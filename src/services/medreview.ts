import pb from '@/lib/pocketbase/client'
import type { ParsedCsvCard } from '@/lib/csvImport'

export interface SeedApplyResult {
  ok: boolean
  createdDecks: number
  createdCards: number
  totalDecks: number
  totalCards: number
}

export interface ReviewInput {
  card_ref?: string
  global_card_ref?: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  stability: number
  difficulty: number
  retrievability: number | null
  elapsed_days: number
  scheduled_days: number
  state: string
  due: string
  reviewed_at: string
}

export const applyInitialSeed = () =>
  pb.send<SeedApplyResult>('/backend/v1/mr/seed/apply', { method: 'POST', body: '{}' })

export const createReview = (data: ReviewInput) =>
  pb.send('/backend/v1/mr/reviews', { method: 'POST', body: JSON.stringify(data) })

export const manageGlobalCatalog = <T = any>(action: string, fields: Record<string, unknown>) =>
  pb.send<T>('/backend/v1/mr/global-catalog', {
    method: 'POST',
    body: JSON.stringify({ action, ...fields }),
  })

export const manageLibrary = <T = any>(action: string, fields: Record<string, unknown>) =>
  pb.send<T>('/backend/v1/mr/manage', {
    method: 'POST',
    body: JSON.stringify({ action, ...fields }),
  })

export const createDeck = async (
  title: string,
  kind: 'tutoria' | 'prova' | 'custom',
  parentId?: string,
  mode?: 'study' | 'organizer',
  frontline?: boolean,
) => {
  const res: any = await manageLibrary('deck_create', {
    title,
    kind,
    parent_id: parentId || '',
    mode: mode || 'study',
    frontline: !!frontline,
  })
  // Fallback: se o hook não gravou o frontline (deploy antigo/erro), marca
  // DIRETO pelo frontend (updateRule do dono já garante ownership).
  if (frontline && res?.id) {
    try {
      const rec = await pb.collection('mr_decks').getOne(res.id)
      if (!rec['frontline']) await pb.collection('mr_decks').update(res.id, { frontline: true })
    } catch (e) {
      // melhor esforço — o hook já gravou frontline na maioria dos casos
    }
  }
  return res
}

export const renameDeck = (deckId: string, title: string) =>
  manageLibrary('deck_rename', { deck_id: deckId, title })

export const moveDeck = (deckId: string, parentId: string, kind?: string) =>
  manageLibrary('deck_move', { deck_id: deckId, parent_id: parentId || '', kind: kind || '' })

export const moveDeckSection = (
  fromKind: 'tutoria' | 'prova' | 'custom',
  parentId?: string,
  kind?: 'tutoria' | 'prova' | 'custom',
  blockTitle?: string,
) =>
  manageLibrary('deck_move_section', {
    from_kind: fromKind,
    parent_id: parentId || '',
    kind: kind || '',
    block_title: blockTitle || '',
  })

export const undoMoveSection = (
  deckIds: string[],
  restoreKind: 'tutoria' | 'prova' | 'custom',
  blockId?: string,
) =>
  manageLibrary('deck_move_section_undo', {
    deck_ids: deckIds,
    restore_kind: restoreKind,
    block_id: blockId || '',
  })

export const repairSection = (restoreKind: 'tutoria' | 'prova' | 'custom', titlePattern: string) =>
  manageLibrary('deck_section_repair', { restore_kind: restoreKind, title_pattern: titlePattern })

export const deleteDeck = (deckId: string) => manageLibrary('deck_delete', { deck_id: deckId })

export interface CardExtras {
  imageUrl?: string
  choices?: string[]
  reverse?: boolean
  clinical?: boolean
}

export const createCard = (deckId: string, card: ParsedCsvCard & CardExtras) =>
  manageLibrary('card_create', { deck_id: deckId, card })

export const updateCard = (
  card: {
    id: string
    q: string
    a: string
    group: string
    ref: string
  } & CardExtras,
) =>
  manageLibrary('card_update', {
    card_id: card.id,
    q: card.q,
    a: card.a,
    group: card.group,
    ref: card.ref,
    imageUrl: card.imageUrl || '',
    choices: card.choices ?? [],
    reverse: !!card.reverse,
    clinical: !!card.clinical,
  })

// Upload de imagem do computador: campo file 'image' do mr_cards.
// A updateRule da coleção já Garante que só o dono altera.
export const uploadCardImage = (cardId: string, file: File) => {
  const form = new FormData()
  form.append('image', file)
  return pb.collection('mr_cards').update(cardId, form)
}

export const setCardSuspended = (cardId: string, suspended: boolean) =>
  manageLibrary('card_suspend', { card_id: cardId, suspended })

export const deleteCard = (cardId: string) => manageLibrary('card_delete', { card_id: cardId })

export const resetDeck = (deckId: string) => manageLibrary('deck_reset', { deck_id: deckId })

export const moveCard = (cardId: string, deckId: string) =>
  manageLibrary('card_move', { card_id: cardId, deck_id: deckId })

export const importCards = (deckId: string, cards: ParsedCsvCard[]) =>
  manageLibrary('card_import', {
    deck_id: deckId,
    cards: cards.map((card) => ({
      q: card.q,
      a: card.a,
      group: card.group || '',
      ref: card.ref || '',
      clinical: !!card.clinical,
      imageUrl: card.imageUrl || '',
    })),
  })

export const importCardsAuto = (
  cards: (ParsedCsvCard & { folder?: string })[],
  parentDeckId?: string,
) =>
  manageLibrary('card_import_auto', {
    parent_deck_id: parentDeckId || '',
    cards: cards.map((card) => ({
      q: card.q,
      a: card.a,
      group: card.group || '',
      ref: card.ref || '',
      folder_title: card.folder || '',
      clinical: !!card.clinical,
      imageUrl: card.imageUrl || '',
    })),
  })
