import React, { useState, useRef, useEffect } from 'react'

interface Props {
  src: string
  title?: string
  onClose: () => void
}

export const ImageLightboxModal: React.FC<Props> = ({ src, title, onClose }) => {
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [invert, setInvert] = useState<boolean>(false)

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Tecla ESC para fechar, + e - para zoom
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, Number((z + 0.3).toFixed(2))))
      else if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(0.7, Number((z - 0.3).toFixed(2))))
      else if (e.key === '0') {
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleMouseDown = (e: React.MouseEvent) => {
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom((z) => Math.max(0.6, Math.min(4.5, Number((z + delta).toFixed(2)))))
  }

  const handleDoubleClick = () => {
    if (zoom !== 1) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else {
      setZoom(2.2)
    }
  }

  return (
    <div
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(10, 15, 30, 0.94)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* Barra de Ferramentas Superior */}
      <header
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#f8fafc',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1rem', fontWeight: 800 }}>🔬 Visualizador Médico em Alta Resolução</span>
          {title && (
            <span style={{ fontSize: '.84rem', color: '#94a3b8', borderLeft: '1px solid #334155', paddingLeft: 10 }}>
              {title}
            </span>
          )}
        </div>

        {/* Controles de Zoom e Imagem */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.25).toFixed(2))))}
            style={btnStyle}
            title="Reduzir Zoom (-)"
          >
            ➖
          </button>
          <span style={{ minWidth: 48, textAlign: 'center', fontSize: '.85rem', fontWeight: 800, color: '#38bdf8' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4.5, Number((z + 0.25).toFixed(2))))}
            style={btnStyle}
            title="Aumentar Zoom (+)"
          >
            ➕
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
            style={btnStyle}
            title="Ajustar ao Padrão (0)"
          >
            🔄 100%
          </button>

          <button
            type="button"
            onClick={() => {
              setZoom(2.5)
              setPan({ x: 0, y: 0 })
            }}
            style={btnStyle}
            title="Super Definição 250%"
          >
            🔍 250%
          </button>

          <button
            type="button"
            onClick={() => setInvert((v) => !v)}
            style={{ ...btnStyle, background: invert ? '#38bdf8' : 'rgba(255,255,255,0.1)', color: invert ? '#0f172a' : '#fff' }}
            title="Inverter Cores (Modo Raio-X / Negativo)"
          >
            🌓 Negativo
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              ...btnStyle,
              background: '#ef4444',
              color: '#fff',
              fontWeight: 800,
              marginLeft: 8,
            }}
            title="Fechar (ESC)"
          >
            ✕ Fechar
          </button>
        </div>
      </header>

      {/* Área Central Interativa com Pan e Zoom */}
      <div
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'zoom-in',
          position: 'relative',
        }}
      >
        <img
          src={src}
          alt={title || 'Diagrama Médico'}
          draggable={false}
          style={{
            maxWidth: zoom === 1 ? '92vw' : 'none',
            maxHeight: zoom === 1 ? '85vh' : 'none',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            filter: invert ? 'invert(1) hue-rotate(180deg)' : 'none',
            imageRendering: 'auto',
            willChange: 'transform',
            borderRadius: 8,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Dica de Rodapé */}
      <footer
        style={{
          padding: '8px 20px',
          textAlign: 'center',
          fontSize: '.78rem',
          color: '#94a3b8',
          background: 'rgba(15, 23, 42, 0.7)',
        }}
      >
        💡 Dica médica: Clique e arraste para navegar pelo diagrama • Role a roda do mouse para zoom suave • Clique duplo para alternar 100% / 220%
      </footer>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.15)',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#f8fafc',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: '.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}
