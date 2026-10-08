/**
 * MedReview Anki Universal Parser (Compatibilidade com Anki Moderno 2.1.50+, 23+, 24+)
 * 1. Descompacta pacotes .apkg com JSZip.
 * 2. Suporta descompressão de bancos Zstandard (Zstd) em collection.anki21b usando fzstd.
 * 3. Ignora os cartões dummy ("Atualize para a versão mais recente do Anki...") inseridos pelo Anki moderno em collection.anki2.
 * 4. Decodifica mapa de mídia (media ou media.zst) e converte fotos em Base64 Data URLs.
 * 5. Abre a base de dados real com sql.js e extrai 100% dos cartões com suas imagens e formatação.
 */

import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { decompress } from 'fzstd'

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
 * Converte Uint8Array para Base64 de forma eficiente e segura para arquivos grandes
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

/**
 * Descompacta bytes caso comecem com o magic number do Zstandard (0xFD2FB528 -> [0x28, 0xb5, 0x2f, 0xfd])
 */
function decompressIfZstd(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  ) {
    try {
      return decompress(bytes)
    } catch (e) {
      console.warn('Falha na descompressão Zstd, tentando bytes brutos:', e)
    }
  }
  return bytes
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
 * Substitui tags de imagem (<img src="paste-123.png">) pelos Data URLs em Base64
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
 * Para cartas Cloze com múltiplos índices:
 * Apenas a lacuna ativa do card vira {{c1::...}}; as demais são exibidas normalmente como no Anki.
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
 * Processa pacotes .apkg com suporte total a Anki moderno (collection.anki21b / Zstd)
 */
export async function parseAnkiApkg(fileBuffer: ArrayBuffer, fileName: string): Promise<AnkiPackageResult> {
  const zip = await JSZip.loadAsync(fileBuffer)

  // 1. Extrai mapeamento de mídia (suporta 'media' ou 'media.zst')
  const mediaMap = new Map<string, string>()
  let mediaJsonText = ''

  const mediaZstFile = zip.file('media.zst')
  const mediaFile = zip.file('media')

  if (mediaZstFile) {
    try {
      const raw = await mediaZstFile.async('uint8array')
      const decompressed = decompressIfZstd(raw)
      mediaJsonText = new TextDecoder('utf-8').decode(decompressed)
    } catch (e) {
      console.warn('Erro ao ler media.zst:', e)
    }
  } else if (mediaFile) {
    try {
      mediaJsonText = await mediaFile.async('text')
    } catch (e) {
      console.warn('Erro ao ler media:', e)
    }
  }

  if (mediaJsonText) {
    try {
      const mediaJson = JSON.parse(mediaJsonText) as Record<string, string>
      for (const [zipKey, realName] of Object.entries(mediaJson)) {
        const entry = zip.file(zipKey)
        if (entry) {
          let rawBytes = await entry.async('uint8array')
          rawBytes = decompressIfZstd(rawBytes)
          const mime = getMimeType(realName)
          const base64Data = uint8ArrayToBase64(rawBytes)
          const dataUrl = `data:${mime};base64,${base64Data}`
          mediaMap.set(realName, dataUrl)
          mediaMap.set(decodeURIComponent(realName), dataUrl)
        }
      }
    } catch (e) {
      console.warn('Erro ao decodificar arquivos de mídia do Anki:', e)
    }
  }

  // 2. Localiza a base SQLite com a prioridade correta:
  // Anki 2.1.50+ armazena o banco real em collection.anki21b compactado com Zstandard.
  // collection.anki2 é apenas um placeholder de aviso de compatibilidade.
  const zipFiles = Object.keys(zip.files)
  let dbFileName = ''

  // Prioridade 1: collection.anki21b
  for (const f of zipFiles) {
    if (f.toLowerCase().includes('anki21b')) {
      dbFileName = f
      break
    }
  }

  // Prioridade 2: collection.anki21
  if (!dbFileName) {
    for (const f of zipFiles) {
      if (f.toLowerCase().includes('anki21')) {
        dbFileName = f
        break
      }
    }
  }

  // Prioridade 3: collection.anki2
  if (!dbFileName) {
    for (const f of zipFiles) {
      if (f.toLowerCase().includes('anki2')) {
        dbFileName = f
        break
      }
    }
  }

  if (!dbFileName) {
    throw new Error('Nenhum banco de dados do Anki foi encontrado no arquivo .apkg.')
  }

  const rawDbBytes = await zip.file(dbFileName)!.async('uint8array')
  // Descompacta Zstandard se necessário
  const dbBytes = decompressIfZstd(rawDbBytes)

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
      for (const d of Object.values(decksJson) as any[]) {
        if (d && d.name && d.name !== 'Default') {
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
    // Join padrão cards + notes
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
          const targetIndex = ord + 1
          q = formatClozeForCard(processedFields[0], targetIndex)
          const extra = processedFields[1]
            ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1">${processedFields[1]}</div>`
            : ''
          a = processedFields[0].replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, '$1') + extra
        } else if (
          processedFields.length >= 4 &&
          (processedFields[1].includes('<img') || processedFields[2].includes('<img'))
        ) {
          // Image Occlusion Enhanced
          const header = processedFields[0]
            ? `<div style="font-weight:700;margin-bottom:8px">${processedFields[0]}</div>`
            : ''
          q = header + processedFields[1] + (processedFields[2] ? processedFields[2] : '')
          a =
            (processedFields[3] ? processedFields[3] : processedFields[1]) +
            (processedFields[4] ? `<div style="margin-top:10px">${processedFields[4]}</div>` : '')
        } else {
          // Carta básica convencional
          q = processedFields[0]
          a = processedFields.slice(1).filter(Boolean).join('<br><br>') || 'Revisão'
        }

        // Filtra cartões de aviso dummy de atualização do Anki
        if (
          q.includes('Atualize para a versão mais recente') ||
          q.includes('Please update to the latest Anki version')
        ) {
          continue
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
    console.warn('Join cards+notes falhou, tentando fallback em notes:', err)
  }

  // Fallback se cards join não retornou cartões
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

          if (
            q.includes('Atualize para a versão mais recente') ||
            q.includes('Please update to the latest Anki version')
          ) {
            continue
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
    } catch (e2) {
      console.error('Fallback notes falhou:', e2)
    }
  }

  db.close()

  if (cards.length === 0) {
    throw new Error(
      'Não foi possível encontrar cartões válidos no arquivo do Anki. Certifique-se de que o baralho exportado contém notas com conteúdo.'
    )
  }

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

    if (
      q.includes('Atualize para a versão mais recente') ||
      q.includes('Please update to the latest Anki version')
    ) {
      continue
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
 * Função unificada chamada pela interface
 */
export async function parseAnkiFile(file: File): Promise<AnkiPackageResult> {
  const name = file.name
  const isApkg = name.toLowerCase().endsWith('.apkg') || name.toLowerCase().endsWith('.colpkg')

  if (isApkg) {
    const buffer = await file.arrayBuffer()
    return parseAnkiApkg(buffer, name)
  }

  const textContent = await file.text()
  return parseAnkiText(textContent, name)
}
