import React, { useState } from 'react'
import { submitCardReport } from '@/services/cardReports'

interface Props {
  cardId: string
  cardQ: string
  onClose: () => void
  onSuccess: () => void
}

const COMMON_REASONS = [
  'Gabarito incorreto ou invertido',
  'Pergunta ambígua ou confusa',
  'Erro de digitação / formatação',
  'Referência médica desatualizada',
  'Classificação / caso clínico errado',
]

export const CardReportModal: React.FC<Props> = ({ cardId, cardQ, onClose, onSuccess }) => {
  const [selectedReason, setSelectedReason] = useState(COMMON_REASONS[0])
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async () => {
    setBusy(true)
    const reasonText = details.trim() ? `${selectedReason}: ${details.trim()}` : selectedReason
    try {
      await submitCardReport(cardId, reasonText)
      onSuccess()
      onClose()
    } catch (e: any) {
      setMsg('Erro ao enviar: ' + (e?.message || e))
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
          maxWidth: '500px',
          padding: '24px',
          boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> Reportar Erro na Carta
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: '.84rem', color: '#64748b' }}>
          Seu feedback ajuda a manter a biblioteca 100% atualizada. A mensagem será enviada diretamente para a conta mestre.
        </p>

        <div style={{ padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16 }}>
          <span style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700 }}>Carta selecionada:</span>
          <p style={{ margin: '3px 0 0', fontSize: '.84rem', color: '#1e293b', fontWeight: 600 }}>
            {cardQ.slice(0, 100)}...
          </p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
            Tipo de problema
          </label>
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              fontSize: '.9rem',
              background: '#fff',
            }}
          >
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="Outro motivo">Outro motivo</option>
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
            Detalhes adicionais (opcional)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Ex: No Harrison 21ª edição, a conduta agora é X..."
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              fontSize: '.88rem',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {msg && (
          <div style={{ marginBottom: 14, color: '#dc2626', fontSize: '.85rem', fontWeight: 600 }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
            onClick={handleSubmit}
            disabled={busy}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: '#f59e0b',
              color: '#fff',
              fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Enviando…' : 'Enviar Relatório'}
          </button>
        </div>
      </div>
    </div>
  )
}
