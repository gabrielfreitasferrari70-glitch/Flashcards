import { supabase } from '@/lib/supabase/client'

const OFFLINE_QUEUE_KEY = 'mr_offline_reviews_queue'
const OFFLINE_SYNC_LOCK = 'mr_offline_reviews_sync'

type SyncResult = { synced: number; error?: string }
let flushInFlight: Promise<SyncResult> | null = null

export interface OfflineReview {
  id: string
  user_id: string
  card_id: string
  rating: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  state: string
  due: string
  reviewed_at: string
}

export function getOfflineReviews(): OfflineReview[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveOfflineReview(review: OfflineReview): void {
  try {
    const queue = getOfflineReviews()
    queue.push(review)
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch (e) {
    console.error('Erro ao salvar revisão offline:', e)
  }
}

async function flushQueuedReviews(): Promise<SyncResult> {
  let synced = 0
  try {
    // Envia todas as avaliações acumuladas em lote para o Supabase
    // Remove IDs sintéticos não-UUID para que o PostgreSQL gere UUIDs válidos
    const isUuid = (id?: string) =>
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    while (true) {
      // Read inside the lock: another tab may already have uploaded the queue.
      const queue = getOfflineReviews()
      if (queue.length === 0) return { synced }
      const payload = queue.map((r) => {
        if (r.id && isUuid(r.id)) return r
        const { id: _id, ...rest } = r
        return rest
      })
      const { error } = await supabase.from('mr_reviews').insert(payload)
      if (error) throw error

      // Acknowledge only this batch; reviews added during the request stay queued.
      const uploadedIds = new Set(queue.map((r) => r.id))
      const remaining = getOfflineReviews().filter((r) => !uploadedIds.has(r.id))
      if (remaining.length > 0) {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining))
      } else {
        localStorage.removeItem(OFFLINE_QUEUE_KEY)
      }
      synced += queue.length
      console.log(`[PWA Offline] ${queue.length} avaliações sincronizadas com sucesso com o Supabase!`)
      // Drain reviews created during the upload without waiting for another online event.
    }
  } catch (err: any) {
    console.warn('[PWA Offline] Falha ao sincronizar revisões acumuladas:', err)
    return { synced, error: err?.message || 'Falha de conexão' }
  }
}

export function flushOfflineReviews(): Promise<SyncResult> {
  if (flushInFlight) return flushInFlight

  // Coalesce callers in this tab and serialize uploads across tabs where supported.
  const flush = typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(OFFLINE_SYNC_LOCK, flushQueuedReviews)
    : flushQueuedReviews()
  flushInFlight = flush.finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

export function initOfflineSync(onStatusChange?: (online: boolean, pendingCount: number) => void): () => void {
  const update = async () => {
    const isOnline = navigator.onLine
    const count = getOfflineReviews().length

    if (isOnline && count > 0) {
      await flushOfflineReviews()
    }

    if (onStatusChange) {
      onStatusChange(isOnline, getOfflineReviews().length)
    }
  }

  window.addEventListener('online', update)
  window.addEventListener('offline', update)

  // Disparo inicial
  update()

  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}
