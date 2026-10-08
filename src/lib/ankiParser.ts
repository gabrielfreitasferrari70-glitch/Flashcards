/**
 * MedReview Anki Universal Parser (Fidelidade Total com Imagens e Cloze)
 * 1. Arquivos de pacote Anki (*.apkg): Descompacta com JSZip, decodifica mídia em Base64 Data URLs
 *    e lê o banco SQLite nativo (collection.anki2) usando sql.js (WebAssembly).
 * 2. Suporta notas com Imagens (PNG, JPG, SVG, WebP), Cloze Deletion e Image Occlusion.
 * 3. Arquivos de texto (*.txt, *.tsv, *.csv) exportados do Anki.
 */

import JSZip from 'jszip'
import initSqlJs from 'sql.js'

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

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Limpa HTML mantendo quebras de linha e estrutura legível
 */
export function cleanAnkiHtml(html: string): string {
  if (!html) return ''
  let text = html
    .replace(/<br\s*[/]?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
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
 * Substitui caminhos de imagem locais do Anki (<img src="paste-123.png">)
 * pelos Data URLs em Base64 extraídos da pasta de mídia do .apkg
 */
function injectMediaIntoHtml(html: string, mediaMap: Map<string, string>): string {
  if (!html) return ''
  return html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
    const rawFileName = src.trim()
    const decodedName = decodeURIComponent(rawFileName)
    const dataUrl = mediaMap.get(rawFileName) || mediaMap.get(decodedName)
    if (dataUrl) {
      return `<img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:10px;margin:10px 0;display:block;box-shadow:0 4px 14px rgba(0,0,0,0.1)" alt="Imagem Anki" />`
    }
    return match
  })
}

/**
 * Para cartas Cloze com múltiplos índices (ex: c1, c2):
 * Apenas a lacuna alvo do card fica no formato {{c1::...}}; as demais são exibidas reveladas.
 */
function formatClozeForCard(text: string, targetIndex: number): string {
  return text.replace(/\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g, (_, numStr, term, tip) => {
    const num = parseInt(numStr, 10)
    if (num === targetIndex) {
      return tip ? `{{c1::${term}::${tip}}}` : `{{c1::${term}}}`
    }
    return term
  })
}

/**
 * Processa pacotes .apkg com sql.js e JSZip
 */
export async function parseAnkiApkg(fileBuffer: ArrayBuffer, fileName: string): Promise<AnkiPackageResult> {
  const zip = await JSZip.loadAsync(fileBuffer)

  // 1. Extrai mapeamento de mídia
  const mediaMap = new Map<string, string>()
  const mediaFile = zip.file('media')
  if (mediaFile) {
    try {
      const mediaJson = JSON.parse(await mediaFile.async('text')) as Record<string, string>
      for (const [zipKey, realName] of Object.entries(mediaJson)) {
        const entry = zip.file(zipKey)
        if (entry) {
          const base64Data = await entry.async('base64')
          const mime = getMimeType(realName)
          const dataUrl = `data:${mime};base64,${base64Data}`
          mediaMap.set(realName, dataUrl)
          mediaMap.set(decodeURIComponent(realName), dataUrl)
        }
      }
    } catch (e) {
      console.warn('Erro ao ler mapa de mídia do Anki:', e)
    }
  }

  // 2. Extrai banco SQLite (collection.anki2 ou collection.anki21)
  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21')
  if (!dbFile) {
    throw new Error('Não foi possível encontrar a base de dados collection.anki2 dentro do arquivo .apkg.')
  }

  const dbBytes = await dbFile.async('uint8array')

  // Inicializa o engine SQLite WebAssembly
  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  })
  const db = new SQL.Database(dbBytes)

  // 3. Obtém nomes dos baralhos a partir da tabela 'col'
  let detectedDeckName = ''
  try {
    const colRes = db.exec('SELECT decks FROM col LIMIT 1;')
    if (colRes.length && colRes[0].values.length) {
      const decksJson = JSON.parse(colRes[0].values[0][0] as string)
      // Pega o primeiro deck com nome diferente de "Default" se houver
      for (const d of Object.values(decksJson) as any[]) {
        if (d && d.name && d.name !== 'Default') {
          // Em Anki, subdecks usam "::", ex: "Medicina::Cardiologia"
          const cleanName = d.name.replace(/::/g, ' — ').trim()
          if (!detectedDeckName || cleanName.length > detectedDeckName.length) {
            detectedDeckName = cleanName
          }
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao consultar tabela col:', e)
  }

  if (!detectedDeckName) {
    detectedDeckName = fileName.replace(/\.apkg$/i, '').trim() || 'Baralho Anki Importado'
  }

  // 4. Consulta cartões e notas do Anki
  const cards: ParsedAnkiCard[] = []

  try {
    // Tenta join padrão cards + notes
    const res = db.exec(
      'SELECT c.id, c.nid, c.ord, n.flds, n.tags FROM cards c JOIN notes n ON c.nid = n.id ORDER BY c.id ASC;'
    )

    if (res.length && res[0].values.length) {
      for (const row of res[0].values) {
        const ord = (row[2] as number) || 0
        const fldsRaw = (row[3] as string) || ''
        const tagsRaw = (row[4] as string) || ''

        const fields = fldsRaw.split('\x1f')
        if (fields.length === 0) continue

        // Substitui referências de mídia em todos os campos
        const processedFields = fields.map((f) => injectMediaIntoHtml(f, mediaMap))

        const isCloze = /\{\{c\d+::.*?\}\}/.test(processedFields[0])
        let q = ''
        let a = ''

        if (isCloze) {
          // Carta Cloze: formata a lacuna correspondente a este card
          const targetIndex = ord + 1
          q = formatClozeForCard(processedFields[0], targetIndex)
          // Verso contém o texto completo revelado + extras
          const extra = processedFields[1] ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1">${processedFields[1]}</div>` : ''
          a = processedFields[0].replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, '$1') + extra
        } else if (processedFields.length >= 4 && (processedFields[1].includes('<img') || processedFields[2].includes('<img'))) {
          // Possível Image Occlusion Enhanced
          // Field 0: Header, 1: Imagem original/pergunta, 2: Máscara pergunta, 3: Resposta, 4: Notas
          const header = processedFields[0] ? `<div style="font-weight:700;margin-bottom:8px">${processedFields[0]}</div>` : ''
          q = header + processedFields[1] + (processedFields[2] ? processedFields[2] : '')
          a = (processedFields[3] ? processedFields[3] : processedFields[1]) + (processedFields[4] ? `<div style="margin-top:10px">${processedFields[4]}</div>` : '')
        } else {
          // Carta básica tradicional
          q = processedFields[0]
          a = processedFields.slice(1).filter(Boolean).join('<br><br>') || 'Revisão'
        }

        const tags = tagsRaw.trim().split(/\s+/).filter(Boolean)

        if (q && q.trim()) {
          cards.push({
            q: q.trim(),
            a: a.trim(),
            tags: tags.length ? tags : undefined,
            isCloze,
          })
        }
      }
    }
  } catch (err) {
    console.warn('Join cards+notes falhou, tentando fallback direto em notes:', err)
  }

  // Se o join falhou ou não retornou cartões, faz leitura direta da tabela notes
  if (cards.length === 0) {
    try {
      const notesRes = db.exec('SELECT id, flds, tags FROM notes ORDER BY id ASC;')
      if (notesRes.length && notesRes[0].values.length) {
        for (const row of notesRes[0].values) {
          const fldsRaw = (row[1] as string) || ''
          const tagsRaw = (row[2] as string) || ''
          const fields = fldsRaw.split('\x1f').map((f) => injectMediaIntoHtml(f, mediaMap))

          const isCloze = /\{\{c\d+::.*?\}\}/.test(fields[0])
          const q = fields[0] || ''
          const a = fields.slice(1).filter(Boolean).join('<br><br>') || (isCloze ? 'Complete a lacuna' : 'Revisão')
          const tags = tagsRaw.trim().split(/\s+/).filter(Boolean)

          if (q && q.trim()) {
            cards.push({
              q: q.trim(),
              a: a.trim(),
              tags: tags.length ? tags : undefined,
              isCloze,
            })
          }
        }
      }
    } catch (e2) {
      console.error('Fallback notes também falhou:', e2)
    }
  }

  db.close()

  return {
    deckName: detectedDeckName,
    cards,
  }
}

/**
 * Faz parse de arquivos de texto (.txt, .tsv, .csv) exportados do Anki
 */
export function parseAnkiText(content: string, fileName: string): AnkiPackageResult {
  const lines = content.split(/\r?\n/)
  let separator = '\t'
  let tagsColumnIndex = -1

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
      q = parts[0]
      a = 'Revisão Cloze'
    } else {
      q = parts[0]
      a = parts[1]

      if (tagsColumnIndex >= 0 && parts[tagsColumnIndex]) {
        const rawTags = parts[tagsColumnIndex].trim().split(/\s+/)
        tags.push(...rawTags.filter(Boolean))
      } else if (parts.length >= 3) {
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
 * Função unificada chamada pela UI
 */
export async function parseAnkiFile(file: File): Promise<AnkiPackageResult> {
  const name = file.name
  const isApkg = name.toLowerCase().endsWith('.apkg')

  if (isApkg) {
    const buffer = await file.arrayBuffer()
    return parseAnkiApkg(buffer, name)
  }

  const textContent = await file.text()
  return parseAnkiText(textContent, name)
}
