// ============================================================
// CBT Bridge AI — Prompt Builder (CBT 특화)
// 학술 번역 + 용어사전 주입 프롬프트 생성
// ============================================================

import type { GlossaryEntry } from '../shared/types'

interface PromptContext {
  sectionName?: string
  sectionIndex?: number
  totalSections?: number
  prevSummary?: string
  docType?: 'paper' | 'textbook' | 'news' | 'general'
}

/**
 * CBT 특화 학술 번역 프롬프트를 생성합니다.
 */
export function buildTranslationPrompt(
  text: string,
  glossary: GlossaryEntry[],
  context: PromptContext = {}
): string {
  const systemPrompt = buildSystemPrompt(glossary, context)
  const userPrompt = buildUserPrompt(text)
  return `${systemPrompt}\n\n${userPrompt}`
}

/**
 * システムプロンプト（翻訳ルール + 用語辞典）
 */
function buildSystemPrompt(
  glossary: GlossaryEntry[],
  context: PromptContext
): string {
  const glossaryBlock = buildGlossaryBlock(glossary)
  const contextBlock = buildContextBlock(context)

  return `あなたはCBT（認知行動療法）およびメンタルヘルス分野の学術文書専門翻訳者です。
英語から日本語への翻訳を行います。

${glossaryBlock}

【翻訳ルール】
1. 数式・統計記号はそのまま維持してください（LaTeX形式を保持）
2. 引用 (Author, Year) 形式は原文のまま維持してください
3. 略語は初出時に「訳語（略語）」形式で表記してください。例：行動活性化（BA）
4. 人名・機関名は原文を維持してください（例：Aaron Beck, Beck Institute）
5. 学術的文体を維持してください（口語体禁止）
6. DSM-5 / ICD-11 コードはそのまま維持してください
7. 用語辞典に登録された用語は必ず指定の訳語を使用してください
8. Figure/Table への参照は「図1」「表2」の形式で統一してください
9. コードブロックは翻訳せず、コメントのみ翻訳してください

${contextBlock}

【出力形式】
翻訳文のみを出力してください。説明や注釈は不要です。`
}

function buildGlossaryBlock(glossary: GlossaryEntry[]): string {
  if (glossary.length === 0) return ''

  const entries = glossary
    .filter(entry => entry.isApproved)
    .map(entry => `- ${entry.original} → ${entry.translation}`)
    .join('\n')

  return `【用語辞典】
以下の用語は必ず指定された訳語を使用してください：
${entries}`
}

function buildContextBlock(context: PromptContext): string {
  const parts: string[] = []

  if (context.prevSummary) {
    parts.push(`- 前セクション要約: ${context.prevSummary}`)
  }
  if (context.sectionName) {
    const position = context.sectionIndex !== undefined && context.totalSections
      ? `（全${context.totalSections}セクション中${context.sectionIndex + 1}）`
      : ''
    parts.push(`- 現在位置: ${context.sectionName}${position}`)
  }
  if (context.docType) {
    const typeMap: Record<string, string> = {
      paper: '学術論文',
      textbook: '学術書籍',
      news: 'ニュース記事',
      general: '一般文書',
    }
    parts.push(`- 文書タイプ: ${typeMap[context.docType] ?? context.docType}`)
  }

  if (parts.length === 0) return ''

  return `【コンテキスト情報】
${parts.join('\n')}`
}

function buildUserPrompt(text: string): string {
  return `以下の英文を日本語に翻訳してください：

${text}`
}

/**
 * 用語抽出プロンプト
 */
export function buildTermExtractionPrompt(text: string, domain?: string): string {
  const domainHint = domain ? `この文書は「${domain}」分野のものです。` : ''

  return `あなたは学術用語の専門家です。${domainHint}

以下の英文テキストから専門用語を抽出し、日本語の標準的な訳語を提案してください。

【出力形式】
JSON配列で出力してください。各エントリは以下の形式です：
[
  {
    "original": "英語用語",
    "suggestedTranslation": "日本語訳",
    "domain": "分野名",
    "category": "カテゴリ（概念/技法/診断/ツールなど）",
    "confidence": 0.0〜1.0
  }
]

【テキスト】
${text}`
}

/**
 * 単一用語の翻訳提案プロンプト（Flash Lite用 — 軽量）
 */
export function buildTermSuggestionPrompt(original: string): string {
  return `認知行動療法（CBT）およびメンタルヘルス分野で使用される用語「${original}」の標準的な日本語訳を1つだけ回答してください。訳語のみ出力してください。`
}

// ---- PDF 専用プロンプト ----

/**
 * PDF 構造分析 + 全文テキスト抽出プロンプト
 * PDFを1回だけ送信 → 構造とテキストを同時に取得
 * 以降の翻訳ではPDFを再送信しない（コスト75%削減）
 */
export function buildPdfAnalysisPrompt(): string {
  return `あなたは学術論文の構造分析と正確なテキスト抽出の専門家です。

このPDF論文から以下の情報をJSON形式で抽出してください。

【出力形式】
JSONのみ出力してください。説明は不要です。
{
  "title": "論文タイトル（原文のまま）",
  "authors": "著者名（原文のまま）",
  "totalPages": ページ数,
  "sections": [
    {
      "name": "セクション名（原文のまま）",
      "pageStart": 開始ページ,
      "pageEnd": 終了ページ,
      "text": "このセクションの全文テキスト（原文英語のまま）"
    }
  ]
}

【重要な注意事項】
- セクション名は原文（英語）のまま記載
- "text" フィールドには、そのセクションの原文テキストをすべて含めてください
- 数式、引用、表の内容もテキストとして含めてください
- Abstract, Introduction, Methods, Results, Discussion, Conclusion, References 等の主要セクションを網羅
- サブセクション（例: 2.1, 2.2）は親セクションに含める
- Referencesセクションのtextは "（参考文献リスト）" と省略してOK`
}

/**
 * テキストベース翻訳プロンプト（PDFを再送信しない）
 * Phase 1で抽出したテキストのみを使用
 */
export function buildPdfTranslationPrompt(
  sectionName: string,
  _pageStart: number,
  _pageEnd: number,
  glossary: GlossaryEntry[],
): string {
  const glossaryBlock = buildGlossaryBlock(glossary)

  return `あなたはCBT（認知行動療法）およびメンタルヘルス分野の学術文書専門翻訳者です。

以下の学術論文セクション「${sectionName}」の英語テキストを日本語に翻訳してください。

${glossaryBlock}

【翻訳ルール】
1. 数式・統計記号はそのまま維持（LaTeX形式を保持）
2. 引用 (Author, Year) 形式は原文のまま維持
3. 略語は初出時に「訳語（略語）」形式で表記。例：行動活性化（BA）
4. 人名・機関名は原文を維持（例：Aaron Beck, Beck Institute）
5. 学術的文体を維持（口語体禁止）
6. DSM-5 / ICD-11 コードはそのまま維持
7. 用語辞典に登録された用語は必ず指定の訳語を使用
8. Figure/Table への参照は「図1」「表2」の形式で統一

【出力形式】
翻訳文のみを出力してください。セクション見出しも翻訳して含めてください。`
}

// ---- スクリーンショット翻訳プロンプト ----

/**
 * スクリーンショット画像の翻訳プロンプト（Gemini Vision用）
 * Kindle等DOM非対応サイトで使用
 */
export function buildScreenshotTranslationPrompt(glossary: GlossaryEntry[]): string {
  const glossarySection = glossary.length > 0
    ? `\n【用語辞典】以下の用語は指定の訳語を使用してください:\n${glossary.slice(0, 30).map(e => `- ${e.original} → ${e.translation}`).join('\n')}\n`
    : ''

  return `あなたは英日翻訳の専門家です。
このスクリーンショットに**表示されている英語テキストだけ**を読み取り、日本語に翻訳してください。

⚠️ **最重要ルール: 画像に見えないテキストは絶対に追加しない**
- この画像はページの一部分だけを表示しています
- 文章が途中で切れている場合、切れたままで翻訳してください（補完禁止）
- あなたの知識やトレーニングデータから本の内容を補完してはいけません
- 画像に物理的に表示されている文字のみが翻訳対象です

📖 **見開きレイアウトの処理**
- 画像に左右2つのカラム/ページが表示されている場合、それらは**別々のページ**です
- 左ページを先に翻訳し、次に右ページを翻訳してください
- ページの区切りは「---」で示してください
- 左右を混ぜて読まないでください（左の段落→右の段落と交互に読むのは間違い）

【翻訳ルール】
1. 画像内に見える英語テキストのみを対象にする
2. UIボタン、ページ番号、ヘッダー/フッターは無視
3. 本文の段落構造を維持する
4. 見出しがあれば見出しとして翻訳する
5. 人名・固有名詞は原文のまま維持
6. 自然で読みやすい日本語にする
7. 文が途中で始まる場合 → 「...」で始める
8. 文が途中で終わる場合 → 「...」で終わる
${glossarySection}
【出力形式】
翻訳文のみを出力してください。余計な説明は不要です。`
}
