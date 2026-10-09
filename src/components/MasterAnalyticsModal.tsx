import React, { useMemo } from 'react'

interface Props {
  cards: any[]
  reviews: any[]
  decks: any[]
  onClose: () => void
  onOpenCard?: (cardId: string) => void
}

export const MasterAnalyticsModal: React.FC<Props> = ({
  cards,
  reviews,
  decks,
  onClose,
  onOpenCard,
}) => {
  // Aggregate stats
  const analytics = useMemo(() => {
    const cardMap = new Map<string, { card: any; reviews: number; lapses: number; goodCount: number }>()

    for (const c of cards) {
      cardMap.set(c.id, { card: c, reviews: 0, lapses: 0, goodCount: 0 })
    }

    for (const r of reviews) {
      const cardId = r.card_ref || r.card
      const entry = cardMap.get(cardId)
      if (entry) {
        entry.reviews += 1
        if (r.rating === 'again') entry.lapses += 1
        else if (r.rating === 'good' || r.rating === 'easy') entry.goodCount += 1
      }
    }

    const cardList = Array.from(cardMap.values())
    const totalReviews = reviews.length
    const totalLapses = reviews.filter((r) => r.rating === 'again').length
    const cohortRetention = totalReviews > 0 ? Math.round(((totalReviews - totalLapses) / totalReviews) * 100) : 0

    // Top most difficult cards (with at least 1 review)
    const mostDifficult = cardList
      .filter((e) => e.reviews > 0)
      .sort((a, b) => b.lapses / b.reviews - a.lapses / a.reviews || b.lapses - a.lapses)
      .slice(0, 10)

    // Group stats by deck
    const deckStats = decks.map((d) => {
      const deckCards = cards.filter((c) => c.deck === d.id)
      let dReviews = 0
      let dLapses = 0
      for (const dc of deckCards) {
        const e = cardMap.get(dc.id)
        if (e) {
          dReviews += e.reviews
          dLapses += e.lapses
        }
      }
      const errorRate = dReviews > 0 ? Math.round((dLapses / dReviews) * 100) : 0
      return {
        id: d.id,
        title: d.title,
        cardsCount: deckCards.length,
        reviews: dReviews,
        errorRate,
      }
    }).filter((ds) => ds.reviews > 0).sort((a, b) => b.errorRate - a.errorRate)

    return {
      totalReviews,
      totalLapses,
      cohortRetention,
      mostDifficult,
      deckStats,
    }
  }, [cards, reviews, decks])

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
          maxWidth: '840px',
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
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎓</span> Painel Docente & Desempenho da Turma
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: '#64748b' }}>
              Métricas consolidadas de fixação médica e pontos cegos dos alunos.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>
            ✕
          </button>
        </header>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '16px', borderRadius: 14, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '.74rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase' }}>
                Total de Revisões
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#14532d', marginTop: 4 }}>
                {analytics.totalReviews}
              </div>
            </div>
            <div style={{ padding: '16px', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: '.74rem', color: '#1d4ed8', fontWeight: 800, textTransform: 'uppercase' }}>
                Retenção Média Geral
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>
                {analytics.cohortRetention}%
              </div>
            </div>
            <div style={{ padding: '16px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <span style={{ fontSize: '.74rem', color: '#b91c1c', fontWeight: 800, textTransform: 'uppercase' }}>
                Erros Acumulados (Lapses)
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#991b1b', marginTop: 4 }}>
                {analytics.totalLapses}
              </div>
            </div>
          </div>

          {/* Top Hardest Cards */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '.95rem', color: '#0f172a', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚨</span> Cartas Mais Erradas pelos Alunos (Pontos Críticos)
            </h3>
            {analytics.mostDifficult.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '.84rem' }}>Ainda não há revisões suficientes para gerar o ranking.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {analytics.mostDifficult.map((item, idx) => {
                  const errorPct = Math.round((item.lapses / item.reviews) * 100)
                  return (
                    <div
                      key={item.card.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700 }}>
                          #{idx + 1} · {item.card.group || 'Geral'}
                        </div>
                        <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 600 }}>
                          {item.card.q.slice(0, 85)}...
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#dc2626' }}>
                            {errorPct}% erro
                          </div>
                          <div style={{ fontSize: '.72rem', color: '#64748b' }}>
                            {item.lapses} de {item.reviews} rev.
                          </div>
                        </div>
                        {onOpenCard && (
                          <button
                            onClick={() => {
                              onOpenCard(item.card.id)
                              onClose()
                            }}
                            style={{
                              padding: '5px 9px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              fontSize: '.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Ver
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Deck difficulty */}
          <div>
            <h3 style={{ fontSize: '.95rem', color: '#0f172a', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📊</span> Taxa de Erro por Disciplina / Pasta
            </h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {analytics.deckStats.slice(0, 8).map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    fontSize: '.82rem',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#334155' }}>{d.title}</span>
                  <span style={{ fontWeight: 800, color: d.errorRate > 30 ? '#dc2626' : '#15803d' }}>
                    {d.errorRate}% erro ({d.reviews} revisões)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
