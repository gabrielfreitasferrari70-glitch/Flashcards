import source from './academicCalendarData'
import { localDay, localTime, type PlanningRecord } from './domain'

export type AcademicSlot = {
  start: string
  end: string
  title: string
  color: string
  category: 'event' | 'free' | 'holiday' | 'empty'
}
const calendar = source as Record<string, AcademicSlot[]>

export const academicLegend = [
  { title: 'Tutorias', color: '#f79646' },
  { title: 'Aulas', color: '#ffffff' },
  { title: 'Avaliações', color: '#fcff44' },
  { title: 'Feriados', color: '#fd5c4c' },
  { title: 'I.C.', color: '#538dd5' },
  { title: 'Livre', color: '#d8e4bc' },
]

export function academicColor(record: PlanningRecord): string | undefined {
  if (record.kind !== 'event') return undefined
  const date = localDay(String(record.data.starts_at))
  const time = localTime(String(record.data.starts_at))
  const original = calendar[date]?.find(
    (slot) => slot.category === 'event' && slot.start <= time && time < slot.end,
  )
  if (original && String(record.data.notes || '').includes('00 - 08.09 Planilha UC2'))
    return original.color
  if (record.data.event_type === 'exam') return '#fcff44'
  if (record.data.event_type === 'tutorial') return '#f79646'
  if (record.data.subject === 'Interação Comunitária') return '#538dd5'
  if (record.data.event_type === 'class') return '#ffffff'
  return undefined
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

// These are references from the PDF, never study tasks or personal availability.
// An actual event or scheduled task takes precedence over a "Livre" reference.
export function academicReferences(date: string, records: PlanningRecord[]): AcademicSlot[] {
  const busy: [number, number][] = []
  for (const record of records) {
    const start = record.kind === 'event' ? record.data.starts_at : record.data.scheduled_at
    if (!start || (record.kind !== 'event' && record.kind !== 'task')) continue
    if (record.kind === 'task' && record.data.status === 'done') continue
    const startDate = localDay(String(start))
    const end = record.kind === 'event'
      ? String(record.data.ends_at)
      : new Date(Date.parse(String(start)) + Number(record.data.estimated_minutes) * 60000).toISOString()
    const endDate = localDay(end)
    if (startDate > date || endDate < date) continue
    busy.push([
      startDate < date ? 0 : minutes(localTime(String(start))),
      endDate > date ? 1440 : minutes(localTime(end)),
    ])
  }
  busy.sort((a, b) => a[0] - b[0])
  const result: AcademicSlot[] = []
  for (const slot of calendar[date] || []) {
    if (slot.category === 'event') continue
    let segments: [number, number][] = [[minutes(slot.start), minutes(slot.end)]]
    if (slot.category === 'free' || slot.category === 'empty') {
      for (const [a, b] of busy) {
        segments = segments.flatMap(([begin, end]) => {
          if (a >= end || b <= begin) return [[begin, end]] as [number, number][]
          const remainder: [number, number][] = []
          if (a > begin) remainder.push([begin, a])
          if (b < end) remainder.push([b, end])
          return remainder
        })
      }
    }
    for (const [begin, end] of segments) {
      const current = { ...slot, start: clock(begin), end: clock(end) }
      const last = result[result.length - 1]
      if (last && last.end === current.start && last.category === current.category &&
        last.title === current.title && last.color === current.color) last.end = current.end
      else result.push(current)
    }
  }
  return result
}
