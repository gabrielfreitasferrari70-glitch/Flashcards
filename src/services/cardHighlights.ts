export interface CardHighlight {
  text: string
  color: string
}

const HIGHLIGHT_KEY_PREFIX = 'mr_hl_'

export function getCardHighlights(cardId: string): CardHighlight[] {
  if (!cardId) return []
  try {
    const raw = localStorage.getItem(HIGHLIGHT_KEY_PREFIX + cardId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCardHighlight(cardId: string, text: string, color: string): CardHighlight[] {
  if (!cardId || !text || text.trim().length === 0) return getCardHighlights(cardId)
  try {
    const current = getCardHighlights(cardId)
    const trimmed = text.trim()
    // Evita duplicar o mesmo texto
    const filtered = current.filter((h) => h.text.toLowerCase() !== trimmed.toLowerCase())
    filtered.push({ text: trimmed, color })
    localStorage.setItem(HIGHLIGHT_KEY_PREFIX + cardId, JSON.stringify(filtered))
    return filtered
  } catch (e) {
    console.error('Erro ao salvar marca-texto:', e)
    return getCardHighlights(cardId)
  }
}

export function clearCardHighlights(cardId: string): void {
  if (!cardId) return
  try {
    localStorage.removeItem(HIGHLIGHT_KEY_PREFIX + cardId)
  } catch {}
}

export function applyHighlightsToHtml(html: string, highlights: CardHighlight[]): string {
  if (!html || !highlights || highlights.length === 0) return html

  let result = html
  // Aplica do mais longo para o mais curto para evitar colisões
  const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length)

  for (const h of sorted) {
    if (!h.text || h.text.length < 2) continue
    // Escapa caracteres especiais de Regex
    const escaped = h.text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
    // Substitui fora de tags HTML
    const regex = new RegExp(`(?![^<]*>)(${escaped})`, 'gi')
    result = result.replace(
      regex,
      `<mark style="background: ${h.color}; border-radius: 4px; padding: 1px 4px; color: inherit; font-weight: inherit; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">$1</mark>`
    )
  }

  return result
}
