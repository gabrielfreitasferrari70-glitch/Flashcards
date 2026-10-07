import React, { useState, useRef } from 'react'
import type { OcclusionMask } from '@/services/imageOcclusion'
import { createCard } from '@/services/medreview'

interface Props {
  decks: Array<{ id: string; title: string }>
  initialDeckId?: string
  onClose: () => void
  onSuccess: () => void
}

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
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const imgContainerRef = useRef<HTMLDivElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgContainerRef.current) return { x: 0, y: 0 }
    const rect = imgContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    return { x, y }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageUrl) return
    const coords = getRelativeCoords(e)
    setIsDrawing(true)
    setStartPos(coords)
    setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos) return
    const coords = getRelativeCoords(e)
    const x = Math.min(startPos.x, coords.x)
    const y = Math.min(startPos.y, coords.y)
    const w = Math.abs(coords.x - startPos.x)
    const h = Math.abs(coords.y - startPos.y)
    setCurrentRect({ x, y, w, h })
  }

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect) return
    setIsDrawing(false)
    if (currentRect.w > 3 && currentRect.h > 3) {
      const newMask: OcclusionMask = {
        id: 'mask_' + Math.random().toString(36).slice(2, 9),
        x: Math.round(currentRect.x * 10) / 10,
        y: Math.round(currentRect.y * 10) / 10,
        width: Math.round(currentRect.w * 10) / 10,
        height: Math.round(currentRect.h * 10) / 10,
        label: `Estrutura ${masks.length + 1}`,
      }
      setMasks((prev) => [...prev, newMask])
      setSelectedMaskId(newMask.id)
    }
    setCurrentRect(null)
    setStartPos(null)
  }

  const updateLabel = (id: string, label: string) => {
    setMasks((prev) => prev.map((m) => (m.id === id ? { ...m, label } : m)))
  }

  const removeMask = (id: string) => {
    setMasks((prev) => prev.filter((m) => m.id !== id))
    if (selectedMaskId === id) setSelectedMaskId(null)
  }

  const handleSave = async (generateOnePerMask: boolean) => {
    if (!deckId) {
      setMsg('Escolha uma pasta de destino.')
      return
    }
    if (!imageUrl) {
      setMsg('Selecione uma imagem.')
      return
    }
    if (masks.length === 0) {
      setMsg('Desenhe pelo menos uma tarja na imagem.')
      return
    }

    setBusy(true)
    setMsg('')
    try {
      if (generateOnePerMask) {
        // Estilo Anki: 1 cartão para CADA tarja (Oculta todas, testa uma)
        for (let i = 0; i < masks.length; i++) {
          const mask = masks[i]
          const qText = `Identifique a estrutura destacada em amarelo [${mask.label || `Item ${i + 1}`}]`
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
              mode: 'hide_all_guess_one',
            },
            tags: ['🖼️ Oclusão de Imagem', 'Anatomia'],
          } as any)
        }
      } else {
        // 1 cartão único com todas as tarjas
        await createCard(deckId, {
          q: title || 'Identifique as estruturas marcadas',
          a: masks.map((m, idx) => `${idx + 1}. ${m.label}`).join('\n'),
          group: 'Oclusão de Imagem',
          ref: title || 'Anatomia / Histologia',
          clinical: false,
          imageUrl,
          occlusion: {
            imageUrl,
            imageTitle: title || 'Oclusão de Imagem',
            masks,
            mode: 'hide_all_guess_one',
          },
          tags: ['🖼️ Oclusão de Imagem'],
        } as any)
      }

      onSuccess()
      onClose()
    } catch (e: any) {
      setMsg('Erro ao salvar cartões: ' + (e?.message || e))
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
        background: 'rgba(15,23,42,.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '95%',
          maxWidth: '860px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
        }}
      >
        <header
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🖼️</span> Criador de Oclusão de Imagem (Image Occlusion)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#64748b' }}>
              Tampe as estruturas em lâminas de histologia ou peças anatômicas.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              color: '#64748b',
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Pasta de destino
              </label>
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  background: '#fff',
                }}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Título / Peça anatômica
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Coração — Face Esternocostal"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Imagem da peça
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{
                  padding: '8px',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: 10,
                  flex: 1,
                  background: '#f8fafc',
                }}
              />
              <span style={{ alignSelf: 'center', color: '#94a3b8', fontSize: '.8rem' }}>ou cole URL:</span>
              <input
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                }}
              />
            </div>
          </div>

          {imageUrl ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#15803d' }}>
                  ✏️ Clique e arraste na imagem para desenhar as tarjas:
                </span>
                <span style={{ fontSize: '.78rem', color: '#64748b' }}>
                  {masks.length} tarja(s) criada(s)
                </span>
              </div>

              {/* Canvas area */}
              <div
                ref={imgContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  maxWidth: '100%',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#0f172a',
                  cursor: 'crosshair',
                  userSelect: 'none',
                }}
              >
                <img
                  src={imageUrl}
                  alt="Pré-visualização"
                  draggable={false}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: '380px',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                />

                {/* Drawn masks */}
                {masks.map((mask, idx) => (
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
                      borderRadius: 4,
                      border: selectedMaskId === mask.id ? '2.5px solid #f59e0b' : '2px solid #ef4444',
                      background: selectedMaskId === mask.id ? 'rgba(245, 158, 11, 0.65)' : 'rgba(239, 68, 68, 0.55)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                    }}
                  >
                    #{idx + 1}
                  </div>
                ))}

                {/* Drawing rect */}
                {currentRect && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${currentRect.x}%`,
                      top: `${currentRect.y}%`,
                      width: `${currentRect.w}%`,
                      height: `${currentRect.h}%`,
                      border: '2px dashed #3b82f6',
                      background: 'rgba(59, 130, 246, 0.35)',
                      pointerEvents: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>

              {/* Mask list with label inputs */}
              {masks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '.85rem', color: '#334155' }}>
                    Respostas de cada tarja (Gabaritos):
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {masks.map((mask, idx) => (
                      <div
                        key={mask.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: selectedMaskId === mask.id ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                          background: selectedMaskId === mask.id ? '#fffbeb' : '#f8fafc',
                        }}
                      >
                        <span style={{ fontWeight: 800, color: '#64748b', fontSize: '.8rem' }}>#{idx + 1}</span>
                        <input
                          value={mask.label}
                          onChange={(e) => updateLabel(mask.id, e.target.value)}
                          placeholder="Nome da estrutura..."
                          style={{
                            flex: 1,
                            padding: '4px 6px',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            fontSize: '.82rem',
                          }}
                        />
                        <button
                          onClick={() => removeMask(mask.id)}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                          title="Excluir tarja"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: 16,
                padding: '40px 20px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
              }}
            >
              Envie ou cole a imagem acima para começar a marcar as estruturas.
            </div>
          )}

          {msg && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 10,
                background: msg.includes('Erro') ? '#fee2e2' : '#fef3c7',
                color: msg.includes('Erro') ? '#991b1b' : '#92400e',
                fontSize: '.85rem',
                fontWeight: 600,
              }}
            >
              {msg}
            </div>
          )}
        </div>

        <footer
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: '#f8fafc',
          }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#475569',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={busy || masks.length === 0}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg,#16a34a,#22c55e)',
              color: '#fff',
              fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(22,163,74,.2)',
            }}
          >
            {busy ? 'Criando…' : `⚡ Criar ${masks.length} Cartões (1 por tarja — Anki)`}
          </button>
        </footer>
      </div>
    </div>
  )
}
