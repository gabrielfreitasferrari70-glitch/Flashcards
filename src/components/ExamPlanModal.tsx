import React, { useState, useEffect } from 'react'
import { getExamPlan, setExamPlan, removeExamPlan, calculateExamCountdown, type ExamPlan } from '@/services/examPlans'

interface Props {
  deckId: string
  deckTitle: string
  totalCards: number
  onClose: () => void
  onSaved: () => void
}

export const ExamPlanModal: React.FC<Props> = ({ deckId, deckTitle, totalCards, onClose, onSaved }) => {
  const [examDate, setExamDate] = useState('')
  const [currentPlan, setCurrentPlan] = useState<ExamPlan | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getExamPlan(deckId).then((p) => {
      if (p) {
        setCurrentPlan(p)
        setExamDate(p.exam_date)
      }
    })
  }, [deckId])

  const stats = examDate ? calculateExamCountdown(examDate, totalCards) : null

  const handleSave = async () => {
    if (!examDate) return
    setBusy(true)
    await setExamPlan(deckId, examDate, deckTitle)
    setBusy(false)
    onSaved()
    onClose()
  }

  const handleRemove = async () => {
    setBusy(true)
    await removeExamPlan(deckId)
    setBusy(false)
    onSaved()
    onClose()
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
          maxWidth: '520px',
          padding: '24px',
          boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎯</span> Modo Prova com Data-Alvo
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '.84rem', color: '#64748b' }}>
          Defina o dia da sua prova para a pasta <strong>“{deckTitle}”</strong> ({totalCards} cartas). O MedReview recalculará o ritmo ideal para você fechar 100% da matéria a tempo.
        </p>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
            Data da prova
          </label>
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1.5px solid #cbd5e1',
              fontSize: '.95rem',
            }}
          />
        </div>

        {stats && (
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              background: stats.passed ? '#fef2f2' : '#f0fdf4',
              border: stats.passed ? '1.5px solid #fecaca' : '1.5px solid #bbf7d0',
              marginBottom: 20,
            }}
          >
            {stats.passed ? (
              <span style={{ color: '#991b1b', fontWeight: 700, fontSize: '.9rem' }}>
                ⚠️ A data informada já passou.
              </span>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={{ fontSize: '.72rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase' }}>
                    Tempo restante
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#14532d' }}>
                    {stats.daysLeft} {stats.daysLeft === 1 ? 'dia' : 'dias'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '.72rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase' }}>
                    Meta diária sugerida
                  </span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#16a34a' }}>
                    {stats.dailyGoal} cartas/dia
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {currentPlan ? (
            <button
              onClick={handleRemove}
              disabled={busy}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '.82rem',
              }}
            >
              Remover plano
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: 10 }}>
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
              onClick={handleSave}
              disabled={busy || !examDate}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                color: '#fff',
                fontWeight: 800,
                cursor: busy || !examDate ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(22,163,74,.2)',
              }}
            >
              {busy ? 'Salvando…' : 'Ativar Modo Prova'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
