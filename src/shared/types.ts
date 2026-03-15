// ============================================================
// CBT Bridge AI — Shared Types
// ============================================================

/** 번역 보기 모드 */
export type ViewMode = 'overlay' | 'split'

/** 번역 트리거 모드 */
export type TranslateMode = 'hover' | 'select' | 'page'

/** 모델 우선순위 (→ 모델 라우터에서 사용) */
export type Priority = 'high' | 'normal' | 'low'

/** 번역 품질 레벨 (유저 선택) */
export type TranslationQuality = 'speed' | 'standard' | 'premium'

/** 表示位置 (自動/選択のみ時の翻訳結果表示場所) */
export type DisplayMode = 'inline' | 'popup' | 'sidebar'

/** Gemini 모델 ID */
export type GeminiModel =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-flash-lite-preview'

/** 용어사전 항목 */
export interface GlossaryEntry {
  id: string
  original: string        // 영문 원문
  translation: string     // 일문 번역
  domain: string          // 도메인 (예: "CBT", "Psychiatry")
  category: string        // 카테고리 (예: "인지왜곡", "기법")
  source: 'preset' | 'ai' | 'user'  // 출처
  isApproved: boolean     // 사용자 승인 여부
  usageCount: number      // 사용 횟수
  createdAt: number       // 타임스탬프
  updatedAt: number
}

/** 용어사전 프로젝트 */
export interface GlossaryProject {
  id: string
  name: string
  domain: string
  entries: GlossaryEntry[]
  createdAt: number
  updatedAt: number
}

/** 익스텐션 설정 */
export interface ExtensionSettings {
  apiKey: string
  viewMode: ViewMode
  translateMode: TranslateMode
  displayMode: DisplayMode
  translationQuality: TranslationQuality
  autoExtractTerms: boolean
  splitRatio: number       // 0~1 (좌측 원문 비율)
  activeProjectId: string
  showTermHighlights: boolean
}

/** 번역 요청 */
export interface TranslateRequest {
  text: string
  context?: string
  sectionName?: string
  glossary: GlossaryEntry[]
  priority: Priority
  paragraphId?: string
}

/** 번역 결과 */
export interface TranslateResult {
  original: string
  translated: string
  paragraphId?: string
  model: GeminiModel
  tokensUsed: { input: number; output: number }
}

/** 용어 추출 결과 */
export interface ExtractedTerm {
  original: string
  suggestedTranslation: string
  domain: string
  category: string
  confidence: number  // 0~1
}

// ---- PDF 번역 ----

/** PDF 섹션 상태 */
export type PdfSectionStatus = 'pending' | 'translating' | 'done' | 'skipped'

/** PDF 문서 구조 (Phase 1 구조 분석 결과) */
export interface PdfDocumentStructure {
  title: string
  authors: string
  totalPages: number
  sections: PdfSection[]
}

/** PDF 섹션 */
export interface PdfSection {
  name: string
  pageStart: number
  pageEnd: number
  priority: Priority
  status: PdfSectionStatus
  extractedText?: string     // Phase 1에서 추출된 원문 텍스트
  translatedText?: string
}

/** PDF 비용 추정 */
export interface PdfCostEstimate {
  sections: Array<{
    name: string
    pages: number
    model: GeminiModel
    estimatedCost: number
  }>
  totalEstimate: number
  skippedSections: string[]
}

/** PDF 번역 상태 */
export interface PdfTranslationState {
  fileName: string
  fileSize: number
  structure: PdfDocumentStructure | null
  costEstimate: PdfCostEstimate | null
  currentSectionIndex: number
  actualCostSoFar: number
  budgetLimit: number
}
