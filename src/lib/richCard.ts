// Cartão "rico" v2: verso em camadas (resposta direta → porquê → listas → pegadinhas → comparação →
// mnemônico → relacionados → fonte). Guardado em mr_cards.rich (jsonb). Cartões sem `rich` continuam
// usando q/a normalmente.

export interface RichBullets {
  title?: string
  items: string[]
}

export interface RichCompare {
  title?: string
  headers: string[]
  rows: string[][]
}

export interface RichSource {
  name: string
  detail?: string
}

export type RichReviewStatus = 'pending' | 'verified' | 'flagged'

export interface RichCardV2 {
  v: 2
  /** Resposta direta, uma linha (o "título" do verso). */
  answer: string
  /** Explicação do porquê / mecanismo. Parágrafos separados por linha em branco. */
  why?: string
  bullets?: RichBullets
  /** Pegadinhas e pontos que costumam cair em prova. */
  pearls?: string[]
  compare?: RichCompare
  mnemonic?: string
  /** Temas relacionados ("veja também"). */
  related?: string[]
  source?: RichSource
  highYield?: boolean
  review?: { status: RichReviewStatus; notes?: string }
}

const MAX_TEXT = 2500
const MAX_ITEMS = 12
const MAX_ROWS = 10
const MAX_COLS = 5

function str(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return ''
  return v.replace(/\0/g, '').trim().slice(0, max)
}

function strList(v: unknown, maxItems = MAX_ITEMS, maxLen = 400): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems)
}

/** Valida e limpa o que veio da IA ou do banco. Retorna null se não houver o mínimo (answer). */
export function sanitizeRich(input: unknown): RichCardV2 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const r = input as Record<string, any>
  const answer = str(r.answer, 400)
  if (!answer) return null

  const out: RichCardV2 = { v: 2, answer }

  const why = str(r.why)
  if (why) out.why = why

  const bulletItems = strList(r.bullets?.items)
  if (bulletItems.length) {
    out.bullets = { items: bulletItems }
    const t = str(r.bullets?.title, 120)
    if (t) out.bullets.title = t
  }

  const pearls = strList(r.pearls, 8)
  if (pearls.length) out.pearls = pearls

  if (r.compare && Array.isArray(r.compare.headers) && Array.isArray(r.compare.rows)) {
    // Células vazias são válidas (ex.: cabeçalho da coluna de rótulos); não filtrar, para manter o alinhamento.
    const cells = (v: unknown, maxLen: number): string[] =>
      Array.isArray(v) ? v.slice(0, MAX_COLS).map((x) => str(x, maxLen)) : []
    const headers = cells(r.compare.headers, 80)
    const rows = r.compare.rows
      .slice(0, MAX_ROWS)
      .map((row: unknown) => cells(row, 200))
      .filter((row: string[]) => row.some(Boolean))
    if (headers.length >= 2 && headers.some(Boolean) && rows.length) {
      out.compare = { headers, rows }
      const t = str(r.compare.title, 120)
      if (t) out.compare.title = t
    }
  }

  const mnemonic = str(r.mnemonic, 400)
  if (mnemonic) out.mnemonic = mnemonic

  const related = strList(r.related, 8, 120)
  if (related.length) out.related = related

  const srcName = str(r.source?.name, 200)
  if (srcName) {
    out.source = { name: srcName }
    const d = str(r.source?.detail, 200)
    if (d) out.source.detail = d
  }

  if (r.highYield === true) out.highYield = true

  const st = r.review?.status
  if (st === 'pending' || st === 'verified' || st === 'flagged') {
    out.review = { status: st }
    const n = str(r.review?.notes, 600)
    if (n) out.review.notes = n
  }

  return out
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Texto da IA → HTML seguro. Só entende **negrito** e *itálico*; todo o resto é escapado. */
export function inlineToHtml(text: string): string {
  const safe = escapeHtml(text)
  return safe
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong style="color:var(--mr-ink, #15803d);font-weight:800">$1</strong>',
    )
    .replace(/(^|[^*])\*([^\s*][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 10px;line-height:1.6">${inlineToHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

const SECTION_LABEL =
  'font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mr-muted, #64748b);cursor:pointer;margin:0 0 6px'

function section(label: string, inner: string, open = true): string {
  return `<details ${open ? 'open' : ''} style="margin:14px 0 0"><summary style="${SECTION_LABEL}">${escapeHtml(label)}</summary>${inner}</details>`
}

/** Verso do cartão rico, em HTML (já escapado). */
export function renderRichHtml(rich: RichCardV2): string {
  let out = ''

  out += `<div style="font-size:1.12rem;font-weight:800;color:var(--mr-ink, #15803d);line-height:1.4;margin-bottom:10px">${inlineToHtml(rich.answer)}</div>`

  if (rich.why) {
    out += `<div style="color:var(--mr-text, #334155);font-size:.98rem">${paragraphs(rich.why)}</div>`
  }

  if (rich.bullets) {
    const items = rich.bullets.items
      .map((i) => `<li style="margin:3px 0">${inlineToHtml(i)}</li>`)
      .join('')
    out += section(
      rich.bullets.title || 'Pontos-chave',
      `<ul style="margin:0;padding-left:20px;color:var(--mr-text, #334155);font-size:.96rem">${items}</ul>`,
    )
  }

  if (rich.compare) {
    const head = rich.compare.headers
      .map(
        (h) =>
          `<th style="text-align:left;padding:6px 8px;background:var(--mr-pale, #f0fdf4);border-bottom:1px solid var(--mr-line, #bbf7d0);font-size:.82rem">${inlineToHtml(h)}</th>`,
      )
      .join('')
    const body = rich.compare.rows
      .map(
        (row) =>
          `<tr>${row
            .map(
              (c) =>
                `<td style="padding:6px 8px;border-bottom:1px solid var(--mr-line, #e2e8f0);font-size:.88rem;vertical-align:top">${inlineToHtml(c)}</td>`,
            )
            .join('')}</tr>`,
      )
      .join('')
    out += section(
      rich.compare.title || 'Comparação',
      `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    )
  }

  if (rich.pearls) {
    const items = rich.pearls
      .map(
        (p) =>
          `<li style="margin:4px 0;padding:6px 10px;border-left:3px solid #f59e0b;background:rgba(245,158,11,.08);border-radius:0 6px 6px 0;list-style:none">${inlineToHtml(p)}</li>`,
      )
      .join('')
    out += section(
      '⚠️ Pegadinhas de prova',
      `<ul style="margin:0;padding:0;font-size:.94rem;color:var(--mr-text, #334155)">${items}</ul>`,
    )
  }

  if (rich.mnemonic) {
    out += section(
      '🧠 Mnemônico',
      `<div style="font-size:.95rem;color:var(--mr-text, #334155)">${inlineToHtml(rich.mnemonic)}</div>`,
    )
  }

  if (rich.related?.length) {
    const chips = rich.related
      .map(
        (r) =>
          `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 10px;border-radius:999px;background:rgba(100,116,139,.12);font-size:.8rem">${escapeHtml(r)}</span>`,
      )
      .join('')
    out += section('Veja também', chips, false)
  }

  if (rich.source) {
    out += `<div style="margin-top:14px;text-align:right;font-size:.76rem;font-style:italic;color:var(--mr-muted, #64748b)">${escapeHtml(rich.source.name)}${rich.source.detail ? ` — ${escapeHtml(rich.source.detail)}` : ''}</div>`
  }

  if (rich.review?.status === 'flagged') {
    out += `<div style="margin-top:10px;padding:6px 10px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:.8rem;font-weight:700">⚠️ Marcado para conferência${rich.review.notes ? `: ${escapeHtml(rich.review.notes)}` : ''}</div>`
  }

  return out
}

/** Versão em texto puro: vai para a coluna `a` (busca, exportação e cartões sem suporte ao v2). */
export function richToPlainText(rich: RichCardV2): string {
  const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
  const parts: string[] = [strip(rich.answer)]
  if (rich.why) parts.push(strip(rich.why))
  if (rich.bullets) {
    parts.push(
      [rich.bullets.title, ...rich.bullets.items.map((i) => `• ${strip(i)}`)]
        .filter(Boolean)
        .join('\n'),
    )
  }
  if (rich.pearls) parts.push(`Pegadinhas:\n${rich.pearls.map((p) => `• ${strip(p)}`).join('\n')}`)
  if (rich.mnemonic) parts.push(`Mnemônico: ${strip(rich.mnemonic)}`)
  return parts.join('\n\n')
}
