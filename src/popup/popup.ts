// ============================================================
// CBT Bridge AI — Popup Script
// ============================================================

async function initPopup(): Promise<void> {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })

  // 활성화 토글 — storage에서 상태 복원
  const toggle = document.getElementById('toggle-enabled') as HTMLInputElement
  const stored = await chrome.storage.local.get('cbt-bridge-enabled')
  const wasEnabled = (stored['cbt-bridge-enabled'] === true) || (!('cbt-bridge-enabled' in stored) && !!settings?.apiKey)
  toggle.checked = wasEnabled

  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked
    // storage에 상태 저장 (popup 재오픈 시 유지)
    await chrome.storage.local.set({ 'cbt-bridge-enabled': enabled })
    // content script에 알림 (chrome:// 등 content script 없는 탭에서는 무시)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EXTENSION', payload: { enabled } })
      }
    } catch {
      // content script가 없는 페이지 — 무시
    }
  })

  // ---- 翻訳方法 ----
  const triggerSelect = document.getElementById('trigger-select') as HTMLButtonElement
  const triggerPage = document.getElementById('trigger-page') as HTMLButtonElement

  // ---- 表示位置 ----
  const displayInline = document.getElementById('display-inline') as HTMLButtonElement
  const displayPopup = document.getElementById('display-popup') as HTMLButtonElement
  const sectionDisplay = document.getElementById('section-display') as HTMLDivElement

  // ---- 画面モード ----
  const splitH = document.getElementById('split-horizontal') as HTMLButtonElement
  const splitV = document.getElementById('split-vertical') as HTMLButtonElement
  const sectionScreen = document.getElementById('section-screen') as HTMLDivElement

  /** 그레이아웃 로직 */
  function applyGrayout(method: 'auto' | 'select' | 'page'): void {
    if (method === 'page') {
      sectionDisplay.classList.add('disabled')
      ;[displayInline, displayPopup].forEach(b => b.classList.add('disabled'))
      sectionScreen.classList.remove('disabled')
      splitH.classList.remove('disabled')
      splitV.classList.remove('disabled')

      // 左右分割을 기본 선택
      if (!splitH.classList.contains('active') && !splitV.classList.contains('active')) {
        splitH.classList.add('active')
      }
    } else {
      // 表示位置 활성, 画面モード 비활성
      sectionDisplay.classList.remove('disabled')
      ;[displayInline, displayPopup].forEach(b => b.classList.remove('disabled'))
      sectionScreen.classList.add('disabled')
      ;[splitH, splitV].forEach(b => { b.classList.add('disabled'); b.classList.remove('active') })
    }
  }

  function setTrigger(mode: 'select' | 'page'): void {
    triggerSelect.classList.toggle('active', mode === 'select')
    triggerPage.classList.toggle('active', mode === 'page')
    applyGrayout(mode)
    // 'auto' → 기존 'hover', 'select' → 기존 'hover' (선택 전용)
    const backendMode = mode === 'page' ? 'page' : mode === 'select' ? 'select' : 'hover'
    chrome.runtime.sendMessage({ type: 'SET_TRANSLATE_MODE', payload: { mode: backendMode } })
  }

  // 초기 상태 로드
  const savedTrigger = settings?.translateMode
  const initTrigger = savedTrigger === 'page' ? 'page' : 'select'
  setTrigger(initTrigger)

  triggerSelect.addEventListener('click', () => setTrigger('select'))
  triggerPage.addEventListener('click', () => setTrigger('page'))

  // ---- 表示位置 ----
  function setDisplay(mode: 'inline' | 'popup'): void {
    displayInline.classList.toggle('active', mode === 'inline')
    displayPopup.classList.toggle('active', mode === 'popup')
    chrome.runtime.sendMessage({ type: 'SET_DISPLAY_MODE', payload: { mode } })
  }

  if (settings?.displayMode) {
    // sidebar가 설정되어 있다면 popup으로 폴백
    const mode = settings.displayMode === 'sidebar' ? 'popup' : settings.displayMode
    setDisplay(mode)
  } else {
    setDisplay('popup')
  }
  displayInline.addEventListener('click', () => setDisplay('inline'))
  displayPopup.addEventListener('click', () => setDisplay('popup'))

  async function openSplit(layout: 'horizontal' | 'vertical'): Promise<void> {
    splitH.classList.toggle('active', layout === 'horizontal')
    splitV.classList.toggle('active', layout === 'vertical')

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    chrome.runtime.sendMessage({
      type: 'OPEN_SPLIT_VIEW',
      payload: { layout, tabId: tab.id },
    })
    setTimeout(() => window.close(), 100)
  }

  splitH.addEventListener('click', () => openSplit('horizontal'))
  splitV.addEventListener('click', () => openSplit('vertical'))

  // 번역 품질
  const qualitySpeed = document.getElementById('quality-speed') as HTMLButtonElement
  const qualityStandard = document.getElementById('quality-standard') as HTMLButtonElement
  const qualityPremium = document.getElementById('quality-premium') as HTMLButtonElement
  const qualityInfo = document.getElementById('quality-info') as HTMLDivElement

  const qualityLabels: Record<string, string> = {
    speed: 'Flash Lite — 最速・最安',
    standard: 'Flash — バランス型',
    premium: 'Pro — 最高品質',
  }

  function setQuality(q: 'speed' | 'standard' | 'premium'): void {
    qualitySpeed.classList.toggle('active', q === 'speed')
    qualityStandard.classList.toggle('active', q === 'standard')
    qualityPremium.classList.toggle('active', q === 'premium')
    qualityInfo.textContent = qualityLabels[q]
    chrome.storage.local.set({ 'cbt-bridge-quality': q })
  }

  // 저장된 품질 복원
  const storedQuality = await chrome.storage.local.get('cbt-bridge-quality')
  const currentQuality = (storedQuality['cbt-bridge-quality'] as string) ?? 'standard'
  setQuality(currentQuality as 'speed' | 'standard' | 'premium')

  qualitySpeed.addEventListener('click', () => setQuality('speed'))
  qualityStandard.addEventListener('click', () => setQuality('standard'))
  qualityPremium.addEventListener('click', () => setQuality('premium'))

  // API 상태
  const apiStatus = document.getElementById('api-status') as HTMLDivElement
  if (settings?.apiKey) {
    apiStatus.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg> APIキー設定済み'
    apiStatus.className = 'footer-status connected'
  }

  // 용어사전 버튼
  document.getElementById('btn-glossary')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }
    window.close() // 설정직 자동 닫기
  })

  // 설정 버튼
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })

  // ---- PDF: 현재 탭 감지 + 업로드 ----

  const pdfCurrentBtn = document.getElementById('btn-pdf-current') as HTMLButtonElement
  const pdfUploadBtn = document.getElementById('btn-pdf-upload') as HTMLButtonElement
  const pdfInput = document.getElementById('pdf-file-input') as HTMLInputElement
  const pdfStatus = document.getElementById('pdf-status') as HTMLDivElement

  // 현재 탭이 PDF인지 감지
  let currentPdfUrl: string | null = null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url ?? ''
    if (isPdfUrl(url)) {
      currentPdfUrl = url
      const urlName = url.split('/').pop()?.split('?')[0] ?? 'PDF'
      pdfCurrentBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:white;fill:none;stroke-width:2"><circle cx="12" cy="12" r="10"/><path d="m2 12 5.1 2.8"/><path d="m22 12-5.1 2.8"/><path d="m8.6 8.6 2.8 5.1"/><path d="m15.4 8.6-2.8 5.1"/></svg> ${truncate(urlName, 20)} を翻訳`
      pdfCurrentBtn.style.display = 'block'
    }
  } catch {
    // tabs API 에러 무시
  }

  // 「このPDFを翻訳」 클릭 → fetch → 뷰어 열기
  pdfCurrentBtn.addEventListener('click', async () => {
    if (!settings?.apiKey) {
      pdfStatus.textContent = 'まずAPIキーを設定してください'
      pdfStatus.style.color = '#ef4444'
      return
    }
    if (!currentPdfUrl) return

    pdfStatus.textContent = 'ダウンロード中...'
    pdfStatus.style.color = '#3b82f6'
    pdfCurrentBtn.disabled = true

    try {
      // Service Worker 経由で fetch (CORS 回避)
      const result = await chrome.runtime.sendMessage({
        type: 'PDF_FETCH_URL',
        payload: { url: currentPdfUrl },
      }) as { pdfBase64?: string; fileSize?: number; error?: string }

      if (result.error) {
        pdfStatus.textContent = result.error ?? 'エラー'
        pdfStatus.style.color = '#ef4444'
        pdfCurrentBtn.disabled = false
        return
      }

      if (!result.pdfBase64) {
        pdfStatus.textContent = 'PDFの取得に失敗しました'
        pdfStatus.style.color = '#ef4444'
        pdfCurrentBtn.disabled = false
        return
      }

      const fileName = currentPdfUrl.split('/').pop()?.split('?')[0] ?? 'document.pdf'

      await chrome.storage.local.set({
        'cbt-bridge-pdf-pending': {
          pdfBase64: result.pdfBase64,
          fileName,
          fileSize: result.fileSize ?? 0,
        },
      })

      chrome.tabs.create({ url: chrome.runtime.getURL('src/pdfviewer/pdfviewer.html') })
      window.close()
    } catch (err) {
      pdfStatus.textContent = `エラー: ${(err as Error).message}`
      pdfStatus.style.color = '#ef4444'
      pdfCurrentBtn.disabled = false
    }
  })

  // 「ファイルから選択」 클릭
  pdfUploadBtn.addEventListener('click', () => {
    if (!settings?.apiKey) {
      pdfStatus.textContent = 'まずAPIキーを設定してください'
      pdfStatus.style.color = '#ef4444'
      return
    }
    pdfInput.click()
  })

  pdfInput.addEventListener('change', async () => {
    const file = pdfInput.files?.[0]
    if (!file) return

    // Gate 1: 파일 크기 제한 (50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      pdfStatus.textContent = `ファイルが大きすぎます (${(file.size / 1024 / 1024).toFixed(1)}MB > 50MB)`
      pdfStatus.style.color = '#ef4444'
      return
    }

    pdfStatus.textContent = '読み込み中...'
    pdfStatus.style.color = '#3b82f6'

    try {
      // PDF → base64
      const arrayBuffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(arrayBuffer)

      // base64를 storage에 임시 저장 후 뷰어 페이지 열기
      await chrome.storage.local.set({
        'cbt-bridge-pdf-pending': {
          pdfBase64: base64,
          fileName: file.name,
          fileSize: file.size,
        },
      })

      // 뷰어 페이지 열기
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/pdfviewer/pdfviewer.html'),
      })

      // 팝업 닫기
      window.close()
    } catch (err) {
      pdfStatus.textContent = `❌ 読み込みエラー: ${(err as Error).message}`
      pdfStatus.style.color = '#ef4444'
    }
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const pathname = u.pathname.toLowerCase()
    // .pdf 확장자
    if (pathname.endsWith('.pdf')) return true
    // arxiv 등 학술 사이트의 /pdf/ 경로 패턴
    if (pathname.includes('/pdf/')) return true
    // 쿼리 파라미터 힌트
    const params = u.search.toLowerCase()
    if (params.includes('type=pdf') || params.includes('format=pdf')) return true
    return false
  } catch {
    return false
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

initPopup()
