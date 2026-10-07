import React, { useState, useRef, useEffect } from 'react'
import type { OcclusionMask } from '@/services/imageOcclusion'
import { createCard } from '@/services/medreview'

interface Props {
  decks: Array<{ id: string; title: string }>
  initialDeckId?: string
  onClose: () => void
  onSuccess: () => void
}

type ActiveTool = 'select' | 'rect' | 'ellipse'

const ANKI_COLORS = [
  { name: 'Amarelo Anki', bg: '#ffea79', border: '#1e293b' },
  { name: 'Laranja', bg: '#ffcc80', border: '#e65100' },
  { name: 'Verde', bg: '#c8e6c9', border: '#2e7d32' },
  { name: 'Azul', bg: '#bbdefb', border: '#1565c0' },
  { name: 'Rosa', bg: '#f8bbd0', border: '#c2185b' },
]

export const ImageOcclusionModal: React.FC<Props> = ({
  decks,
  initialDeckId,
  onClose,
  onSuccess,
}) => {
  const [deckId, setDeckId] = useState(initialDeckId || decks[0]?.id || '')
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [masks, setMasks] = useState<OcclusionMask[]>([])
  const [history, setHistory] = useState<OcclusionMask[][]>([])
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('rect')
  const [selectedColor, setSelectedColor] = useState(ANKI_COLORS[0])
  const [zoomLevel, setZoomLevel] = useState(1)

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Dragging selected mask state
  const [isDraggingMask, setIsDraggingMask] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const imgContainerRef = useRef<HTMLDivElement>(null)

  const pushHistory = (newMasks: OcclusionMask[]) => {
    setHistory((prev) => [...prev.slice(-15), masks])
    setMasks(newMasks)
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setMasks(prev)
    setSelectedMaskId(null)
  }

  // Redimensiona e otimiza imagens (evita estourar memória com base64 gigante de fotos de câmera/print)
  const processImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        try {
          const maxDim = 1280
          let w = img.naturalWidth || img.width
          let h = img.naturalHeight || img.height
          if (!w || !h) {
            URL.revokeObjectURL(url)
            reject(new Error('Imagem sem dimensões válidas.'))
            return
          }
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
            URL.revokeObjectURL(url)
            reject(new Error('Falha ao inicializar canvas para imagem.'))
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          URL.revokeObjectURL(url)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          resolve(dataUrl)
        } catch (err) {
          URL.revokeObjectURL(url)
          reject(err)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Formato de imagem não reconhecido ou corrompido.'))
      }
      img.src = url
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMsg('')
    try {
      const optimized = await processImageFile(file)
      setImageUrl(optimized)
      setMasks([])
      setHistory([])
    } catch (err: any) {
      console.error('Erro ao abrir imagem:', err)
      setMsg('Erro ao abrir imagem: ' + (err?.message || 'formato incompatível'))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  // Suporte a colar imagem direto do clipboard (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) {
            setBusy(true)
            try {
              const opt = await processImageFile(file)
              setImageUrl(opt)
              setMasks([])
              setHistory([])
              setMsg('Imagem colada da área de transferência!')
              setTimeout(() => setMsg(''), 2500)
            } catch (err: any) {
              setMsg('Erro ao colar imagem: ' + (err?.message || err))
            } finally {
              setBusy(false)
            }
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!imgContainerRef.current) return { x: 0, y: 0 }
    const rect = imgContainerRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height || rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 }
    }
    const rawX = ((clientX - rect.left) / rect.width) * 100
    const rawY = ((clientY - rect.top) / rect.height) * 100
    if (isNaN(rawX) || isNaN(rawY)) return { x: 0, y: 0 }
    const x = Math.max(0, Math.min(100, Math.round(rawX * 10) / 10))
    const y = Math.max(0, Math.min(100, Math.round(rawY * 10) / 10))
    return { x, y }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageUrl) return
    const coords = getRelativeCoords(e.clientX, e.clientY)

    if (activeTool === 'select' && selectedMaskId) {
      const selected = masks.find((m) => m.id === selectedMaskId)
      if (
        selected &&
        coords.x >= selected.x &&
        coords.x <= selected.x + selected.width &&
        coords.y >= selected.y &&
        coords.y <= selected.y + selected.height
      ) {
        setIsDraggingMask(true)
        setDragOffset({ x: coords.x - selected.x, y: coords.y - selected.y })
        return
      }
    }

    if (activeTool === 'rect' || activeTool === 'ellipse') {
      setIsDrawing(true)
      setStartPos(coords)
      setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 })
    }
  }

  // Captura movimento e soltura do mouse em nível de window para não travar quando o cursor sai da imagem
  useEffect(() => {
    if (!isDrawing && !isDraggingMask) return

    const handleWindowMouseMove = (e: MouseEvent) => {
      const coords = getRelativeCoords(e.clientX, e.clientY)

      if (isDraggingMask && selectedMaskId && dragOffset) {
        setMasks((prev) =>
          prev.map((m) => {
            if (m.id === selectedMaskId) {
              const newX = Math.max(0, Math.min(100 - m.width, coords.x - dragOffset.x))
              const newY = Math.max(0, Math.min(100 - m.height, coords.y - dragOffset.y))
              return { ...m, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 }
            }
            return m
          })
        )
        return
      }

      if (isDrawing && startPos) {
        const x = Math.min(startPos.x, coords.x)
        const y = Math.min(startPos.y, coords.y)
        const w = Math.abs(coords.x - startPos.x)
        const h = Math.abs(coords.y - startPos.y)
        setCurrentRect({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
        })
      }
    }

    const handleWindowMouseUp = () => {
      if (isDraggingMask) {
        setIsDraggingMask(false)
        setDragOffset(null)
      }

      if (isDrawing) {
        setIsDrawing(false)
        if (currentRect && currentRect.w > 1.5 && currentRect.h > 1.5) {
          const newMask: OcclusionMask = {
            id: 'mask_' + Math.random().toString(36).slice(2, 9),
            x: currentRect.x,
            y: currentRect.y,
            width: currentRect.w,
            height: currentRect.h,
            label: `Estrutura ${masks.length + 1}`,
          }
          pushHistory([...masks, newMask])
          setSelectedMaskId(newMask.id)
        }
        setCurrentRect(null)
        setStartPos(null)
      }
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [isDrawing, isDraggingMask, selectedMaskId, dragOffset, startPos, currentRect, masks])

  const updateLabel = (id: string, label: string) => {
    setMasks((prev) => prev.map((m) => (m.id === id ? { ...m, label } : m)))
  }

  const removeMask = (id: string) => {
    pushHistory(masks.filter((m) => m.id !== id))
    if (selectedMaskId === id) setSelectedMaskId(null)
  }

  const duplicateMask = () => {
    if (!selectedMaskId) return
    const target = masks.find((m) => m.id === selectedMaskId)
    if (!target) return
    const newMask: OcclusionMask = {
      ...target,
      id: 'mask_' + Math.random().toString(36).slice(2, 9),
      x: Math.min(90, target.x + 3),
      y: Math.min(90, target.y + 3),
      label: `${target.label} (cópia)`,
    }
    pushHistory([...masks, newMask])
    setSelectedMaskId(newMask.id)
  }

  // Keyboard shortcuts (Delete, Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMaskId) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          removeMask(selectedMaskId)
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMaskId, masks, history])

  const handleSaveAnkiMode = async (mode: 'hide_all_guess_one' | 'hide_one_guess_one') => {
    if (!deckId) {
      setMsg('Escolha a pasta de destino.')
      return
    }
    if (!imageUrl) {
      setMsg('Selecione ou cole uma imagem.')
      return
    }
    if (masks.length === 0) {
      setMsg('Desenhe pelo menos um quadradinho na imagem.')
      return
    }

    setBusy(true)
    setMsg('')
    try {
      const modeLabel = mode === 'hide_all_guess_one' ? 'Ocultar Todos, Adivinhar Um' : 'Ocultar Um, Adivinhar Um'

      // Cria 1 cartão para CADA quadradinho (padrão exato do Anki)
      for (let i = 0; i < masks.length; i++) {
        const mask = masks[i]
        const qText = `Identifique a estrutura no quadradinho destacado [${mask.label || `Item ${i + 1}`}]`
        const aText = mask.label || `Estrutura ${i + 1}`

        await createCard(deckId, {
          q: qText,
          a: aText,
          group: 'Oclusão de Imagem',
          ref: title || 'Anatomia / Histologia',
          clinical: false,
          imageUrl,
          occlusion: {
            imageUrl,
            imageTitle: title || 'Oclusão de Imagem',
            masks,
            activeMaskId: mask.id,
            mode,
          },
          tags: ['🖼️ Oclusão de Imagem', 'Anatomia'],
        } as any)
      }

      onSuccess()
      onClose()
    } catch (e: any) {
      setMsg('Erro ao gerar cartões: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15,23,42,.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#2b2b2b',
          color: '#e2e8f0',
          borderRadius: 14,
          width: '98%',
          maxWidth: '1040px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
          border: '1px solid #444',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Barra Superior estilo Anki: Tipo & Baralho */}
        <header
          style={{
            background: '#1e1e1e',
            borderBottom: '1px solid #3a3a3a',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.78rem', color: '#94a3b8', fontWeight: 700 }}>
              Tipo: <strong style={{ color: '#fff' }}>Oclusão de Imagem</strong>
            </span>
            <span style={{ color: '#555' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '.78rem', color: '#94a3b8', fontWeight: 700 }}>Baralho:</span>
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                style={{
                  background: '#383838',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: '.8rem',
                  outline: 'none',
                }}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da peça (ex: Coração - Faces e Vasos)"
              style={{
                background: '#383838',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: '.8rem',
                minWidth: '220px',
              }}
            />
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                fontSize: '1.2rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Sub-barra de ferramentas rápidas */}
        <div
          style={{
            background: '#252525',
            borderBottom: '1px solid #333',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label
              style={{
                background: '#3b82f6',
                color: '#fff',
                fontSize: '.75rem',
                fontWeight: 700,
                padding: '5px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              📁 Selecionar Imagem
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <span style={{ fontSize: '.75rem', color: '#777' }}>ou cole URL:</span>
            <input
              value={imageUrl.startsWith('data:') ? '' : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              style={{
                background: '#333',
                color: '#ddd',
                border: '1px solid #444',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: '.75rem',
                width: '180px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              style={{
                background: '#333',
                border: '1px solid #444',
                color: history.length ? '#fff' : '#666',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: '.75rem',
                cursor: history.length ? 'pointer' : 'default',
              }}
              title="Desfazer (Ctrl+Z)"
            >
              ↩️ Desfazer
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
              style={{
                background: '#333',
                border: '1px solid #444',
                color: '#fff',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: '.75rem',
                cursor: 'pointer',
              }}
              title="Aproximar Zoom"
            >
              🔍+
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
              style={{
                background: '#333',
                border: '1px solid #444',
                color: '#fff',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: '.75rem',
                cursor: 'pointer',
              }}
              title="Afastar Zoom"
            >
              🔍-
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              style={{
                background: '#333',
                border: '1px solid #444',
                color: '#fff',
                borderRadius: 5,
                padding: '4px 8px',
                fontSize: '.75rem',
                cursor: 'pointer',
              }}
              title="Resetar Zoom"
            >
              ⛶
            </button>
          </div>
        </div>

        {/* Área Central: Barra de Ferramentas Vertical + Canvas */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Barra de Ferramentas Vertical estilo Anki (esquerda) */}
          <aside
            style={{
              width: '48px',
              background: '#222222',
              borderRight: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '10px 0',
              gap: 8,
            }}
          >
            {/* Selecionar */}
            <button
              onClick={() => setActiveTool('select')}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 7,
                border: 'none',
                background: activeTool === 'select' ? '#2563eb' : '#333',
                color: '#fff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem',
              }}
              title="Ferramenta de Seleção (Mover / Ajustar)"
            >
              ↖️
            </button>

            {/* Retângulo (Quadradinho clássico do Anki) */}
            <button
              onClick={() => setActiveTool('rect')}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 7,
                border: 'none',
                background: activeTool === 'rect' ? '#2563eb' : '#333',
                color: '#fff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem',
              }}
              title="Retângulo (Quadradinho de Oclusão)"
            >
              🔲
            </button>

            {/* Duplicar */}
            <button
              onClick={duplicateMask}
              disabled={!selectedMaskId}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 7,
                border: 'none',
                background: selectedMaskId ? '#333' : '#222',
                color: selectedMaskId ? '#fff' : '#555',
                cursor: selectedMaskId ? 'pointer' : 'default',
                display: 'grid',
                placeItems: 'center',
                fontSize: '.9rem',
              }}
              title="Duplicar retângulo selecionado"
            >
              📋
            </button>

            {/* Lixeira */}
            <button
              onClick={() => selectedMaskId && removeMask(selectedMaskId)}
              disabled={!selectedMaskId}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 7,
                border: 'none',
                background: selectedMaskId ? '#7f1d1d' : '#222',
                color: selectedMaskId ? '#fca5a5' : '#555',
                cursor: selectedMaskId ? 'pointer' : 'default',
                display: 'grid',
                placeItems: 'center',
                fontSize: '.9rem',
              }}
              title="Excluir retângulo selecionado (Del)"
            >
              🗑️
            </button>

            <div style={{ width: '28px', height: '1px', background: '#3a3a3a', margin: '4px 0' }} />

            {/* Paleta de Cores estilo Anki */}
            {ANKI_COLORS.map((c) => (
              <button
                key={c.bg}
                onClick={() => setSelectedColor(c)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: c.bg,
                  border: selectedColor.bg === c.bg ? '2.5px solid #fff' : '1px solid #555',
                  cursor: 'pointer',
                }}
                title={c.name}
              />
            ))}
          </aside>

          {/* Canvas Escuro Central com Imagem */}
          <div
            style={{
              flex: 1,
              background: '#1a1a1a',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
              }}
            >
              {imageUrl ? (
                <div
                  ref={imgContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    cursor: activeTool === 'rect' ? 'crosshair' : activeTool === 'select' ? 'default' : 'crosshair',
                    userSelect: 'none',
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="Peça anatômica"
                    draggable={false}
                    onError={() => setMsg('Erro ao renderizar a imagem. Verifique o formato ou tente enviar outro arquivo.')}
                    style={{
                      display: 'block',
                      maxWidth: '820px',
                      maxHeight: '52vh',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Quadradinhos já desenhados (Estilo Anki exato com alças de redimensionamento) */}
                  {masks.map((mask, idx) => {
                    const isSelected = selectedMaskId === mask.id
                    return (
                      <div
                        key={mask.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedMaskId(mask.id)
                        }}
                        style={{
                          position: 'absolute',
                          left: `${mask.x}%`,
                          top: `${mask.y}%`,
                          width: `${mask.width}%`,
                          height: `${mask.height}%`,
                          borderRadius: 2,
                          border: isSelected ? '2px solid #ef4444' : `1.5px solid ${selectedColor.border}`,
                          background: isSelected ? 'rgba(255, 234, 121, 0.95)' : selectedColor.bg,
                          color: '#0f172a',
                          fontWeight: 800,
                          fontSize: 'clamp(0.68rem, 1.2vw, 0.85rem)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxSizing: 'border-box',
                          cursor: isDraggingMask ? 'grabbing' : 'grab',
                          boxShadow: isSelected ? '0 0 10px rgba(239, 68, 68, 0.7)' : '0 2px 5px rgba(0,0,0,0.2)',
                        }}
                      >
                        <span style={{ padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          #{idx + 1}
                        </span>

                        {/* Handles nos 4 cantos se selecionado (estilo Anki) */}
                        {isSelected && (
                          <>
                            <div style={{ position: 'absolute', top: -4, left: -4, width: 8, height: 8, background: '#ef4444', border: '1px solid #fff' }} />
                            <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#ef4444', border: '1px solid #fff' }} />
                            <div style={{ position: 'absolute', bottom: -4, left: -4, width: 8, height: 8, background: '#ef4444', border: '1px solid #fff' }} />
                            <div style={{ position: 'absolute', bottom: -4, right: -4, width: 8, height: 8, background: '#ef4444', border: '1px solid #fff' }} />
                          </>
                        )}
                      </div>
                    )
                  })}

                  {/* Quadradinho sendo desenhado agora */}
                  {currentRect && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${currentRect.x}%`,
                        top: `${currentRect.y}%`,
                        width: `${currentRect.w}%`,
                        height: `${currentRect.h}%`,
                        border: '2px solid #e11d48',
                        background: 'rgba(255, 234, 121, 0.65)',
                        pointerEvents: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              ) : (
                <div
                  style={{
                    border: '2px dashed #444',
                    borderRadius: 14,
                    padding: '60px 40px',
                    textAlign: 'center',
                    color: '#888',
                  }}
                >
                  <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🖼️</div>
                  <strong style={{ display: 'block', color: '#ccc', marginBottom: 6 }}>
                    Nenhuma imagem carregada
                  </strong>
                  <span>Clique em "Selecionar Imagem" ou cole a URL de uma peça anatômica acima.</span>
                </div>
              )}
            </div>

            {/* Painel inferior de gabaritos dos quadradinhos */}
            {masks.length > 0 && (
              <div
                style={{
                  background: '#202020',
                  borderTop: '1px solid #333',
                  padding: '8px 16px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#94a3b8' }}>
                    Rótulos dos Quadradinhos ({masks.length}):
                  </span>
                  {masks.map((mask, idx) => (
                    <div
                      key={mask.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: selectedMaskId === mask.id ? '#383838' : '#2b2b2b',
                        border: selectedMaskId === mask.id ? '1.5px solid #ef4444' : '1px solid #444',
                        borderRadius: 6,
                        padding: '3px 8px',
                      }}
                    >
                      <span style={{ fontSize: '.74rem', fontWeight: 900, color: '#fbbf24' }}>#{idx + 1}</span>
                      <input
                        value={mask.label}
                        onChange={(e) => updateLabel(mask.id, e.target.value)}
                        placeholder="Nome da estrutura..."
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#fff',
                          fontSize: '.78rem',
                          outline: 'none',
                          width: '130px',
                        }}
                      />
                      <button
                        onClick={() => removeMask(mask.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '.75rem',
                          fontWeight: 800,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {msg && (
          <div
            style={{
              padding: '8px 16px',
              background: msg.includes('Erro') ? '#7f1d1d' : '#854d0e',
              color: '#fff',
              fontSize: '.82rem',
              fontWeight: 700,
            }}
          >
            {msg}
          </div>
        )}

        {/* Rodapé com botões fiéis ao Anki */}
        <footer
          style={{
            background: '#1e1e1e',
            borderTop: '1px solid #333',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: '.78rem', color: '#888' }}>
            {masks.length} quadradinho(s) demarcado(s) na imagem
          </span>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{
                background: '#333',
                color: '#ccc',
                border: '1px solid #444',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: '.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>

            {/* Botão Anki: Ocultar Um, Adivinhar Um */}
            <button
              onClick={() => handleSaveAnkiMode('hide_one_guess_one')}
              disabled={busy || masks.length === 0}
              style={{
                background: '#475569',
                color: '#fff',
                border: '1px solid #64748b',
                borderRadius: 8,
                padding: '8px 15px',
                fontSize: '.82rem',
                fontWeight: 800,
                cursor: busy || masks.length === 0 ? 'not-allowed' : 'pointer',
              }}
              title="Gera cartões onde apenas 1 quadradinho é ocultado por vez, mantendo os outros visíveis como referência anatômica"
            >
              {busy ? 'Gerando…' : 'Ocultar Um, Adivinhar Um'}
            </button>

            {/* Botão Anki: Ocultar Todos, Adivinhar Um */}
            <button
              onClick={() => handleSaveAnkiMode('hide_all_guess_one')}
              disabled={busy || masks.length === 0}
              style={{
                background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 18px',
                fontSize: '.82rem',
                fontWeight: 900,
                cursor: busy || masks.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
              }}
              title="Gera cartões onde todos os quadradinhos continuam tapados e você precisa identificar o que está destacado em vermelho"
            >
              {busy ? 'Gerando…' : 'Ocultar Todos, Adivinhar Um'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
