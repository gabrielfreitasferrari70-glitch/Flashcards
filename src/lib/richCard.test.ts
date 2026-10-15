import { describe, expect, it } from 'vitest'
import { inlineToHtml, renderRichHtml, richToPlainText, sanitizeRich } from './richCard'

describe('sanitizeRich', () => {
  it('rejeita entradas sem resposta', () => {
    expect(sanitizeRich(null)).toBeNull()
    expect(sanitizeRich('texto')).toBeNull()
    expect(sanitizeRich({ why: 'x' })).toBeNull()
    expect(sanitizeRich({ answer: '   ' })).toBeNull()
  })

  it('mantém só campos válidos e limita listas', () => {
    const r = sanitizeRich({
      answer: 'Deficiência intelectual',
      why: 'Neurotoxicidade da fenilalanina.',
      pearls: Array.from({ length: 20 }, (_, i) => `p${i}`),
      compare: { headers: ['A'], rows: [['x']] }, // menos de 2 colunas: descartada
      highYield: true,
      review: { status: 'invalido' },
      lixo: 'ignorar',
    })
    expect(r).not.toBeNull()
    expect(r!.v).toBe(2)
    expect(r!.pearls).toHaveLength(8)
    expect(r!.compare).toBeUndefined()
    expect(r!.review).toBeUndefined()
    expect((r as any).lixo).toBeUndefined()
    expect(r!.highYield).toBe(true)
  })
})

describe('renderização segura', () => {
  it('escapa HTML vindo da IA', () => {
    const html = inlineToHtml('<script>alert(1)</script> **ok**')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<strong')
  })

  it('renderiza as camadas presentes e omite as ausentes', () => {
    const rich = sanitizeRich({
      answer: 'Resposta',
      why: 'Porque sim.\n\nSegundo parágrafo.',
      pearls: ['Cuidado com X'],
      source: { name: 'UpToDate', detail: 'Overview' },
    })!
    const html = renderRichHtml(rich)
    expect(html).toContain('Resposta')
    expect(html).toContain('Segundo parágrafo.')
    expect(html).toContain('Pegadinhas de prova')
    expect(html).toContain('UpToDate')
    expect(html).not.toContain('Mnemônico')
    expect(html).not.toContain('<table')
  })
})

describe('richToPlainText', () => {
  it('gera texto sem marcações para a coluna a', () => {
    const rich = sanitizeRich({
      answer: '**Resposta**',
      why: 'Explicação com *ênfase*.',
      bullets: { title: 'Lista', items: ['um', 'dois'] },
    })!
    const t = richToPlainText(rich)
    expect(t).toContain('Resposta')
    expect(t).not.toContain('**')
    expect(t).toContain('• um')
  })
})

describe('tabela comparativa', () => {
  it('preserva cabeçalho vazio para manter o alinhamento das colunas', () => {
    const r = sanitizeRich({
      answer: 'x',
      compare: { headers: ['', 'A', 'B'], rows: [['Defeito', '1', '2']] },
    })!
    expect(r.compare!.headers).toEqual(['', 'A', 'B'])
    expect(r.compare!.rows[0]).toHaveLength(3)
  })
})
