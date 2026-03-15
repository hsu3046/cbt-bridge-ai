/* ============================================================
   CBT Bridge AI — Content Script
   클릭 기반 번역 + 인라인 용어 등록
   ============================================================ */

import './styles/overlay.css'
import { CSS_PREFIX, HOVER_DEBOUNCE_MS } from '../shared/constants'
import type { TranslateResult, GlossaryEntry } from '../shared/types'

// ---- Lucide SVG Icons (14px inline) ----
const s = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const ICON = {
  translate: `<svg ${s}><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`,
  camera:    `<svg ${s}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  play:      `<svg ${s}><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  stop:      `<svg ${s}><rect width="14" height="14" x="5" y="5" rx="1"/></svg>`,
  x:         `<svg ${s}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  check:     `<svg ${s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  loader:    `<svg ${s} style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  book:      `<svg ${s}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>`,
  fileSingle:`<svg ${s}><rect width="18" height="14" x="3" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`,
  fileSpread:`<svg ${s}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/></svg>`,
  alertX:    `<svg ${s} stroke="#ef4444"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  maximize:  `<svg ${s}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`,
  minimize:  `<svg ${s}><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`,
} as const

// ---- 상태 ----

let isEnabled = false
let currentMode: 'overlay' | 'split' = 'overlay'
let translateMode: 'hover' | 'select' | 'page' = 'hover'
let displayMode: 'inline' | 'popup' | 'sidebar' = 'inline'
let glossary: GlossaryEntry[] = []
const translatedParagraphs = new WeakSet<HTMLElement>()
const pendingParagraphs = new WeakSet<HTMLElement>()
let activeTranslateBtn: HTMLElement | null = null
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

// ---- 초기화 ----

async function init(): Promise<void> {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
  if (settings && !settings.error) {
    currentMode = settings.viewMode ?? 'overlay'
    translateMode = settings.translateMode ?? 'hover'
    displayMode = settings.displayMode ?? 'inline'
  }

  // 활성화 상태: storage 우선
  const stored = await chrome.storage.local.get('cbt-bridge-enabled')
  if (stored['cbt-bridge-enabled'] !== undefined) {
    isEnabled = stored['cbt-bridge-enabled'] as boolean
  } else if (settings?.apiKey) {
    isEnabled = true
    await chrome.storage.local.set({ 'cbt-bridge-enabled': true })
  }

  // 용어사전 로드
  const glossaryResult = await chrome.runtime.sendMessage({
    type: 'GET_GLOSSARY',
    payload: { projectId: settings?.activeProjectId ?? 'default' },
  })
  if (glossaryResult?.entries) {
    glossary = glossaryResult.entries
  }

  setupTranslateButton()
  setupInlineTermRegistration()
  setupClipboardTranslation()
  setupMessageListener()

  console.log(`[CBT Bridge AI] Content script loaded — ${isEnabled ? '✅ ACTIVE' : '⏸ INACTIVE'} (${glossary.length} terms)`)
}

// ---- 번역 버튼 (호버 시 표시 → 클릭 시 번역) ----

function setupTranslateButton(): void {
  // 단락 호버 → 작은 번역 버튼 표시
  document.addEventListener('mouseover', (event) => {
    if (!isEnabled) return
    if (translateMode !== 'hover') return // 自動モード以外はホバーボタン非表示
    const target = event.target as HTMLElement
    if (!target) return
    // 이미 번역된 오버레이나 버튼 위에서는 무시
    if (target.closest(`.${CSS_PREFIX}-overlay`) || target.closest(`.${CSS_PREFIX}-translate-btn`)) return

    const paragraph = findNearestParagraph(target)
    if (!paragraph) return
    if (translatedParagraphs.has(paragraph) || pendingParagraphs.has(paragraph)) return

    if (hoverTimeout) clearTimeout(hoverTimeout)
    hoverTimeout = setTimeout(() => {
      showTranslateButton(paragraph)
    }, HOVER_DEBOUNCE_MS)
  })

  // 단락에서 벗어나면 버튼 제거 (지연)
  document.addEventListener('mouseout', (event) => {
    const related = (event as MouseEvent).relatedTarget as HTMLElement | null
    if (related?.closest(`.${CSS_PREFIX}-translate-btn`)) return // 버튼으로 이동 시 유지

    if (hoverTimeout) clearTimeout(hoverTimeout)
    hoverTimeout = setTimeout(() => {
      removeTranslateButton()
    }, 500)
  })
}

function showTranslateButton(paragraph: HTMLElement): void {
  removeTranslateButton()

  const btn = document.createElement('button')
  btn.className = `${CSS_PREFIX}-translate-btn`
  btn.innerHTML = `${ICON.translate} 翻訳`
  btn.title = 'このパラグラフを翻訳'

  // 클릭 → 번역 실행
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    removeTranslateButton()
    requestTranslation(paragraph)
  })

  // 버튼 위에 마우스 올리면 유지
  btn.addEventListener('mouseover', () => {
    if (hoverTimeout) clearTimeout(hoverTimeout)
  })

  // 버튼에서 벗어나면 제거
  btn.addEventListener('mouseout', () => {
    hoverTimeout = setTimeout(removeTranslateButton, 500)
  })

  // 단락 위치 기준으로 body에 fixed 배치 (CSS 충돌 없음)
  const rect = paragraph.getBoundingClientRect()
  btn.style.top = `${rect.top + window.scrollY - 4}px`
  btn.style.left = `${rect.right + window.scrollX - 70}px`
  document.body.appendChild(btn)
  activeTranslateBtn = btn
}

function removeTranslateButton(): void {
  if (activeTranslateBtn) {
    activeTranslateBtn.remove()
    activeTranslateBtn = null
  }
}

function findNearestParagraph(element: HTMLElement): HTMLElement | null {
  const blockTags = ['P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']
  let current: HTMLElement | null = element
  while (current) {
    if (blockTags.includes(current.tagName)) return current
    current = current.parentElement
  }
  return null
}

// 원본 HTML 저장 (복원용)
const originalHtmlMap = new Map<HTMLElement, string>()
const translatedTextMap = new Map<HTMLElement, string>()

async function requestTranslation(paragraph: HTMLElement): Promise<void> {
  const text = paragraph.textContent?.trim()
  console.log('[CBT Bridge AI] 🔵 requestTranslation called, text length:', text?.length)
  if (!text || text.length < 10) return
  if (translatedParagraphs.has(paragraph) || pendingParagraphs.has(paragraph)) return

  pendingParagraphs.add(paragraph)

  // 로딩 표시 (반투명 + 커서)
  const origOpacity = paragraph.style.opacity
  paragraph.style.opacity = '0.5'
  paragraph.style.transition = 'opacity 0.3s'

  try {
    console.log('[CBT Bridge AI] 🟡 Sending TRANSLATE_TEXT message...')
    const result = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_TEXT',
      payload: { text, glossary, priority: 'low' as const },
    }) as TranslateResult

    console.log('[CBT Bridge AI] 🟢 Got result:', JSON.stringify(result).slice(0, 200))

    paragraph.style.opacity = origOpacity || ''

    if (result?.translated) {
      if (displayMode === 'sidebar') {
        // サイドバー → ページ内右サイドドロワーに表示
        showSidebarTranslation(result)
      } else if (displayMode === 'popup') {
        // POPアップ → フローティングパネルに表示
        showFloatingTranslation(result)
      } else {
        // 画面の中 → インライン置換
        originalHtmlMap.set(paragraph, paragraph.innerHTML)
        translatedTextMap.set(paragraph, result.translated)
        paragraph.textContent = result.translated
        paragraph.style.cursor = 'pointer'
        paragraph.title = 'クリックで原文/翻訳を切替'
        paragraph.addEventListener('click', toggleTranslation)
        translatedParagraphs.add(paragraph)
      }
      console.log('[CBT Bridge AI] ✅ Translation displayed successfully')
    } else {
      console.log('[CBT Bridge AI] ⚠️ result.translated is empty:', result)
    }
  } catch (err) {
    paragraph.style.opacity = origOpacity || ''
    console.error('[CBT Bridge AI] Translation error:', err)
  } finally {
    pendingParagraphs.delete(paragraph)
  }
}

function toggleTranslation(event: Event): void {
  event.preventDefault()
  event.stopPropagation()

  const el = event.currentTarget as HTMLElement
  const origHtml = originalHtmlMap.get(el)
  const translated = translatedTextMap.get(el)
  if (!origHtml || !translated) return

  if (el.textContent === translated) {
    el.innerHTML = origHtml
    el.style.borderBottom = '2px dashed rgba(59, 130, 246, 0.3)'
  } else {
    el.textContent = translated
    el.style.borderBottom = '2px solid rgba(59, 130, 246, 0.3)'
  }
}

// ---- 전문번역 (Split View용) ----

function isVisible(el: HTMLElement): boolean {
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  return true
}

/** 번역에서 제외할 영역 */
const SKIP_SELECTORS = [
  // 쿠키 / GDPR
  '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
  '[id*="cookie"]', '[id*="consent"]',
  // 모달 / 팝업
  '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]',
  '[id*="modal"]', '[id*="popup"]',
  // 네비게이션 / 메뉴
  'nav', '[role="navigation"]', '[class*="menu"]', '[class*="nav-"]', '[class*="navbar"]',
  // 사이드바 / 위젯
  'aside', '[role="complementary"]', '[class*="sidebar"]', '[class*="widget"]',
  // 광고
  '[class*="advert"]', '[class*="ad-"]', '[class*="ads-"]', '[class*="sponsor"]',
  '[id*="ad-"]', '[id*="ads"]',
  // 댓글
  '[class*="comment"]', '[id*="comment"]', '[id*="disqus"]',
  // 푸터 / 헤더 (네비 포함)
  'footer', 'header',
  // 배너
  '[class*="banner"]', '[class*="alert"]', '[class*="notice"]',
].join(',')

function shouldSkip(el: HTMLElement): boolean {
  return !!el.closest(SKIP_SELECTORS)
}

/** 본문 영역 자동 감지: article > main > [role=main] > 텍스트 밀도 기반 */
function findMainContentRoot(): HTMLElement {
  // 1순위: <article> (블로그, 뉴스 등에서 가장 정확)
  const article = document.querySelector('article')
  if (article && (article.textContent?.trim().length ?? 0) > 100) {
    console.log('[CBT Bridge AI] 📍 Main content: <article>')
    return article as HTMLElement
  }

  // 2순위: <main> 또는 [role="main"]
  const main = document.querySelector('main, [role="main"]')
  if (main && (main.textContent?.trim().length ?? 0) > 100) {
    console.log('[CBT Bridge AI] 📍 Main content: <main>')
    return main as HTMLElement
  }

  // 3순위: 텍스트 밀도가 가장 높은 컨테이너 찾기
  const candidates = document.querySelectorAll('section, div.content, div.post, div.entry, div.article, [class*="content"], [class*="post-body"], [class*="entry-content"]')
  let bestEl: HTMLElement = document.body
  let bestLen = 0

  candidates.forEach(el => {
    const htmlEl = el as HTMLElement
    if (shouldSkip(htmlEl)) return
    const textLen = htmlEl.textContent?.trim().length ?? 0
    if (textLen > bestLen) {
      bestLen = textLen
      bestEl = htmlEl
    }
  })

  if (bestLen > 200 && bestEl !== document.body) {
    console.log(`[CBT Bridge AI] 📍 Main content: density-based (${bestEl.tagName}.${bestEl.className.toString().slice(0, 30)}, ${bestLen} chars)`)
    return bestEl
  }

  // 최종 fallback: body
  console.log('[CBT Bridge AI] 📍 Main content: fallback to <body>')
  return document.body
}

const BLOCK_TAGS = ['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'FIGCAPTION', 'DT', 'DD']

async function translateAllParagraphs(): Promise<void> {
  const CHUNK_SIZE = 10

  // 본문 영역 자동 감지
  const contentRoot = findMainContentRoot()
  const elements = contentRoot.querySelectorAll(BLOCK_TAGS.join(','))
  const targets: HTMLElement[] = []

  elements.forEach(el => {
    const htmlEl = el as HTMLElement
    const text = htmlEl.textContent?.trim()
    if (!text || text.length < 10) return
    if (!isVisible(htmlEl)) return
    if (shouldSkip(htmlEl)) return
    targets.push(htmlEl)
  })

  const total = targets.length
  console.log(`[CBT Bridge AI] 📄 Found ${total} translatable paragraphs`)
  if (total === 0) return

  let translated = 0

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE)

    // 이 청크를 3개씩 병렬 번역
    for (let j = 0; j < chunk.length; j += 3) {
      const batch = chunk.slice(j, j + 3)
      await Promise.all(batch.map(p => {
        if (translatedParagraphs.has(p) || pendingParagraphs.has(p)) return Promise.resolve()
        return requestTranslation(p)
      }))
    }

    translated = Math.min(i + CHUNK_SIZE, total)
    const remaining = total - translated

    if (remaining <= 0) break

    // 계속 진행 확인 — 플로팅 바
    const shouldContinue = await showTranslationProgress(translated, total)
    if (!shouldContinue) {
      console.log(`[CBT Bridge AI] ⏹ Translation stopped at ${translated}/${total}`)
      return
    }
  }

  // 완료 표시
  showTranslationComplete(translated)
  console.log(`[CBT Bridge AI] ✅ All ${translated} paragraphs translated`)
}

function showTranslationProgress(done: number, total: number): Promise<boolean> {
  return new Promise(resolve => {
    removeProgressBar()

    const bar = document.createElement('div')
    bar.id = 'cbt-bridge-progress-bar'
    bar.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1e293b, #334155);
      color: white; padding: 12px 20px; border-radius: 12px; z-index: 2147483647;
      font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
      font-size: 13px; display: flex; align-items: center; gap: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3); backdrop-filter: blur(10px);
    `

    const pct = Math.round((done / total) * 100)
    bar.innerHTML = `
      <div style="flex: 1;">
        <div style="margin-bottom: 4px;">${ICON.translate} <b>${done}</b> / ${total} 段落翻訳済み (${pct}%)</div>
        <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 4px; overflow: hidden;">
          <div style="background: #3b82f6; height: 100%; width: ${pct}%; border-radius: 4px; transition: width 0.3s;"></div>
        </div>
      </div>
      <button id="cbt-progress-continue" style="
        padding: 6px 16px; background: #3b82f6; color: white; border: none;
        border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
        font-family: inherit; white-space: nowrap;
      ">${ICON.play} 続行</button>
      <button id="cbt-progress-stop" style="
        padding: 6px 12px; background: rgba(255,255,255,0.1); color: #94a3b8;
        border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer;
        font-size: 12px; font-family: inherit; white-space: nowrap;
      ">⏹ 停止</button>
    `

    document.body.appendChild(bar)

    document.getElementById('cbt-progress-continue')!.addEventListener('click', () => {
      removeProgressBar()
      resolve(true)
    })
    document.getElementById('cbt-progress-stop')!.addEventListener('click', () => {
      removeProgressBar()
      resolve(false)
    })
  })
}

function showTranslationComplete(count: number): void {
  removeProgressBar()
  const bar = document.createElement('div')
  bar.id = 'cbt-bridge-progress-bar'
  bar.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #065f46, #047857); color: white;
    padding: 12px 20px; border-radius: 12px; z-index: 2147483647;
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
    font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `
  bar.innerHTML = `${ICON.check} ${count} 段落の翻訳が完了しました`
  document.body.appendChild(bar)
  setTimeout(removeProgressBar, 3000)
}

function showTranslateAllConfirmation(): void {
  // 번역 가능한 단락 수를 먼저 세기
  const contentRoot = findMainContentRoot()
  const elements = contentRoot.querySelectorAll(BLOCK_TAGS.join(','))
  let count = 0
  elements.forEach(el => {
    const htmlEl = el as HTMLElement
    const text = htmlEl.textContent?.trim()
    if (!text || text.length < 10) return
    if (!isVisible(htmlEl)) return
    if (shouldSkip(htmlEl)) return
    count++
  })

  if (count === 0) return

  removeProgressBar()
  const bar = document.createElement('div')
  bar.id = 'cbt-bridge-progress-bar'
  bar.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(135deg, #1e293b, #334155);
    color: white; padding: 14px 20px; border-radius: 12px; z-index: 2147483647;
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
    font-size: 13px; display: flex; align-items: center; gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); backdrop-filter: blur(10px);
  `
  bar.innerHTML = `
    <div style="flex: 1;">
      ${ICON.translate} <b>${count}</b> 段落を翻訳しますか？
    </div>
    <button id="cbt-confirm-start" style="
      padding: 6px 16px; background: #3b82f6; color: white; border: none;
      border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
      font-family: inherit; white-space: nowrap; display: flex; align-items: center; gap: 4px;
    ">${ICON.play} 開始</button>
    <button id="cbt-confirm-cancel" style="
      padding: 6px 12px; background: rgba(255,255,255,0.1); color: #94a3b8;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer;
      font-size: 12px; font-family: inherit; white-space: nowrap;
    ">${ICON.x} キャンセル</button>
  `
  document.body.appendChild(bar)

  document.getElementById('cbt-confirm-start')!.addEventListener('click', () => {
    removeProgressBar()
    translateAllParagraphs()
  })
  document.getElementById('cbt-confirm-cancel')!.addEventListener('click', () => {
    removeProgressBar()
  })
}

function removeProgressBar(): void {
  document.getElementById('cbt-bridge-progress-bar')?.remove()
}

// ---- スクリーンショット翻訳 (Kindle等、DOM非対応サイト用) ----

function setupClipboardTranslation(): void {
  // クリップボード監視 (copy イベント)
  document.addEventListener('copy', () => {
    if (!isEnabled) return
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (!text || text.trim().length < 5) return
        showClipboardTranslateBar(text.trim())
      } catch { /* clipboard permission denied */ }
    }, 300)
  })

  // 📸 フローティング翻訳ボタン（画面右下固定）
  const fab = document.createElement('button')
  fab.id = 'cbt-screenshot-fab'
  fab.innerHTML = ICON.camera
  fab.title = 'このページを翻訳 (スクリーンショット)'
  fab.style.cssText = `
    position: fixed; bottom: 80px; right: 20px; z-index: 2147483646;
    width: 48px; height: 48px; border-radius: 50%; border: none;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white; font-size: 22px; cursor: pointer;
    box-shadow: 0 4px 16px rgba(59,130,246,0.4);
    display: none; align-items: center; justify-content: center;
    transition: transform 0.2s, box-shadow 0.2s;
    font-family: "Inter", system-ui, sans-serif;
  `
  fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.1)' })
  fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)' })
  fab.addEventListener('click', showScreenshotMenu)
  document.body.appendChild(fab)

  // 活性化状態に応じて表示/非表示
  updateFabVisibility()
  chrome.storage.onChanged.addListener(() => updateFabVisibility())

  function updateFabVisibility(): void {
    // 自動モード以外・無効時はカメラFAB非表示
    fab.style.display = (isEnabled && translateMode === 'hover') ? 'flex' : 'none'
  }
}

function showScreenshotMenu(): void {
  document.getElementById('cbt-screenshot-menu')?.remove()

  const menu = document.createElement('div')
  menu.id = 'cbt-screenshot-menu'
  menu.style.cssText = `
    position: fixed; bottom: 136px; right: 12px; z-index: 2147483647;
    background: linear-gradient(135deg, #1e293b, #334155);
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    padding: 6px; display: flex; flex-direction: column; gap: 4px;
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
    animation: cbt-bridge-fade-in 0.15s ease;
  `
  const btnStyle = `
    padding: 10px 16px; border: none; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 500; text-align: left; white-space: nowrap;
    font-family: inherit; transition: background 0.15s;
  `

  menu.innerHTML = `
    <button id="cbt-ss-single" style="${btnStyle} background: #3b82f6; color: white;">
      ${ICON.fileSingle} 1ページ
    </button>
    <button id="cbt-ss-spread" style="${btnStyle} background: rgba(255,255,255,0.08); color: #e2e8f0;">
      ${ICON.fileSpread} 見開き（左・右）
    </button>
  `
  document.body.appendChild(menu)

  document.getElementById('cbt-ss-single')?.addEventListener('click', () => {
    menu.remove()
    handleScreenshotTranslate('single')
  })
  document.getElementById('cbt-ss-spread')?.addEventListener('click', () => {
    menu.remove()
    handleScreenshotTranslate('spread')
  })

  // 외부 클릭시 닫기
  const dismiss = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', dismiss) }
  }
  setTimeout(() => document.addEventListener('mousedown', dismiss), 100)
}

async function handleScreenshotTranslate(layout: 'single' | 'spread'): Promise<void> {
  const fab = document.getElementById('cbt-screenshot-fab')
  document.getElementById('cbt-screenshot-menu')?.remove()
  if (fab) fab.style.display = 'none'

  const loadingEl = document.createElement('div')
  loadingEl.className = `${CSS_PREFIX}-floating`
  loadingEl.innerHTML = `
    <div class="${CSS_PREFIX}-floating-header">${ICON.camera} スクリーンショット翻訳中...</div>
    <div class="${CSS_PREFIX}-floating-body" style="color: #94a3b8;">
      ${ICON.loader} ${layout === 'spread' ? '見開き2ページを個別に翻訳しています...' : '画面をキャプチャしてGeminiに送信しています...'}
    </div>
    <button class="${CSS_PREFIX}-floating-close">${ICON.x}</button>
  `
  loadingEl.querySelector(`.${CSS_PREFIX}-floating-close`)?.addEventListener('click', () => loadingEl.remove())
  document.querySelector(`.${CSS_PREFIX}-floating`)?.remove()

  await new Promise(r => setTimeout(r, 200))
  document.body.appendChild(loadingEl)

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SCREENSHOT_TRANSLATE',
      payload: { layout },
    }) as { translated?: string; model?: string; estimatedCost?: number; error?: string }

    loadingEl.remove()

    if (result?.error) {
      showFloatingTranslation({
        original: '', translated: `${ICON.alertX} ${result.error}`,
        model: 'gemini-3.1-flash-lite-preview' as const, tokensUsed: { input: 0, output: 0 },
      })
    } else if (result?.translated) {
      showFloatingTranslation({
        original: '(screenshot)',
        translated: result.translated,
        model: (result.model ?? 'gemini-3-flash-preview') as TranslateResult['model'],
        tokensUsed: { input: 0, output: 0 },
      })
    }
  } catch (err) {
    loadingEl.remove()
    console.error('[CBT Bridge AI] Screenshot translation error:', err)
  } finally {
    if (fab) fab.style.display = isEnabled ? 'flex' : 'none'
  }
}

function showClipboardTranslateBar(text: string): void {
  document.getElementById('cbt-clipboard-bar')?.remove()

  const bar = document.createElement('div')
  bar.id = 'cbt-clipboard-bar'
  bar.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647; display: flex; align-items: center; gap: 10px;
    padding: 10px 16px; background: linear-gradient(135deg, #1e293b, #334155);
    border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif; color: white;
    backdrop-filter: blur(10px);
  `

  bar.innerHTML = `
    <span style="font-size: 12px; color: #94a3b8;">📋 ${text.length}文字コピー済み</span>
    <button id="cbt-clipboard-translate" style="
      padding: 8px 16px; background: #3b82f6; color: white; border: none;
      border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
      font-family: inherit;
    ">${ICON.translate} 翻訳</button>
    <button id="cbt-clipboard-close" style="
      padding: 4px 8px; background: none; color: #64748b; border: none;
      cursor: pointer; font-size: 16px;
    ">${ICON.x}</button>
  `

  document.body.appendChild(bar)
  document.getElementById('cbt-clipboard-translate')?.addEventListener('click', () => {
    bar.remove()
    translateSelectedText(text)
  })
  document.getElementById('cbt-clipboard-close')?.addEventListener('click', () => bar.remove())
  setTimeout(() => bar.remove(), 10000)
}

// ---- 選択ベース翻訳 + 用語登録 ----

function setupInlineTermRegistration(): void {
  // capture: true → Kindle 등의 이벤트 가로채기 우회
  document.addEventListener('mouseup', (event) => {
    if (!isEnabled) return

    // 자체 UI 위에서는 무시
    if ((event.target as HTMLElement)?.closest(`.${CSS_PREFIX}-selection-bar, .${CSS_PREFIX}-floating`)) return

    // ★ 핵심: Kindle이 ClearTextSelection을 실행하기 전에 즉시 캡처!
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''

    console.log('[CBT Bridge AI] 🖱 mouseup — immediate capture:', { textLength: text.length, preview: text.slice(0, 50) })

    if (text.length < 2) return

    // UI는 약간 지연 후 표시 (Kindle 자체 UI와 겹치지 않도록)
    setTimeout(() => {
      removeTermPopup()
      showSelectionBar(event, text)
    }, 100)
  }, true) // capture phase!

  // 팝업 외부 클릭 시 닫기
  document.addEventListener('mousedown', (event) => {
    const bar = document.querySelector(`.${CSS_PREFIX}-selection-bar`)
    if (bar && !bar.contains(event.target as Node)) {
      removeTermPopup()
    }
  }, true)
}

function showSelectionBar(event: MouseEvent, selectedText: string): void {
  const bar = document.createElement('div')
  bar.className = `${CSS_PREFIX}-selection-bar`
  bar.style.cssText = `
    position: absolute; z-index: 2147483647;
    display: flex; gap: 4px; padding: 4px;
    background: linear-gradient(135deg, #1e293b, #334155);
    border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
  `

  // 번역 버튼 (항상 표시)
  const translateBtn = document.createElement('button')
  translateBtn.innerHTML = `${ICON.translate} 翻訳`
  translateBtn.style.cssText = `
    padding: 6px 12px; background: #3b82f6; color: white; border: none;
    border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit; white-space: nowrap;
  `
  translateBtn.addEventListener('click', () => {
    removeTermPopup()
    translateSelectedText(selectedText)
  })
  bar.appendChild(translateBtn)

  // 용어 등록 버튼 (짧은 텍스트만)
  if (selectedText.length <= 100) {
    const termBtn = document.createElement('button')
    termBtn.innerHTML = `${ICON.book} 用語追加`
    termBtn.style.cssText = `
      padding: 6px 12px; background: rgba(255,255,255,0.1); color: #94a3b8;
      border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer;
      font-size: 12px; font-family: inherit; white-space: nowrap;
    `
    termBtn.addEventListener('click', () => {
      removeTermPopup()
      showTermPopup(event, selectedText)
    })
    bar.appendChild(termBtn)
  }

  bar.style.left = `${event.pageX}px`
  bar.style.top = `${event.pageY + 10}px`
  document.body.appendChild(bar)
}

async function translateSelectedText(text: string): Promise<void> {
  // 로딩 표시
  const loadingEl = document.createElement('div')
  loadingEl.className = `${CSS_PREFIX}-floating`
  loadingEl.innerHTML = `
    <div class="${CSS_PREFIX}-floating-header">${ICON.translate} 翻訳中...</div>
    <div class="${CSS_PREFIX}-floating-body" style="color: #94a3b8;">${ICON.loader} ${text.length}文字を翻訳しています...</div>
    <button class="${CSS_PREFIX}-floating-close">${ICON.x}</button>
  `
  loadingEl.querySelector(`.${CSS_PREFIX}-floating-close`)?.addEventListener('click', () => loadingEl.remove())
  document.querySelector(`.${CSS_PREFIX}-floating`)?.remove()
  document.body.appendChild(loadingEl)

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_TEXT',
      payload: { text, glossary, priority: 'normal' as const },
    }) as TranslateResult

    loadingEl.remove()

    if (result?.translated) {
      showFloatingTranslation(result)
    }
  } catch (err) {
    loadingEl.remove()
    console.error('[CBT Bridge AI] Selection translation error:', err)
  }
}

function showTermPopup(event: MouseEvent, originalText: string): void {
  const popup = document.createElement('div')
  popup.className = `${CSS_PREFIX}-term-popup`
  popup.innerHTML = `
    <div class="${CSS_PREFIX}-term-popup-header">${ICON.book} 用語辞典に追加</div>
    <div class="${CSS_PREFIX}-term-popup-body">
      <div class="${CSS_PREFIX}-term-row">
        <label>原文</label>
        <span class="${CSS_PREFIX}-term-original">${escapeHtml(originalText)}</span>
      </div>
      <div class="${CSS_PREFIX}-term-row">
        <label>AI推薦</label>
        <span class="${CSS_PREFIX}-term-suggestion" id="${CSS_PREFIX}-suggestion">読み込み中...</span>
      </div>
      <div class="${CSS_PREFIX}-term-row">
        <label>訳語</label>
        <input type="text" class="${CSS_PREFIX}-term-input" id="${CSS_PREFIX}-term-input" placeholder="AI推薦を使用、または入力" />
      </div>
    </div>
    <div class="${CSS_PREFIX}-term-popup-footer">
      <button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" id="${CSS_PREFIX}-btn-add">追加</button>
      <button class="${CSS_PREFIX}-btn" id="${CSS_PREFIX}-btn-cancel">キャンセル</button>
    </div>
  `

  popup.style.left = `${event.pageX}px`
  popup.style.top = `${event.pageY + 10}px`
  document.body.appendChild(popup)

  // AI 추천 요청
  chrome.runtime.sendMessage({
    type: 'SUGGEST_TERM_TRANSLATION',
    payload: { original: originalText },
  }).then((result: { suggestion?: string }) => {
    const suggestionEl = document.getElementById(`${CSS_PREFIX}-suggestion`)
    if (suggestionEl && result?.suggestion) {
      suggestionEl.textContent = result.suggestion
      const input = document.getElementById(`${CSS_PREFIX}-term-input`) as HTMLInputElement
      if (input) input.placeholder = result.suggestion
    }
  })

  // 추가 버튼
  document.getElementById(`${CSS_PREFIX}-btn-add`)?.addEventListener('click', () => {
    const input = document.getElementById(`${CSS_PREFIX}-term-input`) as HTMLInputElement
    const suggestion = document.getElementById(`${CSS_PREFIX}-suggestion`)?.textContent
    const translation = input?.value || suggestion || ''

    chrome.runtime.sendMessage({
      type: 'ADD_TERM',
      payload: {
        original: originalText,
        translation,
        domain: 'CBT',
        projectId: 'default',
      },
    })

    removeTermPopup()
  })

  // 취소 버튼
  document.getElementById(`${CSS_PREFIX}-btn-cancel`)?.addEventListener('click', removeTermPopup)
}

function removeTermPopup(): void {
  document.querySelectorAll(`.${CSS_PREFIX}-term-popup, .${CSS_PREFIX}-selection-bar`).forEach(el => el.remove())
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ---- 메시지 리스너 ----

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_EXTENSION') {
      isEnabled = message.payload?.enabled ?? !isEnabled
      chrome.storage.local.set({ 'cbt-bridge-enabled': isEnabled })
      console.log(`[CBT Bridge AI] ${isEnabled ? '✅ Enabled' : '⏸ Disabled'}`)
    }
    if (message.type === 'TRANSLATE_RESULT' && message.payload) {
      showFloatingTranslation(message.payload)
    }
    if (message.type === 'TERM_UPDATED') {
      chrome.runtime.sendMessage({
        type: 'GET_GLOSSARY',
        payload: { projectId: 'default' },
      }).then((result: { entries?: GlossaryEntry[] }) => {
        if (result?.entries) glossary = result.entries
      })
    }
    if (message.type === 'SET_VIEW_MODE') {
      currentMode = message.payload.mode
    }
    if (message.type === 'SET_DISPLAY_MODE') {
      displayMode = message.payload.mode
    }
    if (message.type === 'SET_TRANSLATE_MODE') {
      translateMode = message.payload.mode
      // モード切替時に確認バーを消す
      removeProgressBar()
      // 'page' 모드 → 확인 후 전문번역 시작
      if (translateMode === 'page' && isEnabled) {
        showTranslateAllConfirmation()
      }
    }

    // ---- Split View: 전문번역 ----
    if (message.type === 'TRANSLATE_ALL') {
      console.log('[CBT Bridge AI] 🔄 TRANSLATE_ALL received — forcing enabled')
      isEnabled = true
      translateAllParagraphs()
      return
    }
  })
}

// ---- サイドバー翻訳ドロワー ----

const sidebarResults: Array<{ translated: string; model: string }> = []

function renderSidebarContent(container: Element): void {
  container.innerHTML = sidebarResults.map(result => {
    const qualityMap: Record<string, { label: string; icon: string }> = {
      'gemini-3.1-flash-lite-preview': { label: '速読', icon: `<svg ${s}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>` },
      'gemini-3-flash-preview': { label: '標準', icon: `<svg ${s}><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>` },
      'gemini-3.1-pro-preview': { label: '高品質', icon: `<svg ${s}><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>` },
    }
    const quality = qualityMap[result.model] ?? { label: '標準', icon: `<svg ${s}><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>` }
    return `
      <div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:10px; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
        <div style="display:inline-flex; align-items:center; gap:3px; background:#f0f4ff; padding:2px 8px; border-radius:50px; font-size:11px; color:#3b82f6; margin-bottom:8px; line-height:1;">
          <span style="display:inline-flex;">${quality.icon}</span> ${quality.label}
        </div>
        <div style="font-size:14px; line-height:1.7; color:#1e293b;">${escapeHtml(result.translated)}</div>
      </div>
    `
  }).join('')
}

function getOrCreateSidebar(): HTMLElement {
  const existing = document.getElementById('cbt-bridge-sidebar')
  if (existing) {
    existing.style.transform = 'translateX(0)'
    // コンテンツ再描画
    const content = existing.querySelector('#cbt-sidebar-content')
    if (content) renderSidebarContent(content)
    return existing
  }

  const sidebar = document.createElement('div')
  sidebar.id = 'cbt-bridge-sidebar'
  sidebar.style.cssText = `
    position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
    background: #fafbfc; border-left: 1px solid #e2e8f0;
    box-shadow: -4px 0 20px rgba(0,0,0,0.08); z-index: 2147483646;
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.3s ease;
  `
  sidebar.innerHTML = `
    <div style="padding:12px 16px; background:linear-gradient(135deg,#3b82f6,#6366f1); color:white; display:flex; align-items:center; gap:8px; flex-shrink:0;">
      ${ICON.translate}
      <span style="font-size:14px; font-weight:600; flex:1;">翻訳結果</span>
      <button id="cbt-sidebar-close" style="background:none; border:none; color:rgba(255,255,255,0.8); cursor:pointer; font-size:16px; padding:2px;">${ICON.x}</button>
    </div>
    <div id="cbt-sidebar-content" style="flex:1; overflow-y:auto; padding:12px;"></div>
  `
  document.body.appendChild(sidebar)

  requestAnimationFrame(() => {
    sidebar.style.transform = 'translateX(0)'
  })

  document.getElementById('cbt-sidebar-close')!.addEventListener('click', () => {
    sidebar.style.transform = 'translateX(100%)'
    showSidebarToggleTab()
  })

  // 初期コンテンツ描画
  const content = sidebar.querySelector('#cbt-sidebar-content')
  if (content) renderSidebarContent(content)

  return sidebar
}

/** サイドバーを再開するための右端ミニタブ */
function showSidebarToggleTab(): void {
  if (document.getElementById('cbt-sidebar-tab')) return

  const tab = document.createElement('button')
  tab.id = 'cbt-sidebar-tab'
  tab.innerHTML = ICON.translate
  tab.title = '翻訳サイドバーを開く'
  tab.style.cssText = `
    position: fixed; top: 50%; right: 0; transform: translateY(-50%);
    width: 28px; height: 48px; border: none;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white; cursor: pointer; z-index: 2147483645;
    border-radius: 8px 0 0 8px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: -2px 0 8px rgba(59,130,246,0.3);
    transition: width 0.2s;
    font-family: "Inter", system-ui, sans-serif;
  `
  tab.addEventListener('mouseenter', () => { tab.style.width = '36px' })
  tab.addEventListener('mouseleave', () => { tab.style.width = '28px' })
  tab.addEventListener('click', () => {
    tab.remove()
    getOrCreateSidebar()
  })
  document.body.appendChild(tab)
}

function showSidebarTranslation(result: TranslateResult): void {
  if (!result.translated) return

  // タブが残っていたら消す
  document.getElementById('cbt-sidebar-tab')?.remove()

  // 結果を記憶（最新を先頭に）
  sidebarResults.unshift({ translated: result.translated, model: result.model })

  getOrCreateSidebar()
}

function showFloatingTranslation(result: TranslateResult): void {
  // 既存ポップアップが非表示（折りたたみ中）でなければ削除
  const existing = document.querySelector(`.${CSS_PREFIX}-floating`) as HTMLElement | null
  if (existing) {
    if (existing.style.display === 'none') {
      // 折りたたみ中 → 新しい翻訳はスキップ（既存を保持）
      return
    }
    existing.remove()
  }

  // モデル → 品質ラベル変換
  const qualityMap: Record<string, { label: string; icon: string }> = {
    'gemini-3.1-flash-lite-preview': { label: '速読', icon: `<svg ${s}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>` },
    'gemini-3-flash-preview': { label: '標準', icon: `<svg ${s}><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>` },
    'gemini-3.1-pro-preview': { label: '高品質', icon: `<svg ${s}><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>` },
  }
  const quality = qualityMap[result.model] ?? { label: '標準', icon: `<svg ${s}><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>` }

  const el = document.createElement('div')
  el.className = `${CSS_PREFIX}-floating`
  el.innerHTML = `
    <div class="${CSS_PREFIX}-floating-header">
      ${ICON.translate} 翻訳結果 <span class="${CSS_PREFIX}-model-badge">${quality.icon} ${quality.label}</span>
    </div>
    <div class="${CSS_PREFIX}-floating-body">${escapeHtml(result.translated)}</div>
    <button class="${CSS_PREFIX}-floating-expand" title="拡大/縮小">${ICON.maximize}</button>
    <button class="${CSS_PREFIX}-floating-minimize" title="一時非表示">${ICON.minimize}</button>
    <button class="${CSS_PREFIX}-floating-close">${ICON.x}</button>
  `

  // 閉じる（完全削除）
  el.querySelector(`.${CSS_PREFIX}-floating-close`)?.addEventListener('click', () => {
    el.remove()
    document.getElementById('cbt-floating-tab')?.remove()
  })

  // 折りたたみ（一時非表示 → タブ表示）
  el.querySelector(`.${CSS_PREFIX}-floating-minimize`)?.addEventListener('click', () => {
    el.style.display = 'none'
    showFloatingToggleTab(el)
  })

  // 拡大/縮小 토글
  let expanded = false
  const expandBtn = el.querySelector(`.${CSS_PREFIX}-floating-expand`)
  expandBtn?.addEventListener('click', () => {
    expanded = !expanded
    if (expanded) {
      el.style.cssText = `
        position: fixed; bottom: 12px; left: 16px; right: 16px;
        width: calc(100vw - 32px); max-width: none; height: 60vh; max-height: none;
        border-radius: 16px; z-index: 2147483647;
        animation: none; overflow: hidden;
        background: white; box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
        font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
      `
      expandBtn.innerHTML = ICON.minimize
    } else {
      el.style.cssText = ''
      expandBtn.innerHTML = ICON.maximize
    }
  })

  document.body.appendChild(el)
}

/** POPアップを再表示するための底部ミニタブ */
function showFloatingToggleTab(popup: HTMLElement): void {
  document.getElementById('cbt-floating-tab')?.remove()

  const tab = document.createElement('button')
  tab.id = 'cbt-floating-tab'
  tab.innerHTML = `${ICON.translate} 翻訳`
  tab.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    padding: 8px 14px; border: none;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white; cursor: pointer; z-index: 2147483645;
    border-radius: 10px;
    display: flex; align-items: center; gap: 6px;
    box-shadow: 0 4px 16px rgba(59,130,246,0.3);
    font-size: 12px; font-weight: 600;
    font-family: "Inter", "Noto Sans JP", system-ui, sans-serif;
    transition: transform 0.2s;
  `
  tab.addEventListener('mouseenter', () => { tab.style.transform = 'scale(1.05)' })
  tab.addEventListener('mouseleave', () => { tab.style.transform = 'scale(1)' })
  tab.addEventListener('click', () => {
    tab.remove()
    popup.style.display = ''
  })
  document.body.appendChild(tab)
}

// ---- 시작 ----
init()
