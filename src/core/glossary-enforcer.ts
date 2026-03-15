// ============================================================
// CBT Bridge AI — Glossary Enforcer
// 용어사전 강제 적용: 플레이스홀더 + 후처리 검증
// ============================================================

import type { GlossaryEntry } from '../shared/types'

/** 플레이스홀더 치환 결과 */
interface PreProcessResult {
  processedText: string
  placeholders: Map<string, GlossaryEntry>  // {{TERM_1}} → entry
}

/** 후처리 검증 리포트 */
interface EnforcementReport {
  enforced: Array<{ original: string; translation: string; method: 'placeholder' | 'postfix' }>
  missed: Array<{ original: string; translation: string; reason: string }>
}

// 단어 수준인지 판별 (공백 수 기준: 2단어 이하 = 플레이스홀더, 3단어 이상 = 후처리)
function isWordLevel(term: string): boolean {
  return term.split(/\s+/).length <= 2
}

/**
 * ① 전처리: 단어 수준 용어를 플레이스홀더로 치환
 *    - "CBT" → "{{TERM_1}}"
 *    - 원문에 해당 용어가 있을 때만 치환
 */
export function preProcess(text: string, glossary: GlossaryEntry[]): PreProcessResult {
  const placeholders = new Map<string, GlossaryEntry>()
  let processedText = text
  let counter = 1

  // 긴 용어부터 먼저 치환 (greedy → "cognitive behavioral therapy" 가 "cognitive" 보다 먼저)
  const sortedEntries = [...glossary]
    .filter(e => e.isApproved && isWordLevel(e.original))
    .sort((a, b) => b.original.length - a.original.length)

  for (const entry of sortedEntries) {
    // 대소문자 무시 매칭, 단어 경계 존중
    const escaped = entry.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')

    if (regex.test(processedText)) {
      const tag = `{{TERM_${counter}}}`
      placeholders.set(tag, entry)
      processedText = processedText.replace(regex, tag)
      counter++
    }
  }

  return { processedText, placeholders }
}

/**
 * ② 후처리: 플레이스홀더 복원 + 구문 수준 용어 강제 치환
 */
export function postProcess(
  translatedText: string,
  originalText: string,
  placeholders: Map<string, GlossaryEntry>,
  glossary: GlossaryEntry[]
): { text: string; report: EnforcementReport } {
  let result = translatedText
  const report: EnforcementReport = { enforced: [], missed: [] }

  // Step 1: 플레이스홀더 복원 ({{TERM_1}} → 역어)
  for (const [tag, entry] of placeholders) {
    if (result.includes(tag)) {
      result = result.replaceAll(tag, entry.translation)
      report.enforced.push({ original: entry.original, translation: entry.translation, method: 'placeholder' })
    } else {
      // AI가 플레이스홀더를 변형/삭제한 경우 — 로그만 남김
      report.missed.push({ original: entry.original, translation: entry.translation, reason: 'placeholder lost in translation' })
    }
  }

  // Step 2: 구문 수준 용어 후처리 검증 (3단어 이상)
  const phraseEntries = glossary.filter(e => e.isApproved && !isWordLevel(e.original))

  for (const entry of phraseEntries) {
    const escaped = entry.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const originalRegex = new RegExp(`\\b${escaped}\\b`, 'gi')

    // 원문에 해당 용어가 있는지 확인
    if (!originalRegex.test(originalText)) continue

    // 번역문에 지정 역어가 이미 있는지 확인
    if (result.includes(entry.translation)) {
      report.enforced.push({ original: entry.original, translation: entry.translation, method: 'postfix' })
      continue
    }

    // 역어가 없으면 — AI가 다른 표현을 쓴 것  → 치환 시도는 하지 않음 (문맥 파괴 위험)
    // 대신 리포트에 기록
    report.missed.push({
      original: entry.original,
      translation: entry.translation,
      reason: 'AI used different translation',
    })
  }

  return { text: result, report }
}

/**
 * 프롬프트용 플레이스홀더 안내 생성
 * (AI에게 {{TERM_N}} 는 그대로 유지하라고 지시)
 */
export function buildPlaceholderInstruction(placeholders: Map<string, GlossaryEntry>): string {
  if (placeholders.size === 0) return ''

  const list = [...placeholders.entries()]
    .map(([tag, _entry]) => `  ${tag} — この記号はそのまま維持`)
    .join('\n')

  return `
【プレースホルダー指示】
以下のマーカーは専門用語のプレースホルダーです。翻訳文中にそのまま維持してください（変更・省略・翻訳しないこと）：
${list}
`
}
