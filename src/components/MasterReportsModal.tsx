import React, { useState, useEffect, useMemo } from 'react'
import {
  getMasterReports,
  toggleCardReportResolved,
  deleteCardReport,
  type CardReport,
} from '@/services/cardReports'

interface Props {
  cards?: any[]
  onClose: () => void
  onOpenCard?: (cardId: string) => void
}

export const MasterReportsModal: React.FC<Props> = ({ cards, onClose, onOpenCard }) => {
  const [reports, setReports] = useState<CardReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await getMasterReports(cards)
      setReports(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggle = async (id: string, currentResolved: boolean) => {
    setActionBusyId(id)
    try {
      await toggleCardReportResolved(id, !currentResolved)
      await load()
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente remover este relatório de erro?')) return
    setActionBusyId(id)
    try {
      await deleteCardReport(id)
      await load()
    } finally {
      setActionBusyId(null)
    }
  }

  const pendingCount = useMemo(() => reports.filter((r) => !r.resolved).length, [reports])
  const resolvedCount = useMemo(() => reports.filter((r) => r.resolved).length, [reports])

  const filteredReports = useMemo(() => {
    let list = reports
    if (filter === 'pending') {
      list = list.filter((r) => !r.resolved)
    } else if (filter === 'resolved') {
      list = list.filter((r) => r.resolved)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.reason.toLowerCase().includes(q) ||
          (r.card_q && r.card_q.toLowerCase().includes(q)) ||
          (r.user_email && r.user_email.toLowerCase().includes(q)) ||
          r.card_id.toLowerCase().includes(q),
      )
    }

    return list
  }, [reports, filter, search])

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
          maxHeight: '88vh',
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
            <h2
              style={{
                margin: 0,
                fontSize: '1.25rem',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠️</span> Erros Reportados pelos Alunos
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: '#64748b' }}>
              {pendingCount} pendente(s) · {resolvedCount} resolvido(s) · {reports.length} total
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={load}
              disabled={loading}
              title="Recarregar relatórios"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '.78rem',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <span className={loading ? 'spinning' : ''}>🔄</span>
              Atualizar
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.3rem',
                cursor: 'pointer',
                color: '#64748b',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Barra de Filtros e Busca */}
        <div
          style={{
            padding: '12px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFilter('pending')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '.8rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: filter === 'pending' ? '#f59e0b' : '#e2e8f0',
                color: filter === 'pending' ? '#fff' : '#475569',
              }}
            >
              ⚠️ Pendentes ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('resolved')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '.8rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: filter === 'resolved' ? '#16a34a' : '#e2e8f0',
                color: filter === 'resolved' ? '#fff' : '#475569',
              }}
            >
              ✓ Resolvidos ({resolvedCount})
            </button>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '.8rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: filter === 'all' ? '#0284c7' : '#e2e8f0',
                color: filter === 'all' ? '#fff' : '#475569',
              }}
            >
              📋 Todos ({reports.length})
            </button>
          </div>

          <div style={{ flex: 1, minWidth: '220px', maxWidth: '350px' }}>
            <input
              type="text"
              placeholder="Buscar por pergunta, motivo ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 12px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: '.82rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔄</div>
              Carregando relatórios de erros...
            </div>
          ) : filteredReports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              {search.trim() ? (
                <div>Nenhum relatório encontrado para a busca &quot;{search}&quot;.</div>
              ) : filter === 'pending' ? (
                <div style={{ color: '#16a34a', fontWeight: 600 }}>
                  🎉 Nenhum erro pendente no momento! Todas as cartas estão validadas.
                </div>
              ) : (
                <div>Nenhum relatório nesta categoria.</div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {filteredReports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    border: r.resolved ? '1px solid #e2e8f0' : '1.5px solid #fde68a',
                    background: r.resolved ? '#f8fafc' : '#fffbeb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: r.resolved ? 'none' : '0 2px 8px rgba(245,158,11,0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      {r.user_email && (
                        <span style={{ fontSize: '.76rem', color: '#475569', fontWeight: 600 }}>
                          Aluno: {r.user_email}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '.74rem', color: '#94a3b8' }}>
                      {new Date(r.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {r.card_q ? (
                    <div
                      style={{
                        fontSize: '.86rem',
                        color: '#1e293b',
                        fontWeight: 600,
                        background: '#fff',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <span style={{ fontSize: '.72rem', color: '#64748b', display: 'block', fontWeight: 700, marginBottom: 2 }}>
                        PERGUNTA DA CARTA:
                      </span>
                      {r.card_q}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>
                      ID da Carta: {r.card_id}
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: '.88rem',
                      color: '#0f172a',
                      background: r.resolved ? '#fff' : '#fff7ed',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: r.resolved ? '1px solid #e2e8f0' : '1px solid #fed7aa',
                    }}
                  >
                    <strong style={{ color: r.resolved ? '#475569' : '#c2410c' }}>
                      Problema apontado:
                    </strong>{' '}
                    {r.reason}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                      borderTop: '1px solid rgba(0,0,0,0.05)',
                      paddingTop: 8,
                    }}
                  >
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={actionBusyId === r.id}
                      title="Excluir este relatório"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #fecaca',
                        background: '#fff',
                        color: '#dc2626',
                        fontSize: '.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🗑 Excluir
                    </button>

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
                          color: '#0284c7',
                          fontSize: '.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🔍 Abrir carta
                      </button>
                    )}

                    <button
                      onClick={() => handleToggle(r.id, r.resolved)}
                      disabled={actionBusyId === r.id}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: r.resolved ? '#64748b' : '#16a34a',
                        color: '#fff',
                        fontSize: '.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {actionBusyId === r.id
                        ? 'Processando...'
                        : r.resolved
                        ? '↩ Reabrir (Marcar pendente)'
                        : '✓ Marcar como corrigido'}
                    </button>
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
