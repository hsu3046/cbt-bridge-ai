# 🧠 CBT Bridge AI

## Tagline-en

Has AI translation really been perfected? When reading academic papers or lengthy PDFs, technical terms are still a mess — there's a long way to go. CBT Bridge AI leverages Google Gemini and a custom glossary to translate accurately and consistently, right in your browser.

## Tagline-ko

AI 번역, 정말 완벽해졌을까요? 논문이나 장문의 PDF를 읽다 보면 전문용어가 뒤죽박죽—아직 갈 길이 멉니다. CBT Bridge AI는 Google Gemini와 커스텀 용어사전를 활용하여, 전문용어까지 정확하고 일관되게 웹브라우저에서 바로 번역합니다.

## Tagline-ja

AI翻訳、本当に完璧になったのでしょうか？ 論文や長文のPDFを読んでいると、専門用語はまだバラバラ——まだまだ先は長いのです。CBT Bridge AIはGoogle Geminiとカスタム用語辞典を活用し、専門用語まで正確かつ一貫して、ウェブブラウザ上でそのまま翻訳します。

---

## Summary-en

AI translation has come a long way, but reading academic papers, lengthy PDFs, or e-books still comes with plenty of frustrations. Technical terms get mistranslated or rendered differently every time, forcing you to manually correct them over and over. CBT Bridge AI was built to solve exactly this. Powered by Google Gemini, this Chrome extension uses a dedicated glossary to translate English into Japanese — accurately and consistently, right down to the jargon. Just hover over text or select a passage for instant translation, and you can even upload PDFs to translate section by section. Pick your quality tier — Speed-read (Flash Lite), Standard (Flash), or Premium (Pro) — and view results as a popup, inline, or in a split-screen layout that works best for you.

## Summary-ko

AI 번역의 품질은 놀라울 정도로 발전했지만, 논문이나 장문의 PDF·이북을 읽을 때면 여전히 아쉬운 점이 많습니다. 전문용어가 제대로 번역되지 않거나, 같은 용어가 매번 다르게 옮겨져 일일이 수정해야 하는 번거로움—이런 문제를 해결하기 위해 CBT Bridge AI가 탄생했습니다. Google Gemini 기반의 이 Chrome 확장 프로그램은 전용 용어사전을 활용하여 전문용어까지 정확하고 일관되게, 영어를 일본어로 번역해 줍니다. 마우스를 올리거나 텍스트를 선택하는 것만으로 바로 번역되고, PDF 파일을 업로드해서 섹션별로 번역할 수도 있어요. 속독(Flash Lite)·표준(Flash)·고품질(Pro) 중 원하는 품질을 골라 팝업·인라인·분할 화면 등 자신에게 맞는 방식으로 번역 결과를 확인해 보세요.

## Summary-ja

AI翻訳の精度は飛躍的に向上しましたが、論文や長文のPDF・電子書籍を読むときには、まだまだ不便な点が残っています。専門用語が正しく訳されなかったり、同じ用語がそのたびに違う訳になって、いちいち修正しなければならない煩わしさ——そんな問題を解決するために、CBT Bridge AIは生まれました。Google Gemini搭載のこのChrome拡張機能は、専用用語辞典を活用して、専門用語まで正確かつ一貫した英日翻訳を実現します。マウスオーバーやテキスト選択だけですぐに翻訳され、PDFファイルをアップロードしてセクションごとに翻訳することもできます。速読（Flash Lite）・標準（Flash）・高品質（Pro）からお好みの品質を選んで、ポップアップ・インライン・分割画面など、自分に合った方法で翻訳結果をご確認ください。

---

## ✨ What It Does

- **Translates on hover or selection** — Point at any English paragraph and get instant Japanese translation without copy-pasting.
- **Uploads and translates full PDFs** — Drop a PDF file or detect the current tab's PDF, then view section-by-section translations in a dedicated viewer.
- **Enforces a CBT glossary** — 40+ preset terms (plus your own additions) guarantee consistent, domain-accurate translations every time.
- **Offers three quality tiers** — Speed-read (Flash Lite), Standard (Flash), or Premium (Pro) — pick the right balance of cost and accuracy.
- **Shows results your way** — Inline replacement, a floating popup with expand/minimize, or a left-right split view.
- **Manages a live glossary sidebar** — Add, edit (both English and Japanese), and delete terms in a Chrome side panel that stays in sync with translations.
- **Works on any website** — Content script injects seamlessly; translates academic sites, journals, and general web pages alike.
- **Minimizes to a tab** — Collapse the translation popup or sidebar, then reopen without losing your results.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Platform | Chrome Extension (Manifest V3) |
| Language | TypeScript (Strict) |
| Build | Vite 6 + @crxjs/vite-plugin |
| AI Model | Google Gemini API (Flash Lite / Flash / Pro) |
| Storage | Chrome Storage API (local) |
| UI | Vanilla HTML/CSS + Lucide Icons (inline SVG) |

---

## 📦 Installation

```bash
git clone https://github.com/knowai/cbt-bridge-ai.git
cd cbt-bridge-ai
npm install
cp .env.example .env.local   # Fill in your Gemini API key
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder
4. Click the extension icon and enter your Gemini API key in **設定 (Settings)**

---

## 📁 Project Structure

```
├── src/
│   ├── background/          # Service worker (message routing, API calls)
│   ├── content/             # Content script + overlay CSS (hover/select UI)
│   ├── core/                # Translation engine, model router, prompt builder, PDF translator
│   ├── glossary/            # Glossary store (CRUD for term entries)
│   ├── popup/               # Extension popup (settings, quality picker, PDF upload)
│   ├── sidepanel/           # Side panel (glossary management UI)
│   ├── splitview/           # Left-right / top-bottom split translation view
│   ├── pdfviewer/           # Dedicated PDF translation viewer
│   ├── options/             # Options / settings page
│   ├── shared/              # Types, messages, constants
│   └── assets/              # Extension icons
├── manifest.json            # Chrome Extension Manifest V3
├── vite.config.ts           # Vite build configuration
├── tsconfig.json            # TypeScript configuration
└── .env.example             # API key template
```

---

## 🗺 Roadmap

- [ ] Support EN → KO (Korean) translation mode
- [ ] Context menu integration (right-click to translate selection)
- [ ] Batch translation for multiple paragraphs
- [ ] Export translated PDF as downloadable file
- [ ] Support additional AI providers (Claude, GPT)
- [ ] Chrome Web Store publication

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat(scope): add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

---

*Built by [KnowAI](https://knowai.space) · © 2026 KnowAI*
