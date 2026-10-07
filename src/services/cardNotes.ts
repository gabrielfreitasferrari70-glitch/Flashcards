import { supabase } from '@/lib/supabase/client'

const STORAGE_PREFIX = 'mr_note_'

export function getLocalCardNote(cardId: string): string {
  try {
    return localStorage.getItem(STORAGE_PREFIX + cardId) || ''
  } catch {
    return ''
  }
}

export async function fetchCardNote(cardId: string): Promise<string> {
  const local = getLocalCardNote(cardId)
  try {
    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      const { data, error } = await supabase
        .from('mr_card_notes')
        .select('note')
        .eq('card_id', cardId)
        .eq('user_id', user.user.id)
        .maybeSingle()

      if (!error && data?.note !== undefined) {
        localStorage.setItem(STORAGE_PREFIX + cardId, data.note)
        return data.note
      }
    }
  } catch {
    /* fallback to local */
  }
  return local
}

export async function saveCardNote(cardId: string, note: string): Promise<void> {
  try {
    localStorage.setItem(STORAGE_PREFIX + cardId, note)
  } catch {
    /* ignore */
  }

  try {
    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      await supabase.from('mr_card_notes').upsert({
        card_id: cardId,
        user_id: user.user.id,
        note,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'card_id,user_id' })
    }
  } catch {
    /* ignore */
  }
}
