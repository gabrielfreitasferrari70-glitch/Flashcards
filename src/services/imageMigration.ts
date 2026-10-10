import { supabase } from '@/lib/supabase/client'
import { isDataUrl, uploadDataUrlIfNeeded } from './imageStorage'

/**
 * MedReview — Migração automática de imagens legadas (base64 → Storage).
 *
 * Roda sozinha, em background, na conta mestre, sem nenhuma ação manual:
 * varre os cartões que ainda têm imagem em base64 (coluna `image_url` ou o JSON
 * de oclusão) e move cada imagem para o bucket `card-images`, persistindo apenas
 * a URL pública. É idempotente: quando não sobrar base64, marca como concluída
 * e nunca mais roda.
 */

const FLAG_KEY = 'mr_images_migrated_v1'
const MASTER_USER_ID = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'
const CONCURRENCY = 6

export function isMasterUser(userId: string | null | undefined): boolean {
  return !!userId && userId === MASTER_USER_ID
}

export function isImageMigrationDone(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === 'done'
  } catch {
    return false
  }
}

/**
 * Migra as imagens legadas em base64 para o Storage, atualizando o Supabase.
 * Retorna a quantidade de cartões migrados. Segura para re-executar.
 */
export async function migrateLegacyImagesIfNeeded(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (typeof window !== 'undefined' && isImageMigrationDone()) return 0

  // Busca apenas os campos que podem conter base64, paginando (limite de 1000 por página).
  const rows: any[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('mr_cards')
      .select('id, image_url, occlusion')
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const legacy = rows.filter(
    (r: any) => isDataUrl(r.image_url) || (r.occlusion && isDataUrl(r.occlusion.imageUrl)),
  )

  if (legacy.length === 0) {
    try {
      localStorage.setItem(FLAG_KEY, 'done')
    } catch {}
    return 0
  }

  const total = legacy.length
  const queue = [...legacy]
  let done = 0
  let failed = 0

  const worker = async () => {
    while (queue.length > 0) {
      const card = queue.shift()!
      try {
        const updates: Record<string, any> = {}
        if (isDataUrl(card.image_url)) {
          updates.image_url = await uploadDataUrlIfNeeded(card.image_url, `card-${card.id}`)
        }
        if (card.occlusion && typeof card.occlusion === 'object' && isDataUrl(card.occlusion.imageUrl)) {
          updates.occlusion = {
            ...card.occlusion,
            imageUrl: await uploadDataUrlIfNeeded(card.occlusion.imageUrl, `occlusion-${card.id}`),
          }
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('mr_cards').update(updates).eq('id', card.id)
          done++
          onProgress?.(done, total)
        }
      } catch (err) {
        failed++
        console.warn('Falha ao migrar imagem do cartão', card.id, err)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))

  // Só marca como concluída se nada falhou — caso contrário, tenta de novo na
  // próxima carga (os cartões já migrados viram URL e não são reprocessados).
  if (failed === 0) {
    try {
      localStorage.setItem(FLAG_KEY, 'done')
    } catch {}
  }
  return done
}
