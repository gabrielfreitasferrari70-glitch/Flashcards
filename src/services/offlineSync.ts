import { supabase } from '@/lib/supabase/client'

const OFFLINE_QUEUE_KEY = 'mr_offline_reviews_queue'

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

export async function flushOfflineReviews(): Promise<{ synced: number; error?: string }> {
  const queue = getOfflineReviews()
  if (queue.length === 0) return { synced: 0 }

  try {
    // Envia todas as avaliações acumuladas em lote para o Supabase
    const { error } = await supabase.from('mr_reviews').insert(queue)
    if (error) throw error

    // Limpa a fila após confirmação de sucesso
    localStorage.removeItem(OFFLINE_QUEUE_KEY)
    console.log(`[PWA Offline] ${queue.length} avaliações sincronizadas com sucesso com o Supabase!`)
    return { synced: queue.length }
  } catch (err: any) {
    console.warn('[PWA Offline] Falha ao sincronizar revisões acumuladas:', err)
    return { synced: 0, error: err?.message || 'Falha de conexão' }
  }
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
