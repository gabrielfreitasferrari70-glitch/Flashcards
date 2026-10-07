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
    if (data && Array.isArray(data.masks) && (data.imageUrl || data.image)) {
      return {
        imageUrl: data.imageUrl || data.image,
        imageTitle: data.imageTitle || '',
        masks: data.masks,
        activeMaskId: data.activeMaskId,
        mode: data.mode || 'hide_all_guess_one',
      }
    }
  } catch {
    /* ignore */
  }
  return null
}
