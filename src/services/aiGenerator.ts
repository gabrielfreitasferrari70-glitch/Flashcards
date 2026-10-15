import { GoogleGenAI } from '@google/genai'
import { richToPlainText, sanitizeRich, type RichCardV2 } from '@/lib/richCard'

export interface GeneratedCard {
  q: string
  a: string
  group?: string
  ref?: string
  clinical?: boolean
  tags?: string[]
  /** Verso estruturado v2 (camadas). Quando presente, `a` é só a versão em texto puro. */
  rich?: RichCardV2
}

const API_KEY_STORAGE = 'mr_gemini_api_key'
const MODEL = 'gemini-3.8-flash'

export function getGeminiApiKey(): string {
  try {
    const saved = localStorage.getItem(API_KEY_STORAGE)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return import.meta.env.VITE_GEMINI_API_KEY || ''
}

export function saveGeminiApiKey(key: string) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key.trim())
  } catch {
    /* ignore */
  }
}

const RICH_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Resposta direta em UMA linha (o título do verso).' },
    why: {
      type: 'string',
      description:
        'Explicação do porquê/mecanismo em 1 a 3 parágrafos curtos separados por linha em branco. Use **negrito** só nos termos-chave.',
    },
    bullets: {
      type: 'object',
      description: 'Lista de pontos-chave (ex.: manifestações, critérios, etapas). Omitir se não houver.',
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
      },
    },
    pearls: {
      type: 'array',
      items: { type: 'string' },
      description: 'Pegadinhas e detalhes que costumam cair em prova. 0 a 4 itens.',
    },
    compare: {
      type: 'object',
      description: 'Tabela comparativa curta, somente quando comparar ajudar de verdade.',
      properties: {
        title: { type: 'string' },
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      },
    },
    mnemonic: { type: 'string', description: 'Mnemônico, somente se for útil e correto.' },
    related: {
      type: 'array',
      items: { type: 'string' },
      description: 'Até 4 temas relacionados para estudar em seguida.',
    },
    source: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Livro-texto ou diretriz (ex.: Harrison, Nelson, diretriz SBP).' },
        detail: { type: 'string', description: 'Capítulo ou tópico, SEM inventar página, ano ou link.' },
      },
    },
    highYield: { type: 'boolean', description: 'True para tema muito cobrado em provas de residência.' },
  },
  required: ['answer'],
}

function buildInstructions(count: number): string {
  return `Você é um professor e preceptor médico sênior, especialista em memorização ativa e repetição espaçada.
Analise o material fornecido e gere exatamente ${count} flashcards de ALTO RENDIMENTO, no padrão de cartões baseados em evidências.

PRINCÍPIOS
1. Um cartão = uma ideia. Se o tema tem várias manifestações, quebre em cartões encadeados ("Para além de X, quais...?") em vez de um cartão enorme.
2. PERGUNTA (campo q): objetiva. Caso clínico só quando o tema pedir (paciente, idade, achados, pergunta final). Cloze {{c1::termo}} é permitido quando fizer sentido.
3. VERSO EM CAMADAS (campo rich):
   - answer: a resposta direta, numa linha.
   - why: o porquê — fisiopatologia/mecanismo/raciocínio clínico, não só repetir a resposta. Diga também o que é incerto ("o mecanismo não é totalmente compreendido") quando for o caso.
   - bullets: use quando a resposta for uma lista (manifestações, critérios, passos).
   - pearls: pegadinhas reais de prova (exceções, confusões clássicas, valores de corte). Não invente para preencher.
   - compare: tabela só se houver diagnóstico diferencial ou comparação lado a lado.
   - mnemonic: só se for realmente útil e correto.
   - related: até 4 temas para estudar em seguida.
   - highYield: true apenas para temas de alta incidência em provas de residência.
4. FIDELIDADE: use somente informações que você tem alta confiança ou que estão no material. Se o material não cobrir algo, não preencha com suposições. NÃO invente referências, páginas, anos, números ou links; em source.detail cite só capítulo/tópico quando souber.
5. Idioma: português do Brasil, com a conduta e as diretrizes brasileiras quando existirem.
6. group = tema (ex.: "Fenilcetonúria"); clinical = true se for caso clínico; tags = 1 a 3 etiquetas curtas.`
}

function normalizeCard(raw: any): GeneratedCard | null {
  if (!raw || typeof raw.q !== 'string' || !raw.q.trim()) return null
  const rich = sanitizeRich(raw.rich)
  const a = rich ? richToPlainText(rich) : typeof raw.a === 'string' ? raw.a.trim() : ''
  if (!a) return null

  const tags: string[] = Array.isArray(raw.tags)
    ? raw.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
    : []
  if (rich?.highYield && !tags.some((t) => /alto rendimento|high yield/i.test(t))) {
    tags.unshift('🔥 Alto Rendimento')
  }

  return {
    q: raw.q.trim(),
    a,
    group: typeof raw.group === 'string' ? raw.group.trim() : undefined,
    ref: rich?.source?.name || (typeof raw.ref === 'string' ? raw.ref.trim() : undefined),
    clinical: !!raw.clinical,
    tags,
    rich: rich || undefined,
  }
}

function requireKey(apiKey?: string): string {
  const key = apiKey || getGeminiApiKey()
  if (!key) {
    throw new Error('Chave da API Gemini não configurada. Obtenha uma chave gratuita em aistudio.google.com.')
  }
  return key
}

export async function generateFlashcardsWithGemini(params: {
  text?: string
  pdfBase64?: string
  cardCount?: number
  focus?: 'geral' | 'casos_clinicos' | 'cloze' | 'farmacologia'
  apiKey?: string
}): Promise<GeneratedCard[]> {
  const ai = new GoogleGenAI({ apiKey: requireKey(params.apiKey) })
  const count = params.cardCount || 10

  const inputParts: any[] = []
  if (params.pdfBase64) {
    inputParts.push({ type: 'document', data: params.pdfBase64, mime_type: 'application/pdf' })
  }
  const focusNote =
    params.focus && params.focus !== 'geral' ? `\nFoco desta geração: ${params.focus}.` : ''
  inputParts.push({
    type: 'text',
    text: `${buildInstructions(count)}${focusNote}\n\nMaterial de Estudo:\n${params.text || 'Gere flashcards essenciais baseados no documento fornecido.'}`,
  })

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: inputParts,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string', description: 'Pergunta ou caso clínico do cartão' },
                rich: RICH_SCHEMA,
                group: { type: 'string', description: 'Tema do cartão (ex.: Fenilcetonúria)' },
                clinical: { type: 'boolean', description: 'True se for um caso clínico' },
                tags: { type: 'array', items: { type: 'string' } },
              },
              required: ['q', 'rich'],
            },
          },
        },
        required: ['cards'],
      },
    },
  })

  const outputText = interaction.output_text
  if (!outputText) throw new Error('Nenhum cartão gerado pelo modelo.')

  const parsed = JSON.parse(outputText)
  if (!Array.isArray(parsed.cards)) throw new Error('Formato de resposta inesperado do Gemini.')

  const cards = parsed.cards.map(normalizeCard).filter(Boolean) as GeneratedCard[]
  if (!cards.length) throw new Error('O modelo não devolveu cartões válidos. Tente de novo.')
  return cards
}

/**
 * 2ª passada: um revisor independente confere cada cartão contra o material e o conhecimento médico
 * consolidado e MARCA o que parece errado ou duvidoso (não reescreve). É uma checagem da IA — não
 * substitui a sua conferência nem a fonte original.
 */
export async function verifyCardsWithGemini(params: {
  cards: GeneratedCard[]
  text?: string
  pdfBase64?: string
  apiKey?: string
}): Promise<GeneratedCard[]> {
  const ai = new GoogleGenAI({ apiKey: requireKey(params.apiKey) })

  const inputParts: any[] = []
  if (params.pdfBase64) {
    inputParts.push({ type: 'document', data: params.pdfBase64, mime_type: 'application/pdf' })
  }
  const payload = params.cards.map((c, index) => ({ index, q: c.q, verso: c.rich ?? c.a }))
  inputParts.push({
    type: 'text',
    text: `Você é um revisor médico independente e rigoroso. Abaixo estão flashcards gerados por IA.
Para cada um, confira as afirmações do verso contra o material de estudo (se houver) e contra o conhecimento médico consolidado e atual.
Classifique:
- "ok": correto e consistente.
- "duvida": plausível, mas impreciso, incompleto, desatualizado ou não sustentado pelo material.
- "erro": contém afirmação incorreta.
Em "notes", diga em uma frase curta O QUE está duvidoso/errado (vazio se "ok"). Não reescreva o cartão. Se não tiver certeza, use "duvida".

Material de estudo:
${params.text || '(sem texto; usar o documento anexo, se houver)'}

Cartões (JSON):
${JSON.stringify(payload)}`,
  })

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: inputParts,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: {
        type: 'object',
        properties: {
          reviews: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                status: { type: 'string', enum: ['ok', 'duvida', 'erro'] },
                notes: { type: 'string' },
              },
              required: ['index', 'status'],
            },
          },
        },
        required: ['reviews'],
      },
    },
  })

  const outputText = interaction.output_text
  if (!outputText) throw new Error('A conferência não devolveu resultado.')
  const parsed = JSON.parse(outputText)
  const reviews: Array<{ index: number; status: string; notes?: string }> = Array.isArray(parsed.reviews)
    ? parsed.reviews
    : []

  return params.cards.map((card, i) => {
    const r = reviews.find((x) => x.index === i)
    if (!card.rich || !r) return card
    const flagged = r.status !== 'ok'
    return {
      ...card,
      rich: {
        ...card.rich,
        review: {
          status: flagged ? 'flagged' : 'verified',
          ...(flagged && r.notes ? { notes: String(r.notes).slice(0, 600) } : {}),
        },
      },
    }
  })
}
