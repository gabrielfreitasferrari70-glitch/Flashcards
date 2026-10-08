/**
 * MedReview Anki Universal Parser
 * Processa arquivos exportados do Anki:
 * 1. Arquivos de texto (*.txt, *.tsv, *.csv) exportados do Anki com Cloze, HTML e Tags.
 * 2. Arquivos de pacote Anki (*.apkg): Lê o zip via API nativa do navegador (DecompressionStream)
 *    e extrai as notas e campos do banco Anki.
 */

export interface ParsedAnkiCard {
  q: string
  a: string
  tags?: string[]
  isCloze?: boolean
}

export interface AnkiPackageResult {
  deckName: string
  cards: ParsedAnkiCard[]
}

/**
 * Limpa HTML excessivo preservando quebras de linha e estrutura básica
 */
export function cleanAnkiHtml(html: string): string {
  if (!html) return ''
  let text = html
    .replace(/<br\s*[/]?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
    // Preserva clozes {{c1::...}}
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
  return text
}

/**
 * Faz parse de arquivos de texto (.txt, .tsv, .csv) exportados do Anki
 */
export function parseAnkiText(content: string, fileName: string): AnkiPackageResult {
  const lines = content.split(/\r?\n/)
  let separator = '\t'
  let tagsColumnIndex = -1

  // Detecta headers do Anki
  for (const line of lines) {
    if (line.startsWith('#separator:')) {
      const sepName = line.split(':')[1]?.trim()
      if (sepName === 'tab') separator = '\t'
      else if (sepName === 'comma') separator = ','
      else if (sepName === 'semicolon') separator = ';'
      else if (sepName === 'space') separator = ' '
    } else if (line.startsWith('#tags column:')) {
      const colNum = parseInt(line.split(':')[1]?.trim() || '', 10)
      if (!isNaN(colNum)) tagsColumnIndex = colNum - 1
    }
  }

  // Se não foi explicitado e tiver tabs, usa tab; se não, tenta vírgula ou ponto-e-vírgula
  if (separator === '\t' && !content.includes('\t') && content.includes(';')) {
    separator = ';'
  }

  const cards: ParsedAnkiCard[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const parts = line.split(separator)
    if (parts.length < 1) continue

    let q = ''
    let a = ''
    const tags: string[] = []

    if (parts.length === 1) {
      // Pode ser um cloze direto no primeiro campo
      q = cleanAnkiHtml(parts[0])
      a = 'Revisão Cloze'
    } else {
      q = cleanAnkiHtml(parts[0])
      a = cleanAnkiHtml(parts[1])

      // Se houver coluna de tags
      if (tagsColumnIndex >= 0 && parts[tagsColumnIndex]) {
        const rawTags = parts[tagsColumnIndex].trim().split(/\s+/)
        tags.push(...rawTags.filter(Boolean))
      } else if (parts.length >= 3) {
        // Último campo frequentemente são tags
        const lastPart = parts[parts.length - 1].trim()
        if (lastPart && !lastPart.includes('<') && lastPart.length < 50) {
          const rawTags = lastPart.split(/\s+/)
          tags.push(...rawTags.filter(Boolean))
        }
      }
    }

    if (q) {
      const isCloze = /\{\{c\d+::.*?\}\}/.test(q)
      cards.push({
        q,
        a: a || (isCloze ? 'Complete a lacuna' : ''),
        tags: tags.length ? tags : undefined,
        isCloze,
      })
    }
  }

  const deckName = fileName.replace(/\.[^/.]+$/, '').trim() || 'Baralho Importado do Anki'
  return { deckName, cards }
}

/**
 * Descompactador nativo de ZIP para arquivos .apkg no navegador
 */
async function unzipApkg(fileBuffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const dataView = new DataView(fileBuffer)
  let offset = 0
  const length = fileBuffer.byteLength

  // Itera pelos Local File Headers (Assinatura 0x04034b50)
  while (offset + 30 <= length) {
    const signature = dataView.getUint32(offset, true)
    if (signature !== 0x04034b50) break

    const compMethod = dataView.getUint16(offset + 8, true)
    const compSize = dataView.getUint32(offset + 18, true)
    const _uncompSize = dataView.getUint32(offset + 22, true)
    const nameLen = dataView.getUint16(offset + 26, true)
    const extraLen = dataView.getUint16(offset + 28, true)

    const nameBytes = new Uint8Array(fileBuffer, offset + 30, nameLen)
    const fileName = new TextDecoder('utf-8').decode(nameBytes)

    const dataStart = offset + 30 + nameLen + extraLen
    const rawData = new Uint8Array(fileBuffer, dataStart, compSize)

    if (compMethod === 0) {
      // Sem compressão (Stored)
      files.set(fileName, rawData)
    } else if (compMethod === 8) {
      // Deflate
      try {
        const ds = new DecompressionStream('deflate-raw')
        const writer = ds.writable.getWriter()
        writer.write(rawData)
        writer.close()
        const response = new Response(ds.readable)
        const uncompressedBuffer = await response.arrayBuffer()
        files.set(fileName, new Uint8Array(uncompressedBuffer))
      } catch {
        // Fallback se deflate-raw falhar
      }
    }

    offset = dataStart + compSize
  }

  return files
}

/**
 * Extrai notas e campos do arquivo collection.anki2 ou anki21
 */
function extractCardsFromCollection(sqliteBytes: Uint8Array): ParsedAnkiCard[] {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const fullText = decoder.decode(sqliteBytes)
  const cards: ParsedAnkiCard[] = []

  // No SQLite do Anki, a tabela 'notes' armazena os campos separados pelo caractere 0x1f
  // Procuramos blocos contendo esse separador
  const parts = fullText.split('\x1f')

  for (let i = 0; i < parts.length - 1; i++) {
    const rawQ = parts[i]
    const rawA = parts[i + 1]

    // Valida se parece com uma pergunta de flashcard
    if (rawQ && rawQ.length > 2 && rawQ.length < 3000 && !rawQ.includes('sqlite_') && !rawQ.includes('CREATE TABLE')) {
      // Pega o último pedaço limpo antes do delimitador
      const qLines = rawQ.split('\x00')
      const cleanQ = cleanAnkiHtml(qLines[qLines.length - 1] || '')

      const aLines = rawA.split('\x00')
      const cleanA = cleanAnkiHtml(aLines[0] || '')

      if (cleanQ && (cleanA || /\{\{c\d+::.*?\}\}/.test(cleanQ))) {
        // Evita duplicatas imediatas
        const isCloze = /\{\{c\d+::.*?\}\}/.test(cleanQ)
        if (!cards.some((c) => c.q === cleanQ)) {
          cards.push({
            q: cleanQ,
            a: cleanA || (isCloze ? 'Complete a lacuna' : 'Revisão'),
            isCloze,
          })
        }
      }
    }
  }

  return cards
}

/**
 * Função principal que recebe um File do navegador e retorna o baralho parsed
 */
export async function parseAnkiFile(file: File): Promise<AnkiPackageResult> {
  const name = file.name
  const isApkg = name.toLowerCase().endsWith('.apkg')

  if (isApkg) {
    const buffer = await file.arrayBuffer()
    const zipFiles = await unzipApkg(buffer)

    // Tenta encontrar collection.anki21 ou collection.anki2
    const dbBytes = zipFiles.get('collection.anki21') || zipFiles.get('collection.anki2')
    if (dbBytes) {
      const cards = extractCardsFromCollection(dbBytes)
      const deckName = name.replace(/\.apkg$/i, '').trim() || 'Baralho Anki Importado'
      return { deckName, cards }
    }
  }

  // Se for texto (.txt, .tsv, .csv) ou fallback
  const textContent = await file.text()
  return parseAnkiText(textContent, name)
}
