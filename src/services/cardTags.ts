export const SUGGESTED_TAGS = [
  '🔥 Alto Rendimento',
  '📝 Caiu na Prova',
  '⚠️ Pegadinha',
  '💡 Mnemônico / Macete',
  '💊 Farmacologia',
  '🩺 Diagnóstico',
  '🔬 Fisiopatologia',
  '📊 Epidemiologia',
]

export function extractCardTags(card: any): string[] {
  if (Array.isArray(card.tags)) return card.tags
  if (typeof card.tags === 'string' && card.tags.trim()) {
    return card.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
  }
  // Detect high-yield keywords automatically
  const autoTags: string[] = []
  const text = (card.q + ' ' + card.a).toLowerCase()
  if (/caso clínico|paciente|mulher|homem|anos|apresenta|quadro/i.test(text) && !card.clinical) {
    autoTags.push('🩺 Caso Clínico')
  }
  if (/harrison|guyton|diretriz|padrão-ouro|padrão ouro|primeira linha/i.test(text)) {
    autoTags.push('🔥 Alto Rendimento')
  }
  return autoTags
}
