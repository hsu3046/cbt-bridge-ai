// ============================================================
// CBT Bridge AI — PDF Viewer Logic
// 온디맨드 섹션별 번역 + 예산 리미터
// ============================================================

import type {
  PdfDocumentStructure,
  PdfCostEstimate,
  PdfSection,
  GlossaryEntry,
} from '../shared/types'
import { PDF_MAX_PAGES_WARNING, PDF_DEFAULT_BUDGET_LIMIT } from '../shared/constants'

// ---- 상태 ----

let pdfBase64 = ''
let pdfBlobUrl = ''
let structure: PdfDocumentStructure | null = null
let costEstimate: PdfCostEstimate | null = null
let glossary: GlossaryEntry[] = []
let budgetLimit = PDF_DEFAULT_BUDGET_LIMIT
let actualCost = 0

// ---- DOM ----

const $ = (id: string) => document.getElementById(id) as HTMLElement

// ---- 초기화 ----

async function init(): Promise<void> {
  const stored = await chrome.storage.local.get('cbt-bridge-pdf-pending')
  const pending = stored['cbt-bridge-pdf-pending'] as {
    pdfBase64: string; fileName: string; fileSize: number
  } | undefined

  if (!pending) {
    showError('PDFデータが見つかりません。ポップアップからPDFを選択してください。')
    return
  }

  pdfBase64 = pending.pdfBase64
  await chrome.storage.local.remove('cbt-bridge-pdf-pending')

  $('pdf-meta').textContent = `📄 ${pending.fileName} (${(pending.fileSize / 1024).toFixed(0)} KB)`

  // PDF iframe 로드
  loadPdfIframe()

  // 용어사전 로드
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
    const glossaryResult = await chrome.runtime.sendMessage({
      type: 'GET_GLOSSARY',
      payload: { projectId: settings?.activeProjectId ?? 'default' },
    })
    if (glossaryResult?.entries) glossary = glossaryResult.entries
  } catch { /* ignore */ }

  // 예산 인풋
  const budgetInput = $('budget-input') as HTMLInputElement
  budgetInput.addEventListener('change', () => {
    budgetLimit = parseFloat(budgetInput.value) || PDF_DEFAULT_BUDGET_LIMIT
  })

  // 전체 번역 버튼
  $('btn-translate-all').addEventListener('click', translateAllSections)

  // Phase 1: 구조 분석
  await analyzeStructure()
}

function loadPdfIframe(): void {
  const iframe = $('pdf-iframe') as HTMLIFrameElement
  const byteChars = atob(pdfBase64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }
  const blob = new Blob([byteArray], { type: 'application/pdf' })
  pdfBlobUrl = URL.createObjectURL(blob)
  iframe.src = pdfBlobUrl
}

function scrollPdfToPage(page: number): void {
  const iframe = $('pdf-iframe') as HTMLIFrameElement
  iframe.src = `${pdfBlobUrl}#page=${page}`
}

// ---- Phase 1: 구조 분석 ----

async function analyzeStructure(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'PDF_ANALYZE',
      payload: { pdfBase64, fileName: '', fileSize: 0 },
    }) as {
      structure: PdfDocumentStructure
      costEstimate: PdfCostEstimate
      error?: string
    }

    if (result.error) { showError(`分析エラー: ${result.error}`); return }

    structure = result.structure
    costEstimate = result.costEstimate

    renderSectionsUI()
  } catch (err) {
    showError(`分析に失敗しました: ${(err as Error).message}`)
  }
}

// ---- 섹션 목록 UI 렌더링 ----

async function renderSectionsUI(): Promise<void> {
  if (!structure || !costEstimate) return

  // 로딩 숨기고 섹션 패널 표시
  $('state-loading').style.display = 'none'
  $('state-sections').style.display = 'flex'
  $('viewer-footer').style.display = 'flex'

  // 현재 품질 설정 읽기
  const qs = await chrome.storage.local.get('cbt-bridge-quality')
  const quality = (qs['cbt-bridge-quality'] as string) ?? 'standard'
  const qualityMap: Record<string, { label: string; css: string }> = {
    speed: { label: 'Lite', css: 'flash' },
    standard: { label: 'Flash', css: 'flash' },
    premium: { label: 'Pro', css: 'pro' },
  }
  const qInfo = qualityMap[quality] ?? qualityMap.standard

  // 헤더 정보
  $('doc-title').textContent = structure.title
  $('doc-info').textContent = `${structure.authors} — ${structure.totalPages}p, ${structure.sections.length} sections`
  $('cost-info').textContent = `全文予想: $${costEstimate.totalEstimate.toFixed(2)}`

  // Gate 2: 페이지 수 경고
  if (structure.totalPages > PDF_MAX_PAGES_WARNING) {
    const warn = $('page-warning')
    warn.textContent = `⚠️ ${structure.totalPages}ページの大型文書です。必要なセクションのみ翻訳することをお勧めします。`
    warn.style.display = 'block'
  }

  // 섹션 목록
  const body = $('sections-body')
  body.innerHTML = ''

  for (let i = 0; i < structure.sections.length; i++) {
    const section = structure.sections[i]
    const estItem = costEstimate.sections.find(s => s.name === section.name)

    // Row
    const row = document.createElement('div')
    row.className = 'section-row'
    row.id = `section-row-${i}`

    const pages = section.pageEnd - section.pageStart + 1
    const costLabel = estItem ? `~$${estItem.estimatedCost.toFixed(3)}` : ''

    row.innerHTML = `
      <div class="s-info">
        <div class="s-name">${section.name}</div>
        <div class="s-detail">${pages}p ${costLabel}</div>
      </div>
      <span class="s-badge ${section.status === 'skipped' ? 'flash' : qInfo.css}">
        ${section.status === 'skipped' ? 'Skip' : qInfo.label}
      </span>
    `

    // 버튼
    const btn = document.createElement('button')
    btn.className = 's-btn'
    btn.id = `section-btn-${i}`

    if (section.status === 'skipped') {
      btn.className += ' s-btn-skip'
      btn.textContent = '—'
      btn.disabled = true
    } else {
      btn.className += ' s-btn-translate'
      btn.textContent = '▶ 翻訳'
      btn.addEventListener('click', () => translateSection(i))
    }

    row.appendChild(btn)
    body.appendChild(row)

    // 결과 표시 영역 (처음엔 숨김)
    const resultDiv = document.createElement('div')
    resultDiv.className = 's-result'
    resultDiv.id = `section-result-${i}`
    body.appendChild(resultDiv)
  }
}

// ---- 개별 섹션 번역 ----

async function translateSection(index: number): Promise<void> {
  if (!structure) return
  const section = structure.sections[index]

  // Gate 5: 예산 체크
  if (actualCost >= budgetLimit) {
    alert(`予算上限 ($${budgetLimit.toFixed(2)}) に達しています。上限を引き上げてください。`)
    return
  }

  // UI 업데이트: 로딩 상태
  const row = $(`section-row-${index}`)
  const btn = $(`section-btn-${index}`) as HTMLButtonElement
  row.className = 'section-row translating'
  btn.className = 's-btn s-btn-loading'
  btn.textContent = '⏳ 翻訳中...'
  btn.disabled = true

  // PDF를 해당 섹션 페이지로 스크롤
  scrollPdfToPage(section.pageStart)

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'PDF_TRANSLATE_SECTION',
      payload: { pdfBase64, section, glossary },
    }) as {
      sectionName: string
      translatedText: string
      model: string
      estimatedCost: number
      error?: string
    }

    if (result.error) {
      row.className = 'section-row'
      btn.className = 's-btn s-btn-translate'
      btn.textContent = '▶ 再試行'
      btn.disabled = false
      showResultError(index, result.error)
      return
    }

    // 성공
    section.translatedText = result.translatedText
    section.status = 'done'
    actualCost += result.estimatedCost
    updateCostDisplay()

    // UI 완료 상태
    row.className = 'section-row done'
    btn.className = 's-btn s-btn-done'
    btn.textContent = '✅ 完了'

    // 번역 결과 표시
    const resultDiv = $(`section-result-${index}`)
    resultDiv.innerHTML = `${escapeHtml(result.translatedText)}
      <div class="s-result-meta">${result.model} | ~$${result.estimatedCost.toFixed(3)}</div>`
    resultDiv.className = 's-result visible'

  } catch (err) {
    row.className = 'section-row'
    btn.className = 's-btn s-btn-translate'
    btn.textContent = '▶ 再試行'
    btn.disabled = false
    showResultError(index, (err as Error).message)
  }
}

// ---- 전체 섹션 순차 번역 ----

async function translateAllSections(): Promise<void> {
  if (!structure) return

  const allBtn = $('btn-translate-all') as HTMLButtonElement
  allBtn.disabled = true
  allBtn.textContent = '⏳ 翻訳中...'

  for (let i = 0; i < structure.sections.length; i++) {
    const section = structure.sections[i]
    if (section.status === 'skipped' || section.status === 'done') continue

    // Gate 5: 예산 체크
    if (actualCost >= budgetLimit) {
      alert(`予算上限 ($${budgetLimit.toFixed(2)}) に達しました。`)
      break
    }

    await translateSection(i)
  }

  allBtn.disabled = false
  allBtn.textContent = '📋 全セクション翻訳'
}

// ---- UI 유틸 ----

function updateCostDisplay(): void {
  $('footer-cost').textContent = `💰 $${actualCost.toFixed(2)}`
}

function showResultError(index: number, message: string): void {
  const resultDiv = $(`section-result-${index}`)
  resultDiv.innerHTML = `<span style="color:#ef4444;">❌ ${escapeHtml(message)}</span>`
  resultDiv.className = 's-result visible'
}

function showError(message: string): void {
  const screen = $('state-loading')
  screen.innerHTML = `<p style="color:#ef4444;">❌ ${escapeHtml(message)}</p>`
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

init()
