/**
 * MedReview — Serviço de Backup e Exportação Completa em 1 Clique
 *
 * Exporta e restaura:
 * - Pastas e subpastas (hierarquia completa)
 * - Flashcards médicos (perguntas, respostas, tags, casos clínicos, omissões Cloze, diagramas)
 * - Histórico de revisões FSRS-5 (agendamentos, facilidade, repetições, datas de vencimento)
 * - Anotações pessoais dos cartões
 * - Marca-textos e destaques coloridos
 */

export interface FullBackupData {
  app: 'MedReview'
  version: '2.0'
  exported_at: string
  total_decks: number
  total_cards: number
  total_reviews: number
  decks: Array<{
    id: string
    title: string
    kind: string
    parent?: string
    order?: number
  }>
  cards: Array<{
    id?: string
    deck: string
    q: string
    a: string
    group?: string
    ref?: string
    clinical?: boolean
    suspended?: boolean
    reverse?: boolean
    choices?: string[] | null
    diagram_svg?: string | null
    image?: string | null
  }>
  reviews?: Array<{
    card_id: string
    rating: string
    stability?: number
    difficulty?: number
    elapsed_days?: number
    scheduled_days?: number
    state?: string
    due?: string
    reviewed_at?: string
  }>
  notes?: Record<string, string>
  highlights?: Record<string, any[]>
}

/**
 * Coleta todas as anotações pessoais salvas localmente
 */
export function getAllLocalNotes(): Record<string, string> {
  const notes: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('mr_note_')) {
        const cardId = key.replace('mr_note_', '')
        const val = localStorage.getItem(key)
        if (val) notes[cardId] = val
      }
    }
  } catch {
    /* ignore */
  }
  return notes
}

/**
 * Coleta todos os destaques de marca-texto salvos localmente
 */
export function getAllLocalHighlights(): Record<string, any[]> {
  const highlights: Record<string, any[]> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('mr_hl_')) {
        const cardId = key.replace('mr_hl_', '')
        const val = localStorage.getItem(key)
        if (val) {
          try {
            highlights[cardId] = JSON.parse(val)
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return highlights
}

/**
 * Gera e dispara o download do arquivo JSON de backup completo
 */
export function downloadFullBackup(
  decks: any[],
  cards: any[],
  reviews: any[] = []
): { totalCards: number; totalDecks: number; totalReviews: number } {
  const notes = getAllLocalNotes()
  const highlights = getAllLocalHighlights()

  const backup: FullBackupData = {
    app: 'MedReview',
    version: '2.0',
    exported_at: new Date().toISOString(),
    total_decks: decks.length,
    total_cards: cards.length,
    total_reviews: reviews.length,
    decks: decks.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind || 'custom',
      parent: d.parent || '',
      order: d.order || 0,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      deck: c.deck || (c as any).deck_id || '',
      q: c.q,
      a: c.a,
      group: c.group || '',
      ref: c.ref || '',
      clinical: !!c.clinical,
      suspended: !!c.suspended,
      reverse: !!c.reverse,
      choices: c.choices || null,
      diagram_svg: c.diagram_svg || null,
      image: c.image || null,
    })),
    reviews: reviews.map((r) => ({
      card_id: r.card_id || r.card || '',
      rating: r.rating,
      stability: r.stability,
      difficulty: r.difficulty,
      elapsed_days: r.elapsed_days,
      scheduled_days: r.scheduled_days,
      state: r.state,
      due: r.due,
      reviewed_at: r.reviewed_at,
    })),
    notes,
    highlights,
  }

  const jsonString = JSON.stringify(backup, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const dateStr = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `medreview-backup-completo-${dateStr}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return {
    totalCards: cards.length,
    totalDecks: decks.length,
    totalReviews: reviews.length,
  }
}

/**
 * Restaura anotações e marca-textos de um backup para o localStorage
 */
export function restoreLocalMetadata(backup: Partial<FullBackupData>): { notesRestored: number; highlightsRestored: number } {
  let notesRestored = 0
  let highlightsRestored = 0

  if (backup.notes) {
    for (const [cardId, note] of Object.entries(backup.notes)) {
      if (cardId && note) {
        localStorage.setItem(`mr_note_${cardId}`, note)
        notesRestored++
      }
    }
  }

  if (backup.highlights) {
    for (const [cardId, hls] of Object.entries(backup.highlights)) {
      if (cardId && Array.isArray(hls)) {
        localStorage.setItem(`mr_hl_${cardId}`, JSON.stringify(hls))
        highlightsRestored++
      }
    }
  }

  return { notesRestored, highlightsRestored }
}
