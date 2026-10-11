// Native browser IndexedDB cache for instant zero-latency startup (<20ms)
// Handles large payloads (cards with embedded images) that exceed localStorage's 5MB limit.

const DB_NAME = 'medreview_cache_db'
const DB_VERSION = 1
const STORE_NAME = 'kv'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'))
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getLocalCache<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function setLocalCache<T = any>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch (error) {
    console.warn("Não foi possível gravar o cache local; os dados remotos continuam disponíveis.", error)
  }
}

export async function clearLocalCache(key?: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      if (key) {
        store.delete(key)
      } else {
        store.clear()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch (error) {
    console.warn("Não foi possível limpar o cache local.", error)
  }
}
