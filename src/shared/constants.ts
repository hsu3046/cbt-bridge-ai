// ============================================================
// CBT Bridge AI — Constants
// ============================================================

import type { ExtensionSettings } from './types'

/** 기본 설정 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: '',
  viewMode: 'overlay',
  translateMode: 'hover',
  displayMode: 'inline',
  translationQuality: 'standard',
  autoExtractTerms: true,
  splitRatio: 0.5,
  activeProjectId: 'default',
  showTermHighlights: true,
}

/** chrome.storage 키 */
export const STORAGE_KEYS = {
  SETTINGS: 'cbt-bridge-settings',
  GLOSSARY_PREFIX: 'cbt-bridge-glossary-',
  PROJECTS: 'cbt-bridge-projects',
} as const

/** 컨텍스트 메뉴 ID */
export const CONTEXT_MENU_IDS = {
  ADD_TO_GLOSSARY: 'cbt-bridge-add-to-glossary',
  TRANSLATE_SELECTION: 'cbt-bridge-translate-selection',
} as const

/** CSS 클래스 접두사 (충돌 방지) */
export const CSS_PREFIX = 'cbt-bridge' as const

/** 최대 청크 크기 (토큰 기준 근사) */
export const MAX_CHUNK_TOKENS = 4000

/** 호버 번역 디바운스 시간 (ms) */
export const HOVER_DEBOUNCE_MS = 300

// ---- PDF 안전장치 상수 ----

/** Gate 1: 최대 파일 크기 (bytes) — 50MB */
export const PDF_MAX_FILE_SIZE = 50 * 1024 * 1024

/** Gate 2: 페이지 수 경고 임계값 */
export const PDF_MAX_PAGES_WARNING = 50

/** Gate 5: 기본 예산 상한 (USD) */
export const PDF_DEFAULT_BUDGET_LIMIT = 1.00

/** 번역 스킵 대상 섹션 키워드 (소문자 매칭) */
export const PDF_SKIP_SECTION_KEYWORDS = [
  'references', 'bibliography', 'acknowledgments', 'acknowledgements',
  'appendix', 'appendices', 'supplementary', 'conflict of interest',
  'funding', 'author contributions',
] as const

/** PDF → Gemini 입력 시 페이지당 예상 토큰 수 (비용 추정용) */
export const PDF_ESTIMATED_TOKENS_PER_PAGE = 800
