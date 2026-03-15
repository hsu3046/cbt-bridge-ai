// ============================================================
// CBT Bridge AI — Side Panel Script (用語辞典管理)
// ============================================================

import type { GlossaryEntry } from '../shared/types'

let allTerms: GlossaryEntry[] = []
let filteredTerms: GlossaryEntry[] = []

async function initSidePanel(): Promise<void> {
  await loadTerms()
  setupSearch()
  setupAddTerm()
  setupMessageListener()
}

async function loadTerms(): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'GET_GLOSSARY',
    payload: { projectId: 'default' },
  }) as { entries?: GlossaryEntry[] }

  allTerms = result?.entries ?? []
  filteredTerms = [...allTerms]
  renderTerms()
}

function renderTerms(): void {
  const list = document.getElementById('term-list')!
  const count = document.getElementById('term-count')!
  count.textContent = `${filteredTerms.length} terms`

  if (filteredTerms.length === 0) {
    list.innerHTML = '<div class="empty">用語が見つかりません</div>'
    return
  }

  list.innerHTML = filteredTerms.map(term => `
    <div class="term-item" data-id="${term.id}">
      <div class="term-info">
        <div class="term-original">${escapeHtml(term.original)}</div>
        <div class="term-translation">${escapeHtml(term.translation)}</div>
      </div>
      <div class="term-actions">
        <button class="btn-edit" data-id="${term.id}" title="編集">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
        </button>
        <button class="btn-delete" data-id="${term.id}" title="削除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    <div class="term-edit-form" id="edit-${term.id}" style="display:none;">
      <input class="edit-original" value="${escapeHtml(term.original)}" placeholder="英語用語" />
      <input class="edit-translation" value="${escapeHtml(term.translation)}" placeholder="日本語訳" />
      <div class="edit-actions">
        <button class="btn-save" data-id="${term.id}">保存</button>
        <button class="btn-cancel" data-id="${term.id}">キャンセル</button>
      </div>
    </div>
  `).join('')

  // 삭제 버튼
  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = (e.currentTarget as HTMLElement).dataset.id
      if (!id) return
      await chrome.runtime.sendMessage({ type: 'DELETE_TERM', payload: { id } })
      await loadTerms()
    })
  })

  // 편집 버튼 — 인라인 폼 표시
  list.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = (e.currentTarget as HTMLElement).dataset.id
      if (!id) return

      // 이미 열린 코드를 닫음
      document.querySelectorAll('.term-edit-form').forEach(f => (f as HTMLElement).style.display = 'none')

      const form = document.getElementById(`edit-${id}`)
      if (!form) return
      form.style.display = 'block'
      ;(form.querySelector('.edit-original') as HTMLInputElement)?.focus()

      form.querySelector('.btn-cancel')?.addEventListener('click', () => {
        form.style.display = 'none'
      }, { once: true })

      form.querySelector('.btn-save')?.addEventListener('click', async () => {
        const newOriginal = (form.querySelector('.edit-original') as HTMLInputElement).value.trim()
        const newTranslation = (form.querySelector('.edit-translation') as HTMLInputElement).value.trim()
        if (!newOriginal) return
        await chrome.runtime.sendMessage({
          type: 'UPDATE_TERM',
          payload: { id, updates: { original: newOriginal, translation: newTranslation } },
        })
        await loadTerms()
      }, { once: true })
    })
  })
}

function setupSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase()
    if (!query) {
      filteredTerms = [...allTerms]
    } else {
      filteredTerms = allTerms.filter(
        t => t.original.toLowerCase().includes(query) || t.translation.includes(query)
      )
    }
    renderTerms()
  })
}

function setupAddTerm(): void {
  const btnAdd = document.getElementById('btn-add') as HTMLButtonElement
  const inputOriginal = document.getElementById('add-original') as HTMLInputElement
  const inputTranslation = document.getElementById('add-translation') as HTMLInputElement

  btnAdd.addEventListener('click', async () => {
    const original = inputOriginal.value.trim()
    const translation = inputTranslation.value.trim()
    if (!original) return

    await chrome.runtime.sendMessage({
      type: 'ADD_TERM',
      payload: {
        original,
        translation: translation || undefined,
        domain: 'CBT',
        projectId: 'default',
      },
    })

    inputOriginal.value = ''
    inputTranslation.value = ''
    await loadTerms()
  })
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SUGGEST_TERM_RESULT') {
      const inputOriginal = document.getElementById('add-original') as HTMLInputElement
      const inputTranslation = document.getElementById('add-translation') as HTMLInputElement
      inputOriginal.value = message.payload.original
      inputTranslation.value = message.payload.suggestion
    }
    if (message.type === 'TERM_UPDATED') {
      loadTerms()
    }
    if (message.type === 'SIDEBAR_SHOW_TRANSLATION') {
      showTranslationInSidebar(message.payload)
    }
  })
}

function showTranslationInSidebar(result: { translated: string; model: string }): void {
  // 既存の翻訳パネルがあれば削除
  document.getElementById('sidebar-translation')?.remove()

  const panel = document.createElement('div')
  panel.id = 'sidebar-translation'
  panel.style.cssText = `
    margin: 8px 12px; padding: 12px 14px;
    background: white; border: 1px solid #e2e8f0;
    border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  `
  panel.innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:12px; font-weight:600; color:#3b82f6;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
      翻訳結果
      <button id="sidebar-translation-close" style="margin-left:auto; background:none; border:none; cursor:pointer; color:#94a3b8; font-size:16px;">&times;</button>
    </div>
    <div style="font-size:14px; line-height:1.7; color:#1e293b;">${escapeHtml(result.translated)}</div>
  `

  const list = document.getElementById('term-list')!
  list.parentElement!.insertBefore(panel, list)

  document.getElementById('sidebar-translation-close')?.addEventListener('click', () => panel.remove())
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

initSidePanel()
