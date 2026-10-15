import { describe, expect, it } from 'vitest'
import { extractJson, normalizeImportJson } from './importJson'

describe('extractJson', () => {
  it('aceita JSON puro, com cerca de código e com texto em volta', () => {
    expect(extractJson('[{"q":"a"}]')).toEqual([{ q: 'a' }])
    expect(extractJson('```json\n{"cards":[]}\n```')).toEqual({ cards: [] })
    expect(extractJson('Aqui está: {"cards":[]} fim')).toEqual({ cards: [] })
  })
  it('falha com mensagem clara quando não há JSON', () => {
    expect(() => extractJson('nada')).toThrow()
  })
})

describe('normalizeImportJson', () => {
  it('importa cartão com verso em camadas, descarta review externo e aplica alto rendimento', () => {
    const r = normalizeImportJson({
      flashcards: [
        {
          pasta: 'Pediatria',
          pergunta: 'Pergunta?',
          rich: { answer: '**Resposta**', source: { name: 'Nelson' }, highYield: true, review: { status: 'verified' } },
        },
      ],
    })
    expect(r.richCount).toBe(1)
    const c = r.cards[0]
    expect(c.rich?.review).toBeUndefined()
    expect(c.ref).toBe('Nelson')
    expect(c.tags).toContain('🔥 Alto Rendimento')
    expect(c.a).toBe('Resposta')
  })

  it('conta rich inválido e ignora linhas sem pergunta ou sem resposta', () => {
    const r = normalizeImportJson([
      { pergunta: 'A?', resposta: 'ok', rich: { why: 'sem answer' } },
      { pergunta: '', resposta: 'x' },
      { pergunta: 'B?', rich: { why: 'sem answer e sem resposta' } },
    ])
    expect(r.cards).toHaveLength(1)
    expect(r.richInvalid).toBe(2)
    expect(r.skipped).toBe(2)
  })
})
