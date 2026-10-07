import React, { useState, useEffect } from 'react'
import { getMasterReports, resolveCardReport, type CardReport } from '@/services/cardReports'

interface Props {
  onClose: () => void
  onOpenCard?: (cardId: string) => void
}

export const MasterReportsModal: React.FC<Props> = ({ onClose, onOpenCard }) => {
  const [reports, setReports] = useState<CardReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const list = await getMasterReports()
    setReports(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleResolve = async (id: string) => {
    await resolveCardReport(id)
    load()
  }

  const pending = reports.filter((r) => !r.resolved)

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
          maxWidth: '750px',
          maxHeight: '85vh',
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
              <span>⚠️</span> Erros Reportados pelos Alunos
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#64748b' }}>
              {pending.length} pendente(s) de revisão
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </header>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Carregando relatórios…</div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#16a34a', fontWeight: 600 }}>
              🎉 Nenhum erro reportado! Todas as cartas estão 100% validadas.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {reports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: r.resolved ? '1px solid #e2e8f0' : '1.5px solid #fde68a',
                    background: r.resolved ? '#f8fafc' : '#fffbeb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '.72rem',
                        fontWeight: 800,
                        background: r.resolved ? '#dcfce7' : '#fef3c7',
                        color: r.resolved ? '#15803d' : '#b45309',
                      }}
                    >
                      {r.resolved ? '✓ RESOLVIDO' : '⚠️ PENDENTE'}
                    </span>
                    <span style={{ fontSize: '.74rem', color: '#94a3b8' }}>
                      {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  {r.card_q && (
                    <div style={{ fontSize: '.84rem', color: '#334155', fontWeight: 600 }}>
                      Carta: {r.card_q}
                    </div>
                  )}

                  <div style={{ fontSize: '.88rem', color: '#0f172a', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <strong>Problema apontado:</strong> {r.reason}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    {onOpenCard && (
                      <button
                        onClick={() => {
                          onOpenCard(r.card_id)
                          onClose()
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir carta
                      </button>
                    )}
                    {!r.resolved && (
                      <button
                        onClick={() => handleResolve(r.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#16a34a',
                          color: '#fff',
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✓ Marcar como corrigido
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
