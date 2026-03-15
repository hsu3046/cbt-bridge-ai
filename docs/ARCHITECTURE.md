# CBT Bridge AI — アーキテクチャ

> AI-powered EN→JP academic translator for CBT & mental health

## 概要

Chrome拡張機能（MV3）として構築。CBT（認知行動療法）およびメンタルヘルス分野の英語文献を、用語辞典と連携しながら日本語に翻訳する。

---

## システム構成図

```
┌──────────────────────────────────────────────────────┐
│                    Chrome Browser                     │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐            │
│  │  Popup   │  │Side Panel│  │  Options  │  ← UI層     │
│  └────┬─────┘  └─────┬────┘  └────┬──────┘            │
│       │              │            │                    │
│  ─ ─ ─┴── ─ ─ ─ ─ ─ ┴─ ─ ─ ─ ─ ─┴─ ─ ─ ─ ─ ─       │
│       chrome.runtime.sendMessage (Message Bus)         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─       │
│                       │                                │
│              ┌────────▼─────────┐                      │
│              │  Service Worker  │ ← メッセージルーター    │
│              │  (Background)    │                      │
│              └───┬────┬────┬───┘                       │
│                  │    │    │                            │
│          ┌───────┘    │    └───────┐                    │
│          ▼            ▼            ▼                    │
│  ┌──────────┐ ┌────────────┐ ┌──────────────┐          │
│  │Translator│ │Model Router│ │Glossary Store│ ← Core層  │
│  └─────┬────┘ └────────────┘ └──────────────┘          │
│        │                                               │
│        ▼                                               │
│  ┌──────────────┐                                      │
│  │ Gemini API   │ ← 外部API                            │
│  └──────────────┘                                      │
│                                                        │
│  ┌────────────────────────────────────────────┐         │
│  │          Content Script (各タブ)            │         │
│  │  ・ホバー翻訳ボタン                         │         │
│  │  ・オーバーレイ表示                          │         │
│  │  ・全文翻訳 (TRANSLATE_ALL)                 │         │
│  │  ・インライン用語登録                        │         │
│  └────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

---

## ディレクトリ構成

```
src/
├── assets/icons/          # 拡張アイコン (16/48/128px)
├── background/
│   └── service-worker.ts  # メッセージハブ + API呼出 + コンテキストメニュー
├── content/
│   ├── content-script.ts  # タブ内UI + 翻訳トリガー + 全文翻訳
│   └── styles/overlay.css # オーバーレイ翻訳のCSS
├── core/
│   ├── translator.ts      # Gemini API呼出 + 用語抽出
│   ├── model-router.ts    # 3モデルハイブリッドルーティング
│   └── prompt-builder.ts  # CBT特化翻訳プロンプト生成
├── glossary/
│   ├── glossary-store.ts  # chrome.storage ベース CRUD
│   └── presets/
│       └── cbt-mental-health.json  # プリセット用語辞典 (40語)
├── options/               # 設定画面 (APIキー入力)
├── popup/                 # ポップアップ (モード選択 + 分割ビュー)
├── shared/
│   ├── types.ts           # 全共通型定義
│   ├── messages.ts        # メッセージプロトコル (19種)
│   └── constants.ts       # デフォルト設定 + ストレージキー
├── sidepanel/             # サイドパネル (用語辞典管理)
└── splitview/             # 分割ビュー HTML (現在は未使用)
```

---

## コアモジュール詳細

### 1. Model Router (`core/model-router.ts`)

3段階のGeminiモデルを要求特性に応じて自動選択:

| Priority | モデル | 用途 | コスト (per 1M tokens) |
|----------|--------|------|------------------------|
| `low` | **Flash Lite** (`gemini-3.1-flash-lite-preview`) | ホバー翻訳、用語推薦 | $0.25 / $1.50 |
| `normal` | **Flash** (`gemini-3-flash-preview`) | 通常翻訳 | $0.50 / $3.00 |
| `high` | **Pro** (`gemini-3.1-pro-preview`) | 核心セクション | $2.00 / $12.00 |

**自動Pro昇格キーワード:** abstract, conclusion, discussion, summary, introduction, implications

### 2. Prompt Builder (`core/prompt-builder.ts`)

CBT分野に特化した翻訳プロンプトを生成:

- **用語辞典注入** — `isApproved === true` の用語のみプロンプトに含める
- **9つの翻訳ルール** — 数式維持、引用形式維持、略語表記、人名維持、学術文体、DSM/ICDコード etc.
- **コンテキスト情報** — 前セクション要約、現在位置、文書タイプ
- **用語抽出プロンプト** — テキストから専門用語をJSON抽出
- **用語推薦プロンプト** — 単一用語の日本語訳提案（Flash Lite用）

### 3. Translator (`core/translator.ts`)

3つの翻訳機能:

| 関数 | モデル | 用途 |
|------|--------|------|
| `translateText()` | ルーターで自動選択 | テキスト翻訳 |
| `extractTerms()` | Flash | テキストから専門用語を一括抽出 |
| `suggestTermTranslation()` | Flash Lite | 単一用語の翻訳推薦 |

**APIパラメータ:** `temperature: 0.2`, `topP: 0.8`, `maxOutputTokens: 8192`

---

## メッセージプロトコル

Content Script ↔ Service Worker ↔ UI間の通信は `chrome.runtime.sendMessage` で統一。

| メッセージタイプ | 方向 | ペイロード |
|-----------------|------|-----------|
| `TRANSLATE_TEXT` | Content/UI → SW | `TranslateRequest` |
| `TRANSLATE_RESULT` | SW → Content | `TranslateResult` |
| `TRANSLATE_ALL` | SW → Content | (なし) — 全文翻訳トリガー |
| `EXTRACT_TERMS` | UI → SW | `{ text, domain? }` |
| `ADD_TERM` / `UPDATE_TERM` / `DELETE_TERM` | UI → SW | 用語CRUD |
| `GET_GLOSSARY` | Content/UI → SW | `{ projectId }` |
| `OPEN_SPLIT_VIEW` | Popup → SW | `{ layout, tabId }` |
| `GET_SETTINGS` / `UPDATE_SETTINGS` | UI → SW | 設定管理 |

---

## 翻訳モード

### ホバー翻訳 (デフォルト)
1. ユーザーが段落にマウスオーバー
2. 翻訳ボタン（🌐）が表示
3. クリック → Flash Lite で翻訳
4. 原文をインラインで翻訳テキストに置換
5. 再クリック → 原文に戻る

### 全文翻訳 (Split View)
1. ポップアップ → 分割ビューボタンクリック
2. 同じURLを新ウインドウで開く
3. 新ウインドウのContent Scriptに `TRANSLATE_ALL` 送信
4. **本文自動検出** (`findMainContentRoot`):
   - 1順位: `<article>` タグ
   - 2順位: `<main>` / `[role="main"]`
   - 3順位: テキスト密度最大のコンテナ
   - Fallback: `<body>`
5. **チャンク翻訳** (10段落ずつ):
   - 10段落翻訳後 → プログレスバー表示
   - `▶ 続行` / `⏹ 停止` で制御
   - コスト暴走防止

### 除外フィルター
Cookie, Consent, GDPR, Modal, Popup, Nav, Sidebar, Widget, Ad, Comment, Footer, Header, Banner, Alert, Notice

---

## データ永続化

`chrome.storage.local` を使用:

| キー | 内容 |
|------|------|
| `cbt-bridge-settings` | 全体設定 (APIキー, モード等) |
| `cbt-bridge-glossary-{projectId}` | プロジェクト別用語辞典 |
| `cbt-bridge-projects` | プロジェクト一覧 |
| `cbt-bridge-enabled` | 拡張有効/無効状態 |

---

## ビルド & 開発

| コマンド | 説明 |
|---------|------|
| `npm run dev` | Vite devサーバー + HMR |
| `npm run build` | TypeScript型チェック + Vite build → `dist/` |

**依存関係:**
- `@crxjs/vite-plugin` — Chrome拡張ビルド統合
- `@types/chrome` — Chrome API型定義
- `typescript` — 厳密型チェック
- `vite` — バンドラー

**ランタイム依存: ゼロ** — 全てブラウザAPI + Gemini REST APIのみ。
