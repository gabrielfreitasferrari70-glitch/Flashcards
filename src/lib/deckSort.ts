// Ordenação das pastas controlada pelo usuário (salva no navegador).
export type DeckSortMode = 'manual' | 'az' | 'za' | 'newest' | 'oldest'

export const DECK_SORT_OPTIONS: { value: DeckSortMode; label: string }[] = [
  { value: 'manual', label: 'Ordem padrão' },
  { value: 'az', label: 'Nome (A → Z)' },
  { value: 'za', label: 'Nome (Z → A)' },
  { value: 'newest', label: 'Mais recentes primeiro' },
  { value: 'oldest', label: 'Mais antigas primeiro' },
]

const KEY = 'mr_deck_sort'
export const DECK_SORT_EVENT = 'mr-deck-sort-change'

export function getDeckSort(): DeckSortMode {
  try {
    const v = localStorage.getItem(KEY) as DeckSortMode | null
    if (v && DECK_SORT_OPTIONS.some((o) => o.value === v)) return v
  } catch {
    /* localStorage indisponível */
  }
  return 'manual'
}

export function setDeckSort(mode: DeckSortMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(DECK_SORT_EVENT))
}

type SortableDeck = { title?: string; order?: number; created?: string; created_at?: string }

const createdMs = (d: SortableDeck) => {
  const raw = d.created || d.created_at
  const t = raw ? Date.parse(raw) : NaN
  return Number.isNaN(t) ? 0 : t
}

// "numeric: true" faz "Tutoria 2" vir antes de "Tutoria 10".
const byName = (a: SortableDeck, b: SortableDeck) =>
  (a.title || '').localeCompare(b.title || '', 'pt-BR', { numeric: true, sensitivity: 'base' })

export function compareDecks(a: SortableDeck, b: SortableDeck, mode: DeckSortMode = getDeckSort()) {
  switch (mode) {
    case 'az':
      return byName(a, b)
    case 'za':
      return byName(b, a)
    case 'newest':
      return createdMs(b) - createdMs(a) || byName(a, b)
    case 'oldest':
      return createdMs(a) - createdMs(b) || byName(a, b)
    default:
      return (a.order || 0) - (b.order || 0) || createdMs(a) - createdMs(b)
  }
}
