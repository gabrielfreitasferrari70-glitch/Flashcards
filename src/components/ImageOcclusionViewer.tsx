import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { OcclusionData, OcclusionMask } from '@/services/imageOcclusion'

interface Props {
  data: OcclusionData
  revealed: boolean
  onToggleReveal?: () => void
  cardPrompt?: string
  cardAnswer?: string
}

export const ImageOcclusionViewer = React.memo<Props>(({
  data,
  revealed,
  cardPrompt,
  cardAnswer,
}) => {
  const [zoomToMask, setZoomToMask] = useState(false)
  const [userZoom, setUserZoom] = useState(1)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [manuallyRevealed, setManuallyRevealed] = useState<Record<string, boolean>>({})
  const [imgError, setImgError] = useState(false)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const cleanImageUrl = useMemo(() => {
    let raw = data?.imageUrl || (data as any)?.image || (data as any)?.imageSrc || ''
    if (typeof raw !== 'string') return ''
    raw = raw.trim()
    if (raw.toLowerCase().includes('<img')) {
      const match = raw.match(/src=["']([^"']+)["']/i)
      if (match) raw = match[1]
    }
    return raw.trim()
  }, [data?.imageUrl, (data as any)?.image, (data as any)?.imageSrc])

  const [currentImgSrc, setCurrentImgSrc] = useState(cleanImageUrl)
  const [fallbackAttempt, setFallbackAttempt] = useState(0)

  // Reseta erro de imagem, tentativa de fallback e pan se a URL mudar
  useEffect(() => {
    setCurrentImgSrc(cleanImageUrl)
    setFallbackAttempt(0)
    setImgError(false)
    setPan({ x: 0, y: 0 })
  }, [cleanImageUrl])

  const handleImageError = () => {
    const isLocalMedia = cleanImageUrl.includes('cards-media/')
    if (fallbackAttempt === 0 && isLocalMedia) {
      setFallbackAttempt(1)
      const filename = cleanImageUrl.split('cards-media/').pop()?.split('?')[0] || ''
      // Tier 1 CDN: jsDelivr Global Edge CDN (Cloudflare edge)
      setCurrentImgSrc(`https://cdn.jsdelivr.net/gh/gabrielfreitasferrari70-glitch/Flashcards@main/public/cards-media/${filename}`)
    } else if (fallbackAttempt === 1 && isLocalMedia) {
      setFallbackAttempt(2)
      const filename = cleanImageUrl.split('cards-media/').pop()?.split('?')[0] || ''
      // Tier 2 CDN: GitHub Raw direto
      setCurrentImgSrc(`https://raw.githubusercontent.com/gabrielfreitasferrari70-glitch/Flashcards/main/public/cards-media/${filename}`)
    } else {
      setImgError(true)
    }
  }

  // Tecla ESC para sair de tela cheia
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  // Normaliza máscaras garantindo IDs únicos (caso cartões antigos tenham IDs duplicados)
  const normalizedMasks = useMemo(() => {
    if (!Array.isArray(data?.masks)) return []
    const ids = data.masks.map((m) => m?.id)
    const hasDuplicates = new Set(ids).size !== ids.length
    if (!hasDuplicates) return data.masks

    return data.masks.map((m, idx) => ({
      ...m,
      id: `c_${idx + 1}`,
      __origId: m.id,
    }))
  }, [data?.masks])

  // Identifica com precisão a máscara ativa desta carta
  const activeMask = useMemo(() => {
    if (normalizedMasks.length === 0) return null

    // 1. Tenta identificar o número da carta diretamente do prompt ("Carta 2 de 4") ou resposta ("Estrutura 2")
    const cardMatch =
      cardPrompt?.match(/Carta\s+(\d+)\s+de/i) ||
      cardAnswer?.match(/Estrutura\s+(\d+)/i)

    if (cardMatch) {
      const targetOrd = parseInt(cardMatch[1], 10) - 1
      if (normalizedMasks[targetOrd]) {
        return normalizedMasks[targetOrd]
      }
    }

    // 2. Se data.activeMaskId foi definido e não é o ID genérico 'oi_1'
    if (data?.activeMaskId && data.activeMaskId !== 'oi_1') {
      const exactMatch = normalizedMasks.find((m) => m.id === data.activeMaskId)
      if (exactMatch) return exactMatch

      const clozeNumMatch =
        data.activeMaskId.match(/(?:c_|mask_|ord_)(\d+)/i) ||
        data.activeMaskId.match(/\d+/)
      if (clozeNumMatch) {
        const idx = parseInt(clozeNumMatch[1] || clozeNumMatch[0], 10) - 1
        if (normalizedMasks[idx]) return normalizedMasks[idx]
      }
    }

    // 3. Fallback: primeira máscara
    return normalizedMasks[0]
  }, [normalizedMasks, data?.activeMaskId, cardPrompt, cardAnswer])

  // Reseta revelações manuais quando trocar de carta ou máscara ativa
  useEffect(() => {
    setManuallyRevealed({})
  }, [activeMask?.id, data?.activeMaskId, data?.imageUrl, cardPrompt])

  if (!data || !Array.isArray(data.masks) || data.masks.length === 0) {
    return null
  }

  const isHideOne = data.mode === 'hide_one_guess_one'

  const toggleMask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setManuallyRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Cálculo de zoom e ponto focal com suporte a pan suave
  let transformStyle = 'none'
  let transformOrigin = 'center center'
  if (zoomToMask && activeMask && typeof activeMask.x === 'number' && typeof activeMask.y === 'number') {
    const centerX = activeMask.x + (activeMask.width || 0) / 2
    const centerY = activeMask.y + (activeMask.height || 0) / 2
    transformOrigin = `${centerX}% ${centerY}%`
    transformStyle = `translate(${pan.x}px, ${pan.y}px) scale(2.2)`
  } else if (userZoom !== 1) {
    transformOrigin = 'center center'
    transformStyle = `translate(${pan.x}px, ${pan.y}px) scale(${userZoom})`
  } else if (pan.x !== 0 || pan.y !== 0) {
    transformStyle = `translate(${pan.x}px, ${pan.y}px)`
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (userZoom <= 1 && !zoomToMask) return
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    panStartRef.current = { ...pan }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy })
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (userZoom !== 1 || zoomToMask) {
      setUserZoom(1)
      setZoomToMask(false)
      setPan({ x: 0, y: 0 })
    } else {
      setUserZoom(2.2)
      setZoomToMask(false)
    }
  }

  // Renderizador comum da imagem com máscaras
  const renderImageCanvas = (fullMode = false) => {
    const maxHeight = fullMode
      ? '90vh'
      : isExpanded
        ? 'min(85vh, 850px)'
        : 'min(65vh, 600px)'

    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight,
          borderRadius: 14,
          overflow: fullMode || userZoom > 1 ? 'auto' : 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
          background: '#0f172a',
          border: '1.5px solid #334155',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{
            position: 'relative',
            transform: transformStyle,
            transformOrigin,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
            cursor: isDragging ? 'grabbing' : (userZoom > 1 || zoomToMask) ? 'grab' : 'zoom-in',
          }}
        >
          {!cleanImageUrl ? (
            <div style={{ padding: '50px 20px', color: '#fca5a5', textAlign: 'center', fontSize: '.88rem' }}>
              ⚠️ Imagem da oclusão não informada.
            </div>
          ) : imgError ? (
            <div style={{ padding: '50px 20px', color: '#fca5a5', textAlign: 'center', fontSize: '.88rem' }}>
              <div>⚠️ Não foi possível carregar a imagem da oclusão.</div>
              <button
                type="button"
                onClick={() => {
                  setImgError(false)
                  setFallbackAttempt(0)
                  setCurrentImgSrc(`${cleanImageUrl}?t=${Date.now()}`)
                }}
                style={{
                  marginTop: 10,
                  border: '1px solid #f87171',
                  background: 'rgba(239, 68, 68, 0.25)',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontSize: '.78rem',
                  fontWeight: 700,
                }}
              >
                🔄 Tentar novamente
              </button>
            </div>
          ) : (
            <img
              src={currentImgSrc}
              alt={data.imageTitle || 'Oclusão de Imagem'}
              decoding="async"
              onError={handleImageError}
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
                    ? 'Estrutura revelada (clique para ocultar)'
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
                    ? '2.5px solid #16a34a'
                    : isActive
                      ? '2.5px solid #b91c1c'
                      : '1.5px solid #ca8a04',
                  background: isShown
                    ? 'transparent'
                    : isActive
                      ? '#ef4444'
                      : '#fde047',
                  boxShadow: isShown
                    ? 'none'
                    : isActive
                      ? '0 0 12px rgba(239, 68, 68, 0.7)'
                      : '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
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
                setPan({ x: 0, y: 0 })
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
                setUserZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))
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
                {activeMask?.label && !/^Estrutura\s+\d+$/i.test(activeMask.label.trim())
                  ? activeMask.label
                  : 'Estrutura revelada na imagem'}
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
})
