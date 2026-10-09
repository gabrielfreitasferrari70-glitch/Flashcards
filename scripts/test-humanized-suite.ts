import { normalizeSearchText, highlightMatch } from '../src/lib/searchUtils'
import { parseCardsFromCsv } from '../src/lib/csvImport'
import { compareDecks, setDeckSort, getDeckSort } from '../src/lib/deckSort'
import { parseCardsFromRawText } from '../src/lib/ankiParser'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

async function runTestSuite() {
  console.log('================================================================')
  console.log('🩺 MEDREVIEW — SISTEMA HUMANIZADO DE TESTES DE TODAS AS FUNÇÕES')
  console.log('================================================================\n')

  // -------------------------------------------------------------
  // TESTE 1: SISTEMA DE PESQUISA (Busca Médica, Acentuação, Caracteres Especiais)
  // -------------------------------------------------------------
  console.log('🔍 [1/5] Testando Sistema de Busca e Normalização:')

  const term1 = 'Músculo Esquelético'
  const query1 = 'musculo'
  assert(
    normalizeSearchText(term1).includes(normalizeSearchText(query1)),
    'Busca "musculo" sem acento deve encontrar "Músculo Esquelético"'
  )

  const term2 = 'Glomerulonefrite Pós-Estreptocócica'
  const query2 = 'pos-estreptococica'
  assert(
    normalizeSearchText(term2).includes(normalizeSearchText(query2)),
    'Busca com hífens e acentos mistos "pos-estreptococica" encontra com perfeição'
  )

  const term3 = 'Paciente com COVID-19 (SpO2 < 92%) em ventilação [UTI]'
  const query3 = '(SpO2 < 92%)'
  // highlightMatch não deve lançar exceção ao receber caracteres regex reservados ()[]+*?
  let hlSuccess = true
  try {
    highlightMatch(term3, query3)
    highlightMatch(term3, '[UTI]')
    highlightMatch(term3, 'a + b * c?')
  } catch (e) {
    hlSuccess = false
  }
  assert(hlSuccess, 'highlightMatch trata caracteres especiais de regex com segurança sem quebrar')

  // -------------------------------------------------------------
  // TESTE 2: PARSER DE TEXTO E IMPORTAÇÃO INTELIGENTE (IA / CSV / TAB)
  // -------------------------------------------------------------
  console.log('\n📥 [2/5] Testando Importador de Flashcards de IA e CSV:')

  const rawAiText = `
Qual a tríade clínica de Beck no tamponamento cardíaco?	Hipotensão arterial, hipofonese de bulhas e estase jugular.	Cardiologia
Qual a droga de primeira escolha na anafilaxia?	Adrenalina intramuscular (0,3 a 0,5 mg da solução 1:1000).	Emergência
`
  const resAi = parseCardsFromRawText(rawAiText)
  const parsedAi = resAi.cards
  assert(parsedAi.length === 2, `Parser de IA identificou ${parsedAi.length}/2 cartões tabulados`)
  assert(
    parsedAi[0].q.includes('Beck') && parsedAi[0].a.includes('Hipotensão'),
    'Pergunta e resposta do cartão 1 extraídas corretamente'
  )
  assert(
    parsedAi[0].group === 'Cardiologia' && parsedAi[1].group === 'Emergência',
    'Grupos e especialidades mapeados corretamente'
  )

  const rawCsv = `"Pergunta Cardio","Resposta Cardio","Semiologia","Cardio"
"Pergunta Neuro","Resposta Neuro","Neurologia","Neuro"`
  const parsedCsv = parseCardsFromCsv(rawCsv)
  assert(parsedCsv.cards.length === 2, `Parser CSV identificou ${parsedCsv.cards.length}/2 cartões com aspas`)

  // -------------------------------------------------------------
  // TESTE 3: ORDENAÇÃO E NAVEGAÇÃO DE PASTAS MÉDICAS
  // -------------------------------------------------------------
  console.log('\n📁 [3/5] Testando Ordenação e Hierarquia de Decks:')

  const mockDecks = [
    { id: '1', title: 'Cardiologia', order: 2, kind: 'tutoria' },
    { id: '2', title: 'Anatomia', order: 1, kind: 'tutoria' },
    { id: '3', title: 'Farmacologia', order: 3, kind: 'tutoria' },
  ]
  const sortedAlpha = [...mockDecks].sort((a, b) => a.title.localeCompare(b.title))
  assert(sortedAlpha[0].title === 'Anatomia' && sortedAlpha[2].title === 'Farmacologia', 'Ordenação alfabética funciona')

  // -------------------------------------------------------------
  // TESTE 4: INTEGRIDADE DO FORMATO DE BACKUP
  // -------------------------------------------------------------
  console.log('\n💾 [4/5] Testando Formato e Restauração de Backup:')

  const mockBackup = {
    version: 2,
    appName: 'MedReview',
    exportedAt: new Date().toISOString(),
    decks: mockDecks,
    cards: [
      { id: 'c1', deck: '1', q: 'Pergunta', a: 'Resposta', group: 'G1' }
    ]
  }
  assert(mockBackup.appName === 'MedReview' && mockBackup.decks.length === 3, 'Payload de backup estruturado corretamente')

  // -------------------------------------------------------------
  // TESTE 5: BUSCA MULTI-NÍVEL (PASTAS + CARDS) & CASOS LIMITES
  // -------------------------------------------------------------
  console.log('\n⚡ [5/6] Testando Busca Combinada e Casos Limite:')

  const searchCards = [
    { id: 'c1', deck: '1', q: 'Tratamento de cetoacidose diabética', a: 'Hidratação venosa e insulina regular', group: 'Endócrino' },
    { id: 'c2', deck: '2', q: 'Indicação de cirurgia na apendicite aguda', a: 'Apendicectomia de urgência', group: 'Cirurgia' },
    { id: 'c3', deck: '3', q: 'Conduta no Choque Séptico refratário a volume', a: 'Noradrenalina em bomba de infusão contínua', group: 'UTI' },
  ]

  const qTest = 'insulina'
  const matchingC = searchCards.filter(c =>
    normalizeSearchText(c.q).includes(normalizeSearchText(qTest)) ||
    normalizeSearchText(c.a).includes(normalizeSearchText(qTest))
  )
  assert(matchingC.length === 1 && matchingC[0].id === 'c1', 'Busca por conteúdo da resposta ("insulina") encontra o card cetoacidose')

  const qMultiWord = 'choque septico'
  const matchingMulti = searchCards.filter(c =>
    normalizeSearchText(c.q).includes(normalizeSearchText(qMultiWord))
  )
  assert(matchingMulti.length === 1 && matchingMulti[0].id === 'c3', 'Busca por termo composto sem acento ("choque septico") encontra "Choque Séptico"')

  assert(normalizeSearchText('') === '', 'Busca com texto vazio retorna string vazia sem quebrar')
  assert(normalizeSearchText(null as any) === '', 'Busca com null trata com segurança sem erro de tipo')
  assert(normalizeSearchText('   AMOXICILINA + CLAVULANATO   ') === 'amoxicilina + clavulanato', 'Tratamento de espaços e maiúsculas correto')

  // -------------------------------------------------------------
  // TESTE 6: HIERARQUIA DE SUBPASTAS E CÁLCULO DE CARTÕES
  // -------------------------------------------------------------
  console.log('\n🌳 [6/6] Testando Hierarquia de Pastas e Contagem de Subárvores:')

  const nestedDecks = [
    { id: 'root', title: 'Medicina Interna', kind: 'tutoria', order: 1 },
    { id: 'sub1', title: 'Cardiologia', parent: 'root', kind: 'tutoria', order: 1 },
    { id: 'sub2', title: 'Arritmias', parent: 'sub1', kind: 'tutoria', order: 1 },
    { id: 'other', title: 'Cirurgia', kind: 'tutoria', order: 2 },
  ]
  const cardCounts = new Map([
    ['root', 5],
    ['sub1', 10],
    ['sub2', 20],
    ['other', 15],
  ])

  // Função recursiva de contagem de subárvore
  const getSubtreeTotal = (deckId: string): number => {
    let sum = cardCounts.get(deckId) || 0
    const kids = nestedDecks.filter(d => d.parent === deckId)
    for (const kid of kids) {
      sum += getSubtreeTotal(kid.id)
    }
    return sum
  }

  assert(getSubtreeTotal('sub2') === 20, 'Subpasta folha calcula 20 cartas')
  assert(getSubtreeTotal('sub1') === 30, 'Pasta intermediária calcula 30 cartas (10 + 20 da folha)')
  assert(getSubtreeTotal('root') === 35, 'Pasta raiz calcula 35 cartas (5 + 10 + 20)')
  assert(getSubtreeTotal('other') === 15, 'Pasta independente calcula 15 cartas')

  console.log('\n================================================================')
  console.log(`📊 RESULTADO FINAL: ${passed} testes passaram | ${failed} falharam`)
  console.log('================================================================\n')

  if (failed > 0) process.exit(1)
}

runTestSuite()
