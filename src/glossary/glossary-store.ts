// ============================================================
// CBT Bridge AI — Glossary Store
// chrome.storage 기반 용어사전 CRUD
// ============================================================

import type { GlossaryEntry, GlossaryProject } from '../shared/types'
import { STORAGE_KEYS } from '../shared/constants'
import presetTerms from './presets/cbt-mental-health.json'

/**
 * 프로젝트의 용어사전을 가져옵니다.
 */
export async function getGlossary(projectId: string): Promise<GlossaryEntry[]> {
  const key = `${STORAGE_KEYS.GLOSSARY_PREFIX}${projectId}`
  const result = await chrome.storage.local.get(key)
  return (result[key] as GlossaryEntry[]) ?? []
}

/**
 * 용어를 추가합니다.
 */
export async function addTerm(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
): Promise<GlossaryEntry> {
  const entries = await getGlossary(projectId)

  const newEntry: GlossaryEntry = {
    ...entry,
    id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    usageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  entries.push(newEntry)
  await saveGlossary(projectId, entries)
  return newEntry
}

/**
 * 용어를 수정합니다.
 */
export async function updateTerm(
  projectId: string,
  termId: string,
  updates: Partial<GlossaryEntry>
): Promise<GlossaryEntry | null> {
  const entries = await getGlossary(projectId)
  const index = entries.findIndex(e => e.id === termId)
  if (index === -1) return null

  entries[index] = {
    ...entries[index],
    ...updates,
    updatedAt: Date.now(),
  }

  await saveGlossary(projectId, entries)
  return entries[index]
}

/**
 * 용어를 삭제합니다.
 */
export async function deleteTerm(
  projectId: string,
  termId: string
): Promise<boolean> {
  const entries = await getGlossary(projectId)
  const filtered = entries.filter(e => e.id !== termId)
  if (filtered.length === entries.length) return false

  await saveGlossary(projectId, filtered)
  return true
}

/**
 * 프리셋 용어를 로드합니다 (초기 1회).
 */
export async function loadPresets(projectId: string): Promise<void> {
  const existing = await getGlossary(projectId)
  if (existing.length > 0) return // 이미 데이터가 있으면 스킵

  const now = Date.now()
  const entries: GlossaryEntry[] = (presetTerms as GlossaryEntry[]).map(term => ({
    ...term,
    createdAt: now,
    updatedAt: now,
  }))

  await saveGlossary(projectId, entries)
}

/**
 * 프로젝트 목록을 가져옵니다.
 */
export async function getProjects(): Promise<GlossaryProject[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROJECTS)
  return (result[STORAGE_KEYS.PROJECTS] as GlossaryProject[]) ?? []
}

/**
 * 기본 프로젝트를 초기화합니다.
 */
export async function initDefaultProject(): Promise<void> {
  const projects = await getProjects()
  if (projects.length > 0) return

  const defaultProject: GlossaryProject = {
    id: 'default',
    name: 'CBT / Mental Health',
    domain: 'CBT',
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.PROJECTS]: [defaultProject],
  })

  await loadPresets('default')
}

// ---- 내부 헬퍼 ----

async function saveGlossary(projectId: string, entries: GlossaryEntry[]): Promise<void> {
  const key = `${STORAGE_KEYS.GLOSSARY_PREFIX}${projectId}`
  await chrome.storage.local.set({ [key]: entries })
}
