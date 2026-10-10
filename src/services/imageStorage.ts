import { supabase } from '@/lib/supabase/client'

/**
 * MedReview — Armazenamento de imagens no Supabase Storage.
 *
 * Antes, as imagens eram gravadas como base64 (data:image/...) diretamente na
 * coluna `mr_cards.image_url` e dentro do JSON de oclusão, inflando o PostgreSQL
 * (backup de ~390 MB) e exigindo batching defensivo contra timeouts.
 *
 * Agora as imagens sobem para o bucket público `card-images` e apenas a URL
 * pública é persistida no banco. Cartões antigos (base64) continuam sendo
 * renderizados normalmente pela camada de exibição.
 */

const BUCKET = 'card-images'

export function isDataUrl(url: string | null | undefined): boolean {
  return !!url && /^data:/i.test(url)
}

export function isExternalUrl(url: string | null | undefined): boolean {
  return !!url && /^(https?:|\/)/i.test(url)
}

/** Sanitiza um nome de pasta/arquivo para uso como caminho no bucket. */
function sanitizeSegment(segment: string): string {
  return (segment || 'image')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'image'
}

function mimeToExt(mime: string): string {
  const m = (mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('svg')) return 'svg'
  if (m.includes('avif')) return 'avif'
  return 'jpg'
}

/** Converte uma data URL em Blob. Suporta base64 (`;base64,`) e url-encoded (ex.: SVG). */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } | null {
  // Formato: data:<mime>[;base64],<conteúdo>
  const m = /^data:([^;,]+)(;base64)?,(.*)$/is.exec(dataUrl)
  if (!m) return null
  const mime = m[1].split(';')[0] // ignora parâmetros tipo ;charset=utf-8
  const isBase64 = !!m[2]
  try {
    if (isBase64) {
      const bstr = atob(m[3].replace(/\s/g, ''))
      const u8 = new Uint8Array(bstr.length)
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i)
      return { blob: new Blob([u8], { type: mime }), mime }
    }
    const decoded = decodeURIComponent(m[3])
    return { blob: new Blob([decoded], { type: mime }), mime }
  } catch {
    return null
  }
}

function publicUrl(path: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}

/**
 * Faz upload de um arquivo/Blob para o bucket e retorna a URL pública.
 * `folderName` vira uma subpasta (ex.: id do cartão ou "deck-<id>").
 */
export async function uploadImageToStorage(
  blob: Blob | File,
  folderName: string,
  options?: { contentType?: string },
): Promise<string> {
  const file = blob instanceof File ? blob : new File([blob], 'image', { type: blob.type })
  const mime = options?.contentType || file.type || 'image/jpeg'
  const ext = mimeToExt(mime)
  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  // A política `card_images_insert` exige que a PRIMEIRA pasta do caminho seja o
  // UUID do usuário autenticado. Prefixamos com o uid para não violar o RLS.
  const { data: authData } = await supabase.auth.getUser()
  const uid = authData?.user?.id || 'anonymous'
  const path = `${sanitizeSegment(uid)}/${sanitizeSegment(folderName)}/${salt}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
  return publicUrl(path)
}

/**
 * Converte uma imagem em data URL (base64) para URL pública no Storage.
 * Se o valor já for uma URL externa ou vazio, retorna o próprio valor sem alterar.
 */
export async function uploadDataUrlIfNeeded(url: string, folderName: string): Promise<string> {
  if (!isDataUrl(url)) return url
  const parsed = dataUrlToBlob(url)
  if (!parsed) return url
  return uploadImageToStorage(parsed.blob, folderName, { contentType: parsed.mime })
}
