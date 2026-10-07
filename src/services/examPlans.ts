import { supabase } from '@/lib/supabase/client'

export interface ExamPlan {
  id?: string
  deck_id: string
  deck_title?: string
  exam_date: string // YYYY-MM-DD
  created_at?: string
}

const STORAGE_KEY = 'mr_exam_plans'

function getLocalPlans(): Record<string, ExamPlan> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalPlan(plan: ExamPlan) {
  try {
    const current = getLocalPlans()
    current[plan.deck_id] = plan
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
}

export async function getExamPlan(deckId: string): Promise<ExamPlan | null> {
  try {
    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      const { data, error } = await supabase
        .from('mr_exam_plans')
        .select('*')
        .eq('deck_id', deckId)
        .eq('user_id', user.user.id)
        .maybeSingle()

      if (!error && data) {
        saveLocalPlan(data)
        return data
      }
    }
  } catch {
    /* fallback to local storage */
  }

  const local = getLocalPlans()
  return local[deckId] || null
}

export async function setExamPlan(deckId: string, examDate: string, deckTitle?: string): Promise<ExamPlan> {
  const plan: ExamPlan = { deck_id: deckId, exam_date: examDate, deck_title: deckTitle }
  saveLocalPlan(plan)

  try {
    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      await supabase
        .from('mr_exam_plans')
        .upsert(
          {
            deck_id: deckId,
            exam_date: examDate,
            user_id: user.user.id,
          },
          { onConflict: 'user_id,deck_id' }
        )
    }
  } catch {
    /* local fallback active */
  }

  return plan
}

export async function removeExamPlan(deckId: string): Promise<void> {
  try {
    const current = getLocalPlans()
    delete current[deckId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))

    const { data: user } = await supabase.auth.getUser()
    if (user?.user) {
      await supabase.from('mr_exam_plans').delete().eq('deck_id', deckId).eq('user_id', user.user.id)
    }
  } catch {
    /* ignore */
  }
}

export function calculateExamCountdown(examDateStr: string, totalCards: number) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exam = new Date(examDateStr + 'T00:00:00')
  const diffMs = exam.getTime() - now.getTime()
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) {
    return { daysLeft: 0, passed: true, dailyGoal: 0 }
  }

  const daysToUse = Math.max(1, daysLeft)
  const dailyGoal = Math.ceil(totalCards / daysToUse)

  return { daysLeft, passed: false, dailyGoal }
}
