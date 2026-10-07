import { GoogleGenAI } from '@google/genai'

export interface GeneratedCard {
  q: string
  a: string
  group?: string
  ref?: string
  clinical?: boolean
  tags?: string[]
}

const API_KEY_STORAGE = 'mr_gemini_api_key'

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

export async function generateFlashcardsWithGemini(params: {
  text?: string
  pdfBase64?: string
  cardCount?: number
  focus?: 'geral' | 'casos_clinicos' | 'cloze' | 'farmacologia'
  apiKey?: string
}): Promise<GeneratedCard[]> {
  const key = params.apiKey || getGeminiApiKey()
  if (!key) {
    throw new Error('Chave da API Gemini não configurada. Obtenha uma chave gratuita em aistudio.google.com.')
  }

  const ai = new GoogleGenAI({ apiKey: key })
  const count = params.cardCount || 10

  const instructions = `Você é um professor e preceptor médico sênior especialista em memorização ativa e repetição espaçada (FSRS-5 / Anki).
Sua tarefa é analisar o material fornecido e gerar exatamente ${count} flashcards de medicina de ALTO RENDIMENTO.

Diretrizes:
1. FOCO: Conceitos essenciais, raciocínio fisiopatológico, condutas diagnósticas e terapêuticas baseadas em diretrizes (Harrison, Guyton, UpToDate, Diretrizes Brasileiras).
2. FORMATO DA PERGUNTA:
   - Se for caso clínico: inclua paciente, idade, queixa principal, achados e termine com a pergunta objetiva ("Qual o diagnóstico mais provável?", "Qual a conduta inicial?").
   - Se for conceito-chave: pergunta direta e sem rodeios.
   - Pode usar o formato cloze deletion quando apropriado: ex: "O forame oval comunica o átrio direito ao {{c1::átrio esquerdo}} na circulação fetal."
3. RESPOSTA: Explicação concisa e clinicamente correta, direta ao ponto.
4. REFERÊNCIA: Livro-texto ou diretriz padrão (ex: Guyton, Harrison, Moore, Robbins).
5. TAGS: Inclua 1 a 3 tags relevantes (ex: "🔥 Alto Rendimento", "🩺 Caso Clínico", "💊 Farmacologia").`

  const inputParts: any[] = []

  if (params.pdfBase64) {
    inputParts.push({
      type: 'document',
      data: params.pdfBase64,
      mime_type: 'application/pdf',
    })
  }

  const promptText = `${instructions}\n\nMaterial de Estudo:\n${params.text || 'Gere flashcards essenciais baseados no documento fornecido.'}`
  inputParts.push({
    type: 'text',
    text: promptText,
  })

  const interaction = await ai.interactions.create({
    model: 'gemini-3.8-flash',
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
                a: { type: 'string', description: 'Gabarito completo e explicação' },
                group: { type: 'string', description: 'Tema ou módulo (ex: Cardiologia)' },
                ref: { type: 'string', description: 'Referência bibliográfica' },
                clinical: { type: 'boolean', description: 'True se for um caso clínico' },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Etiquetas de classificação',
                },
              },
              required: ['q', 'a'],
            },
          },
        },
        required: ['cards'],
      },
    },
  })

  const outputText = interaction.output_text
  if (!outputText) {
    throw new Error('Nenhum cartão gerado pelo modelo.')
  }

  const parsed = JSON.parse(outputText)
  if (!Array.isArray(parsed.cards)) {
    throw new Error('Formato de resposta inesperado do Gemini.')
  }

  return parsed.cards
}
