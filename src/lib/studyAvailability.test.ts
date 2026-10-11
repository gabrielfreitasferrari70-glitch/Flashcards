import { describe, expect, it } from 'vitest'
import { selectStudyScope } from './studyAvailability'

const decks = [
  { id: 'root', kind: 'tutoria' },
  { id: 'child', parent: 'root', kind: 'custom' },
  { id: 'grandchild', parent: 'child', kind: 'custom' },
  { id: 'other', kind: 'prova' },
  { id: 'deleted', parent: 'root', kind: 'tutoria', deleted: true },
]
const cards = decks.map((d) => ({ id: `card-${d.id}`, deck: d.id }))

describe('study availability scope', () => {
  it('includes descendants and excludes deleted branches', () => {
    expect(selectStudyScope(cards, decks, { deckId: 'root' }).map((c) => c.deck)).toEqual([
      'root',
      'child',
      'grandchild',
    ])
  })
  it('includes all descendants of a category even when their kinds differ', () => {
    expect(selectStudyScope(cards, decks, { kind: 'tutoria' }).map((c) => c.deck)).toEqual([
      'root',
      'child',
      'grandchild',
    ])
    expect(selectStudyScope(cards, decks, { kind: 'prova' }).map((c) => c.deck)).toEqual(['other'])
  })
  it('terminates on a cyclic hierarchy without duplicating cards', () => {
    const cyclic = [
      { id: 'a', parent: 'b', kind: 'custom' },
      { id: 'b', parent: 'a', kind: 'custom' },
    ]
    expect(selectStudyScope([{ deck: 'a' }, { deck: 'b' }], cyclic, { deckId: 'a' })).toHaveLength(
      2,
    )
  })
  it('returns no cards for an empty scope and preserves an unscoped collection', () => {
    expect(selectStudyScope(cards, decks, { deckId: 'missing' })).toEqual([])
    expect(selectStudyScope(cards, decks)).toBe(cards)
  })
})
