'use client'

import { useSyncExternalStore } from 'react'

export const COMPARE_MAX = 4
const STORAGE_KEY = 'mcppedia.compare.v1'

export interface CompareItem {
  id: string
  slug: string
  name: string
  score_total: number
}

const listeners = new Set<() => void>()
let cachedSnapshot: CompareItem[] = []
let cachedRaw = ''

function read(): CompareItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? ''
    if (raw === cachedRaw) return cachedSnapshot
    cachedRaw = raw
    if (!raw) {
      cachedSnapshot = []
      return cachedSnapshot
    }
    const parsed = JSON.parse(raw)
    cachedSnapshot = Array.isArray(parsed) ? parsed.filter(isCompareItem) : []
    return cachedSnapshot
  } catch {
    cachedSnapshot = []
    return cachedSnapshot
  }
}

function isCompareItem(v: unknown): v is CompareItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string'
    && typeof o.slug === 'string'
    && typeof o.name === 'string'
    && typeof o.score_total === 'number'
}

function write(list: CompareItem[]): void {
  if (typeof window === 'undefined') return
  const raw = JSON.stringify(list)
  window.localStorage.setItem(STORAGE_KEY, raw)
  cachedRaw = raw
  cachedSnapshot = list
  listeners.forEach(fn => fn())
}

export function getCompareList(): CompareItem[] {
  return read()
}

export function isInCompare(id: string): boolean {
  return read().some(item => item.id === id)
}

export function addToCompare(item: CompareItem): boolean {
  const list = read()
  if (list.some(x => x.id === item.id)) return true
  if (list.length >= COMPARE_MAX) return false
  write([...list, item])
  return true
}

export function removeFromCompare(id: string): void {
  const list = read()
  const next = list.filter(item => item.id !== id)
  if (next.length !== list.length) write(next)
}

export function clearCompare(): void {
  if (read().length === 0) return
  write([])
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }
  return () => {
    listeners.delete(onChange)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
    }
  }
}

const SERVER_SNAPSHOT: CompareItem[] = []
function getServerSnapshot(): CompareItem[] {
  return SERVER_SNAPSHOT
}

export function useCompareList(): CompareItem[] {
  return useSyncExternalStore(subscribe, read, getServerSnapshot)
}
