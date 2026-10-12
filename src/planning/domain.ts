export const PLANNING_START = '2026-10-12'
export const PLANNING_ZONE = 'America/Cuiaba'
export const PLANNING_ADMIN = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'
export type Kind = 'event' | 'session' | 'task' | 'review' | 'material' | 'settings'
export type RecordData = Record<string, unknown>
export type PlanningRecord = {
  id: string
  owner_id: string
  kind: Kind
  data: RecordData
  revision: number
  created_at: string
  updated_at: string
}
export type Command =
  | { action: 'create'; kind: Kind; data: RecordData; id?: string }
  | {
      action: 'update'
      id: string
      expected_revision: number
      patch: RecordData
      confirmed?: boolean
    }
  | { action: 'complete'; id: string; expected_revision: number }
  | { action: 'import'; records: Command[]; confirmed: boolean }
export type Availability = { weekday: number; start: string; end: string }
export function localDay(instant: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNING_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant))
}
export function localTime(instant: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: PLANNING_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant))
}
export function addDays(day: string, days: number): string {
  const date = new Date(day + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function localInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Informe data e horário completos.')
  // Resolve the IANA offset instead of using the device timezone.
  const naive = new Date(value + ':00Z').getTime()
  let utc = naive
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: PLANNING_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utc))
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    utc += naive - represented
  }
  const result = new Date(utc).toISOString()
  if (`${localDay(result)}T${localTime(result)}` !== value)
    throw new Error('Data ou horário inválido.')
  return result
}
export function isPending(record: PlanningRecord, day: string): boolean {
  if (day < PLANNING_START || record.data.status === 'done') return false
  if (record.kind === 'review')
    return String(record.data.due_on) >= PLANNING_START && String(record.data.due_on) <= day
  return (
    record.kind === 'task' &&
    (!record.data.deadline || String(record.data.deadline) >= PLANNING_START)
  )
}
export type Suggestion = {
  id: string
  revision: number
  starts_at: string
  ends_at: string
  reason: string
}
export function proposePlan(
  records: PlanningRecord[],
  start: string,
  days = 7,
  now = new Date(),
): {
  suggestions: Suggestion[]
  unscheduled: { id: string; reason: string }[]
  freeMinutes: number | null
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start < PLANNING_START || days < 1 || days > 14)
    throw new Error('Período inválido; planejamento começa em 12/10/2026.')
  const settings = records.find((r) => r.kind === 'settings')?.data
  const availability = (settings?.availability || []) as Availability[]
  const tasks = records
    .filter((r) => isPending(r, addDays(start, days - 1)) && r.kind === 'task')
    .sort(
      (a, b) =>
        Number(b.data.priority || 0) - Number(a.data.priority || 0) ||
        String(a.data.deadline || '9999').localeCompare(String(b.data.deadline || '9999')) ||
        a.id.localeCompare(b.id),
    )
  const busy: [number, number][] = records
    .filter((r) => r.kind === 'event')
    .map((r) => [Date.parse(String(r.data.starts_at)), Date.parse(String(r.data.ends_at))])
  for (const task of records.filter(
    (r) => r.kind === 'task' && r.data.scheduled_at && r.data.status !== 'done',
  )) {
    const begin = Date.parse(String(task.data.scheduled_at))
    const duration = Number(task.data.estimated_minutes)
    if (Number.isFinite(begin) && duration > 0) busy.push([begin, begin + duration * 60000])
  }
  const free: [number, number][] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i)
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay()
    for (const slot of availability.filter((s) => s.weekday === weekday)) {
      const begin = Math.max(Date.parse(localInstant(`${day}T${slot.start}`)), now.getTime())
      const end = Date.parse(localInstant(`${day}T${slot.end}`))
      if (begin >= end) continue
      let cursor = begin
      for (const [a, b] of busy
        .filter(([a, b]) => a < end && b > begin)
        .sort((a, b) => a[0] - b[0])) {
        if (a > cursor) free.push([cursor, Math.min(a, end)])
        cursor = Math.max(cursor, b)
      }
      if (cursor < end) free.push([cursor, end])
    }
  }
  free.sort((a, b) => a[0] - b[0])
  const freeMinutes = settings
    ? Math.floor(free.reduce((sum, [a, b]) => sum + b - a, 0) / 60000)
    : null
  const suggestions: Suggestion[] = []
  const unscheduled: { id: string; reason: string }[] = []
  for (const task of tasks) {
    const duration = Number(task.data.estimated_minutes) * 60000
    if (!Number.isFinite(duration) || duration <= 0) {
      unscheduled.push({ id: task.id, reason: 'Informe uma duração estimada antes de distribuir.' })
      continue
    }
    if (task.data.scheduled_at) {
      unscheduled.push({ id: task.id, reason: 'Já possui horário manual; mantido sem alteração.' })
      continue
    }
    const exam = records
      .filter(
        (r) =>
          r.kind === 'event' &&
          r.data.event_type === 'exam' &&
          r.data.subject === task.data.subject &&
          String(r.data.starts_at) >= localInstant(start + 'T00:00'),
      )
      .sort(
        (a, b) => Date.parse(String(a.data.starts_at)) - Date.parse(String(b.data.starts_at)),
      )[0]
    const deadline = task.data.deadline
      ? Date.parse(localInstant(addDays(String(task.data.deadline), 1) + 'T00:00'))
      : Infinity
    const limit = Math.min(deadline, exam ? Date.parse(String(exam.data.starts_at)) : Infinity)
    const slot = free.find((s) => s[0] + duration <= Math.min(s[1], limit))
    if (!slot) {
      unscheduled.push({
        id: task.id,
        reason: availability.length
          ? 'Não cabe nas janelas livres antes do prazo/prova.'
          : 'Defina sua disponibilidade para receber sugestões.',
      })
      continue
    }
    const begin = slot[0]
    slot[0] += duration
    suggestions.push({
      id: task.id,
      revision: task.revision,
      starts_at: new Date(begin).toISOString(),
      ends_at: new Date(slot[0]).toISOString(),
      reason: `Prioridade ${task.data.priority ?? 'não informada'}; ${duration / 60000} min em janela livre, sem conflito com compromissos${exam ? ' e antes da prova da disciplina' : ''}${task.data.deadline ? ', respeitando o prazo' : ''}.`,
    })
  }
  return { suggestions, unscheduled, freeMinutes }
}
export function performance(records: PlanningRecord[]) {
  const groups = new Map<
    string,
    {
      subject: string
      topic: string
      minutes: number
      timed: number
      sessions: number
      questions: number
      correct: number
      measured: number
    }
  >()
  for (const r of records.filter(
    (r) => r.kind === 'session' && localDay(String(r.data.studied_at)) >= PLANNING_START,
  )) {
    const key = JSON.stringify([r.data.subject, r.data.topic])
    const g = groups.get(key) || {
      subject: String(r.data.subject),
      topic: String(r.data.topic),
      minutes: 0,
      timed: 0,
      sessions: 0,
      questions: 0,
      correct: 0,
      measured: 0,
    }
    g.sessions++
    if (r.data.duration_minutes !== undefined) {
      g.minutes += Number(r.data.duration_minutes)
      g.timed++
    }
    if (r.data.questions !== undefined && r.data.correct !== undefined) {
      g.questions += Number(r.data.questions)
      g.correct += Number(r.data.correct)
      g.measured++
    }
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => ({
    ...g,
    accuracy: g.questions > 0 ? (g.correct / g.questions) * 100 : null,
  }))
}
