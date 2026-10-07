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
            willChange: 'transform',
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
              decoding="async"
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
          {data.masks.map((mask: OcclusionMask, idx: number) => {
            const isActive = mask.id === activeMask?.id
            // No modo Hide One, os outros retângulos não ficam tampados durante a pergunta
            if (isHideOne && !isActive) return null

            const isShown = (revealed && isActive) || !!manuallyRevealed[mask.id]

            return (
              <div
                key={mask.id}
                onClick={(e) => toggleMask(mask.id, e)}
                title={isShown ? `${mask.label} (clique para ocultar)` : isActive ? 'Pergunta atual (clique para espiar)' : 'Clique para espiar'}
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
                  // ESTILO FIEL AO ANKI:
                  // 1. REVELADO: TRANSPARENTE para ver 100% da anatomia por baixo, com contorno verde
                  // 2. ATIVO (pergunta): 100% OPACO VERMELHO (#dc2626) para nada vazar
                  // 3. OUTROS (Hide All): 100% OPACO AMARELO (#ffea79)
                  border: isShown
                    ? '3px solid #16a34a'
                    : isActive
                      ? '3px solid #991b1b'
                      : '2px solid #1e293b',
                  background: isShown
                    ? 'rgba(34, 197, 94, 0.05)'
                    : isActive
                      ? '#dc2626'
                      : '#ffea79',
                  color: isShown ? '#15803d' : isActive ? '#ffffff' : '#0f172a',
                  fontWeight: 900,
                  fontSize: 'clamp(0.68rem, 1.3vw, 0.9rem)',
                  textAlign: 'center',
                  userSelect: 'none',
                  boxShadow: isShown
                    ? '0 0 12px rgba(22, 163, 74, 0.5), inset 0 0 8px rgba(22, 163, 74, 0.15)'
                    : isActive
                      ? '0 0 14px rgba(220, 38, 38, 0.85)'
                      : '0 2px 5px rgba(0,0,0,0.3)',
                }}
              >
                {/* Quando revelado: o interior é transparente e a etiqueta fica em um badge externo para não cobrir a peça */}
                {isShown ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: mask.y < 14 ? '100%' : 'auto',
                      bottom: mask.y < 14 ? 'auto' : '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#15803d',
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: 5,
                      fontSize: 'clamp(0.72rem, 1.2vw, 0.82rem)',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 3px 8px rgba(0,0,0,0.35)',
                      zIndex: 25,
                      pointerEvents: 'none',
                      marginTop: mask.y < 14 ? 5 : 0,
                      marginBottom: mask.y < 14 ? 0 : 5,
                    }}
                  >
                    ✓ {mask.label || 'Estrutura'}
                  </div>
                ) : isActive ? (
                  <span style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.5px' }}>[ ? ]</span>
                ) : (
                  <span style={{ fontSize: '0.78rem', fontWeight: 900 }}>#{idx + 1}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Banner de Gabarito com botão de alternar quando virado */}
      {revealed && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 16px',
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: '680px',
            boxSizing: 'border-box',
            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.3rem' }}>🎯</span>
            <div>
              <span
                style={{
                  fontSize: '.72rem',
                  color: '#15803d',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'block',
                }}
              >
                Gabarito Anatômico
              </span>
              <strong style={{ fontSize: '1rem', color: '#14532d', fontWeight: 900 }}>
                {activeMask?.label || 'Estrutura Identificada'}
              </strong>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => toggleMask(activeMask?.id || '', e)}
            style={{
              background: '#dcfce7',
              border: '1px solid #86efac',
              color: '#166534',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: '.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            👁️ Ocultar / Espiar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: '.74rem', color: '#64748b' }}>
          💡 Dica: Toque no quadradinho a qualquer momento para alternar entre ver a anatomia ou cobrir novamente.
        </span>
      </div>
    </div>
  )
}
