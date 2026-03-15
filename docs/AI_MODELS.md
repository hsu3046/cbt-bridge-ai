# CBT Bridge AI — AI モデル & コスト

## 使用モデル一覧

| モデル | 用途 | Input | Output | 備考 |
|--------|------|-------|--------|------|
| `gemini-3.1-flash-lite-preview` | ホバー翻訳、用語推薦 | $0.25/1M | $1.50/1M | 最軽量・最安 |
| `gemini-3-flash-preview` | 通常段落翻訳、用語抽出 | $0.50/1M | $3.00/1M | バランス |
| `gemini-3.1-pro-preview` | 核心セクション翻訳 | $2.00/1M | $12.00/1M | 最高品質 |

> 価格は2026年3月時点。最新の料金は [Google AI Studio](https://ai.google.dev/pricing) を参照。

---

## ルーティングロジック

```
Request → priority?
  ├─ low    → Flash Lite  (ホバー、リアルタイム)
  ├─ high   → Pro         (手動指定)
  └─ normal → sectionName?
       ├─ abstract/conclusion/discussion/summary
       │    → Pro         (核心セクション自動昇格)
       └─ other
            → Flash       (デフォルト)
```

---

## コスト見積もり

### 1ページあたりの概算

| シナリオ | 段落数 | モデル | 段落平均 | 総トークン | 推定コスト |
|---------|--------|--------|---------|-----------|-----------|
| ブログ記事ホバー (5段落) | 5 | Flash Lite | ~200 tokens | ~2,000 | **< $0.01** |
| 論文全文翻訳 | 30 | Flash | ~300 tokens | ~18,000 | **~$0.06** |
| 論文核心セクション | 5 | Pro | ~500 tokens | ~5,000 | **~$0.07** |
| ニュースサイト全文 | 20 | Flash Lite | ~150 tokens | ~6,000 | **~$0.01** |

### コスト制御メカニズム

1. **チャンク翻訳** — 10段落ずつ翻訳、毎回の確認ダイアログ
2. **本文フィルター** — Cookie, Nav, Sidebar, Ad, Comment, Footer を自動除外
3. **可視性チェック** — `display:none`、サイズ0の要素をスキップ
4. **本文領域検出** — `<article>` → `<main>` → テキスト密度 の優先順位

---

## APIパラメータ

```typescript
{
  temperature: 0.2,   // 低温度 → 学術翻訳の一貫性確保
  topP: 0.8,
  maxOutputTokens: 8192,
}
```

---

## API エンドポイント

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
```

**認証:** URLパラメータ `key` でAPIキー指定。`chrome.storage.local` に保存。
