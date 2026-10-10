import { supabase } from '@/lib/supabase/client'

export interface CardReport {
  id: string
  card_id: string
  user_id?: string
  user_email?: string
  reason: string
  resolved: boolean
  created_at: string
  card_q?: string
  card_a?: string
}

const STORAGE_KEY = 'mr_local_reports'

function getLocalReports(): CardReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalReport(rep: CardReport) {
  try {
    const cur = getLocalReports()
    cur.unshift(rep)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur))
  } catch {
    /* ignore */
  }
}

export async function submitCardReport(cardId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const cleanId = String(cardId).replace(/::rev$/, '').trim()
  const localRep: CardReport = {
    id: 'rep_' + Math.random().toString(36).slice(2, 9),
    card_id: cleanId,
    reason,
    resolved: false,
    created_at: new Date().toISOString(),
  }
  saveLocalReport(localRep)

  try {
    const sessionRes = await supabase.auth.getSession()
    const user = sessionRes.data?.session?.user || (await supabase.auth.getUser()).data?.user

    const payload: any = {
      card_id: cleanId,
      reason,
      resolved: false,
    }
    if (user?.id) {
      payload.user_id = user.id
    }

    const { error } = await supabase.from('mr_card_reports').insert(payload)
    if (error) {
      console.warn('Aviso: falha ao inserir em mr_card_reports (salvo localmente):', error)
      return { ok: true, error: error.message }
    }

    // Opcional: transmite broadcast de novo report para o docente conectado
    try {
      const channel = supabase.channel('medreview_global_sync')
      channel.send({
        type: 'broadcast',
        event: 'db_mutation',
        payload: { table: 'mr_card_reports', action: 'insert', card_id: cleanId },
      })
    } catch {
      /* ignore broadcast error */
    }

    return { ok: true }
  } catch (err: any) {
    console.warn('Erro ao submeter report na nuvem (mantido no cache local):', err)
    return { ok: true, error: err?.message }
  }
}

export async function getMasterReports(cachedCards?: any[]): Promise<CardReport[]> {
  let reportsData: any[] | null = null
  let dbError: any = null

  try {
    // 1. Tenta buscar com o join nativo de mr_cards
    const res = await supabase
      .from('mr_card_reports')
      .select('id, card_id, user_id, reason, resolved, created_at, mr_cards(q, a)')
      .order('created_at', { ascending: false })

    if (!res.error && Array.isArray(res.data)) {
      reportsData = res.data
    } else {
      dbError = res.error
      console.warn('Join com mr_cards falhou em getMasterReports, buscando direto:', res.error)
      // 2. Fallback de resiliência: busca direta sem o join (evita erro de chave estrangeira no PostgREST)
      const fallback = await supabase
        .from('mr_card_reports')
        .select('id, card_id, user_id, reason, resolved, created_at')
        .order('created_at', { ascending: false })

      if (!fallback.error && Array.isArray(fallback.data)) {
        reportsData = fallback.data
        dbError = null
      } else {
        dbError = fallback.error || dbError
        console.error('Falha ao buscar mr_card_reports sem join:', fallback.error)
      }
    }
  } catch (err) {
    console.error('Exceção ao carregar reports do Supabase:', err)
    dbError = err
  }

  // Mapa de cartões para resolução de texto
  const cardMap = new Map<string, any>()
  if (cachedCards && Array.isArray(cachedCards)) {
    for (const c of cachedCards) {
      if (c?.id) {
        cardMap.set(String(c.id).replace(/::rev$/, ''), c)
      }
    }
  }

  // Se recebemos registros do banco de dados
  if (Array.isArray(reportsData) && reportsData.length > 0) {
    // Busca no Supabase os cartões que não estão em memória para ter pergunta e resposta
    const missingCardIds = reportsData
      .map((r) => String(r.card_id).replace(/::rev$/, ''))
      .filter((id) => !cardMap.has(id))

    if (missingCardIds.length > 0) {
      try {
        const { data: missingCards } = await supabase
          .from('mr_cards')
          .select('id, q, a')
          .in('id', missingCardIds.slice(0, 100))

        if (Array.isArray(missingCards)) {
          for (const mc of missingCards) {
            cardMap.set(String(mc.id), mc)
          }
        }
      } catch (err) {
        console.warn('Aviso ao buscar cartões complementares para reports:', err)
      }
    }

    // Busca dados dos alunos que reportaram na tabela profiles (se disponível)
    const userIds = Array.from(new Set(reportsData.map((r) => r.user_id).filter(Boolean)))
    const profileMap = new Map<string, { name?: string; email?: string }>()
    if (userIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds)

        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            profileMap.set(p.id, p)
          }
        }
      } catch {
        /* permissão de profiles opcional */
      }
    }

    const remoteReports: CardReport[] = reportsData.map((r: any) => {
      const cleanCardId = String(r.card_id).replace(/::rev$/, '')
      const card = cardMap.get(cleanCardId)
      const profile = r.user_id ? profileMap.get(r.user_id) : undefined

      return {
        id: String(r.id),
        card_id: cleanCardId,
        user_id: r.user_id,
        user_email: profile?.email || profile?.name,
        reason: r.reason || 'Erro no cartão',
        resolved: !!r.resolved,
        created_at: r.created_at || new Date().toISOString(),
        card_q: r.mr_cards?.q || card?.q || '',
        card_a: r.mr_cards?.a || card?.a || '',
      }
    })

    // Funde com relatórios locais que ainda não existam no servidor
    const local = getLocalReports()
    const remoteIdSet = new Set(remoteReports.map((r) => r.id))
    for (const l of local) {
      if (!remoteIdSet.has(l.id)) {
        const c = cardMap.get(l.card_id)
        remoteReports.push({
          ...l,
          card_q: l.card_q || c?.q || '',
          card_a: l.card_a || c?.a || '',
        })
      }
    }

    return remoteReports
  }

  // Se não foi possível ler da nuvem ou não há registros remotos, retorna locais
  const localList = getLocalReports()
  return localList.map((l) => {
    const c = cardMap.get(l.card_id)
    return {
      ...l,
      card_q: l.card_q || c?.q || '',
      card_a: l.card_a || c?.a || '',
    }
  })
}

export async function resolveCardReport(reportId: string): Promise<void> {
  return toggleCardReportResolved(reportId, true)
}

export async function toggleCardReportResolved(reportId: string, resolved: boolean): Promise<void> {
  try {
    const cur = getLocalReports()
    const updated = cur.map((r) => (r.id === reportId ? { ...r, resolved } : r))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    await supabase.from('mr_card_reports').update({ resolved }).eq('id', reportId)
  } catch (e) {
    console.warn('Erro ao atualizar status do report:', e)
  }
}

export async function deleteCardReport(reportId: string): Promise<void> {
  try {
    const cur = getLocalReports()
    const updated = cur.filter((r) => r.id !== reportId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    await supabase.from('mr_card_reports').delete().eq('id', reportId)
  } catch (e) {
    console.warn('Erro ao excluir report:', e)
  }
}
