import { create } from 'zustand'
import type { Focus, Params } from './params'

const RECENT_LIMIT = 3

type RecentSettings = {
  mode: 'auto' | 'manual'
  preset: string
  strength: number
  manual: Params
  focus: Focus
  removals: Record<'left' | 'right' | 'banner', boolean>
}

type Recent = {
  id: string
  name: string
  updatedAt: number
  original: Blob
  edited: Blob | null
  thumb: Blob | null
  settings: RecentSettings
}

type RecentItem = { id: string; name: string; updatedAt: number; thumb: string | null }

export const useRecents = create<{ items: RecentItem[] }>(() => ({ items: [] }))

const DB = 'roblox-editor'
const STORE = 'recents'

let db: Promise<IDBDatabase> | null = null

function open() {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return db
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = action(database.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

async function all() {
  const rows = await run<Recent[]>('readonly', (store) => store.getAll())
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function refreshRecents() {
  try {
    const rows = (await all()).slice(0, RECENT_LIMIT)
    for (const item of useRecents.getState().items) if (item.thumb) URL.revokeObjectURL(item.thumb)
    useRecents.setState({
      items: rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt, thumb: r.thumb ? URL.createObjectURL(r.thumb) : null })),
    })
  } catch {
    useRecents.setState({ items: [] })
  }
}

export async function saveRecent(recent: Recent) {
  try {
    await run('readwrite', (store) => store.put(recent))
    const rows = await all()
    for (const old of rows.slice(RECENT_LIMIT)) await run('readwrite', (store) => store.delete(old.id))
    await refreshRecents()
  } catch {}
}

export async function loadRecent(id: string) {
  try {
    return (await run<Recent | undefined>('readonly', (store) => store.get(id))) ?? null
  } catch {
    return null
  }
}
