// ============================================================
// CBT Bridge AI — Split View Panel Script
// 번역 결과를 표시하고 원본 페이지와 스크롤 동기화
// ============================================================

import type { TranslateResult } from '../shared/types'

interface ParagraphData {
  index: number
  originalText: string
  translatedText?: string
  status: 'pending' | 'translating' | 'done' | 'error'
}

const paragraphs: ParagraphData[] = []
let sourceTabId: number | null = null

async function init(): Promise<void> {
  // URL 파라미터에서 원본 탭 ID 가져오기
  const params = new URLSearchParams(window.location.search)
  sourceTabId = Number(params.get('tabId')) || null

  updateStatus(sourceTabId ? `🔗 タブ #${sourceTabId} に接続中...` : '⚠️ ソースタブ未指定')

  // 원본 탭에서 텍스트 가져오기
  if (sourceTabId) {
    try {
      await chrome.tabs.sendMessage(sourceTabId, { type: 'SPLITVIEW_CONNECTED' })
      updateStatus(`✅ 接続完了 — テキストを取得中...`)

      // 원본 페이지에서 단락 추출 요청
      const result = await chrome.tabs.sendMessage(sourceTabId, {
        type: 'GET_PAGE_PARAGRAPHS',
      }) as { paragraphs: string[] }

      if (result?.paragraphs) {
        result.paragraphs.forEach((text, index) => {
          paragraphs.push({ index, originalText: text, status: 'pending' })
        })
        renderParagraphs()
        updateStatus(`📄 ${paragraphs.length} 段落を取得`)
      }
    } catch (err) {
      updateStatus(`⚠️ 接続エラー: ${(err as Error).message}`)
    }
  }

  setupMessageListener()
  setupButtons()
}

function renderParagraphs(): void {
  const content = document.getElementById('content')!

  if (paragraphs.length === 0) return

  content.innerHTML = paragraphs.map(p => `
    <div class="paragraph-block ${p.status === 'translating' ? 'loading' : ''} ${p.status === 'done' ? 'active' : ''}"
         id="para-${p.index}"
         data-index="${p.index}">
      ${p.status === 'done' ? escapeHtml(p.translatedText ?? '') :
        p.status === 'translating' ? `翻訳中... (${p.index + 1}/${paragraphs.length})` :
        escapeHtml(p.originalText)}
    </div>
  `).join('')
}

async function translateAll(): Promise<void> {
  updateStatus('🔄 全文翻訳中...')

  for (const para of paragraphs) {
    if (para.status === 'done') continue

    para.status = 'translating'
    renderParagraphs()

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_TEXT',
        payload: {
          text: para.originalText,
          glossary: [],
          priority: 'medium' as const,
        },
      }) as TranslateResult

      if (result?.translated) {
        para.translatedText = result.translated
        para.status = 'done'
      } else {
        para.status = 'error'
      }
    } catch {
      para.status = 'error'
    }

    renderParagraphs()

    // 번역된 단락이 보이도록 스크롤
    const el = document.getElementById(`para-${para.index}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const doneCount = paragraphs.filter(p => p.status === 'done').length
  updateStatus(`✅ 翻訳完了 — ${doneCount}/${paragraphs.length} 段落`)
}

async function translateSingle(index: number): Promise<void> {
  const para = paragraphs[index]
  if (!para || para.status === 'done') return

  para.status = 'translating'
  renderParagraphs()

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_TEXT',
      payload: {
        text: para.originalText,
        glossary: [],
        priority: 'low' as const,
      },
    }) as TranslateResult

    if (result?.translated) {
      para.translatedText = result.translated
      para.status = 'done'
    }
  } catch {
    para.status = 'error'
  }

  renderParagraphs()
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    // 원본 페이지에서 스크롤 동기화 이벤트
    if (message.type === 'SCROLL_SYNC' && message.payload?.paragraphIndex !== undefined) {
      const el = document.getElementById(`para-${message.payload.paragraphIndex}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 활성 단락 하이라이팅
        document.querySelectorAll('.paragraph-block.active').forEach(e => e.classList.remove('active'))
        el.classList.add('active')
      }
    }

    // 단일 단락 번역 요청 (번역 버튼 클릭 시)
    if (message.type === 'TRANSLATE_PARAGRAPH' && message.payload?.index !== undefined) {
      translateSingle(message.payload.index)
    }
  })
}

function setupButtons(): void {
  document.getElementById('btn-translate-all')?.addEventListener('click', translateAll)

  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.close()
  })
}

function updateStatus(text: string): void {
  const el = document.getElementById('status-bar')
  if (el) el.textContent = text
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

init()
