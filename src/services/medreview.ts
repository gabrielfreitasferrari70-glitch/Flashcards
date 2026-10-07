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

  // Nova pasta entra no FINAL das irmãs (ordem padrão = ordem de criação).
  let siblings = supabase
    .from('mr_decks')
    .select('order')
    .eq('user_id', user.user.id)
    .order('order', { ascending: false })
    .limit(1)
  siblings = parentId ? siblings.eq('parent', parentId) : siblings.is('parent', null)
  const { data: last } = await siblings
  const nextOrder = ((last?.[0]?.order as number) || 0) + 1

  const { data, error } = await supabase.from('mr_decks').insert({
    user_id: user.user.id,
    title,
    kind,
    parent: parentId || null,
    order: nextOrder
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

export const createCard = async (
  deckId: string,
  card: ParsedCsvCard & CardExtras & { occlusion?: any; tags?: string[] },
) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  const basePayload: any = {
    user_id: user.user.id,
    deck_id: deckId,
    q: card.q,
    a: card.a,
    clinical: !!card.clinical,
    suspended: false,
  }

  // Se tiver colunas da migração 002, tenta incluir
  const extendedPayload: any = { ...basePayload }
  if ((card as any).occlusion) extendedPayload.occlusion = (card as any).occlusion
  if ((card as any).imageUrl) extendedPayload.image_url = (card as any).imageUrl
  if ((card as any).tags) extendedPayload.tags = (card as any).tags
  if ((card as any).group) extendedPayload.group = (card as any).group
  if ((card as any).ref) extendedPayload.ref = (card as any).ref

  try {
    const { data, error } = await supabase
      .from('mr_cards')
      .insert(extendedPayload)
      .select()
      .single()
    if (!error) return data

    // Se o banco ainda não rodou a migração 002 das colunas novas, faz fallback seguro
    if (error.code === '42703' || error.message?.includes('column')) {
      console.warn('Fallback: colunas extras ainda não criadas em mr_cards, inserindo payload básico')
      const { data: fbData, error: fbErr } = await supabase
        .from('mr_cards')
        .insert(basePayload)
        .select()
        .single()
      if (fbErr) throw fbErr
      return fbData
    }
    throw error
  } catch (err) {
    throw err
  }
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
export const moveDeck = async (deckId: string, parent: string, rootKind?: string) => {
  const updates: any = {}
  if (parent) updates.parent = parent
  else updates.parent = null
  if (rootKind) updates.kind = rootKind

  const { data, error } = await supabase.from('mr_decks').update(updates).eq('id', deckId).select().single()
  if (error) throw error
  return data
}
export const moveDeckSection = async (fromKind: string, parent: string, rootKind?: string) => {
  const updates: any = {}
  if (parent) updates.parent = parent
  else updates.parent = null
  if (rootKind) updates.kind = rootKind

  // Supabase update on multiple rows
  const { data, error } = await supabase.from('mr_decks').update(updates).eq('kind', fromKind).is('parent', null).select()
  if (error) throw error
  return data
}
export const undoMoveSection = async () => {}
export const repairSection = async () => {}
export const resetDeck = async () => {}
export const moveCard = async () => {}
export const importCards = async () => {}
export const importCardsAuto = async () => {}
export const uploadCardImage = async () => {}
export const applyInitialSeed = async () => ({ ok: true })
