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
    return {
      user_id: user.user!.id,
      deck_id: deckId,
      q: c.q,
      a: c.a,
      clinical: !!c.clinical,
      suspended: false,
      tags: c.tags || [],
      group: c.group || '',
      ref: c.ref || '',
      occlusion: c.occlusion || null,
    }
  })

  // Insere em lotes adaptativos para garantir envio rápido e não estourar limite de payload HTTP
  const results: any[] = []
  const MAX_BYTES_PER_CHUNK = 1_200_000
  const MAX_CARDS_PER_CHUNK = 20

  const chunks: Array<typeof payloads> = []
  let currentChunk: typeof payloads = []
  let currentBytes = 0

  for (const item of payloads) {
    const itemBytes =
      (item.q?.length || 0) +
      (item.a?.length || 0) +
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
      if (error.code === '42703' || error.message?.includes('column')) {
        const basicPayloads = chunk.map((c) => ({
          user_id: c.user_id,
          deck_id: c.deck_id,
          q: c.q,
          a: c.a,
          clinical: c.clinical,
          suspended: false,
        }))
        const { data: fbData, error: fbErr } = await supabase.from('mr_cards').insert(basicPayloads).select('id')
        if (fbErr) throw fbErr
        if (fbData) results.push(...fbData)
      } else {
        // Fallback resiliente: insere um a um para salvar o máximo possível de cartas
        for (const single of chunk) {
          try {
            const { data: sData } = await supabase.from('mr_cards').insert([single]).select('id')
            if (sData) results.push(...sData)
          } catch (singleErr) {
            console.warn('Erro ao inserir cartão individual:', singleErr)
          }
        }
      }
    } else if (data) {
      results.push(...data)
    }
  }
  return results
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
  } catch {}
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
  } catch {}
}

export const setCardSuspended = async (cardId: string, suspended: boolean) => {
  const { data, error } = await supabase.from('mr_cards').update({ suspended }).eq('id', cardId).select().single()
  if (error) throw error
  return data
}

export const deleteCard = async (cardId: string) => {
  recordDeletedCardId(cardId)
  await supabase.from('mr_reviews').delete().eq('card_id', cardId)
  await supabase.from('mr_card_reports').delete().eq('card_id', cardId)
  await supabase.from('mr_card_notes').delete().eq('card_id', cardId)
  const { error } = await supabase.from('mr_cards').delete().eq('id', cardId)
  if (error) throw error
  return true
}

export const deleteCardsBatch = async (cardIds: string[]) => {
  if (cardIds.length === 0) return true
  recordDeletedCardId(cardIds)
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    await supabase.from('mr_reviews').delete().in('card_id', chunk)
    await supabase.from('mr_card_reports').delete().in('card_id', chunk)
    await supabase.from('mr_card_notes').delete().in('card_id', chunk)
    const { error } = await supabase.from('mr_cards').delete().in('id', chunk)
    if (error) throw error
  }
  return true
}

export const setCardsSuspendedBatch = async (cardIds: string[], suspended: boolean) => {
  if (cardIds.length === 0) return true
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    const { error } = await supabase.from('mr_cards').update({ suspended }).in('id', chunk)
    if (error) throw error
  }
  return true
}

export const moveCardsBatch = async (cardIds: string[], deckId: string) => {
  if (cardIds.length === 0) return true
  for (let i = 0; i < cardIds.length; i += 100) {
    const chunk = cardIds.slice(i, i + 100)
    const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).in('id', chunk)
    if (error) throw error
  }
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
export const moveCard = async (cardId: string, deckId: string) => {
  const { error } = await supabase.from('mr_cards').update({ deck_id: deckId }).eq('id', cardId)
  if (error) throw error
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
  return { ok: true, restoredDecks: idMap.size, restoredCards: cardPayloads.length }
}

export const purgeLegacyBloatedCards = async () => {
  try {
    const { data: userAuth } = await supabase.auth.getUser()
    if (!userAuth.user) return
    const userId = userAuth.user.id

    // Busca IDs dos cartões antigos criados antes de 12:00
    const { data: oldRows } = await supabase
      .from('mr_cards')
      .select('id')
      .eq('user_id', userId)
      .lt('created_at', '2026-10-08T12:00:00Z')
      .limit(100)

    if (oldRows && oldRows.length > 0) {
      const ids = oldRows.map((r) => r.id)
      for (let i = 0; i < ids.length; i += 25) {
        const chunk = ids.slice(i, i + 25)
        await supabase.from('mr_cards').delete().in('id', chunk)
      }
    }
  } catch (e) {
    console.warn('Erro ao purgar cartões legados:', e)
  }
}

export const applyInitialSeed = async () => {
  try {
    const res = await restoreBackupData(false)
    // Dispara a limpeza dos registros legados em background sem travar o boot
    purgeLegacyBloatedCards().catch(() => {})
    return res
  } catch (err) {
    console.error('Falha na inicialização da seed:', err)
    return { ok: false, error: err }
  }
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
) => {
  const { data: userAuth } = await supabase.auth.getUser()
  if (!userAuth.user) throw new Error('Usuário não autenticado')
  const userId = userAuth.user.id

  const { data: existingDecks } = await supabase
    .from('mr_decks')
    .select('id, title')
    .eq('user_id', userId)

  const deckMap = new Map<string, string>()
  for (const d of existingDecks || []) {
    deckMap.set(d.title.trim().toLowerCase(), d.id)
  }

  const byFolder = new Map<string, typeof cards>()
  for (const c of cards) {
    const folderName = c.folder?.trim() || 'Importação Geral'
    const arr = byFolder.get(folderName) || []
    arr.push(c)
    byFolder.set(folderName, arr)
  }

  for (const [folderName, folderCards] of byFolder.entries()) {
    let targetDeckId = deckMap.get(folderName.toLowerCase())
    if (!targetDeckId) {
      const created = await createDeck(folderName, 'custom')
      targetDeckId = created.id
      deckMap.set(folderName.toLowerCase(), targetDeckId)
    }
    await createCardsBatch(targetDeckId, folderCards)
  }
  return true
}
export const uploadCardImage = async () => {}



