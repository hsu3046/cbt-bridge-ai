import type {
  GlossaryEntry,
  GeminiModel,
  PdfDocumentStructure,
  PdfSection,
  PdfCostEstimate,
  Priority,
  TranslationQuality,
} from '../shared/types'
import { selectModelByQuality, getApiUrl } from './model-router'
import { buildPdfAnalysisPrompt, buildPdfTranslationPrompt } from './prompt-builder'
import {
  PDF_SKIP_SECTION_KEYWORDS,
  PDF_ESTIMATED_TOKENS_PER_PAGE,
} from '../shared/constants'

/** Pro로 번역해야 할 학술 섹션 키워드 */
const PRO_SECTION_KEYWORDS = [
  'abstract', 'conclusion', 'discussion', 'summary',
  'introduction', 'implications',
]

// ---- Phase 1: 구조 분석 + 텍스트 추출 (항상 Flash Lite — 최저 비용) ----

/**
 * PDF 구조 분석 + 전체 텍스트 추출.
 * 텍스트 추출은 단순 복사이므로 항상 Flash Lite 사용.
 */
export async function analyzePdfStructure(
  pdfBase64: string,
  apiKey: string,
): Promise<PdfDocumentStructure> {
  const prompt = buildPdfAnalysisPrompt()
  // 항상 Flash Lite — 텍스트 추출은 정확한 복사이므로 충분
  const model: GeminiModel = 'gemini-3.1-flash-lite-preview'

  const responseText = await callGeminiPdfApi(model, pdfBase64, prompt, apiKey)

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('JSON not found in response')
    }

    const raw = JSON.parse(jsonMatch[0]) as {
      title?: string
      authors?: string
      totalPages?: number
      sections?: Array<{
        name?: string
        pageStart?: number
        pageEnd?: number
        text?: string
      }>
    }

    const sections: PdfSection[] = (raw.sections ?? []).map(s => {
      const name = s.name ?? 'Unknown'
      const nameLower = name.toLowerCase()

      const shouldSkip = PDF_SKIP_SECTION_KEYWORDS.some(kw => nameLower.includes(kw))
      const isProSection = PRO_SECTION_KEYWORDS.some(kw => nameLower.includes(kw))
      const priority: Priority = isProSection ? 'high' : 'normal'

      return {
        name,
        pageStart: s.pageStart ?? 1,
        pageEnd: s.pageEnd ?? 1,
        priority,
        status: shouldSkip ? 'skipped' as const : 'pending' as const,
        // 추출된 원문 텍스트를 extractedText에 저장
        extractedText: s.text ?? undefined,
      }
    })

    return {
      title: raw.title ?? 'Unknown Title',
      authors: raw.authors ?? 'Unknown',
      totalPages: raw.totalPages ?? sections.length,
      sections,
    }
  } catch (err) {
    console.error('[CBT Bridge AI] PDF structure analysis failed:', err)
    throw new Error(`PDF構造分析に失敗しました: ${(err as Error).message}`)
  }
}

// ---- 비용 추정 ----

/**
 * Gate 3: 비용 추정 (텍스트 기반이므로 PDF 재전송 비용 없음)
 */
export function estimateCost(
  structure: PdfDocumentStructure,
  quality: TranslationQuality = 'standard',
): PdfCostEstimate {
  const skippedSections: string[] = []
  const sections: PdfCostEstimate['sections'] = []

  for (const section of structure.sections) {
    if (section.status === 'skipped') {
      skippedSections.push(section.name)
      continue
    }

    const sectionPages = section.pageEnd - section.pageStart + 1
    const modelKey = section.priority === 'high' ? 'pro' : 'flash'
    const config = selectModelByQuality(quality)

    // 텍스트만 보내므로: 섹션 텍스트 토큰 + 프롬프트
    const textLength = section.extractedText?.length ?? 0
    const inputTokens = Math.max(textLength / 4, sectionPages * PDF_ESTIMATED_TOKENS_PER_PAGE) + 500
    const outputTokens = inputTokens // 출력은 입력과 비슷

    const cost =
      (inputTokens / 1_000_000) * config.inputCostPer1M +
      (outputTokens / 1_000_000) * config.outputCostPer1M

    sections.push({
      name: section.name,
      pages: sectionPages,
      model: config.model,
      estimatedCost: Math.round(cost * 10000) / 10000,
    })
  }

  const totalEstimate = sections.reduce((sum, s) => sum + s.estimatedCost, 0)

  return {
    sections,
    totalEstimate: Math.round(totalEstimate * 100) / 100,
    skippedSections,
  }
}

// ---- Phase 2: 텍스트 기반 번역 (PDF 재전송 없음!) ----

/**
 * 추출된 텍스트를 번역합니다. PDF를 다시 보내지 않습니다.
 */
export async function translatePdfSection(
  _pdfBase64: string,
  section: PdfSection,
  glossary: GlossaryEntry[],
  apiKey: string,
  quality: TranslationQuality = 'standard',
): Promise<{ translatedText: string; model: GeminiModel; estimatedCost: number }> {
  const sourceText = section.extractedText
  if (!sourceText) {
    throw new Error(`セクション "${section.name}" のテキストが抽出されていません`)
  }

  const config = selectModelByQuality(quality)

  const prompt = buildPdfTranslationPrompt(
    section.name,
    section.pageStart,
    section.pageEnd,
    glossary,
  )

  // 텍스트만 전송 (PDF 없음!)
  const fullPrompt = `${prompt}\n\n---\n\n${sourceText}`
  const translatedText = await callGeminiTextApi(config.model, fullPrompt, apiKey)

  // 비용 계산
  const inputTokens = (sourceText.length + prompt.length) / 4
  const outputTokens = translatedText.length / 4
  const estimatedCost =
    (inputTokens / 1_000_000) * config.inputCostPer1M +
    (outputTokens / 1_000_000) * config.outputCostPer1M

  return {
    translatedText,
    model: config.model,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
  }
}

// ---- API 호출 ----

/** PDF를 inline_data로 Gemini에 전송 (Phase 1 구조 분석 전용) */
async function callGeminiPdfApi(
  model: GeminiModel,
  pdfBase64: string,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const url = getApiUrl(model, apiKey)

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 65536,  // 전체 텍스트 추출을 위해 충분히 크게
    },
  }

  return await fetchGemini(url, body)
}

/** 텍스트만 Gemini에 전송 (Phase 2 번역 전용 — PDF 없음) */
async function callGeminiTextApi(
  model: GeminiModel,
  prompt: string,
  apiKey: string,
): Promise<string> {
  const url = getApiUrl(model, apiKey)

  const body = {
    contents: [{
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 8192,
    },
  }

  return await fetchGemini(url, body)
}

/** 공통 fetch 로직 */
async function fetchGemini(url: string, body: object): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errorText}`)
  }

  const data = await response.json() as GeminiApiResponse
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini API returned empty response')
  }

  return text
}

/** Gemini API 응답 타입 */
interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}
