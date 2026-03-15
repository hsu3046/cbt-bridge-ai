// ============================================================
// CBT Bridge AI — Message Protocol
// Content Script ↔ Service Worker ↔ Side Panel 통신
// ============================================================

import type {
  TranslateRequest,
  TranslateResult,
  GlossaryEntry,
  ExtractedTerm,
  ViewMode,
  TranslateMode,
  DisplayMode,
  ExtensionSettings,
  PdfDocumentStructure,
  PdfCostEstimate,
  PdfSection,
} from './types'

// ---- 메시지 타입 정의 ----

export interface TranslateTextMessage {
  type: 'TRANSLATE_TEXT'
  payload: TranslateRequest
}

export interface TranslateResultMessage {
  type: 'TRANSLATE_RESULT'
  payload: TranslateResult
}

export interface TranslatePageMessage {
  type: 'TRANSLATE_PAGE'
  payload: { glossary: GlossaryEntry[] }
}

export interface ExtractTermsMessage {
  type: 'EXTRACT_TERMS'
  payload: { text: string; domain?: string }
}

export interface ExtractTermsResultMessage {
  type: 'EXTRACT_TERMS_RESULT'
  payload: { terms: ExtractedTerm[] }
}

export interface AddTermMessage {
  type: 'ADD_TERM'
  payload: {
    original: string
    translation?: string
    domain: string
    projectId: string
  }
}

export interface UpdateTermMessage {
  type: 'UPDATE_TERM'
  payload: { id: string; updates: Partial<GlossaryEntry> }
}

export interface DeleteTermMessage {
  type: 'DELETE_TERM'
  payload: { id: string }
}

export interface GetGlossaryMessage {
  type: 'GET_GLOSSARY'
  payload: { projectId: string }
}

export interface GlossaryResultMessage {
  type: 'GLOSSARY_RESULT'
  payload: { entries: GlossaryEntry[] }
}

export interface TermUpdatedMessage {
  type: 'TERM_UPDATED'
  payload: { entry: GlossaryEntry; action: 'add' | 'update' | 'delete' }
}

export interface SetViewModeMessage {
  type: 'SET_VIEW_MODE'
  payload: { mode: ViewMode }
}

export interface SetTranslateModeMessage {
  type: 'SET_TRANSLATE_MODE'
  payload: { mode: TranslateMode }
}

export interface SetDisplayModeMessage {
  type: 'SET_DISPLAY_MODE'
  payload: { mode: DisplayMode }
}

export interface OpenSidebarTranslationMessage {
  type: 'OPEN_SIDEBAR_TRANSLATION'
  payload: { translated: string; model: string }
}

export interface SidebarShowTranslationMessage {
  type: 'SIDEBAR_SHOW_TRANSLATION'
  payload: { translated: string; model: string }
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS'
}

export interface SettingsResultMessage {
  type: 'SETTINGS_RESULT'
  payload: ExtensionSettings
}

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS'
  payload: Partial<ExtensionSettings>
}

export interface SuggestTermTranslationMessage {
  type: 'SUGGEST_TERM_TRANSLATION'
  payload: { original: string }
}

export interface SuggestTermResultMessage {
  type: 'SUGGEST_TERM_RESULT'
  payload: { original: string; suggestion: string }
}

export interface OpenSplitViewMessage {
  type: 'OPEN_SPLIT_VIEW'
  payload: { layout: 'horizontal' | 'vertical'; tabId: number }
}

// ---- PDF 메시지 ----

export interface PdfAnalyzeMessage {
  type: 'PDF_ANALYZE'
  payload: { pdfBase64: string; fileName: string; fileSize: number }
}

export interface PdfAnalyzeResultMessage {
  type: 'PDF_ANALYZE_RESULT'
  payload: {
    structure: PdfDocumentStructure
    costEstimate: PdfCostEstimate
  }
}

export interface PdfTranslateSectionMessage {
  type: 'PDF_TRANSLATE_SECTION'
  payload: {
    pdfBase64: string
    section: PdfSection
    glossary: GlossaryEntry[]
  }
}

export interface PdfSectionResultMessage {
  type: 'PDF_SECTION_RESULT'
  payload: {
    sectionName: string
    translatedText: string
    model: string
    estimatedCost: number
  }
}

export interface PdfTranslateAbortMessage {
  type: 'PDF_TRANSLATE_ABORT'
}

export interface PdfFetchUrlMessage {
  type: 'PDF_FETCH_URL'
  payload: { url: string }
}

export interface ScreenshotTranslateMessage {
  type: 'SCREENSHOT_TRANSLATE'
  payload?: { layout?: 'single' | 'spread' }
}

/** 전체 메시지 유니온 타입 */
export type ExtensionMessage =
  | TranslateTextMessage
  | TranslateResultMessage
  | TranslatePageMessage
  | ExtractTermsMessage
  | ExtractTermsResultMessage
  | AddTermMessage
  | UpdateTermMessage
  | DeleteTermMessage
  | GetGlossaryMessage
  | GlossaryResultMessage
  | TermUpdatedMessage
  | SetViewModeMessage
  | SetTranslateModeMessage
  | SetDisplayModeMessage
  | GetSettingsMessage
  | SettingsResultMessage
  | UpdateSettingsMessage
  | SuggestTermTranslationMessage
  | SuggestTermResultMessage
  | OpenSplitViewMessage
  | PdfAnalyzeMessage
  | PdfAnalyzeResultMessage
  | PdfTranslateSectionMessage
  | PdfSectionResultMessage
  | PdfTranslateAbortMessage
  | PdfFetchUrlMessage
  | ScreenshotTranslateMessage
  | OpenSidebarTranslationMessage
  | SidebarShowTranslationMessage
