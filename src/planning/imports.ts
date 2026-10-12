import { localInstant } from './domain'
export function scheduleCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        if (!quoted && cell !== '') throw new Error('Aspas inválidas no CSV.')
        quoted = !quoted
      }
    } else if (c === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('Aspas não fechadas no CSV.')
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  const headers = rows.shift()?.map((h) => h.trim().replace(/^\uFEFF/, '')) || []
  const allowed = [
    'title',
    'event_type',
    'starts_at',
    'ends_at',
    'subject',
    'topic',
    'attendance',
    'notes',
  ]
  if (
    ['title', 'event_type', 'starts_at', 'ends_at'].some((h) => !headers.includes(h)) ||
    headers.some((h) => !allowed.includes(h)) ||
    new Set(headers).size !== headers.length
  )
    throw new Error(
      'CSV exige title,event_type,starts_at,ends_at. Colunas opcionais: subject,topic,attendance,notes.',
    )
  if (rows.length > 200) throw new Error('Importe até 200 eventos por arquivo.')
  return {
    format: 'medreview-planning-v1',
    records: rows.map((cells, i) => {
      if (cells.length !== headers.length)
        throw new Error(`Número de colunas inválido na linha ${i + 2}.`)
      const data: Record<string, string> = {}
      headers.forEach((h, index) => {
        if (cells[index].trim()) data[h] = cells[index].trim()
      })
      if (!data.title || !['class', 'exam', 'tutorial', 'study'].includes(data.event_type))
        throw new Error(`Título/tipo inválido na linha ${i + 2}.`)
      for (const field of ['starts_at', 'ends_at']) {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data[field] || ''))
          data[field] = localInstant(data[field])
        else if (
          !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(data[field] || '') ||
          !Number.isFinite(Date.parse(data[field]))
        )
          throw new Error(
            `Informe data e horário ISO na linha ${i + 2}; sem fuso será usado America/Cuiaba.`,
          )
      }
      if (Date.parse(data.ends_at) <= Date.parse(data.starts_at))
        throw new Error(`Fim anterior ao início na linha ${i + 2}.`)
      return { kind: 'event', data }
    }),
  }
}
