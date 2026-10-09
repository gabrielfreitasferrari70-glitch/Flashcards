/**
 * MedReview — Importador e Parser de Flashcards CSV (RFC 4180)
 *
 * Suporta:
 * - RFC 4180 com autômato de estados (células com aspas duplas, quebras de linha e vírgulas/pontos-e-vírgulas internas)
 * - Aspas duplas escapadas via dupla aspa ("")
 * - Detecção automática de delimitador (vírgula ',' vs ponto-e-vírgula ';')
 * - Decodificação de entidades HTML de exportação web (&amp;, &lt;, &gt;, &quot;, &#39;, &nbsp;, etc.)
 * - Fidelidade total aos campos 'frente' e 'verso' sem reescrever nem resumir
 * - Validação e tolerância a cabeçalhos variáveis e acentuação (pasta, grupo, frente, verso, referencia)
 */

export interface ParsedCsvCard {
  q: string
  a: string
  ref: string
  group: string
  folder?: string
  clinical?: boolean
  imageUrl?: string
}

export interface CsvParseResult {
  cards: ParsedCsvCard[]
  totalRows: number
  validCount: number
  skippedEmptyCount: number
  error?: string
  detectedDelimiter?: string
  headersFound?: string[]
}

/**
 * Decodifica entidades HTML comuns sem corromper texto médico
 */
export function decodeHtmlEntities(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10))
      } catch {
        return _
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16))
      } catch {
        return _
      }
    })
}

/**
 * Remove acentos e converte para minúsculas para comparação de nomes de coluna
 */
export function normalizeHeaderKey(key: string): string {
  return (key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Detecta o delimitador mais provável (vírgula, ponto-e-vírgula ou tabulação)
 */
export function detectDelimiter(csvText: string): ',' | ';' | '\t' {
  // Analisa as primeiras linhas fora de aspas
  let inQuotes = false
  let commaCount = 0
  let semicolonCount = 0
  let tabCount = 0
  const maxChars = Math.min(csvText.length, 4096)

  for (let i = 0; i < maxChars; i++) {
    const char = csvText[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes) {
      if (char === ',') commaCount++
      else if (char === ';') semicolonCount++
      else if (char === '\t') tabCount++
      else if (char === '\n' && (commaCount > 0 || semicolonCount > 0 || tabCount > 0)) {
        break
      }
    }
  }

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t'
  return semicolonCount > commaCount ? ';' : ','
}

/**
 * Autômato de estados para parsing estrito conforme RFC 4180
 * Suporta quebras de linha dentro de aspas, aspas duplas (""), delimitador variável.
 */
export function parseCsvRows(csvText: string, delimiter?: ',' | ';' | '\t'): string[][] {
  const delim = delimiter || detectDelimiter(csvText)
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false
  const len = csvText.length

  for (let i = 0; i < len; i++) {
    const char = csvText[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Aspa escapada: ""
          currentCell += '"'
          i++ // Pula a segunda aspa
        } else {
          // Fim do bloco entre aspas
          inQuotes = false
        }
      } else {
        currentCell += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delim) {
        currentRow.push(currentCell)
        currentCell = ''
      } else if (char === '\r') {
        // Trata CRLF
        if (i + 1 < len && csvText[i + 1] === '\n') {
          i++
        }
        currentRow.push(currentCell)
        rows.push(currentRow)
        currentRow = []
        currentCell = ''
      } else if (char === '\n') {
        currentRow.push(currentCell)
        rows.push(currentRow)
        currentRow = []
        currentCell = ''
      } else {
        currentCell += char
      }
    }
  }

  // Última célula/linha se o arquivo não terminar com quebra de linha
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
}

/**
 * Processa o texto CSV completo e extrai as cartas preservando fidelidade
 */
export function parseCardsFromCsv(csvText: string): CsvParseResult {
  if (!csvText || !csvText.trim()) {
    return {
      cards: [],
      totalRows: 0,
      validCount: 0,
      skippedEmptyCount: 0,
      error: 'O arquivo CSV está vazio.',
    }
  }

  const delimiter = detectDelimiter(csvText)
  const allRows = parseCsvRows(csvText, delimiter)

  // Encontra a linha de cabeçalho (primeira linha não vazia)
  let headerRowIndex = -1
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i]
    if (row.some((cell) => cell.trim().length > 0)) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    return {
      cards: [],
      totalRows: 0,
      validCount: 0,
      skippedEmptyCount: 0,
      error: 'Nenhum cabeçalho encontrado no CSV.',
    }
  }

  const rawHeaders = allRows[headerRowIndex]
  const normalizedHeaders = rawHeaders.map((h) => normalizeHeaderKey(h))

  // Mapeia índices das colunas
  // Colunas esperadas: pasta, grupo, frente, verso, referencia, modo_clinico
  let frenteIdx = -1
  let versoIdx = -1
  let grupoIdx = -1
  let refIdx = -1
  let pastaIdx = -1
  let clinicoIdx = -1
  let imgIdx = -1

  normalizedHeaders.forEach((nh, idx) => {
    if (nh === 'frente' || nh === 'pergunta' || nh === 'question' || nh === 'front') {
      frenteIdx = idx
    } else if (
      nh === 'verso' ||
      nh === 'resposta' ||
      nh === 'answer' ||
      nh === 'back' ||
      nh === 'gabarito'
    ) {
      versoIdx = idx
    } else if (nh === 'grupo' || nh === 'group' || nh === 'objetivo' || nh === 'topico') {
      grupoIdx = idx
    } else if (nh === 'referencia' || nh === 'ref' || nh === 'referencias' || nh === 'fontes') {
      refIdx = idx
    } else if (nh === 'pasta' || nh === 'folder' || nh === 'modulo' || nh === 'deck') {
      pastaIdx = idx
    } else if (
      nh === 'modoclinico' ||
      nh === 'modoclinica' ||
      nh === 'clinico' ||
      nh === 'clinical'
    ) {
      clinicoIdx = idx
    } else if (nh === 'imagem' || nh === 'image' || nh === 'imagemurl' || nh === 'imageurl') {
      imgIdx = idx
    }
  })

  let dataRows = allRows.slice(headerRowIndex + 1)

  // Validação: se não achou cabeçalhos com palavras-chave, mas há pelo menos 2 colunas, usa mapeamento posicional
  if (frenteIdx === -1 || versoIdx === -1) {
    if (rawHeaders.length >= 2) {
      frenteIdx = 0
      versoIdx = 1
      if (rawHeaders.length >= 3) grupoIdx = 2
      if (rawHeaders.length >= 4) pastaIdx = 3
      dataRows = allRows.slice(headerRowIndex) // Inclui a primeira linha como dados
    } else {
      return {
        cards: [],
        totalRows: allRows.length - headerRowIndex - 1,
        validCount: 0,
        skippedEmptyCount: 0,
        detectedDelimiter: delimiter,
        headersFound: rawHeaders.map((h) => h.trim()),
        error: 'O CSV precisa ter pelo menos duas colunas (frente e verso).',
      }
    }
  }

  const cards: ParsedCsvCard[] = []
  let skippedEmptyCount = 0

  for (const row of dataRows) {
    // Linha totalmente vazia
    if (row.length === 0 || row.every((c) => !c || c.trim().length === 0)) {
      continue
    }

    const rawFrente = frenteIdx >= 0 && frenteIdx < row.length ? row[frenteIdx] : ''
    const rawVerso = versoIdx >= 0 && versoIdx < row.length ? row[versoIdx] : ''
    const rawGrupo = grupoIdx >= 0 && grupoIdx < row.length ? row[grupoIdx] : ''
    const rawRef = refIdx >= 0 && refIdx < row.length ? row[refIdx] : ''
    const rawPasta = pastaIdx >= 0 && pastaIdx < row.length ? row[pastaIdx] : ''
    const rawClinico = clinicoIdx >= 0 && clinicoIdx < row.length ? row[clinicoIdx] : ''
    const rawImg = imgIdx >= 0 && imgIdx < row.length ? row[imgIdx] : ''

    const frenteDecoded = decodeHtmlEntities(rawFrente).trim()
    const versoDecoded = decodeHtmlEntities(rawVerso).trim()

    // Se frente ou verso estiverem vazios, pula a linha e contabiliza
    if (!frenteDecoded || !versoDecoded) {
      skippedEmptyCount++
      continue
    }

    const grupoDecoded = decodeHtmlEntities(rawGrupo).trim()
    const refDecoded = decodeHtmlEntities(rawRef).trim()
    const pastaDecoded = decodeHtmlEntities(rawPasta).trim()

    const clinicoRaw = decodeHtmlEntities(rawClinico).trim().toLowerCase()
    const isClinical =
      clinicoRaw === ''
        ? /caso cl[ií]nico/i.test(frenteDecoded)
        : clinicoRaw !== '0' &&
          clinicoRaw !== 'nao' &&
          clinicoRaw !== 'não' &&
          clinicoRaw !== 'false' &&
          clinicoRaw !== 'normal'

    const imgDecoded = decodeHtmlEntities(rawImg).trim()
    const imgUrl = /^https?:\/\//i.test(imgDecoded) ? imgDecoded : ''

    cards.push({
      q: frenteDecoded,
      a: versoDecoded,
      group: grupoDecoded,
      ref: refDecoded || 'Referência Médica',
      folder: pastaDecoded,
      clinical: isClinical,
      imageUrl: imgUrl,
    })
  }

  return {
    cards,
    totalRows: dataRows.length,
    validCount: cards.length,
    skippedEmptyCount,
    detectedDelimiter: delimiter,
    headersFound: rawHeaders.map((h) => h.trim()),
  }
}

/**
 * Cria o objeto de carta completo no padrão FSRS-5 para inserção na pasta
 */
export function createFsrsCard(cardData: ParsedCsvCard, containerId: string, folderTitle: string) {
  return {
    id:
      'usr_' +
      Date.now() +
      '_' +
      Math.random().toString(36).substring(2, 7) +
      '_' +
      Math.random().toString(36).substring(2, 5),
    q: cardData.q,
    a: cardData.a,
    ref: cardData.ref || 'Referência Médica',
    group: cardData.group || '',
    clinical: false,
    repetitions: 0,
    interval: 0,
    easeFactor: 2.5,
    dueDate: Date.now(),
    fsrsS: null,
    fsrsD: null,
    fsrsState: 'new',
    lapses: 0,
    containerId,
    folderTitle,
  }
}
