import React from 'react'

/**
 * Normaliza o texto removendo acentos, diacríticos e convertendo para minúsculas.
 * Permite buscar "musculo" e encontrar "Músculo", "cardio" e achar "Cardíaco", etc.
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Destaca visualmente os trechos correspondentes ao termo de busca.
 * Trata caracteres especiais de regex e mantém segurança de renderização.
 */
export function highlightMatch(
  text: string | null | undefined,
  query: string | null | undefined,
): React.ReactNode {
  if (!text) return ''
  if (!query || !query.trim()) return text

  const cleanQuery = query.trim()
  try {
    const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    const parts = text.split(regex)

    if (parts.length === 1) {
      // Se não encontrou correspondência exata de acentuação, tenta via texto normalizado
      const normText = normalizeSearchText(text)
      const normQ = normalizeSearchText(cleanQuery)
      const idx = normText.indexOf(normQ)
      if (idx !== -1 && normQ.length > 0) {
        const before = text.slice(0, idx)
        const match = text.slice(idx, idx + normQ.length)
        const after = text.slice(idx + normQ.length)
        return (
          <>
            {before}
            <mark
              style={{
                background: '#fef08a',
                color: '#854d0e',
                borderRadius: 4,
                padding: '1px 3px',
                fontWeight: 700,
              }}
            >
              {match}
            </mark>
            {after}
          </>
        )
      }
      return text
    }

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark
              key={i}
              style={{
                background: '#fef08a',
                color: '#854d0e',
                borderRadius: 4,
                padding: '1px 3px',
                fontWeight: 700,
              }}
            >
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </>
    )
  } catch {
    return text
  }
}
