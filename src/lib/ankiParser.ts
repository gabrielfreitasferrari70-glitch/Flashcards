/**
 * MedReview Anki Universal Parser (Compatibilidade com Anki Moderno 2.1.50+, 23+, 24+)
 * 1. Descompacta pacotes .apkg com JSZip.
 * 2. Suporta descompressão de bancos Zstandard (Zstd) em collection.anki21b usando fzstd.
 * 3. Ignora os cartões dummy ("Atualize para a versão mais recente do Anki...") inseridos pelo Anki moderno em collection.anki2.
 * 4. Decodifica mapa de mídia em ambos os formatos: JSON e Protobuf do Anki moderno, convertendo fotos em Base64 Data URLs.
 * 5. Suporte nativo a cartões Image Occlusion do Anki 23/24 (image-occlusion:rect) com renderização visual interativa completa.
 * 6. Abre a base de dados real com sql.js e extrai 100% dos cartões com suas imagens e formatação.
 */

import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { decompress } from 'fzstd'

export interface ParsedAnkiCard {
  q: string
  a: string
  tags?: string[]
  isCloze?: boolean
  occlusion?: any
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
    case 'bmp':
      return 'image/bmp'
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
 * Decodifica o arquivo de mídia binário do Anki moderno (Anki 2.1.50+, Anki 23+, Anki 24+)
 * No Anki moderno, o catálogo de mídia é serializado em Protocol Buffers (Protobuf).
 * Cada mensagem de nível 1 contém sub-campo 1 com o nome do arquivo original ("paste-xxx.png").
 */
function parseMediaProtobuf(bytes: Uint8Array): string[] {
  const entries: string[] = []
  let pos = 0
  const len = bytes.length

  function readVarint(): number {
    let result = 0
    let shift = 0
    while (pos < len) {
      const b = bytes[pos++]
      result |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    return result
  }

  while (pos < len) {
    const tag = readVarint()
    const wireType = tag & 7
    const fieldNum = tag >> 3

    if (wireType === 2) {
      const fieldLen = readVarint()
      const end = pos + fieldLen

      if (fieldNum === 1) {
        let name = ''
        while (pos < end) {
          const subTag = readVarint()
          const subWire = subTag & 7
          const subNum = subTag >> 3

          if (subWire === 2) {
            const subLen = readVarint()
            if (subNum === 1) {
              name = new TextDecoder('utf-8').decode(bytes.subarray(pos, pos + subLen))
            }
            pos += subLen
          } else if (subWire === 0) {
            readVarint()
          } else if (subWire === 1) {
            pos += 8
          } else if (subWire === 5) {
            pos += 4
          } else {
            pos = end
          }
        }
        if (name) entries.push(name)
      } else {
        pos = end
      }
    } else if (wireType === 0) {
      readVarint()
    } else if (wireType === 1) {
      pos += 8
    } else if (wireType === 5) {
      pos += 4
    } else {
      break
    }
  }

  return entries
}

/**
 * Otimiza data URLs no navegador para carregar instantaneamente e não pesar no Supabase
 */
async function optimizeDataUrl(dataUrl: string, maxDim = 1200, quality = 0.78): Promise<string> {
  if (!dataUrl || dataUrl.length < 80000) return dataUrl
  if (typeof window === 'undefined' || typeof document === 'undefined') return dataUrl
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          } else {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const optimized = canvas.toDataURL('image/jpeg', quality)
        resolve(optimized.length < dataUrl.length ? optimized : dataUrl)
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function registerMedia(map: Map<string, string>, name: string, dataUrl: string) {
  if (!name || !dataUrl) return
  const clean = name.trim()
  map.set(clean, dataUrl)
  map.set(clean.toLowerCase(), dataUrl)
  try {
    const dec = decodeURIComponent(clean)
    map.set(dec, dataUrl)
    map.set(dec.toLowerCase(), dataUrl)
  } catch {
    /* ignore */
  }
  try {
    const enc = encodeURIComponent(clean)
    map.set(enc, dataUrl)
    map.set(enc.toLowerCase(), dataUrl)
  } catch {
    /* ignore */
  }
  const base = clean.split('/').pop()?.split('\\').pop() || clean
  map.set(base, dataUrl)
  map.set(base.toLowerCase(), dataUrl)
}

/**
 * Limpa HTML mantendo quebras de linha e estrutura legível, removendo artefatos internos do Anki
 */
export function cleanAnkiHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/(?:\{\{c\d+::)?image-occlusion:[^}\s<]+(?:\}\})?/gi, '')
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
}

/**
 * Substitui tags de imagem (<img src="paste-123.png">) ou referências brutas pelos Data URLs em Base64
 */
function injectMediaIntoHtml(html: string, mediaMap: Map<string, string>): string {
  if (!html) return ''
  // 1. Substitui tags <img src="...">
  let processed = html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
    const raw = src.trim()
    const base = raw.split('/').pop()?.split('\\').pop() || raw
    let dataUrl =
      mediaMap.get(raw) ||
      mediaMap.get(base) ||
      mediaMap.get(raw.toLowerCase()) ||
      mediaMap.get(base.toLowerCase())

    if (!dataUrl) {
      try {
        const decRaw = decodeURIComponent(raw)
        const decBase = decodeURIComponent(base)
        dataUrl =
          mediaMap.get(decRaw) ||
          mediaMap.get(decBase) ||
          mediaMap.get(decRaw.toLowerCase()) ||
          mediaMap.get(decBase.toLowerCase())
      } catch {
        /* ignore */
      }
    }

    if (dataUrl) {
      return `<img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:10px;margin:10px 0;display:block;box-shadow:0 4px 14px rgba(0,0,0,0.1)" alt="Imagem Anki" />`
    }
    return match
  })

  // 2. Se o campo for puramente o nome de um arquivo de imagem sem tag <img>
  const trimmed = html.trim()
  const baseTrimmed = trimmed.split('/').pop()?.split('\\').pop() || trimmed
  if (!processed.includes('<img')) {
    const directUrl =
      mediaMap.get(trimmed) ||
      mediaMap.get(baseTrimmed) ||
      mediaMap.get(trimmed.toLowerCase()) ||
      mediaMap.get(baseTrimmed.toLowerCase())
    if (directUrl) {
      processed = `<img src="${directUrl}" style="max-width:100%;height:auto;border-radius:10px;margin:10px 0;display:block;box-shadow:0 4px 14px rgba(0,0,0,0.1)" alt="Imagem Anki" />`
    }
  }

  return processed
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
 * Processa pacotes .apkg com suporte total a Anki moderno (collection.anki21b / Zstd e Image Occlusion nativo)
 */
export async function parseAnkiApkg(fileBuffer: ArrayBuffer, fileName: string): Promise<AnkiPackageResult> {
  const zip = await JSZip.loadAsync(fileBuffer)

  // 1. Extrai mapeamento de mídia com suporte a Zstandard, JSON e Protobuf
  const mediaMap = new Map<string, string>()

  // Procura o arquivo de mapeamento de mídia
  let mediaEntry: JSZip.JSZipObject | null = zip.file('media.zst') || zip.file('media')
  if (!mediaEntry) {
    for (const key of Object.keys(zip.files)) {
      const lower = key.toLowerCase()
      if (lower === 'media' || lower.endsWith('/media') || lower === 'media.zst' || lower.endsWith('/media.zst')) {
        mediaEntry = zip.file(key)
        break
      }
    }
  }

  if (mediaEntry) {
    try {
      const raw = await mediaEntry.async('uint8array')
      const decompressed = decompressIfZstd(raw)

      const mediaMapping = new Map<string, string>()

      // Tentativa 1: Formato JSON (Anki legado / versões anteriores)
      try {
        const mediaJsonText = new TextDecoder('utf-8').decode(decompressed)
        if (mediaJsonText.trim().startsWith('{')) {
          const mediaJson = JSON.parse(mediaJsonText) as Record<string, string>
          for (const [k, v] of Object.entries(mediaJson)) {
            mediaMapping.set(k, v)
          }
        }
      } catch {
        /* ignora se não for JSON */
      }

      // Tentativa 2: Formato Protobuf (Anki moderno 2.1.50+, 23+, 24+)
      if (mediaMapping.size === 0) {
        try {
          const protoNames = parseMediaProtobuf(decompressed)
          protoNames.forEach((realName, idx) => {
            mediaMapping.set(String(idx), realName)
          })
        } catch (protoErr) {
          console.warn('Erro ao ler Protobuf de mídia:', protoErr)
        }
      }

      // Tentativa 3: Fallback Regex buscando nomes de arquivo no buffer
      if (mediaMapping.size === 0) {
        try {
          const latinText = new TextDecoder('latin1').decode(decompressed)
          const matches = [...latinText.matchAll(/([a-zA-Z0-9_\-.]+\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a|mp4))/gi)]
          matches.forEach((m, idx) => {
            const cleanName = m[1].replace(/^[^a-zA-Z0-9]+/, '')
            if (cleanName) mediaMapping.set(String(idx), cleanName)
          })
        } catch {
          /* ignore */
        }
      }

      for (const [zipKey, realName] of mediaMapping.entries()) {
        let entry = zip.file(zipKey) || zip.file(String(zipKey))
        if (!entry) {
          for (const k of Object.keys(zip.files)) {
            const baseK = k.split('/').pop() || ''
            if (baseK === String(zipKey) || k === String(zipKey)) {
              entry = zip.file(k)
              break
            }
          }
        }
        if (entry) {
          let rawBytes = await entry.async('uint8array')
          rawBytes = decompressIfZstd(rawBytes)
          const mime = getMimeType(realName)
          let dataUrl = `data:${mime};base64,${uint8ArrayToBase64(rawBytes)}`
          dataUrl = await optimizeDataUrl(dataUrl)
          registerMedia(mediaMap, realName, dataUrl)
          registerMedia(mediaMap, zipKey, dataUrl)
        }
      }
    } catch (e) {
      console.warn('Erro ao decodificar mapeamento de mídia do Anki:', e)
    }
  }

  // Fallback e reforço: também indexa qualquer imagem armazenada diretamente no zip
  for (const [key, zipObj] of Object.entries(zip.files)) {
    if (zipObj.dir) continue
    const baseName = key.split('/').pop() || ''
    const ext = baseName.split('.').pop()?.toLowerCase() || ''
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
      if (!mediaMap.has(baseName) && !mediaMap.has(baseName.toLowerCase())) {
        try {
          let rawBytes = await zipObj.async('uint8array')
          rawBytes = decompressIfZstd(rawBytes)
          const mime = getMimeType(baseName)
          let dataUrl = `data:${mime};base64,${uint8ArrayToBase64(rawBytes)}`
          dataUrl = await optimizeDataUrl(dataUrl)
          registerMedia(mediaMap, baseName, dataUrl)
        } catch (err) {
          console.warn('Erro ao carregar arquivo de imagem direto do zip:', baseName, err)
        }
      }
    }
  }

  // 2. Localiza a base SQLite com a prioridade correta:
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

        // Detecta Oclusão de Imagem Nativa do Anki (Anki 23.10+, Anki 24+)
        const hasNativeOcclusion = fields.some((f) => f.includes('image-occlusion:'))

        if (hasNativeOcclusion) {
          const occlusionRaw = fields.find((f) => f.includes('image-occlusion:')) || ''

          // 1. Identifica a imagem
          let imageUrl = ''
          for (const f of processedFields) {
            const imgMatch = f.match(/<img[^>]+src=["']([^"']+)["']/i)
            if (imgMatch && imgMatch[1]) {
              imageUrl = imgMatch[1]
              break
            }
          }
          if (!imageUrl) {
            for (const f of fields) {
              const clean = f.trim()
              const base = clean.split('/').pop()?.split('\\').pop() || clean
              const found =
                mediaMap.get(clean) ||
                mediaMap.get(base) ||
                mediaMap.get(clean.toLowerCase()) ||
                mediaMap.get(base.toLowerCase())
              if (found) {
                imageUrl = found
                break
              }
            }
          }
          if (!imageUrl && mediaMap.size > 0) {
            imageUrl = Array.from(mediaMap.values())[0]
          }

          // 2. Identifica título/header e anotações extras
          const textFields = fields
            .filter((f) => !f.includes('image-occlusion:') && !f.includes('<img'))
            .map((f) => cleanAnkiHtml(f))
            .filter(Boolean)
          const header = textFields[0] || ''
          const remarks = textFields.slice(1).join(' • ') || ''

          // 3. Faz parse de todas as máscaras com suas coordenadas exatas
          const maskMatches = [
            ...occlusionRaw.matchAll(/(?:\{\{c(\d+)::)?image-occlusion:(\w+):([^}\n<"]+)(?:\}\})?/g),
          ]
          const masks: Array<{ id: string; x: number; y: number; width: number; height: number; label: string }> = []
          let maskIdx = 0

          for (const m of maskMatches) {
            maskIdx++
            const clozeNum = m[1] ? parseInt(m[1], 10) : maskIdx
            const params = m[3]

            const leftM = params.match(/left=([0-9.]+)/)
            const topM = params.match(/top=([0-9.]+)/)
            const widthM = params.match(/width=([0-9.]+)/)
            const heightM = params.match(/height=([0-9.]+)/)

            if (leftM && topM && widthM && heightM) {
              const x = parseFloat(leftM[1]) * 100
              const y = parseFloat(topM[1]) * 100
              const width = parseFloat(widthM[1]) * 100
              const height = parseFloat(heightM[1]) * 100
              const id = `c_${clozeNum}`

              masks.push({
                id,
                x: Math.max(0, Math.min(100, x)),
                y: Math.max(0, Math.min(100, y)),
                width: Math.max(0.5, Math.min(100, width)),
                height: Math.max(0.5, Math.min(100, height)),
                label: `Estrutura ${clozeNum}`,
              })
            }
          }

          const targetCloze = ord + 1
          const activeMask =
            masks.find((m) => m.id === `c_${targetCloze}`) ||
            masks[ord] ||
            masks[0]
          const activeMaskId = activeMask ? activeMask.id : `c_${targetCloze}`

          const occlusionData = {
            imageUrl,
            imageTitle: header || 'Oclusão Anatômica',
            masks:
              masks.length > 0
                ? masks
                : [{ id: 'm_0', x: 20, y: 20, width: 60, height: 20, label: 'Estrutura 1' }],
            activeMaskId,
            mode: 'hide_all_guess_one',
          }

          const qTitle = header ? `<strong>${header}</strong>` : 'Identifique a estrutura oculta em destaque na imagem'
          const q = `<div class="anki-io-prompt" style="font-size:1.05rem;font-weight:700;color:#0f172a;margin-bottom:6px">${qTitle}</div><div style="font-size:.82rem;color:#64748b;margin-bottom:10px">Carta ${ord + 1} de ${masks.length || 1} • Oclusão de Imagem</div>`

          const aLabel = activeMask?.label || `Estrutura ${ord + 1}`
          const remarksHtml = remarks
            ? `<div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:.88rem;color:#334155">${remarks}</div>`
            : ''
          const a = `<div style="font-size:1.05rem;font-weight:700;color:#16a34a;margin-bottom:6px">✓ Resposta: ${aLabel} revelada na imagem</div>${remarksHtml}`

          const tags = tagsRaw.trim().split(/\s+/).filter(Boolean)
          if (!tags.includes('🖼️ Oclusão de Imagem')) tags.push('🖼️ Oclusão de Imagem')

          cards.push({
            q,
            a,
            tags: tags.length ? tags : undefined,
            isCloze: false,
            occlusion: occlusionData,
          })
          continue
        }

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
          // Image Occlusion Enhanced (Add-on)
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
          const fields = fldsRaw.split('\x1f')
          const processedFields = fields.map((f) => injectMediaIntoHtml(f, mediaMap))

          const hasNativeOcclusion = fields.some((f) => f.includes('image-occlusion:'))
          if (hasNativeOcclusion) {
            let imageUrl = ''
            for (const f of processedFields) {
              const imgMatch = f.match(/<img[^>]+src=["']([^"']+)["']/i)
              if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1]
                break
              }
            }
            if (!imageUrl && mediaMap.size > 0) imageUrl = Array.from(mediaMap.values())[0]

            cards.push({
              q: '<div style="font-weight:700">Identifique a estrutura em destaque</div>',
              a: '<div style="font-weight:700;color:#16a34a">✓ Estrutura identificada</div>',
              tags: ['🖼️ Oclusão de Imagem'],
              isCloze: false,
              occlusion: {
                imageUrl,
                imageTitle: 'Oclusão Anatômica',
                masks: [{ id: 'm_0', x: 20, y: 20, width: 60, height: 20, label: 'Estrutura 1' }],
                activeMaskId: 'm_0',
                mode: 'hide_all_guess_one',
              },
            })
            continue
          }

          const isCloze = /\{\{c\d+::.*?\}\}/.test(processedFields[0])
          const q = processedFields[0] || ''
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
