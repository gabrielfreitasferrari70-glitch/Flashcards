import React, { useState, useEffect, useMemo } from 'react'
import type { OcclusionData, OcclusionMask } from '@/services/imageOcclusion'

interface Props {
  data: OcclusionData
  revealed: boolean
  onToggleReveal?: () => void
}

export const ImageOcclusionViewer: React.FC<Props> = ({ data, revealed }) => {
  const [zoomToMask, setZoomToMask] = useState(false)
  const [userZoom, setUserZoom] = useState(1)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [manuallyRevealed, setManuallyRevealed] = useState<Record<string, boolean>>({})
  const [imgError, setImgError] = useState(false)

  // Reseta erro de imagem se a URL mudar
  useEffect(() => {
    setImgError(false)
  }, [data?.imageUrl])

  // Tecla ESC para sair de tela cheia
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  const cleanImageUrl =
    typeof data?.imageUrl === 'string' && data.imageUrl.startsWith('<img')
      ? data.imageUrl.match(/src=["']([^"']+)["']/i)?.[1] || data.imageUrl
      : data?.imageUrl || ''

  // Normaliza máscaras garantindo IDs únicos (caso cartões antigos tenham IDs duplicados)
  const normalizedMasks = useMemo(() => {
    if (!Array.isArray(data?.masks)) return []
    const ids = data.masks.map((m) => m?.id)
    const hasDuplicates = new Set(ids).size !== ids.length
    if (!hasDuplicates) return data.masks

    return data.masks.map((m, idx) => ({
      ...m,
      id: `m_${idx + 1}`,
      __origId: m.id,
    }))
  }, [data?.masks])

  // Identifica com precisão a máscara ativa desta carta
  const activeMask = useMemo(() => {
    if (normalizedMasks.length === 0) return null
    // 1. Procura correspondência exata de ID
    const found = normalizedMasks.find((m) => m.id === data?.activeMaskId)
    if (found) return found
    // 2. Se as máscaras foram reindexadas, procura por número de cloze ou ord
    const clozeNumMatch = typeof data?.activeMaskId === 'string' ? data.activeMaskId.match(/\d+/) : null
    if (clozeNumMatch) {
      const idx = parseInt(clozeNumMatch[0], 10) - 1
      if (normalizedMasks[idx]) return normalizedMasks[idx]
    }
    return normalizedMasks[0]
  }, [normalizedMasks, data?.activeMaskId])

  // Reseta revelações manuais quando trocar de carta ou máscara ativa
  useEffect(() => {
    setManuallyRevealed({})
  }, [data?.activeMaskId, data?.imageUrl])

  if (!data || !cleanImageUrl || !Array.isArray(data.masks) || data.masks.length === 0) {
    return null
  }

  const isHideOne = data.mode === 'hide_one_guess_one'

  const toggleMask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setManuallyRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Cálculo de zoom e ponto focal
  let transformStyle = 'none'
  let transformOrigin = 'center center'
  if (zoomToMask && activeMask && typeof activeMask.x === 'number' && typeof activeMask.y === 'number') {
    const centerX = activeMask.x + (activeMask.width || 0) / 2
    const centerY = activeMask.y + (activeMask.height || 0) / 2
    transformOrigin = `${centerX}% ${centerY}%`
    transformStyle = 'scale(2.2)'
  } else if (userZoom !== 1) {
    transformOrigin = 'center center'
    transformStyle = `scale(${userZoom})`
  }

  // Renderizador comum da imagem com máscaras
  const renderImageCanvas = (fullMode = false) => {
    const maxHeight = fullMode
      ? '88vh'
      : isExpanded
        ? 'min(80vh, 780px)'
        : 'min(55vh, 480px)'

    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight,
          borderRadius: 14,
          overflow: fullMode ? 'auto' : 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
          background: '#0f172a',
          border: '1.5px solid #334155',
        }}
        onClick={(e) => e.stopPropagation()}
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
            <div style={{ padding: '50px 20px', color: '#fca5a5', textAlign: 'center', fontSize: '.88rem' }}>
              ⚠️ Não foi possível carregar a imagem da oclusão.
            </div>
          ) : (
            <img
              src={cleanImageUrl}
              alt={data.imageTitle || 'Oclusão de Imagem'}
              decoding="async"
              onError={() => setImgError(true)}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight,
                width: 'auto',
                objectFit: 'contain',
                userSelect: 'none',
              }}
            />
          )}

          {/* Occlusion Rectangles (estilo clássico Anki com opacidade 100% sólida) */}
          {normalizedMasks.map((mask: OcclusionMask, idx: number) => {
            const isActive = mask.id === activeMask?.id
            if (isHideOne && !isActive) return null

            const isShown = (revealed && isActive) || !!manuallyRevealed[mask.id]

            return (
              <div
                key={mask.id}
                onClick={(e) => toggleMask(mask.id, e)}
                title={
                  isShown
                    ? `${mask.label} (clique para ocultar)`
                    : isActive
                      ? 'Pergunta atual (clique para espiar)'
                      : 'Clique para espiar'
                }
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
                  // 1. REVELADO: TRANSPARENTE para enxergar 100% da anatomia por baixo
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
                  fontSize: 'clamp(0.7rem, 1.3vw, 0.95rem)',
                  textAlign: 'center',
                  userSelect: 'none',
                  boxShadow: isShown
                    ? '0 0 14px rgba(22, 163, 74, 0.5), inset 0 0 8px rgba(22, 163, 74, 0.15)'
                    : isActive
                      ? '0 0 16px rgba(220, 38, 38, 0.85)'
                      : '0 2px 5px rgba(0,0,0,0.3)',
                }}
              >
                {/* Quando revelado: o interior é transparente e a etiqueta fica em badge externo flutuante */}
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
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: 'clamp(0.72rem, 1.2vw, 0.85rem)',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                      zIndex: 25,
                      pointerEvents: 'none',
                      marginTop: mask.y < 14 ? 6 : 0,
                      marginBottom: mask.y < 14 ? 0 : 6,
                    }}
                  >
                    ✓ {mask.label || 'Estrutura'}
                  </div>
                ) : isActive ? (
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '-0.5px' }}>[ ? ]</span>
                ) : (
                  <span style={{ fontSize: '0.8rem', fontWeight: 900 }}>#{idx + 1}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Barra de Controles Superior com Modos de Zoom e Tamanho da Imagem */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '920px',
          marginBottom: 10,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '.86rem', color: '#334155', fontWeight: 800 }}>
          {data.imageTitle || 'Anatomia — Oclusão de Imagem'}
        </span>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Alternância de Modo: Imagem Inteira vs Focar no [ ? ] */}
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 2 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setZoomToMask(false)
                setUserZoom(1)
              }}
              style={{
                border: 'none',
                background: !zoomToMask && userZoom === 1 ? '#fff' : 'transparent',
                color: !zoomToMask && userZoom === 1 ? '#0f172a' : '#64748b',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: !zoomToMask && userZoom === 1 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
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
                setUserZoom(1)
              }}
              style={{
                border: 'none',
                background: zoomToMask ? '#fff' : 'transparent',
                color: zoomToMask ? '#16a34a' : '#64748b',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: zoomToMask ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              🎯 Focar no [ ? ]
            </button>
          </div>

          {/* Controles de Zoom Manual (- / +) */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, padding: '2px 4px', border: '1px solid #cbd5e1' }}>
            <button
              type="button"
              title="Reduzir zoom"
              onClick={(e) => {
                e.stopPropagation()
                setZoomToMask(false)
                setUserZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))
              }}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '3px 7px',
                fontSize: '.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              ➖
            </button>
            <span
              onClick={(e) => {
                e.stopPropagation()
                setZoomToMask(false)
                setUserZoom(1)
              }}
              title="Clique para voltar a 100%"
              style={{
                fontSize: '.72rem',
                fontWeight: 800,
                color: userZoom !== 1 ? '#15803d' : '#475569',
                padding: '0 4px',
                minWidth: '38px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              {Math.round(userZoom * 100)}%
            </span>
            <button
              type="button"
              title="Aumentar zoom"
              onClick={(e) => {
                e.stopPropagation()
                setZoomToMask(false)
                setUserZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))
              }}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '3px 7px',
                fontSize: '.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                color: '#334155',
              }}
            >
              ➕
            </button>
          </div>

          {/* Alternar Tamanho da Imagem: Grande vs Padrão */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded((prev) => !prev)
            }}
            title={isExpanded ? 'Reduzir altura do cartão' : 'Expandir altura máxima da imagem'}
            style={{
              border: '1px solid #cbd5e1',
              background: isExpanded ? '#dcfce7' : '#fff',
              color: isExpanded ? '#15803d' : '#475569',
              padding: '5px 10px',
              borderRadius: 8,
              fontSize: '.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isExpanded ? '↕️ Imagem Grande' : '↕️ Padrão'}
          </button>

          {/* Botão de Tela Cheia Imersiva */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsFullscreen(true)
            }}
            title="Abrir em tela cheia com visualização panorâmica"
            style={{
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
              color: '#166534',
              padding: '5px 10px',
              borderRadius: 8,
              fontSize: '.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ⛶ Tela Cheia
          </button>
        </div>
      </div>

      {/* Renderização normal da Imagem e Oclusões */}
      {renderImageCanvas(false)}

      {/* Banner de Gabarito com botão de alternar quando virado */}
      {revealed && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 18px',
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: '920px',
            boxSizing: 'border-box',
            boxShadow: '0 2px 10px rgba(22, 163, 74, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.4rem' }}>🎯</span>
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
              <strong style={{ fontSize: '1.05rem', color: '#14532d', fontWeight: 900 }}>
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
              fontSize: '.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            👁️ Ocultar / Espiar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: '.74rem', color: '#64748b' }}>
          💡 Dica: Toque no quadradinho a qualquer momento para ver ou cobrir a estrutura. Use ⛶ Tela Cheia ou ➕ para ver em alta definição.
        </span>
      </div>

      {/* Modal Lightbox de Tela Cheia Imersiva */}
      {isFullscreen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            e.stopPropagation()
            setIsFullscreen(false)
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              maxWidth: '1200px',
              marginBottom: 10,
              color: '#fff',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                {data.imageTitle || 'Visualização Ampliada — Oclusão de Imagem'}
              </span>
              <span style={{ fontSize: '.75rem', background: '#334155', padding: '2px 8px', borderRadius: 999, color: '#94a3b8' }}>
                ESC para fechar
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Zoom dentro da tela cheia */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#334155', borderRadius: 8, padding: '2px 6px' }}>
                <button
                  type="button"
                  onClick={() => setUserZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  style={{ border: 'none', background: 'transparent', color: '#fff', padding: '4px 8px', cursor: 'pointer', fontWeight: 800 }}
                >
                  ➖
                </button>
                <span style={{ fontSize: '.78rem', color: '#38bdf8', minWidth: 40, textAlign: 'center', fontWeight: 800 }}>
                  {Math.round(userZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setUserZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  style={{ border: 'none', background: 'transparent', color: '#fff', padding: '4px 8px', cursor: 'pointer', fontWeight: 800 }}
                >
                  ➕
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: '.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ✕ Fechar
              </button>
            </div>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            {renderImageCanvas(true)}
          </div>
        </div>
      )}
    </div>
  )
}
