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

export async function submitCardReport(cardId: string, reason: string): Promise<void> {
  const localRep: CardReport = {
    id: 'rep_' + Math.random().toString(36).slice(2, 9),
    card_id: cardId,
    reason,
    resolved: false,
    created_at: new Date().toISOString(),
  }
  saveLocalReport(localRep)

  try {
    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      await supabase.from('mr_card_reports').insert({
        card_id: cardId,
        user_id: user.user.id,
        reason,
        resolved: false,
      })
    }
  } catch {
    /* fallback to local storage */
  }
}

export async function getMasterReports(): Promise<CardReport[]> {
  try {
    const { data, error } = await supabase
      .from('mr_card_reports')
      .select('id, card_id, user_id, reason, resolved, created_at, mr_cards(q, a)')
      .order('created_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      return data.map((r: any) => ({
        id: r.id,
        card_id: r.card_id,
        user_id: r.user_id,
        reason: r.reason,
        resolved: r.resolved,
        created_at: r.created_at,
        card_q: r.mr_cards?.q,
        card_a: r.mr_cards?.a,
      }))
    }
  } catch {
    /* ignore */
  }

  return getLocalReports()
}

export async function resolveCardReport(reportId: string): Promise<void> {
  try {
    const cur = getLocalReports()
    const updated = cur.map((r) => (r.id === reportId ? { ...r, resolved: true } : r))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    await supabase.from('mr_card_reports').update({ resolved: true }).eq('id', reportId)
  } catch {
    /* ignore */
  }
}
