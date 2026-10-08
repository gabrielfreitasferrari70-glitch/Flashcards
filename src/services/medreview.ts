import { supabase } from '@/lib/supabase/client'
import type { ParsedCsvCard } from '@/lib/csvImport'

export interface ReviewInput {
  card_id?: string
  card_ref?: string
  card?: string
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

  const targetCardId = data.card_id || data.card_ref || data.card
  if (!targetCardId) throw new Error('Identificador do cartão (card_id) não fornecido')

  const { data: res, error } = await supabase.from('mr_reviews').insert({
    user_id: user.user.id,
    card_id: targetCardId,
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
  return deleteDecksBatch([deckId])
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
}

export const createCardsBatch = async (
  deckId: string,
  cards: Array<{
    q: string
    a: string
    tags?: string[]
    clinical?: boolean
    ref?: string
    group?: string
    occlusion?: any
    imageUrl?: string
  }>,
) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  const payloads = cards.map((c) => {
    let finalA = c.a
    if (c.occlusion) {
      try {
        const occStr = btoa(unescape(encodeURIComponent(JSON.stringify(c.occlusion))))
        finalA = `${c.a}\n<!--occlusion:${occStr}-->`
      } catch {
        /* ignore */
      }
    }
    return {
      user_id: user.user!.id,
      deck_id: deckId,
      q: c.q,
      a: finalA,
      clinical: !!c.clinical,
      suspended: false,
      tags: c.tags || [],
      group: c.group || '',
      ref: c.ref || '',
      occlusion: c.occlusion || null,
    }
  })

  const { data, error } = await supabase.from('mr_cards').insert(payloads).select('id')
  if (!error) return data

  // Fallback se colunas extras não existirem
  if (error.code === '42703' || error.message?.includes('column')) {
    const basicPayloads = cards.map((c) => {
      let finalA = c.a
      if (c.occlusion) {
        try {
          const occStr = btoa(unescape(encodeURIComponent(JSON.stringify(c.occlusion))))
          finalA = `${c.a}\n<!--occlusion:${occStr}-->`
        } catch {
          /* ignore */
        }
      }
      return {
        user_id: user.user!.id,
        deck_id: deckId,
        q: c.q,
        a: finalA,
        clinical: !!c.clinical,
        suspended: false,
      }
    })
    const { data: fbData, error: fbErr } = await supabase.from('mr_cards').insert(basicPayloads).select('id')
    if (fbErr) throw fbErr
    return fbData
  }
  throw error
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
  try {
    await supabase.from('mr_reviews').delete().eq('card_id', cardId)
    await supabase.from('mr_card_reports').delete().eq('card_id', cardId)
    await supabase.from('mr_card_notes').delete().eq('card_id', cardId)
    const { error } = await supabase.from('mr_cards').delete().eq('id', cardId)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('Hard deleteCard failed, falling back to soft delete:', err)
    const { error: softErr } = await supabase.from('mr_cards').update({ deleted: true }).eq('id', cardId)
    if (softErr) throw softErr
    return true
  }
}

export const deleteCardsBatch = async (cardIds: string[]) => {
  if (cardIds.length === 0) return true
  try {
    await supabase.from('mr_reviews').delete().in('card_id', cardIds)
    await supabase.from('mr_card_reports').delete().in('card_id', cardIds)
    await supabase.from('mr_card_notes').delete().in('card_id', cardIds)
    const { error } = await supabase.from('mr_cards').delete().in('id', cardIds)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('Hard deleteCardsBatch failed, falling back to soft delete:', err)
    const { error: softErr } = await supabase.from('mr_cards').update({ deleted: true }).in('id', cardIds)
    if (softErr) throw softErr
    return true
  }
}

export const setCardsSuspendedBatch = async (cardIds: string[], suspended: boolean) => {
  if (cardIds.length === 0) return true
  const { error } = await supabase.from('mr_cards').update({ suspended }).in('id', cardIds)
  if (error) throw error
  return true
}

export const moveCardsBatch = async (cardIds: string[], deckId: string) => {
  if (cardIds.length === 0) return true
  const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).in('id', cardIds)
  if (error) throw error
  return true
}

export const deleteDecksBatch = async (deckIds: string[]) => {
  if (deckIds.length === 0) return true
  try {
    const { data: allDecks } = await supabase.from('mr_decks').select('id, parent')
    const toDelete = new Set<string>(deckIds)
    if (allDecks) {
      let changed = true
      while (changed) {
        changed = false
        for (const d of allDecks) {
          if (d.parent && toDelete.has(d.parent) && !toDelete.has(d.id)) {
            toDelete.add(d.id)
            changed = true
          }
        }
      }
    }
    const deleteArray = Array.from(toDelete)
    
    // Clean up cards, reviews, notes, exam plans first
    const { data: deckCards } = await supabase.from('mr_cards').select('id').in('deck_id', deleteArray)
    if (deckCards && deckCards.length > 0) {
      const cids = deckCards.map((c) => c.id)
      await supabase.from('mr_reviews').delete().in('card_id', cids)
      await supabase.from('mr_card_reports').delete().in('card_id', cids)
      await supabase.from('mr_card_notes').delete().in('card_id', cids)
    }

    await supabase.from('mr_exam_plans').delete().in('deck_id', deleteArray)
    await supabase.from('mr_cards').delete().in('deck_id', deleteArray)
    const { error } = await supabase.from('mr_decks').delete().in('id', deleteArray)
    if (error) throw error
    return true
  } catch (err) {
    console.warn('Hard deleteDecksBatch failed, falling back to soft delete:', err)
    const deleteArray = Array.from(deckIds)
    await supabase.from('mr_cards').update({ deleted: true }).in('deck_id', deleteArray)
    const { error: softErr } = await supabase.from('mr_decks').update({ deleted: true }).in('id', deleteArray)
    if (softErr) throw softErr
    return true
  }
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
export const moveCard = async (cardId: string, deckId: string) => {
  const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).eq('id', cardId)
  if (error) throw error
  return true
}
export const importCards = async () => {}
export const importCardsAuto = async () => {}
export const uploadCardImage = async () => {}
export const applyInitialSeed = async () => ({ ok: true })
