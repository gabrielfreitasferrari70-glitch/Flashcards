import { supabase } from '@/lib/supabase/client'
import type { ParsedCsvCard } from '@/lib/csvImport'
import { getLocalCache, setLocalCache } from '@/lib/cache/localCache'
import { isDataUrl, uploadDataUrlIfNeeded, uploadImageToStorage } from '@/services/imageStorage'

export const MASTER_USER_ID = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'
export const MASTER_EMAIL = 'gabrielfreitasferrari70@gmail.com'

// Canal global de broadcast Supabase Realtime (latência <50ms entre admin e alunos)
let realtimeChannel: any = null
function getSyncChannel() {
  if (!realtimeChannel) {
    realtimeChannel = supabase.channel('medreview_global_sync', {
      config: { broadcast: { self: false } },
    })
    realtimeChannel.subscribe()
  }
  return realtimeChannel
}

export const notifyDataMutation = (action: string, payload?: any) => {
  try {
    const ch = getSyncChannel()
    ch.send({
      type: 'broadcast',
      event: 'db_mutation',
      payload: { action, details: payload, timestamp: Date.now() },
    })
  } catch (err) {
    console.warn('Realtime notify warning:', err)
  }
}

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
  const { data: { session } } = await supabase.auth.getSession()
  let userId = session?.user?.id
  if (!userId) {
    const { data: user } = await supabase.auth.getUser()
    userId = user.user?.id
  }
  if (!userId) throw new Error('Not authenticated')

  const targetCardId = data.card_id || data.card_ref || data.card
  if (!targetCardId) throw new Error('Identificador do cartão (card_id) não fornecido')

  const { data: res, error } = await supabase.from('mr_reviews').insert({
    user_id: userId,
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
  }).select('id').single()

  if (error) throw error
  return res
}

const FRONTLINE_DECKS_KEY = 'mr_frontline_decks_v1'

export const getFrontlineDeckIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(FRONTLINE_DECKS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

export const recordFrontlineDeckId = (deckId: string) => {
  try {
    const ids = getFrontlineDeckIds()
    ids.add(deckId)
    localStorage.setItem(FRONTLINE_DECKS_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    /* ignore */
  }
}

export const createDeck = async (
  title: string,
  kind: 'tutoria' | 'prova' | 'custom' = 'custom',
  parentId?: string,
  mode?: string,
  frontline?: boolean
) => {
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not authenticated')

  // Nova pasta entra no FINAL das irmãs (ordem padrão = ordem de criação).
  let siblings = supabase
    .from('mr_decks')
    .select('order')
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

  // Marca no localStorage caso seja frontline ou pasta de raiz criada pelo usuário
  const isFront = !!frontline || (!parentId && kind === 'custom')
  if (isFront && data?.id) {
    recordFrontlineDeckId(data.id)
  }

  notifyDataMutation('deck_created', { id: data.id, title, parentId })
  return { ...data, frontline: isFront, mode: mode || 'study' }
}

export const renameDeck = async (deckId: string, title: string) => {
  const { data, error } = await supabase.from('mr_decks').update({ title }).eq('id', deckId).select().single()
  if (error) throw error
  notifyDataMutation('deck_renamed', { id: deckId, title })
  return data
}

export const deleteDeck = async (deckId: string) => {
  return deleteDecksBatch([deckId])
}

export interface CardExtras {
  group?: string
  ref?: string
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

  // Imagem em base64 (data URL) sobe para o Storage e vira URL pública,
  // evitando inflar o PostgreSQL. Fallback mantém o base64 se o upload falhar.
  let resolvedImageUrl = (card as any).imageUrl
  if (isDataUrl(resolvedImageUrl)) {
    try {
      resolvedImageUrl = await uploadDataUrlIfNeeded(resolvedImageUrl, `deck-${deckId}`)
    } catch (err) {
      console.warn('Falha ao enviar imagem para o Storage; mantendo base64:', err)
    }
  }

  if ((card as any).occlusion) extendedPayload.occlusion = (card as any).occlusion
  if (resolvedImageUrl) extendedPayload.image_url = resolvedImageUrl
  if ((card as any).tags) extendedPayload.tags = (card as any).tags
  if ((card as any).group) extendedPayload.group = (card as any).group
  if ((card as any).ref) extendedPayload.ref = (card as any).ref

  const { data, error } = await supabase
    .from('mr_cards')
    .insert(extendedPayload)
    .select()
    .single()
  if (!error) {
    notifyDataMutation('card_created', { id: data.id, deckId })
    return data
  }

  // Se o banco ainda não rodou a migração 002 das colunas novas, faz fallback seguro
  if (error.code === '42703' || error.message?.includes('column')) {
    console.warn('Fallback: colunas extras ainda não criadas em mr_cards, inserindo payload básico')
    const { data: fbData, error: fbErr } = await supabase
      .from('mr_cards')
      .insert(basePayload)
      .select()
      .single()
    if (fbErr) throw fbErr
    notifyDataMutation('card_created', { id: fbData.id, deckId })
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

  const sanitizeStr = (val: any, fallback: string = ''): string => {
    if (val === null || val === undefined) return fallback
    const s = String(val).replace(/\0/g, '').trim()
    return s || fallback
  }

  // Converte imagens em data URL (base64) para URL pública no Storage,
  // evitando inflar o PostgreSQL. Fallback mantém o base64 se o upload falhar.
  const imageUrlByCard = new Map<number, string | null>()
  for (let i = 0; i < cards.length; i++) {
    const raw = sanitizeStr((cards[i] as any).image_url || cards[i].imageUrl || '', '')
    if (raw && isDataUrl(raw)) {
      try {
        imageUrlByCard.set(i, await uploadDataUrlIfNeeded(raw, `deck-${deckId}`))
      } catch (err) {
        console.warn('Falha ao enviar imagem para o Storage; mantendo base64:', err)
        imageUrlByCard.set(i, raw)
      }
    } else {
      imageUrlByCard.set(i, raw || null)
    }
  }

  const payloads = cards.map((c, i) => {
    const cleanQ = sanitizeStr(c.q, 'Flashcard sem pergunta')
    const cleanA = sanitizeStr(c.a, 'Flashcard sem resposta')
    const cleanTags = Array.isArray(c.tags)
      ? c.tags
          .filter((t) => t !== null && t !== undefined)
          .map((t) => String(t).replace(/\0/g, '').trim())
          .filter(Boolean)
      : []

    return {
      user_id: user.user!.id,
      deck_id: deckId,
      q: cleanQ,
      a: cleanA,
      clinical: !!c.clinical,
      suspended: false,
      tags: cleanTags,
      group: sanitizeStr(c.group, ''),
      ref: sanitizeStr(c.ref, ''),
      reverse: !!(c as any).reverse,
      choices: (c as any).choices || null,
      image_url: imageUrlByCard.get(i) ?? null,
      occlusion: c.occlusion && typeof c.occlusion === 'object' ? c.occlusion : null,
    }
  })

  // Insere em lotes adaptativos para garantir envio rápido e não estourar limite de payload HTTP
  const results: any[] = []
  const MAX_BYTES_PER_CHUNK = 800_000
  const MAX_CARDS_PER_CHUNK = 15

  const chunks: Array<typeof payloads> = []
  let currentChunk: typeof payloads = []
  let currentBytes = 0

  for (const item of payloads) {
    const itemBytes =
      (item.q?.length || 0) +
      (item.a?.length || 0) +
      (item.image_url?.length || 0) +
      (item.occlusion ? JSON.stringify(item.occlusion).length : 0)

    if (
      currentChunk.length >= MAX_CARDS_PER_CHUNK ||
      (currentBytes + itemBytes > MAX_BYTES_PER_CHUNK && currentChunk.length > 0)
    ) {
      chunks.push(currentChunk)
      currentChunk = [item]
      currentBytes = itemBytes
    } else {
      currentChunk.push(item)
      currentBytes += itemBytes
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk)

  for (const chunk of chunks) {
    const { data, error } = await supabase.from('mr_cards').insert(chunk).select('id')
    if (error) {
      console.warn('Falha no lote de cartões, inserindo individualmente com sanitização:', error.message)
      for (const single of chunk) {
        const { data: sData, error: sErr } = await supabase.from('mr_cards').insert([single]).select('id')
        if (sData && sData.length > 0) {
          results.push(...sData)
        } else if (sErr) {
          console.warn('Tentando fallback básico para cartão:', sErr.message)
          // Fallback ultra-básico sem occlusion ou tags
          const basic = {
            user_id: single.user_id,
            deck_id: single.deck_id,
            q: single.q,
            a: single.a,
            clinical: single.clinical,
            suspended: false,
          }
          const { data: bData, error: bErr } = await supabase.from('mr_cards').insert([basic]).select('id')
          if (bData && bData.length > 0) {
            results.push(...bData)
          } else if (bErr) {
            console.error('Erro no fallback básico, tentando fallback de segurança:', bErr.message)
            // Fallback de segurança: corta campos gigantes que podem estourar limite do PostgreSQL
            const emergency = {
              user_id: single.user_id,
              deck_id: single.deck_id,
              q: single.q.slice(0, 10000),
              a: single.a.slice(0, 25000),
              clinical: false,
              suspended: false,
            }
            const { data: eData, error: eErr } = await supabase.from('mr_cards').insert([emergency]).select('id')
            if (eData && eData.length > 0) {
              results.push(...eData)
            } else if (eErr) {
              console.error('Não foi possível gravar cartão:', eErr.message, single.q.slice(0, 60))
            }
          }
        }
      }
    } else if (data) {
      results.push(...data)
    }
  }

  if (results.length === 0 && payloads.length > 0) {
    throw new Error('Não foi possível gravar as cartas no banco de dados. Verifique a conexão com o servidor.')
  }

  notifyDataMutation('cards_created', { count: results.length, deckId })
  return results
}


export const updateCard = async (
  card: {
    id: string
    q: string
    a: string
  } & CardExtras,
) => {
  const updatePayload: Record<string, any> = {
    q: card.q,
    a: card.a,
    clinical: !!card.clinical,
  }
  if (card.group !== undefined) updatePayload.group = card.group
  if (card.ref !== undefined) updatePayload.ref = card.ref
  if (card.reverse !== undefined) updatePayload.reverse = card.reverse
  if (card.choices !== undefined) updatePayload.choices = card.choices
  if (card.imageUrl !== undefined) updatePayload.image_url = card.imageUrl

  const { data, error } = await supabase.from('mr_cards').update(updatePayload).eq('id', card.id).select().single()

  if (error) throw error

  try {
    const cached = await getLocalCache<any[]>('mr_cached_cards')
    if (cached && Array.isArray(cached)) {
      const idx = cached.findIndex((c) => c.id === card.id)
      if (idx !== -1) {
        cached[idx] = { ...cached[idx], ...updatePayload }
        await setLocalCache('mr_cached_cards', cached)
      }
    }
  } catch (error) {
    console.warn("Cartão salvo no servidor, mas o cache local não pôde ser atualizado.", error)
  }

  notifyDataMutation('card_updated', { id: card.id })
  return data
}

const DELETED_CARDS_KEY = 'mr_deleted_cards_v1'
const DELETED_DECKS_KEY = 'mr_deleted_decks_v1'

export const getDeletedCardIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(DELETED_CARDS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export const recordDeletedCardId = (id: string | string[]) => {
  if (typeof window === 'undefined') return
  try {
    const set = getDeletedCardIds()
    const ids = Array.isArray(id) ? id : [id]
    for (const item of ids) {
      if (item) set.add(item)
    }
    localStorage.setItem(DELETED_CARDS_KEY, JSON.stringify(Array.from(set)))
  } catch (error) {
    console.warn("Não foi possível registrar a exclusão do cartão no armazenamento local.", error)
  }
}

export const getDeletedDeckIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(DELETED_DECKS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export const recordDeletedDeckId = (id: string | string[]) => {
  if (typeof window === 'undefined') return
  try {
    const set = getDeletedDeckIds()
    const ids = Array.isArray(id) ? id : [id]
    for (const item of ids) {
      if (item) set.add(item)
    }
    localStorage.setItem(DELETED_DECKS_KEY, JSON.stringify(Array.from(set)))
  } catch (error) {
    console.warn("Não foi possível registrar a exclusão da pasta no armazenamento local.", error)
  }
}

export const setCardSuspended = async (cardId: string, suspended: boolean) => {
  const { data, error } = await supabase.from('mr_cards').update({ suspended }).eq('id', cardId).select().single()
  if (error) throw error
  notifyDataMutation('card_suspended', { cardId, suspended })
  return data
}

export const deleteCard = async (cardId: string) => {
  recordDeletedCardId(cardId)
  try {
    const cached = await getLocalCache<any[]>('mr_cached_cards')
    if (cached && Array.isArray(cached)) {
      await setLocalCache('mr_cached_cards', cached.filter((c) => c.id !== cardId))
    }
  } catch (error) {
    console.warn("Não foi possível remover o cartão do cache local.", error)
  }
  await supabase.from('mr_reviews').delete().eq('card_id', cardId)
  await supabase.from('mr_card_reports').delete().eq('card_id', cardId)
  await supabase.from('mr_card_notes').delete().eq('card_id', cardId)
  const { error } = await supabase.from('mr_cards').delete().eq('id', cardId)
  if (error) throw error
  notifyDataMutation('card_deleted', { id: cardId })
  return true
}

export const deleteCardsBatch = async (cardIds: string[]) => {
  if (cardIds.length === 0) return true
  recordDeletedCardId(cardIds)
  try {
    const cached = await getLocalCache<any[]>('mr_cached_cards')
    if (cached && Array.isArray(cached)) {
      const set = new Set(cardIds)
      await setLocalCache('mr_cached_cards', cached.filter((c) => !set.has(c.id)))
    }
  } catch (error) {
    console.warn("Não foi possível remover os cartões do cache local.", error)
  }
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    await supabase.from('mr_reviews').delete().in('card_id', chunk)
    await supabase.from('mr_card_reports').delete().in('card_id', chunk)
    await supabase.from('mr_card_notes').delete().in('card_id', chunk)
    const { error } = await supabase.from('mr_cards').delete().in('id', chunk)
    if (error) throw error
  }
  notifyDataMutation('cards_deleted', { ids: cardIds })
  return true
}

export const setCardsSuspendedBatch = async (cardIds: string[], suspended: boolean) => {
  if (cardIds.length === 0) return true
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    const { error } = await supabase.from('mr_cards').update({ suspended }).in('id', chunk)
    if (error) throw error
  }
  notifyDataMutation('cards_suspended', { ids: cardIds, suspended })
  return true
}

export const moveCardsBatch = async (cardIds: string[], deckId: string) => {
  if (cardIds.length === 0) return true
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).in('id', chunk)
    if (error) throw error
  }
  notifyDataMutation('cards_moved', { ids: cardIds, deckId })
  return true
}

export const deleteDecksBatch = async (deckIds: string[]) => {
  if (deckIds.length === 0) return true
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
  
  // 1. Limpa cartas, avaliações, notas e planos vinculados em lotes seguros
  for (let i = 0; i < deleteArray.length; i += 50) {
    const chunk = deleteArray.slice(i, i + 50)
    const { data: deckCards } = await supabase.from('mr_cards').select('id').in('deck_id', chunk)
    if (deckCards && deckCards.length > 0) {
      const cids = deckCards.map((c) => c.id)
      for (let j = 0; j < cids.length; j += 100) {
        const cardChunk = cids.slice(j, j + 100)
        await supabase.from('mr_reviews').delete().in('card_id', cardChunk)
        await supabase.from('mr_card_reports').delete().in('card_id', cardChunk)
        await supabase.from('mr_card_notes').delete().in('card_id', cardChunk)
      }
    }
    await supabase.from('mr_exam_plans').delete().in('deck_id', chunk)
    await supabase.from('mr_cards').delete().in('deck_id', chunk)
  }

  // 2. Desvincula referências pai/filho na própria mr_decks antes de deletar
  // Isso IMPEDE o erro de Foreign Key do Postgres que exigia clicar 2 a 3 vezes!
  for (let i = 0; i < deleteArray.length; i += 50) {
    const chunk = deleteArray.slice(i, i + 50)
    await supabase.from('mr_decks').update({ parent: null }).in('id', chunk)
    await supabase.from('mr_decks').update({ parent: null }).in('parent', chunk)
  }

  // 3. Deleta as pastas com 100% de sucesso na primeira tentativa
  recordDeletedDeckId(deleteArray)
  for (let i = 0; i < deleteArray.length; i += 50) {
    const chunk = deleteArray.slice(i, i + 50)
    const { error } = await supabase.from('mr_decks').delete().in('id', chunk)
    if (error) throw error
  }
  notifyDataMutation('decks_deleted', { ids: deleteArray })
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
  notifyDataMutation('deck_moved', { deckId, parent })
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
  notifyDataMutation('section_moved', { fromKind, parent })
  return data
}
export const undoMoveSection = async (deckIds?: string[], restoreKind?: string, blockId?: string) => {
  if (!deckIds || deckIds.length === 0) return
  for (const id of deckIds) {
    await supabase.from('mr_decks').update({ kind: restoreKind || 'custom', parent: blockId || null }).eq('id', id)
  }
  notifyDataMutation('section_undo', { deckIds })
}

export const repairSection = async (kind?: string, pattern?: string) => {
  const targetKind = kind === 'prova' ? 'prova' : 'tutoria'
  const re = new RegExp(pattern || (targetKind === 'tutoria' ? '^Tutoria ' : '^Prova '))
  const { data: decks, error } = await supabase
    .from('mr_decks')
    .select('id, title')
    .eq('kind', targetKind)
    .not('parent', 'is', null)
  if (error) throw error

  const ids = (decks || [])
    .filter((d: any) => re.test(d.title || ''))
    .map((d: any) => d.id)

  if (!ids.length) return { success: true, restored: 0 }

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    await supabase.from('mr_decks').update({ parent: null }).in('id', chunk)
  }
  notifyDataMutation('section_repaired', { kind: targetKind })
  return { success: true, restored: ids.length }
}

export const resetCard = async (cardId: string) => {
  if (!cardId) return
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return

  const cleanId = cardId.replace(/::rev$/, '')
  await supabase.from('mr_reviews').delete().eq('user_id', user.user.id).eq('card_id', cleanId)

  // 1. Limpa da fila offline do navegador
  try {
    const rawOffline = localStorage.getItem('mr_offline_reviews_queue')
    if (rawOffline) {
      const q = JSON.parse(rawOffline)
      const filtered = q.filter((r: any) => {
        const cid = (r.card_id || r.card_ref || r.card || '').replace(/::rev$/, '')
        return cid !== cleanId
      })
      localStorage.setItem('mr_offline_reviews_queue', JSON.stringify(filtered))
    }
  } catch (e) {
    console.warn('Erro ao limpar offline reviews para carta:', e)
  }

  // 2. Limpa do cache IndexedDB
  try {
    const cached = await getLocalCache<any[]>('mr_cached_reviews')
    if (cached && Array.isArray(cached)) {
      const filtered = cached.filter((r: any) => {
        const cid = (r.card_id || r.card_ref || r.card || '').replace(/::rev$/, '')
        return cid !== cleanId
      })
      await setLocalCache('mr_cached_reviews', filtered)
    }
  } catch (e) {
    console.warn('Erro ao atualizar cache local para carta:', e)
  }

  notifyDataMutation('card_reset', { cardId: cleanId })
}

export const resetDeck = async (deckId?: string, targetCardIds?: string[]) => {
  if (!deckId) return
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return

  const allCardIdsSet = new Set<string>()
  if (targetCardIds && Array.isArray(targetCardIds)) {
    for (const id of targetCardIds) {
      if (id) allCardIdsSet.add(id.replace(/::rev$/, ''))
    }
  }

  try {
    // 1. Vascula hierarquia de decks no Supabase para pegar subpastas recursivamente
    const { data: dbDecks } = await supabase.from('mr_decks').select('id, parent')
    const descendantDeckIds = new Set<string>([deckId])
    if (dbDecks && Array.isArray(dbDecks)) {
      let added = true
      while (added) {
        added = false
        for (const d of dbDecks) {
          if (d.parent && descendantDeckIds.has(d.parent) && !descendantDeckIds.has(d.id)) {
            descendantDeckIds.add(d.id)
            added = true
          }
        }
      }
    }

    // 2. Busca cartões customizados em mr_cards para todas as subpastas
    const deckIdsList = Array.from(descendantDeckIds)
    for (let i = 0; i < deckIdsList.length; i += 50) {
      const chunk = deckIdsList.slice(i, i + 50)
      const { data: cards } = await supabase.from('mr_cards').select('id').in('deck_id', chunk)
      if (cards && Array.isArray(cards)) {
        for (const c of cards) {
          if (c.id) allCardIdsSet.add(c.id.replace(/::rev$/, ''))
        }
      }
    }

    // 3. Busca cartões do catálogo estático (/catalog.json) pertencentes a essas pastas
    if (typeof window !== 'undefined') {
      try {
        const catRes = await fetch('/catalog.json')
        if (catRes.ok) {
          const cat = await catRes.json()
          if (cat && Array.isArray(cat.cards)) {
            for (const c of cat.cards) {
              if (c.id && (descendantDeckIds.has(c.deck) || descendantDeckIds.has(c.deck_id))) {
                allCardIdsSet.add(c.id.replace(/::rev$/, ''))
              }
            }
          }
        }
      } catch (err) {
        console.warn('Catalog check in resetDeck:', err)
      }
    }
  } catch (err) {
    console.warn('Erro ao listar cartas do deck em resetDeck:', err)
  }

  const allCardIds = Array.from(allCardIdsSet)
  if (allCardIds.length > 0) {
    // 4. Deleta revisões no Supabase em lotes de 50 (evita erro de URI too long)
    for (let i = 0; i < allCardIds.length; i += 50) {
      const chunk = allCardIds.slice(i, i + 50)
      const { error } = await supabase
        .from('mr_reviews')
        .delete()
        .eq('user_id', user.user.id)
        .in('card_id', chunk)
      if (error) {
        console.error('Erro ao deletar revisões no Supabase:', error)
      }
    }

    // 5. Limpa avaliações acumuladas offline no localStorage
    try {
      const rawOffline = localStorage.getItem('mr_offline_reviews_queue')
      if (rawOffline) {
        const q = JSON.parse(rawOffline)
        const filtered = q.filter((r: any) => {
          const cid = (r.card_id || r.card_ref || r.card || '').replace(/::rev$/, '')
          return !allCardIdsSet.has(cid)
        })
        localStorage.setItem('mr_offline_reviews_queue', JSON.stringify(filtered))
      }
    } catch (e) {
      console.warn('Erro ao limpar fila offline:', e)
    }

    // 6. Limpa avaliações em cache local IndexedDB
    try {
      const cached = await getLocalCache<any[]>('mr_cached_reviews')
      if (cached && Array.isArray(cached)) {
        const filtered = cached.filter((r: any) => {
          const cid = (r.card_id || r.card_ref || r.card || '').replace(/::rev$/, '')
          return !allCardIdsSet.has(cid)
        })
        await setLocalCache('mr_cached_reviews', filtered)
      }
    } catch (e) {
      console.warn('Erro ao atualizar cache local:', e)
    }
  }

  notifyDataMutation('deck_reset', { deckId, cardIds: allCardIds })
}
export const moveCard = async (cardId: string, deckId: string) => {
  const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).eq('id', cardId)
  if (error) throw error
  notifyDataMutation('card_moved', { cardId, deckId })
  return true
}
export const importCards = async (
  deckId: string,
  cards: Array<{
    q: string
    a: string
    ref?: string
    group?: string
    clinical?: boolean
    imageUrl?: string
    tags?: string[]
    occlusion?: any
  }>,
) => {
  return createCardsBatch(
    deckId,
    cards.map((c) => ({
      q: c.q,
      a: c.a,
      ref: c.ref,
      group: c.group,
      clinical: c.clinical,
      tags: c.tags,
      occlusion: c.occlusion,
      imageUrl: c.imageUrl,
    })),
  )
}
export const restoreBackupData = async (force = false) => {
  const { data: userAuth } = await supabase.auth.getUser()
  if (!userAuth.user) return { ok: false, error: 'Usuário não autenticado' }
  const userId = userAuth.user.id

  // Apenas a conta Administrador / Docente gerencia o catálogo mestre.
  // Usuários comuns compartilham os 1.352 cartões centralizados do Docente e não devem duplicá-los.
  if (userId !== MASTER_USER_ID) {
    return { ok: true, skipped: true }
  }

  // Se não for forçado, verifica se já foi restaurado e se os cartões estão saudáveis
  if (!force) {
    const alreadyRestored = localStorage.getItem('mr_restored_clean_v6') === 'done'
    const { count: cardCount } = await supabase
      .from('mr_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (alreadyRestored && cardCount && cardCount >= 1000) {
      return { ok: true, skipped: true }
    }
  }

  // Busca o arquivo de restauração com os 1.352 cartões limpos e 34 pastas
  const res = await fetch('/restorationData.json')
  if (!res.ok) {
    throw new Error(`Falha ao ler dados de restauração (HTTP ${res.status})`)
  }
  const payload = await res.json()
  const { decks: jsonDecks, cards: jsonCards } = payload

  // Busca pastas atuais do usuário para reutilizar UUIDs e manter hierarquia perfeita
  const { data: existingDecks } = await supabase
    .from('mr_decks')
    .select('id, title, parent, kind, order')
    .eq('user_id', userId)

  const currentDecks = existingDecks || []
  const idMap = new Map<string, string>()

  // 1. Mapeia ou cria pastas-raiz (UC-1 e UC-2)
  const rootDecks = jsonDecks.filter((d: any) => !d.parent)
  for (const d of rootDecks) {
    const normTitle = d.title.trim().toLowerCase()
    const matched = currentDecks.find(
      (ed: any) => !ed.parent && ed.title?.trim().toLowerCase() === normTitle,
    )

    if (matched) {
      idMap.set(d.id, matched.id)
      await supabase
        .from('mr_decks')
        .update({
          kind: 'custom',
          parent: null,
          order: d.order ?? 0,
        })
        .eq('id', matched.id)
    } else {
      const { data: inserted, error } = await supabase
        .from('mr_decks')
        .insert({
          user_id: userId,
          title: d.title,
          kind: 'custom',
          parent: null,
          order: d.order ?? 0,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Erro ao inserir pasta raiz:', d.title, error)
        throw error
      }
      idMap.set(d.id, inserted.id)
    }
  }

  // 2. Mapeia ou cria subpastas nível a nível
  let remaining = jsonDecks.filter((d: any) => !!d.parent)
  let loopGuard = 0
  while (remaining.length > 0 && loopGuard < 10) {
    loopGuard++
    const batch = remaining.filter((d: any) => idMap.has(d.parent))
    if (batch.length === 0) break

    for (const d of batch) {
      const parentUUID = idMap.get(d.parent)
      const normTitle = d.title.trim().toLowerCase()

      // Tenta encontrar deck correspondente
      const matched = currentDecks.find(
        (ed: any) =>
          ed.title?.trim().toLowerCase() === normTitle &&
          (ed.parent === parentUUID || (!idMap.has(ed.parent) && !ed.parent)),
      )

      if (matched) {
        idMap.set(d.id, matched.id)
        await supabase
          .from('mr_decks')
          .update({
            parent: parentUUID,
            kind: 'custom',
            order: d.order ?? 0,
          })
          .eq('id', matched.id)
      } else {
        const { data: inserted, error } = await supabase
          .from('mr_decks')
          .insert({
            user_id: userId,
            title: d.title,
            kind: 'custom',
            parent: parentUUID,
            order: d.order ?? 0,
          })
          .select('id')
          .single()

        if (error) {
          console.error('Erro ao inserir subpasta:', d.title, error)
          throw error
        }
        idMap.set(d.id, inserted.id)
      }
    }

    const batchIds = new Set(batch.map((b: any) => b.id))
    remaining = remaining.filter((d: any) => !batchIds.has(d.id))
  }

  // 3. Limpa cartões antigos/pesados com Base64 para eliminar o timeout de banco
  try {
    await supabase.from('mr_reviews').delete().eq('user_id', userId)
    await supabase.from('mr_card_reports').delete().eq('user_id', userId)
    await supabase.from('mr_card_notes').delete().eq('user_id', userId)
    await supabase.from('mr_cards').delete().eq('user_id', userId)
  } catch (cleanErr) {
    console.warn('Aviso ao limpar cartões anteriores:', cleanErr)
  }

  // 4. Prepara payloads dos 1.352 cartões limpos
  const cardPayloads = jsonCards
    .map((c: any) => {
      const targetDeckId = idMap.get(c.deck_id)
      if (!targetDeckId) return null

      // Extrai oclusão se presente no comentário <!--occlusion:...-->
      let occObj = c.occlusion || null
      if (!occObj && c.a && c.a.includes('<!--occlusion:')) {
        const match = c.a.match(/<!--occlusion:([A-Za-z0-9+/=]+)-->/)
        if (match) {
          try {
            occObj = JSON.parse(decodeURIComponent(escape(atob(match[1]))))
          } catch {
            try {
              occObj = JSON.parse(atob(match[1]))
            } catch {
              /* ignore */
            }
          }
        }
      }

      return {
        user_id: userId,
        deck_id: targetDeckId,
        q: c.q,
        a: c.a,
        group: c.group || '',
        ref: c.ref || '',
        suspended: !!c.suspended,
        clinical: !!c.clinical,
        occlusion: occObj,
        tags: c.tags || [],
      }
    })
    .filter(Boolean)

  // 5. Insere os 1.352 cartões em lotes leves de 50
  for (let i = 0; i < cardPayloads.length; i += 50) {
    const chunk = cardPayloads.slice(i, i + 50)
    const { error } = await supabase.from('mr_cards').insert(chunk)
    if (error) {
      if (error.code === '42703' || error.message?.includes('column')) {
        const basicChunk = chunk.map((c: any) => ({
          user_id: c.user_id,
          deck_id: c.deck_id,
          q: c.q,
          a: c.a,
          suspended: c.suspended,
          clinical: c.clinical,
        }))
        const { error: basicErr } = await supabase.from('mr_cards').insert(basicChunk)
        if (basicErr) throw basicErr
      } else {
        throw error
      }
    }
  }

  localStorage.setItem('mr_restored_clean_v6', 'done')
  notifyDataMutation('data_restored')
  return { ok: true, restoredDecks: idMap.size, restoredCards: cardPayloads.length }
}

export const applyInitialSeed = async () => {
  // Não realiza mais inserção automática de cartões legados
  return { ok: true }
}

export const importCardsAuto = async (
  cards: Array<{
    q: string
    a: string
    ref?: string
    group?: string
    folder?: string
    clinical?: boolean
    imageUrl?: string
    tags?: string[]
    occlusion?: any
  }>,
  deckTree?: Array<{ id?: string; title: string; parent?: string; kind?: string }>,
) => {
  const { data: userAuth } = await supabase.auth.getUser()
  if (!userAuth.user) throw new Error('Usuário não autenticado')
  const userId = userAuth.user.id

  // 1. Busca todas as pastas existentes do usuário
  const { data: existingDecks } = await supabase
    .from('mr_decks')
    .select('id, title, parent')
    .eq('user_id', userId)

  const currentDecks = existingDecks || []
  const deckMap = new Map<string, string>() // title lower -> id
  const idMap = new Map<string, string>()   // old id -> new id

  for (const d of currentDecks) {
    deckMap.set(d.title.trim().toLowerCase(), d.id)
  }

  let rootDeckId = ''

  // 2. Se temos deckTree (árvore completa de pastas com pais/filhos), cria na ordem correta
  if (deckTree && deckTree.length > 0) {
    // 2.1 Raízes primeiro
    const roots = deckTree.filter((d) => !d.parent)
    for (const r of roots) {
      const lower = r.title.trim().toLowerCase()
      let existingId = deckMap.get(lower)
      if (!existingId) {
        const created = await createDeck(r.title, (r.kind as any) || 'custom', undefined, 'study', true)
        existingId = created.id
        deckMap.set(lower, existingId)
      }
      if (r.id) idMap.set(r.id, existingId)
      if (!rootDeckId) rootDeckId = existingId
      recordFrontlineDeckId(existingId)
    }

    // 2.2 Filhas: resolve em múltiplas passadas garantindo que o pai já exista no idMap
    const remaining = [...deckTree.filter((d) => !!d.parent)]
    let maxRounds = 10
    while (remaining.length > 0 && maxRounds-- > 0) {
      let createdAny = false
      for (let i = remaining.length - 1; i >= 0; i--) {
        const ch = remaining[i]
        const parentId = ch.parent ? idMap.get(ch.parent) : undefined
        // Só cria se o pai já foi resolvido no idMap
        if (parentId) {
          const lower = ch.title.trim().toLowerCase()
          let existingId = deckMap.get(lower)
          if (!existingId) {
            const created = await createDeck(ch.title, (ch.kind as any) || 'custom', parentId, 'study', false)
            existingId = created.id
            deckMap.set(lower, existingId)
          }
          if (ch.id) idMap.set(ch.id, existingId)
          remaining.splice(i, 1)
          createdAny = true
        }
      }
      if (!createdAny) {
        // Se sobrou algum órfão cujo pai não estava no deckTree, cria no nível inicial
        for (const ch of remaining) {
          const lower = ch.title.trim().toLowerCase()
          let existingId = deckMap.get(lower)
          if (!existingId) {
            const created = await createDeck(ch.title, (ch.kind as any) || 'custom', undefined, 'study', false)
            existingId = created.id
            deckMap.set(lower, existingId)
          }
          if (ch.id) idMap.set(ch.id, existingId)
        }
        break
      }
    }
  }

  // 3. Agrupa cartões por pasta
  const byFolder = new Map<string, typeof cards>()
  for (const c of cards) {
    const folderName = c.folder?.trim() || 'Importação Geral'
    const arr = byFolder.get(folderName) || []
    arr.push(c)
    byFolder.set(folderName, arr)
  }

  // 4. Insere cartões nas pastas correspondentes
  for (const [folderName, folderCards] of byFolder.entries()) {
    let targetDeckId = deckMap.get(folderName.toLowerCase())
    if (!targetDeckId) {
      const created = await createDeck(folderName, 'custom', undefined, 'study', true)
      targetDeckId = created.id
      deckMap.set(folderName.toLowerCase(), targetDeckId)
      recordFrontlineDeckId(targetDeckId)
    }
    if (!rootDeckId) rootDeckId = targetDeckId
    await createCardsBatch(targetDeckId, folderCards)
  }

  notifyDataMutation('cards_imported', { firstDeckId: rootDeckId })
  return { ok: true, firstDeckId: rootDeckId }
}
export const uploadCardImage = async (cardId: string, file: File): Promise<string> => {
  // Envia a imagem para o bucket público `card-images` e persiste apenas a URL pública.
  // (Antes gravava a imagem inteira em base64 na coluna `image_url`, inflando o Postgres.)
  const url = await uploadImageToStorage(file, cardId)
  const { error } = await supabase.from('mr_cards').update({ image_url: url }).eq('id', cardId)
  if (error) throw error
  notifyDataMutation('card_image_uploaded', { cardId })
  return url
}



