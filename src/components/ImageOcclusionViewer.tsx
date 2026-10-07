import React, { useState } from 'react'
import type { OcclusionData, OcclusionMask } from '@/services/imageOcclusion'

interface Props {
  data: OcclusionData
  revealed: boolean
  onToggleReveal?: () => void
}

export const ImageOcclusionViewer: React.FC<Props> = ({ data, revealed }) => {
  const [zoomToMask, setZoomToMask] = useState(false)
  const [manuallyRevealed, setManuallyRevealed] = useState<Record<string, boolean>>({})
  const [imgError, setImgError] = useState(false)

  if (!data || !data.imageUrl || !Array.isArray(data.masks) || data.masks.length === 0) {
    return null
  }

  const activeMask = data.masks.find((m) => m && m.id === data.activeMaskId) || data.masks[0]
  const isHideOne = data.mode === 'hide_one_guess_one'

  const toggleMask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setManuallyRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Calculate zoom transform centering on activeMask
  let transformStyle = 'none'
  let transformOrigin = 'center center'
  if (zoomToMask && activeMask && typeof activeMask.x === 'number' && typeof activeMask.y === 'number') {
    const centerX = activeMask.x + (activeMask.width || 0) / 2
    const centerY = activeMask.y + (activeMask.height || 0) / 2
    transformOrigin = `${centerX}% ${centerY}%`
    transformStyle = 'scale(2.2)'
  }


  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* Top control bar: Image Title & Zoom Switch (Quadradinho vs Imagem Inteira) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '680px',
          marginBottom: 8,
          gap: 10,
        }}
      >
        <span style={{ fontSize: '.84rem', color: '#475569', fontWeight: 700 }}>
          {data.imageTitle || 'Anatomia — Oclusão de Imagem'}
        </span>

        {/* Botão de alternar visualização: Em volta do quadradinho vs Imagem inteira */}
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 2 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setZoomToMask(false)
            }}
            style={{
              border: 'none',
              background: !zoomToMask ? '#fff' : 'transparent',
              color: !zoomToMask ? '#0f172a' : '#64748b',
              padding: '4px 9px',
              borderRadius: 6,
              fontSize: '.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: !zoomToMask ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all .15s ease',
            }}
          >
            🖼️ Imagem inteira
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setZoomToMask(true)
            }}
            style={{
              border: 'none',
              background: zoomToMask ? '#fff' : 'transparent',
              color: zoomToMask ? '#16a34a' : '#64748b',
              padding: '4px 9px',
              borderRadius: 6,
              fontSize: '.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: zoomToMask ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all .15s ease',
            }}
          >
            🔍 Focar no quadradinho
          </button>
        </div>
      </div>

      {/* Canvas container com moldura estilo Anki */}
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight: '480px',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          background: '#1e293b',
          border: '1px solid #334155',
        }}
      >
        <div
          style={{
            position: 'relative',
            transform: transformStyle,
            transformOrigin,
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {imgError ? (
            <div style={{ padding: '40px 20px', color: '#fca5a5', textAlign: 'center', fontSize: '.85rem' }}>
              ⚠️ Não foi possível carregar a imagem da oclusão.
            </div>
          ) : (
            <img
              src={data.imageUrl}
              alt={data.imageTitle || 'Oclusão de Imagem'}
              onError={() => setImgError(true)}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '460px',
                objectFit: 'contain',
                userSelect: 'none',
              }}
            />
          )}

          {/* Occlusion Rectangles (estilo clássico do Anki) */}
          {data.masks.map((mask: OcclusionMask) => {
            const isActive = mask.id === activeMask?.id
            // No modo Hide One, os outros retângulos não ficam tampados durante a pergunta
            if (isHideOne && !isActive) return null

            const isShown = (revealed && isActive) || !!manuallyRevealed[mask.id]

            return (
              <div
                key={mask.id}
                onClick={(e) => toggleMask(mask.id, e)}
                title={isShown ? mask.label : isActive ? 'Pergunta atual (clique para revelar)' : 'Clique para espiar'}
                style={{
                  position: 'absolute',
                  left: `${mask.x}%`,
                  top: `${mask.y}%`,
                  width: `${mask.width}%`,
                  height: `${mask.height}%`,
                  borderRadius: 3,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  // Estilo fiel ao Anki:
                  // Ativo: destaque com borda vermelha/laranja pulsante (#e11d48)
                  // Inativo: amarelo clássico (#ffea79) com borda preta
                  // Revelado: verde suave com texto legível
                  border: isShown
                    ? '2px solid #16a34a'
                    : isActive
                      ? '3px solid #dc2626'
                      : '1.5px solid #1e293b',
                  background: isShown
                    ? 'rgba(240, 253, 244, 0.96)'
                    : isActive
                      ? 'rgba(239, 68, 68, 0.9)'
                      : 'rgba(255, 234, 121, 0.94)',
                  color: isShown ? '#14532d' : isActive ? '#ffffff' : '#0f172a',
                  fontWeight: 900,
                  fontSize: 'clamp(0.68rem, 1.3vw, 0.9rem)',
                  padding: '2px 4px',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  userSelect: 'none',
                  boxShadow: isActive && !isShown ? '0 0 12px rgba(220, 38, 38, 0.7)' : '0 2px 4px rgba(0,0,0,0.15)',
                }}
              >
                {isShown ? (
                  <span>{mask.label || '✓'}</span>
                ) : isActive ? (
                  <span style={{ fontSize: '1rem', letterSpacing: '-1px' }}>[ ? ]</span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: '.74rem', color: '#64748b' }}>
          💡 Dica: Toque no quadradinho vermelho para espiar a resposta a qualquer momento.
        </span>
      </div>
    </div>
  )
}
