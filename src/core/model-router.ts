// ============================================================
// CBT Bridge AI — Gemini Model Router
// 3단계 품질 선택: 速読(Flash Lite) / 標準(Flash) / 高品質(Pro)
// ============================================================

import type { GeminiModel, Priority, TranslateRequest, TranslationQuality } from '../shared/types'

export interface ModelConfig {
  model: GeminiModel
  inputCostPer1M: number
  outputCostPer1M: number
  maxOutputTokens: number
}

const MODELS: Record<string, ModelConfig> = {
  pro: {
    model: 'gemini-3.1-pro-preview',
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00,
    maxOutputTokens: 65536,
  },
  flash: {
    model: 'gemini-3-flash-preview',
    inputCostPer1M: 0.50,
    outputCostPer1M: 3.00,
    maxOutputTokens: 65536,
  },
  flashLite: {
    model: 'gemini-3.1-flash-lite-preview',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.50,
    maxOutputTokens: 65536,
  },
} as const

/**
 * 품질 레벨에 따라 모델을 선택합니다 (유저 선택 기반).
 * speed → Flash Lite, standard → Flash, premium → Pro
 */
export function selectModelByQuality(quality: TranslationQuality): ModelConfig {
  switch (quality) {
    case 'speed': return MODELS.flashLite
    case 'premium': return MODELS.pro
    case 'standard':
    default: return MODELS.flash
  }
}

/**
 * 번역 요청의 특성 + 품질 설정에 따라 모델을 선택합니다.
 * 품질 설정이 있으면 우선 적용, 없으면 기존 priority 기반.
 */
export function selectModel(request: TranslateRequest, quality?: TranslationQuality): ModelConfig {
  if (quality) {
    return selectModelByQuality(quality)
  }

  const { priority } = request
  if (priority === 'low') return MODELS.flashLite
  if (priority === 'high') return MODELS.pro
  return MODELS.flash
}

/**
 * 모델 이름으로 직접 설정을 가져옵니다.
 */
export function getModelConfig(modelKey: 'pro' | 'flash' | 'flashLite'): ModelConfig {
  return MODELS[modelKey]
}

/**
 * Gemini API 엔드포인트 URL을 생성합니다.
 */
export function getApiUrl(model: GeminiModel, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}
