import React, { useState, useRef } from 'react'
import { parseAnkiFile, type AnkiPackageResult } from '@/lib/ankiParser'
import { createDeck, createCardsBatch } from '@/services/medreview'

interface Deck {
  id: string
  title: string
  parent?: string
}

interface Props {
  decks: Deck[]
  onClose: () => void
  onSuccess: (importedCount: number, deckTitle: string) => void
}

export const AnkiImportModal: React.FC<Props> = ({ decks, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState<boolean>(false)
  const [result, setResult] = useState<AnkiPackageResult | null>(null)
  const [targetDeckOption, setTargetDeckOption] = useState<'new' | string>('new')
  const [customDeckName, setCustomDeckName] = useState<string>('')
  const [importing, setImporting] = useState<boolean>(false)
  const [progress, setProgress] = useState<{ current: number; total: number; stage: string }>({
    current: 0,
    total: 0,
    stage: '',
  })
  const [errorMsg, setErrorMsg] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileProcess = async (selectedFile: File) => {
    setErrorMsg('')
    setFile(selectedFile)
    setParsing(true)
    try {
      const parsed = await parseAnkiFile(selectedFile)
      if (parsed.cards.length === 0) {
        throw new Error('Nenhuma carta válida foi encontrada neste arquivo do Anki. Verifique se o arquivo não está corrompido.')
      }
      setResult(parsed)
      setCustomDeckName(parsed.deckName)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Falha ao processar o arquivo do Anki.')
      setResult(null)
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0])
    }
  }

  const handleImport = async () => {
    if (!result || result.cards.length === 0) return
    setImporting(true)
    setErrorMsg('')

    try {
      let finalDeckId = targetDeckOption
      let finalDeckTitle = customDeckName.trim() || result.deckName

      if (targetDeckOption === 'new') {
        setProgress({ current: 0, total: result.cards.length, stage: 'Criando nova pasta...' })
        const newDeck = await createDeck(finalDeckTitle, 'custom')
        finalDeckId = newDeck.id
      } else {
        const found = decks.find((d) => d.id === targetDeckOption)
        if (found) finalDeckTitle = found.title
      }

      const total = result.cards.length
      // Importa em lotes rápidos via createCardsBatch
      const BATCH_SIZE = 20
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = result.cards.slice(i, i + BATCH_SIZE)
        setProgress({
          current: Math.min(i + batch.length, total),
          total,
          stage: `Importando cartões (${Math.min(i + batch.length, total)} de ${total})...`,
        })

        await createCardsBatch(
          finalDeckId,
          batch.map((c) => ({
            q: c.q,
            a: c.a,
            tags: c.tags,
            occlusion: (c as any).occlusion,
          })),
        )
      }

      onSuccess(total, finalDeckTitle)
    } catch (e: any) {
      setErrorMsg('Erro durante a gravação das cartas: ' + (e?.message || e))
      setImporting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(15,23,42,.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(5px)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 22,
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem' }}>📥</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                Importador Nativo do Anki (.apkg / .txt / .csv)
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '.84rem', opacity: 0.94 }}>
              Migre seus decks do Anki diretamente para o MedReview com suporte total a Cloze.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: 8,
              width: 30,
              height: 30,
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: 12,
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: '.85rem',
                fontWeight: 600,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          {!result ? (
            /* Upload Dropzone */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #86efac',
                borderRadius: 18,
                padding: '36px 20px',
                textAlign: 'center',
                background: '#f0fdf4',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apkg,.txt,.tsv,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0])
                  }
                }}
              />
              <div style={{ fontSize: '2.8rem', marginBottom: 10 }}>📦</div>
              <h3 style={{ margin: '0 0 6px', color: '#14532d', fontSize: '1.05rem', fontWeight: 800 }}>
                {parsing ? 'Processando arquivo do Anki…' : 'Arraste seu arquivo do Anki aqui'}
              </h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '.84rem', lineHeight: 1.5 }}>
                Suporta pacotes <strong>.apkg</strong> ou notas em texto <strong>.txt / .tsv / .csv</strong> exportadas do Anki.
              </p>
              <button
                type="button"
                style={{
                  marginTop: 16,
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '9px 18px',
                  fontWeight: 700,
                  fontSize: '.84rem',
                  cursor: 'pointer',
                }}
              >
                {parsing ? 'Lendo…' : 'Selecionar Arquivo'}
              </button>
            </div>
          ) : (
            /* Preview and Options */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Resumo do Arquivo */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Arquivo Processado
                  </div>
                  <div style={{ fontSize: '.95rem', fontWeight: 800, color: '#1e293b', marginTop: 2 }}>
                    📄 {file?.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: '.82rem',
                      fontWeight: 800,
                    }}
                  >
                    ✨ {result.cards.length} cartas
                  </span>
                </div>
              </div>

              {/* Destino das cartas */}
              <div>
                <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
                  📁 Destino no MedReview
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTargetDeckOption('new')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${targetDeckOption === 'new' ? '#16a34a' : '#cbd5e1'}`,
                      background: targetDeckOption === 'new' ? '#f0fdf4' : '#fff',
                      color: targetDeckOption === 'new' ? '#15803d' : '#475569',
                      fontWeight: targetDeckOption === 'new' ? 800 : 600,
                      fontSize: '.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Criar nova pasta
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetDeckOption(decks[0]?.id || 'new')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${targetDeckOption !== 'new' ? '#16a34a' : '#cbd5e1'}`,
                      background: targetDeckOption !== 'new' ? '#f0fdf4' : '#fff',
                      color: targetDeckOption !== 'new' ? '#15803d' : '#475569',
                      fontWeight: targetDeckOption !== 'new' ? 800 : 600,
                      fontSize: '.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Usar pasta existente
                  </button>
                </div>

                {targetDeckOption === 'new' ? (
                  <input
                    type="text"
                    value={customDeckName}
                    onChange={(e) => setCustomDeckName(e.target.value)}
                    placeholder="Nome da nova pasta"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #cbd5e1',
                      fontSize: '.88rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <select
                    value={targetDeckOption}
                    onChange={(e) => setTargetDeckOption(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #cbd5e1',
                      fontSize: '.88rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  >
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Prévia dos Primeiros Cartões */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '.82rem', fontWeight: 800, color: '#1e293b' }}>
                    👀 Prévia das Primeiras Cartas
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null)
                      setFile(null)
                    }}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '.76rem', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Escolher outro arquivo
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: '190px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    background: '#f8fafc',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {result.cards.slice(0, 3).map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: '.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, color: '#15803d' }}>Carta #{idx + 1}</span>
                        {(c as any).occlusion ? (
                          <span style={{ background: '#fdf2f8', color: '#be185d', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', fontWeight: 700 }}>
                            🎯 Oclusão de Imagem
                          </span>
                        ) : c.isCloze ? (
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', fontWeight: 700 }}>
                            🧩 Cloze
                          </span>
                        ) : null}
                        {(c.q.includes('<img') || c.a.includes('<img') || !!(c as any).occlusion) && (
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: 4, fontSize: '.7rem', fontWeight: 700 }}>
                            🖼️ Imagem
                          </span>
                        )}
                        {c.tags && c.tags.length > 0 && (
                          <span style={{ color: '#64748b', fontSize: '.7rem' }}>
                            Tags: {c.tags.join(', ')}
                          </span>
                        )}
                      </div>
                      {(c as any).occlusion?.imageUrl && (
                        <div style={{ margin: '6px 0', borderRadius: 8, overflow: 'hidden', maxHeight: 80, display: 'inline-block', border: '1px solid #e2e8f0' }}>
                          <img
                            src={(c as any).occlusion.imageUrl}
                            alt="Miniatura Oclusão"
                            style={{ height: 80, width: 'auto', display: 'block', objectFit: 'contain' }}
                          />
                        </div>
                      )}
                      <div
                        style={{ color: '#1e293b', fontWeight: 600, marginBottom: 6 }}
                        dangerouslySetInnerHTML={{
                          __html: `<strong>P:</strong> ` + c.q,
                        }}
                      />
                      <div
                        style={{ color: '#475569', fontSize: '.78rem' }}
                        dangerouslySetInnerHTML={{
                          __html: `<strong>R:</strong> ` + c.a,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Barra de Progresso durante a importação */}
          {importing && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                <span>{progress.stage}</span>
                <span>{Math.round((progress.current / (progress.total || 1)) * 100)}%</span>
              </div>
              <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round((progress.current / (progress.total || 1)) * 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #16a34a, #22c55e)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            disabled={importing}
            onClick={onClose}
            style={{
              padding: '9px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '.85rem',
              fontWeight: 700,
              cursor: importing ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>

          <button
            disabled={!result || importing}
            onClick={handleImport}
            style={{
              padding: '9px 20px',
              borderRadius: 10,
              border: 'none',
              background: !result || importing ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a, #15803d)',
              color: '#ffffff',
              fontSize: '.88rem',
              fontWeight: 800,
              cursor: !result || importing ? 'not-allowed' : 'pointer',
              boxShadow: !result || importing ? 'none' : '0 4px 14px rgba(22, 163, 74, 0.3)',
            }}
          >
            {importing ? progress.stage : `📥 Importar ${result ? result.cards.length : ''} Cartas`}
          </button>
        </div>
      </div>
    </div>
  )
}
