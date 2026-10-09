import React, { useState } from 'react'
import {
  generateFlashcardsWithGemini,
  getGeminiApiKey,
  saveGeminiApiKey,
  type GeneratedCard,
} from '@/services/aiGenerator'
import { createCard } from '@/services/medreview'
import FolderTreeSelect from '@/components/FolderTreeSelect'

interface Props {
  decks: Array<{ id: string; title: string; kind?: string; parent?: string; deleted?: boolean }>
  initialDeckId?: string
  onClose: () => void
  onSuccess: () => void
}

export const AiCardGeneratorModal: React.FC<Props> = ({
  decks,
  initialDeckId,
  onClose,
  onSuccess,
}) => {
  const [deckId, setDeckId] = useState(initialDeckId || decks[0]?.id || '')
  const [text, setText] = useState('')
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfName, setPdfName] = useState('')
  const [cardCount, setCardCount] = useState(10)
  const [apiKey, setApiKey] = useState(getGeminiApiKey())
  const [showKeyInput, setShowKeyInput] = useState(!getGeminiApiKey())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [previewCards, setPreviewCards] = useState<GeneratedCard[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Extract pure base64 without data:application/pdf;base64,
      const base64 = result.split(',')[1] || result
      setPdfBase64(base64)
    }
    reader.readAsDataURL(file)
  }

  const handleGenerate = async () => {
    if (!text.trim() && !pdfBase64) {
      setMsg('Cole um texto/resumo ou anexe um arquivo PDF da aula.')
      return
    }
    if (!apiKey.trim()) {
      setMsg('Por favor, insira sua chave da API Gemini (gratuita em aistudio.google.com).')
      setShowKeyInput(true)
      return
    }

    saveGeminiApiKey(apiKey)
    setBusy(true)
    setMsg('')
    try {
      const generated = await generateFlashcardsWithGemini({
        text,
        pdfBase64: pdfBase64 || undefined,
        cardCount,
        apiKey,
      })

      setPreviewCards(generated)
      setSelectedCards(new Set(generated.map((_, i) => i)))
    } catch (e: any) {
      setMsg('Erro na geração com IA: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedCards)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelectedCards(next)
  }

  const handleSaveSelected = async () => {
    if (!deckId) {
      setMsg('Escolha uma pasta para salvar os cartões.')
      return
    }
    if (selectedCards.size === 0) {
      setMsg('Selecione pelo menos um cartão para salvar.')
      return
    }

    setBusy(true)
    setMsg('')
    try {
      const cardsToSave = previewCards.filter((_, i) => selectedCards.has(i))
      for (const c of cardsToSave) {
        await createCard(deckId, {
          q: c.q,
          a: c.a,
          group: c.group || 'Gerado com IA',
          ref: c.ref || 'Gemini 3.8 Flash',
          clinical: !!c.clinical,
          tags: c.tags || ['🤖 Gerado com IA'],
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
        zIndex: 1000,
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
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
          overflow: 'hidden',
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
              <span>🤖</span> Criador de Cartões com IA (Gemini 3.8 Flash)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#64748b' }}>
              Transforme apostilas, resumos da tutoria ou PDFs em flashcards instantâneos de alto rendimento.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </header>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Key toggle banner */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '.8rem', color: '#475569' }}>
              🔑 Chave Gemini API: {apiKey ? '••••••••' + apiKey.slice(-4) : 'Não configurada (Necessária)'}
            </span>
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              style={{
                background: 'none',
                border: 'none',
                color: '#16a34a',
                fontSize: '.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {showKeyInput ? 'Ocultar' : 'Alterar Chave'}
            </button>
          </div>

          {showKeyInput && (
            <div style={{ marginBottom: 16, padding: '12px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#15803d', marginBottom: 4 }}>
                Insira sua chave da API Gemini (gratuita no Google AI Studio)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1.5px solid #86efac',
                    fontSize: '.85rem',
                  }}
                />
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#16a34a',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  Obter chave grátis ↗
                </a>
              </div>
            </div>
          )}

          {previewCards.length === 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Pasta de destino
                  </label>
                  <FolderTreeSelect
                    decks={decks}
                    selectedDeckId={deckId}
                    onSelect={(id) => setDeckId(id)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Quantidade
                  </label>
                  <select
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #cbd5e1',
                      background: '#fff',
                    }}
                  >
                    <option value={5}>5 flashcards</option>
                    <option value={10}>10 flashcards</option>
                    <option value={15}>15 flashcards</option>
                    <option value={20}>20 flashcards</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Anexar PDF da aula / diretriz (Opcional)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px',
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: 10,
                    background: '#f8fafc',
                  }}
                />
                {pdfName && <span style={{ fontSize: '.76rem', color: '#16a34a', fontWeight: 700 }}>✓ Anexado: {pdfName}</span>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Texto, anotações da aula ou resumo
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Cole aqui o texto da aula, objetivos da tutoria, casos clínicos ou o resumo da apostila..."
                  rows={6}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #cbd5e1',
                    fontSize: '.88rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '.9rem', fontWeight: 800, color: '#14532d' }}>
                  🎉 {previewCards.length} cartões gerados! Selecione os que deseja salvar:
                </span>
                <button
                  onClick={() => setPreviewCards([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '.8rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  ← Gerar novamente
                </button>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {previewCards.map((c, idx) => {
                  const isChecked = selectedCards.has(idx)
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleSelect(idx)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: isChecked ? '2px solid #16a34a' : '1px solid #cbd5e1',
                        background: isChecked ? '#f0fdf4' : '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(idx)}
                        style={{ marginTop: 4, width: 18, height: 18, accentColor: '#16a34a' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          {c.clinical && (
                            <span style={{ fontSize: '.7rem', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                              CASO CLÍNICO
                            </span>
                          )}
                          <span style={{ fontSize: '.7rem', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                            {c.group || 'Geral'}
                          </span>
                        </div>
                        <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                          {c.q}
                        </div>
                        <div style={{ fontSize: '.84rem', color: '#334155' }}>
                          <strong>R:</strong> {c.a}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
          {previewCards.length === 0 ? (
            <button
              onClick={handleGenerate}
              disabled={busy}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                color: '#fff',
                fontWeight: 800,
                cursor: busy ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(22,163,74,.2)',
              }}
            >
              {busy ? 'Gerando com Gemini 3.8 Flash…' : '⚡ Gerar Flashcards com IA'}
            </button>
          ) : (
            <button
              onClick={handleSaveSelected}
              disabled={busy || selectedCards.size === 0}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                color: '#fff',
                fontWeight: 800,
                cursor: busy || selectedCards.size === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(22,163,74,.2)',
              }}
            >
              {busy ? 'Salvando…' : `Salvar ${selectedCards.size} Cartões na Pasta`}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
