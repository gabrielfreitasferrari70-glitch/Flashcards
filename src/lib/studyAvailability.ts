export type StudyFilter = 'new' | 'review' | 'all'
export type StudyScope = { deckId?: string; kind?: string }

export function selectStudyScope<T extends { deck: string }>(
  cards: T[],
  decks: { id: string; parent?: string; kind: string; deleted?: boolean }[],
  scope: StudyScope = {},
): T[] {
  if (!scope.deckId && !scope.kind) return cards
  const roots = scope.deckId
    ? [scope.deckId]
    : decks.filter((d) => !d.deleted && !d.parent && d.kind === scope.kind).map((d) => d.id)
  const children = new Map<string, string[]>()
  for (const deck of decks) {
    if (deck.deleted || !deck.parent) continue
    children.set(deck.parent, [...(children.get(deck.parent) || []), deck.id])
  }
  const included = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const id = pending.pop()!
    if (included.has(id)) continue
    included.add(id)
    pending.push(...(children.get(id) || []))
  }
  return cards.filter((card) => included.has(card.deck))
}
