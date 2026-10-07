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

export function parseOcclusion(raw: any): OcclusionData | null {
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
        id: String(m.id || `m_${idx}`),
        x: Math.max(0, Math.min(100, typeof m.x === 'number' && !isNaN(m.x) ? m.x : 0)),
        y: Math.max(0, Math.min(100, typeof m.y === 'number' && !isNaN(m.y) ? m.y : 0)),
        width: Math.max(0.5, Math.min(100, typeof m.width === 'number' && !isNaN(m.width) ? m.width : 10)),
        height: Math.max(0.5, Math.min(100, typeof m.height === 'number' && !isNaN(m.height) ? m.height : 10)),
        label: typeof m.label === 'string' ? m.label : `Estrutura ${idx + 1}`,
      }))

    if (validMasks.length === 0) return null

    return {
      imageUrl: rawUrl,
      imageTitle: typeof data.imageTitle === 'string' ? data.imageTitle : '',
      masks: validMasks,
      activeMaskId: typeof data.activeMaskId === 'string' ? data.activeMaskId : validMasks[0]?.id,
      mode: data.mode === 'hide_one_guess_one' ? 'hide_one_guess_one' : 'hide_all_guess_one',
    }
  } catch {
    /* ignore */
  }
  return null
}

