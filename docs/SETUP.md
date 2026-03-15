# CBT Bridge AI — セットアップガイド

## 前提条件

- **Node.js** 18+
- **Google AI Studio** APIキー ([取得方法](https://ai.google.dev/))
- **Chrome** 120+ (Manifest V3対応)

---

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/KnowAI/cbt-bridge-ai.git
cd cbt-bridge-ai

# 依存関係のインストール
npm install

# ビルド
npm run build
```

---

## Chrome に拡張機能を読み込む

1. `chrome://extensions` を開く
2. **「デベロッパーモード」** を ON にする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. `dist/` フォルダを選択

---

## APIキーの設定

1. 拡張アイコン → **右クリック → オプション** を開く
2. Google AI Studio のAPIキーを入力
3. **「保存」** をクリック

> ⚠️ APIキーは `chrome.storage.local` にのみ保存されます。  
> コミット・ログ出力には一切含まれません。

---

## 開発

```bash
# 開発サーバー (HMR対応)
npm run dev

# 型チェック + ビルド
npm run build
```

### ファイル変更後の反映

1. コードを変更
2. `npm run build` を実行
3. `chrome://extensions` で拡張機能を **「再読み込み」**
4. 対象ページを **F5** で再読み込み

---

## 環境変数

このプロジェクトは `.env` を使用しません。  
全ての設定は Chrome拡張の **Options画面** から `chrome.storage.local` に保存されます。

```
.env.example  → APIキーの形式参考のみ
```
