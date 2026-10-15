// Importação de cartões em JSON (inclui o verso em camadas v2). Pura e testável.
import { richToPlainText, sanitizeRich, type RichCardV2 } from '@/lib/richCard'

export interface ImportedCard {
  q: string
  a: string
  group: string
  ref: string
  folder: string
  clinical: boolean
  imageUrl: string
  tags: string[]
  rich?: RichCardV2
}

export interface ImportReport {
  cards: ImportedCard[]
  /** Cartões que entraram com verso em camadas válido. */
  richCount: number
  /** Cartões em que `rich` veio inválido e foram importados só com q/a (ou descartados, se não havia a). */
  richInvalid: number
  /** Linhas ignoradas por não terem pergunta. */
  skipped: number
}

/** Aceita JSON puro, JSON dentro de ```json ... ```, ou com texto antes/depois (comum em respostas de IA). */
export function extractJson(text: string): unknown {
  let t = (text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  try {
    return JSON.parse(t)
  } catch {
    const start = t.search(/[[{]/)
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1))
    throw new Error('Não encontrei um JSON válido no texto colado.')
  }
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

export function normalizeImportJson(input: unknown): ImportReport {
  let rows: any = input
  if (rows && !Array.isArray(rows)) rows = rows.flashcards || rows.cards || rows.cartoes || rows.cartas
  if (!Array.isArray(rows)) throw new Error('JSON deve conter uma lista em flashcards, cards ou cartoes.')

  let richCount = 0
  let richInvalid = 0
  let skipped = 0
  const cards: ImportedCard[] = []

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      skipped++
      continue
    }
    const q = str(row.q ?? row.question ?? row.pergunta ?? row.front ?? row.frente)
    if (!q) {
      skipped++
      continue
    }

    const clinicoRaw = str(row.clinical ?? row.clinico ?? row['modo_clinico'] ?? row.modoClinico).toLowerCase()
    const clinical =
      clinicoRaw === ''
        ? /caso cl[ií]nico/i.test(q)
        : !['0', 'nao', 'não', 'false', 'normal'].includes(clinicoRaw)

    const imgRaw = str(row.imageUrl ?? row.image ?? row.imagem ?? row.img)

    // Verso em camadas: validado e limpo. A conferência da IA só vale quando feita pelo próprio app,
    // então qualquer `review` vindo de fora é descartado.
    let rich: RichCardV2 | undefined
    if (row.rich !== undefined && row.rich !== null) {
      const clean = sanitizeRich(row.rich)
      if (clean) {
        delete clean.review
        rich = clean
        richCount++
      } else {
        richInvalid++
      }
    }

    const a = str(row.a ?? row.answer ?? row.resposta ?? row.back ?? row.verso)
    const finalA = a || (rich ? richToPlainText(rich) : '')
    if (!finalA) {
      skipped++
      continue
    }

    const tags: string[] = Array.isArray(row.tags)
      ? row.tags.map((t: unknown) => str(t)).filter(Boolean)
      : []
    if (rich?.highYield && !tags.some((t) => /alto rendimento|high yield/i.test(t))) {
      tags.unshift('🔥 Alto Rendimento')
    }

    cards.push({
      q,
      a: finalA,
      group: str(row.group ?? row.grupo ?? row.category ?? row.categoria),
      ref: str(row.ref ?? row.referencia ?? row.fonte) || rich?.source?.name || '',
      folder: str(row.folder ?? row.pasta ?? row.deck),
      clinical,
      imageUrl: /^https?:\/\//i.test(imgRaw) ? imgRaw : '',
      tags,
      ...(rich ? { rich } : {}),
    })
  }

  return { cards, richCount, richInvalid, skipped }
}
