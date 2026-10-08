export interface OcclusionMask {
  id: string
  x: number // percent 0-100
  y: number // percent 0-100
  width: number // percent 0-100
  height: number // percent 0-100
  label?: string
}

export interface OcclusionData {
  imageUrl: string
  imageTitle?: string
  masks: OcclusionMask[]
  activeMaskId?: string // If card tests this specific mask
  mode?: 'hide_all_guess_one' | 'hide_one_guess_one'
}

export function parseOcclusion(
  raw: any,
  fallbackText?: string,
  promptText?: string,
): OcclusionData | null {
  if (!raw && fallbackText) {
    const match = fallbackText.match(/<!--occlusion:([A-Za-z0-9+/=]+)-->/)
    if (match) {
      try {
        raw = JSON.parse(decodeURIComponent(escape(atob(match[1]))))
      } catch {
        try {
          raw = JSON.parse(atob(match[1]))
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (!raw) return null
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!data || typeof data !== 'object') return null

    const rawUrl = data.imageUrl || data.image || data.image_url
    if (!rawUrl || typeof rawUrl !== 'string') return null

    const rawMasks = Array.isArray(data.masks) ? data.masks : []
    const validMasks: OcclusionMask[] = rawMasks
      .filter((m: any) => m && typeof m === 'object')
      .map((m: any, idx: number) => ({
        id: String(m.id || `c_${idx + 1}`),
        x: Math.max(0, Math.min(100, typeof m.x === 'number' && !isNaN(m.x) ? m.x : 0)),
        y: Math.max(0, Math.min(100, typeof m.y === 'number' && !isNaN(m.y) ? m.y : 0)),
        width: Math.max(0.5, Math.min(100, typeof m.width === 'number' && !isNaN(m.width) ? m.width : 10)),
        height: Math.max(0.5, Math.min(100, typeof m.height === 'number' && !isNaN(m.height) ? m.height : 10)),
        label: typeof m.label === 'string' ? m.label : `Estrutura ${idx + 1}`,
      }))

    if (validMasks.length === 0) return null

    // Verifica se as máscaras possuem IDs duplicados (ex: todas 'oi_1')
    const maskIds = validMasks.map((m) => m.id)
    const hasDuplicateIds = new Set(maskIds).size !== maskIds.length

    // Normaliza para IDs únicos c_1, c_2, ... se houver IDs duplicados ou genéricos
    const normalizedMasks = hasDuplicateIds
      ? validMasks.map((m, idx) => ({ ...m, id: `c_${idx + 1}` }))
      : validMasks

    // Descobre o número do cartão alvo a partir do prompt ("Carta X de Y") ou da resposta ("Estrutura X")
    const cardMatch =
      promptText?.match(/Carta\s+(\d+)\s+de/i) ||
      fallbackText?.match(/Estrutura\s+(\d+)/i)

    let activeMaskId = typeof data.activeMaskId === 'string' ? data.activeMaskId : ''

    if (cardMatch) {
      const targetNum = parseInt(cardMatch[1], 10)
      activeMaskId = `c_${targetNum}`
    } else if (!activeMaskId || activeMaskId === 'oi_1' || hasDuplicateIds) {
      activeMaskId = normalizedMasks[0]?.id || 'c_1'
    }

    return {
      imageUrl: rawUrl,
      imageTitle: typeof data.imageTitle === 'string' ? data.imageTitle : '',
      masks: normalizedMasks,
      activeMaskId,
      mode: data.mode === 'hide_one_guess_one' ? 'hide_one_guess_one' : 'hide_all_guess_one',
    }
  } catch {
    /* ignore */
  }
  return null
}


