import { supabase } from '@/lib/supabase/client'
import type { ParsedCsvCard } from '@/lib/csvImport'

export interface ReviewInput {
  card_id: string
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

export const createReview = async (data: ReviewInput) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  const { data: res, error } = await supabase.from('mr_reviews').insert({
    user_id: user.user.id,
    card_id: data.card_id,
    rating: data.rating,
    stability: data.stability,
    difficulty: data.difficulty,
    retrievability: data.retrievability,
    elapsed_days: data.elapsed_days,
    scheduled_days: data.scheduled_days,
    state: data.state,
    due: data.due,
    reviewed_at: data.reviewed_at
  }).select().single()

  if (error) throw error
  return res
}

export const createDeck = async (
  title: string,
  kind: 'tutoria' | 'prova' | 'custom',
  parentId?: string
) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  const { data, error } = await supabase.from('mr_decks').insert({
    user_id: user.user.id,
    title,
    kind,
    order: Date.now() 
  }).select().single()
  
  if (error) throw error
  return data
}

export const renameDeck = async (deckId: string, title: string) => {
  const { data, error } = await supabase.from('mr_decks').update({ title }).eq('id', deckId).select().single()
  if (error) throw error
  return data
}

export const deleteDeck = async (deckId: string) => {
  const { error } = await supabase.from('mr_decks').delete().eq('id', deckId)
  if (error) throw error
  return true
}

export interface CardExtras {
  imageUrl?: string
  choices?: string[]
  reverse?: boolean
  clinical?: boolean
}

export const createCard = async (deckId: string, card: ParsedCsvCard & CardExtras) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  const { data, error } = await supabase.from('mr_cards').insert({
    user_id: user.user.id,
    deck_id: deckId,
    q: card.q,
    a: card.a,
    clinical: !!card.clinical,
    suspended: false
  }).select().single()

  if (error) throw error
  return data
}

export const updateCard = async (
  card: {
    id: string
    q: string
    a: string
  } & CardExtras,
) => {
  const { data, error } = await supabase.from('mr_cards').update({
    q: card.q,
    a: card.a,
    clinical: !!card.clinical
  }).eq('id', card.id).select().single()

  if (error) throw error
  return data
}

export const setCardSuspended = async (cardId: string, suspended: boolean) => {
  const { data, error } = await supabase.from('mr_cards').update({ suspended }).eq('id', cardId).select().single()
  if (error) throw error
  return data
}

export const deleteCard = async (cardId: string) => {
  const { error } = await supabase.from('mr_cards').delete().eq('id', cardId)
  if (error) throw error
  return true
}

// Stubs for complex operations that we are simplifying
export const moveDeck = async () => {}
export const moveDeckSection = async () => {}
export const undoMoveSection = async () => {}
export const repairSection = async () => {}
export const resetDeck = async () => {}
export const moveCard = async () => {}
export const importCards = async () => {}
export const importCardsAuto = async () => {}
export const uploadCardImage = async () => {}
export const applyInitialSeed = async () => ({ ok: true })
