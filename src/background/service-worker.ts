// ============================================================
// CBT Bridge AI — Service Worker (Background Script)
// 메시지 라우팅 + API 호출 + 컨텍스트 메뉴
// ============================================================

import { translateText, extractTerms, suggestTermTranslation } from '../core/translator'
import { analyzePdfStructure, translatePdfSection, estimateCost } from '../core/pdf-translator'
import { getGlossary, addTerm, updateTerm, deleteTerm, initDefaultProject } from '../glossary/glossary-store'
import { CONTEXT_MENU_IDS, DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants'
import type { ExtensionSettings, GlossaryEntry } from '../shared/types'
import type { ExtensionMessage } from '../shared/messages'

// ---- 초기화 ----

chrome.runtime.onInstalled.addListener(async () => {
  // 기본 프로젝트 + 프리셋 로드
  await initDefaultProject()

  // 컨텍스트 메뉴 생성
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.ADD_TO_GLOSSARY,
    title: '📖 用語辞典に追加',
    contexts: ['selection'],
  })

  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.TRANSLATE_SELECTION,
    title: '🌐 選択テキストを翻訳',
    contexts: ['selection'],
  })

  // 사이드 패널 설정
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })

  console.log('[CBT Bridge AI] Extension installed successfully')
})

// ---- 컨텍스트 메뉴 핸들러 ----

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab?.id) return

  if (info.menuItemId === CONTEXT_MENU_IDS.ADD_TO_GLOSSARY) {
    // 사이드 패널 열기 + 용어 추가 요청
    await chrome.sidePanel.open({ tabId: tab.id })
    // 선택된 텍스트 → AI 번역 추천 → 사이드 패널로 전달
    const settings = await getSettings()
    if (!settings.apiKey) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TRANSLATE_RESULT',
        payload: { original: info.selectionText, translated: '⚠️ APIキーを設定してください', model: '', tokensUsed: { input: 0, output: 0 } },
      })
      return
    }
    const suggestion = await suggestTermTranslation(info.selectionText, settings.apiKey)
    chrome.runtime.sendMessage({
      type: 'SUGGEST_TERM_RESULT',
      payload: { original: info.selectionText, suggestion },
    })
  }

  if (info.menuItemId === CONTEXT_MENU_IDS.TRANSLATE_SELECTION) {
    const settings = await getSettings()
    if (!settings.apiKey) return
    const glossary = await getGlossary(settings.activeProjectId)
    const result = await translateText(
      { text: info.selectionText, glossary, priority: 'low' },
      settings.apiKey
    )
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TRANSLATE_RESULT',
        payload: result,
      })
    }
  }
})

// ---- 메시지 핸들러 ----

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[CBT Bridge AI] Message handler error:', err)
    sendResponse({ error: (err as Error).message })
  })
  return true // 비동기 응답
})

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const settings = await getSettings()

  switch (message.type) {
    case 'TRANSLATE_TEXT': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const qs = await chrome.storage.local.get('cbt-bridge-quality')
      const tq = (qs['cbt-bridge-quality'] as string ?? 'standard') as 'speed' | 'standard' | 'premium'
      return await translateText(message.payload, settings.apiKey, tq)
    }

    case 'EXTRACT_TERMS': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const terms = await extractTerms(
        message.payload.text,
        settings.apiKey,
        message.payload.domain
      )
      return { terms }
    }

    case 'SUGGEST_TERM_TRANSLATION': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const suggestion = await suggestTermTranslation(
        message.payload.original,
        settings.apiKey
      )
      return { original: message.payload.original, suggestion }
    }

    case 'ADD_TERM': {
      const entry = await addTerm(message.payload.projectId, {
        original: message.payload.original,
        translation: message.payload.translation ?? '',
        domain: message.payload.domain,
        category: '',
        source: 'user',
        isApproved: true,
      })
      // 모든 탭에 용어 변경 알림
      broadcastTermUpdate(entry, 'add')
      return entry
    }

    case 'UPDATE_TERM': {
      const updated = await updateTerm(
        settings.activeProjectId,
        message.payload.id,
        message.payload.updates
      )
      if (updated) broadcastTermUpdate(updated, 'update')
      return updated
    }

    case 'DELETE_TERM': {
      const deleted = await deleteTerm(settings.activeProjectId, message.payload.id)
      return { success: deleted }
    }

    case 'GET_GLOSSARY': {
      const entries = await getGlossary(message.payload.projectId)
      return { entries }
    }

    case 'GET_SETTINGS': {
      return settings
    }

    case 'UPDATE_SETTINGS': {
      const updated = { ...settings, ...message.payload }
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated })
      return updated
    }

    case 'SET_VIEW_MODE': {
      const s = { ...settings, viewMode: message.payload.mode }
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: s })
      // Forward to active tab's content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'SET_VIEW_MODE', payload: message.payload }).catch(() => {})
      }
      return s
    }

    case 'SET_TRANSLATE_MODE': {
      const s = { ...settings, translateMode: message.payload.mode }
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: s })
      // Forward to active tab's content script
      const [tab2] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab2?.id) {
        chrome.tabs.sendMessage(tab2.id, { type: 'SET_TRANSLATE_MODE', payload: message.payload }).catch(() => {})
      }
      return s
    }

    case 'SET_DISPLAY_MODE': {
      const s = { ...settings, displayMode: message.payload.mode }
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: s })
      const [tab3] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab3?.id) {
        chrome.tabs.sendMessage(tab3.id, { type: 'SET_DISPLAY_MODE', payload: message.payload }).catch(() => {})
      }
      return s
    }

    case 'OPEN_SPLIT_VIEW': {
      const layout = (message as { payload: { layout: 'horizontal' | 'vertical'; tabId: number } }).payload
      return await openSplitView(layout.tabId, layout.layout)
    }

    case 'OPEN_SIDEBAR_TRANSLATION': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id })
        // 약간 지연 후 사이드패널에 번역 결과 전달
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'SIDEBAR_SHOW_TRANSLATION',
            payload: message.payload,
          }).catch(() => {})
        }, 500)
      }
      return { success: true }
    }

    // ---- PDF 번역 ----

    case 'PDF_ANALYZE': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const { pdfBase64 } = message.payload
      const qualityStore = await chrome.storage.local.get('cbt-bridge-quality')
      const quality = (qualityStore['cbt-bridge-quality'] as string) ?? 'standard'
      const structure = await analyzePdfStructure(pdfBase64, settings.apiKey)
      const costEstimate = estimateCost(structure, quality as 'speed' | 'standard' | 'premium')
      return { structure, costEstimate }
    }

    case 'PDF_TRANSLATE_SECTION': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const { pdfBase64: pdf, section, glossary: sectionGlossary } = message.payload
      const qStore = await chrome.storage.local.get('cbt-bridge-quality')
      const q = (qStore['cbt-bridge-quality'] as string ?? 'standard') as 'speed' | 'standard' | 'premium'
      const result = await translatePdfSection(pdf, section, sectionGlossary, settings.apiKey, q)
      return {
        sectionName: section.name,
        translatedText: result.translatedText,
        model: result.model,
        estimatedCost: result.estimatedCost,
      }
    }

    case 'SCREENSHOT_TRANSLATE': {
      if (!settings.apiKey) return { error: 'API key not set' }
      const glossary = await getGlossary(settings.activeProjectId)
      const qStore = await chrome.storage.local.get('cbt-bridge-quality')
      const quality = (qStore['cbt-bridge-quality'] as string ?? 'standard') as 'speed' | 'standard' | 'premium'
      const layout = (message as { payload?: { layout?: string } }).payload?.layout ?? 'single'

      // 현재 탭 스크린샷 캡처
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { error: 'No active tab' }

      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })

      const { buildScreenshotTranslationPrompt } = await import('../core/prompt-builder')
      const { selectModelByQuality, getApiUrl } = await import('../core/model-router')
      const config = selectModelByQuality(quality)
      const prompt = buildScreenshotTranslationPrompt(glossary ?? [])
      const apiUrl = getApiUrl(config.model, settings.apiKey)

      // 이미지를 base64 배열로 준비 (single: 1장, spread: 좌우 2장)
      const images: string[] = []

      if (layout === 'spread') {
        // OffscreenCanvas로 이미지를 반으로 분할
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        const bitmap = await createImageBitmap(blob)
        const halfW = Math.floor(bitmap.width / 2)

        for (const offsetX of [0, halfW]) {
          const canvas = new OffscreenCanvas(halfW, bitmap.height)
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(bitmap, offsetX, 0, halfW, bitmap.height, 0, 0, halfW, bitmap.height)
          const cropBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
          const buf = await cropBlob.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          images.push(btoa(binary))
        }
        bitmap.close()
      } else {
        images.push(dataUrl.replace(/^data:image\/\w+;base64,/, ''))
      }

      // 각 이미지에 대해 Gemini 호출
      const translations: string[] = []
      for (let i = 0; i < images.length; i++) {
        const pageLabel = images.length > 1 ? `\n\n以下は${i === 0 ? '左ページ' : '右ページ'}の画像です。このページのみ翻訳してください。\n` : ''
        const body = {
          contents: [{
            parts: [
              { text: prompt + pageLabel },
              { inlineData: { mimeType: 'image/jpeg', data: images[i] } },
            ],
          }],
          generationConfig: { maxOutputTokens: config.maxOutputTokens },
        }

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const errText = await res.text()
          return { error: `Gemini API error: ${res.status} — ${errText.slice(0, 200)}` }
        }

        const json = await res.json()
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        if (text) translations.push(text)
      }

      const totalSize = images.reduce((s, img) => s + img.length, 0)
      return {
        translated: translations.join('\n\n---\n\n'),
        model: config.model,
        estimatedCost: (totalSize / 1.37 / 1_000_000) * config.inputCostPer1M,
      }
    }

    case 'PDF_TRANSLATE_ABORT': {
      // 현재는 클라이언트 측에서 요청 중단으로 처리
      return { success: true }
    }

    case 'PDF_FETCH_URL': {
      const { url } = message.payload
      try {
        const response = await fetch(url)
        if (!response.ok) {
          return { error: `HTTP ${response.status}: PDFの取得に失敗しました` }
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('pdf') && !url.toLowerCase().endsWith('.pdf')) {
          return { error: 'このURLはPDFではないようです' }
        }

        const arrayBuffer = await response.arrayBuffer()

        // Gate 1: 크기 체크 (50MB)
        if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
          return { error: `ファイルが大きすぎます (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB > 50MB)` }
        }

        // ArrayBuffer → base64
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const pdfBase64 = btoa(binary)

        return { pdfBase64, fileSize: arrayBuffer.byteLength }
      } catch (err) {
        return { error: `ダウンロードエラー: ${(err as Error).message}` }
      }
    }

    default:
      return { error: 'Unknown message type' }
  }
}

// ---- 헬퍼 ----

async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  return (result[STORAGE_KEYS.SETTINGS] as ExtensionSettings) ?? { ...DEFAULT_SETTINGS }
}

function broadcastTermUpdate(entry: GlossaryEntry, action: 'add' | 'update' | 'delete'): void {
  chrome.runtime.sendMessage({
    type: 'TERM_UPDATED',
    payload: { entry, action },
  }).catch(() => {
    // 리스너가 없을 수 있음 — 무시
  })
}

async function openSplitView(
  tabId: number,
  layout: 'horizontal' | 'vertical'
): Promise<{ success: boolean }> {
  console.log(`[SPLIT] === START openSplitView(tabId=${tabId}, layout=${layout}) ===`)

  const sourceTab = await chrome.tabs.get(tabId)
  const sourceUrl = sourceTab.url
  console.log(`[SPLIT] sourceUrl=${sourceUrl}, windowId=${sourceTab.windowId}`)
  if (!sourceUrl) return { success: false }

  const winId = sourceTab.windowId
  const currentWindow = await chrome.windows.get(winId)
  console.log(`[SPLIT] currentWindow: state=${currentWindow.state}, w=${currentWindow.width}, h=${currentWindow.height}, left=${currentWindow.left}, top=${currentWindow.top}`)

  if (currentWindow.state === 'maximized' || currentWindow.state === 'fullscreen') {
    console.log(`[SPLIT] De-maximizing window...`)
    await chrome.windows.update(winId, { state: 'normal' })
    await new Promise(r => setTimeout(r, 300))
  }

  const win = await chrome.windows.get(winId)
  const screenW = win.width ?? 1920
  const screenH = win.height ?? 1080
  const winLeft = win.left ?? 0
  const winTop = win.top ?? 0
  console.log(`[SPLIT] After check: state=${win.state}, w=${screenW}, h=${screenH}, left=${winLeft}, top=${winTop}`)

  let newWindowConfig: chrome.windows.CreateData

  if (layout === 'horizontal') {
    const halfW = Math.floor(screenW / 2)
    console.log(`[SPLIT] Horizontal: resizing winId=${winId} to width=${halfW}`)
    const updated = await chrome.windows.update(winId, {
      left: winLeft, top: winTop, width: halfW,
    })
    console.log(`[SPLIT] After update: w=${updated.width}, h=${updated.height}, left=${updated.left}`)
    newWindowConfig = {
      url: sourceUrl,
      left: winLeft + halfW, top: winTop,
      width: halfW, height: screenH,
    }
  } else {
    const halfH = Math.floor(screenH / 2)
    console.log(`[SPLIT] Vertical: resizing winId=${winId} to height=${halfH}`)
    const updated = await chrome.windows.update(winId, {
      left: winLeft, top: winTop, width: screenW, height: halfH,
    })
    console.log(`[SPLIT] After update: w=${updated.width}, h=${updated.height}, top=${updated.top}`)
    newWindowConfig = {
      url: sourceUrl,
      left: winLeft, top: winTop + halfH,
      width: screenW, height: halfH,
    }
  }

  console.log(`[SPLIT] Creating new window:`, JSON.stringify(newWindowConfig))
  const newWindow = await chrome.windows.create(newWindowConfig)
  const newTabId = newWindow?.tabs?.[0]?.id
  console.log(`[SPLIT] New window created, newTabId=${newTabId}`)

  if (newTabId) {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === newTabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        // Content Script 로드 대기 후 재시도 (최대 3회)
        let attempts = 0
        const trySend = (): void => {
          attempts++
          chrome.tabs.sendMessage(newTabId, { type: 'TRANSLATE_ALL' })
            .then(() => console.log('[CBT Bridge AI] TRANSLATE_ALL sent ok'))
            .catch(() => {
              if (attempts < 3) {
                console.log(`[CBT Bridge AI] Retry TRANSLATE_ALL (${attempts}/3)...`)
                setTimeout(trySend, 2000)
              } else {
                console.warn('[CBT Bridge AI] TRANSLATE_ALL failed after 3 attempts')
              }
            })
        }
        setTimeout(trySend, 1500)
      }
    })
  }

  console.log(`[CBT Bridge AI] Split view: ${layout} — ${sourceUrl}`)
  return { success: true }
}
