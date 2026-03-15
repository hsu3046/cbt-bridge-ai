# CBT Bridge AI — API リファレンス

## 内部メッセージ API

Chrome拡張の各コンポーネント間は `chrome.runtime.sendMessage` で通信。

---

### 翻訳系

#### `TRANSLATE_TEXT`
テキストを翻訳する。

```typescript
// 送信
chrome.runtime.sendMessage({
  type: 'TRANSLATE_TEXT',
  payload: {
    text: string,          // 翻訳対象テキスト
    glossary: GlossaryEntry[], // 用語辞典
    priority: 'high' | 'normal' | 'low',
    context?: string,      // 前セクションの要約
    sectionName?: string,  // セクション名 (Pro昇格判定用)
    paragraphId?: string,  // 段落ID
  }
})

// 応答
{
  original: string,
  translated: string,
  model: GeminiModel,
  tokensUsed: { input: number, output: number },
  paragraphId?: string,
}
```

#### `TRANSLATE_ALL`
Content Scriptへ全文翻訳を指示 (Service Worker → Content Script)。

```typescript
chrome.tabs.sendMessage(tabId, { type: 'TRANSLATE_ALL' })
```

---

### 用語辞典系

#### `GET_GLOSSARY`
```typescript
// 送信
{ type: 'GET_GLOSSARY', payload: { projectId: string } }

// 応答
{ entries: GlossaryEntry[] }
```

#### `ADD_TERM`
```typescript
{
  type: 'ADD_TERM',
  payload: {
    original: string,
    translation?: string,  // 未指定時 → AI自動推薦
    domain: string,
    projectId: string,
  }
}
```

#### `UPDATE_TERM` / `DELETE_TERM`
```typescript
{ type: 'UPDATE_TERM', payload: { id: string, updates: Partial<GlossaryEntry> } }
{ type: 'DELETE_TERM', payload: { id: string } }
```

#### `EXTRACT_TERMS`
テキストから専門用語を一括抽出。

```typescript
// 送信
{ type: 'EXTRACT_TERMS', payload: { text: string, domain?: string } }

// 応答
{ terms: ExtractedTerm[] }
```

#### `SUGGEST_TERM_TRANSLATION`
単一用語の翻訳を推薦 (Flash Lite使用)。

```typescript
// 送信
{ type: 'SUGGEST_TERM_TRANSLATION', payload: { original: string } }

// 応答
{ original: string, suggestion: string }
```

---

### 設定系

#### `GET_SETTINGS` / `UPDATE_SETTINGS`
```typescript
{ type: 'GET_SETTINGS' }
// 応答: ExtensionSettings

{ type: 'UPDATE_SETTINGS', payload: Partial<ExtensionSettings> }
```

---

### 表示モード系

#### `TOGGLE_EXTENSION`
```typescript
{ type: 'TOGGLE_EXTENSION', payload: { enabled: boolean } }
```

#### `SET_VIEW_MODE`
```typescript
{ type: 'SET_VIEW_MODE', payload: { mode: 'overlay' | 'split' } }
```

---

### 分割ビュー

#### `OPEN_SPLIT_VIEW`
Popup → Service Worker。同URLを新ウインドウで開き、全文翻訳。

```typescript
{
  type: 'OPEN_SPLIT_VIEW',
  payload: {
    layout: 'horizontal' | 'vertical',
    tabId: number,
  }
}
```

---

## 外部 API

### Gemini API

**エンドポイント:**
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
```

**リクエストボディ:**
```json
{
  "contents": [
    {
      "parts": [{ "text": "プロンプト" }]
    }
  ],
  "generationConfig": {
    "temperature": 0.2,
    "topP": 0.8,
    "maxOutputTokens": 8192
  }
}
```

**レスポンス:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "翻訳結果" }]
      }
    }
  ]
}
```
