// ============================================================
// CBT Bridge AI — Translation Engine
// Gemini API 호출 + 청크 분할 + 결과 조합
// ============================================================

import type {
  GlossaryEntry,
  GeminiModel,
  TranslateRequest,
  TranslateResult,
  TranslationQuality,
} from '../shared/types'
import { selectModel, getApiUrl } from './model-router'
import { buildTranslationPrompt, buildTermExtractionPrompt, buildTermSuggestionPrompt } from './prompt-builder'
import { preProcess, postProcess, buildPlaceholderInstruction } from './glossary-enforcer'
import type { ExtractedTerm } from '../shared/types'

/**
 * Gemini API를 호출하여 텍스트를 번역합니다.
 * 용어사전 강제 적용: 플레이스홀더 + 후처리 검증
 */
export async function translateText(
  request: TranslateRequest,
  apiKey: string,
  quality?: TranslationQuality,
): Promise<TranslateResult> {
  const modelConfig = selectModel(request, quality)

  // ① 전처리: 단어 수준 용어를 플레이스홀더로 치환
  const { processedText, placeholders } = preProcess(request.text, request.glossary)
  const placeholderInst = buildPlaceholderInstruction(placeholders)

  const prompt = buildTranslationPrompt(
    processedText,
    request.glossary,
    {
      sectionName: request.sectionName,
      prevSummary: request.context,
    }
  ) + placeholderInst

  const rawTranslated = await callGeminiApi(
    modelConfig.model,
    prompt,
    apiKey
  )

  // ② 후처리: 플레이스홀더 복원 + 구문 수준 검증
  const { text: translated, report } = postProcess(rawTranslated, request.text, placeholders, request.glossary)

  if (report.enforced.length > 0 || report.missed.length > 0) {
    console.log('[CBT Bridge AI] 📝 Glossary enforcement:', {
      enforced: report.enforced.length,
      missed: report.missed.length,
      details: report,
    })
  }

  return {
    original: request.text,
    translated,
    paragraphId: request.paragraphId,
    model: modelConfig.model,
    tokensUsed: { input: 0, output: 0 },
  }
}

/**
 * 텍스트에서 전문용어를 추출합니다 (Flash 사용).
 */
export async function extractTerms(
  text: string,
  apiKey: string,
  domain?: string
): Promise<ExtractedTerm[]> {
  const prompt = buildTermExtractionPrompt(text, domain)
  const model: GeminiModel = 'gemini-3-flash-preview'

  const response = await callGeminiApi(model, prompt, apiKey)

  try {
    // JSON 배열 추출 (마크다운 코드블록 처리)
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as ExtractedTerm[]
    return parsed
  } catch {
    console.error('[CBT Bridge] Failed to parse term extraction response')
    return []
  }
}

/**
 * 단일 용어의 번역을 추천합니다 (Flash Lite 사용 — 즉시 응답).
 */
export async function suggestTermTranslation(
  original: string,
  apiKey: string
): Promise<string> {
  const prompt = buildTermSuggestionPrompt(original)
  const model: GeminiModel = 'gemini-3.1-flash-lite-preview'

  const response = await callGeminiApi(model, prompt, apiKey)
  return response.trim()
}

/**
 * Gemini API 호출 (공통)
 */
async function callGeminiApi(
  model: GeminiModel,
  prompt: string,
  apiKey: string
): Promise<string> {
  const url = getApiUrl(model, apiKey)

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,  // 학술 번역 — 낮은 온도로 일관성 확보
      topP: 0.8,
      maxOutputTokens: 8192,
    },
  }

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
      parts?: Array<{
        text?: string
      }>
    }
  }>
}
