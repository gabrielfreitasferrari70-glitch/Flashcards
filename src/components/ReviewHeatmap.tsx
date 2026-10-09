import React, { useMemo } from 'react'

export interface ReviewHeatmapProps {
  reviews: any[]
  daysCount?: number
  theme?: 'light' | 'dark'
}

export const ReviewHeatmap: React.FC<ReviewHeatmapProps> = ({
  reviews,
  daysCount = 91, // 13 semanas (aproximadamente 3 meses)
  theme = 'light',
}) => {
  const isDark = theme === 'dark'

  // Agrupa as revisões por data no formato YYYY-MM-DD
  const { dayMap, totalPeriodReviews, activeDays, currentStreak } = useMemo(() => {
    const map = new Map<string, number>()
    let total = 0

    // Processa revisões existentes
    for (const r of reviews || []) {
      const rawDate = r.reviewed_at || r.created_at || r.created
      if (!rawDate) continue
      const dateStr = new Date(rawDate).toISOString().slice(0, 10)
      map.set(dateStr, (map.get(dateStr) || 0) + 1)
      total++
    }

    // Calcula a sequência atual (streak)
    let streak = 0
    const now = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().slice(0, 10)
      const count = map.get(ds) || 0
      if (count > 0) {
        streak++
      } else if (i === 0) {
        // Se hoje ainda não estudou, verifica se ontem estudou antes de zerar o streak
        continue
      } else {
        break
      }
    }

    let active = 0
    map.forEach((c) => {
      if (c > 0) active++
    })

    return {
      dayMap: map,
      totalPeriodReviews: total,
      activeDays: active,
      currentStreak: streak,
    }
  }, [reviews])

  // Gera o grid de dias (das últimas N semanas até hoje)
  const days = useMemo(() => {
    const list: { dateStr: string; dateLabel: string; count: number; dayOfWeek: number }[] = []
    const today = new Date()

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      const count = dayMap.get(ds) || 0
      list.push({
        dateStr: ds,
        dateLabel: label,
        count,
        dayOfWeek: d.getDay(),
      })
    }
    return list
  }, [daysCount, dayMap])

  // Determina a cor de intensidade médica
  const getColor = (count: number) => {
    if (count === 0) return isDark ? '#1e293b' : '#f1f5f9'
    if (count < 5) return isDark ? '#14532d' : '#bbf7d0'
    if (count < 15) return isDark ? '#166534' : '#86efac'
    if (count < 30) return isDark ? '#15803d' : '#22c55e'
    return isDark ? '#4ade80' : '#15803d'
  }

  return (
    <div
      style={{
        marginTop: 20,
        padding: '16px 20px',
        borderRadius: 16,
        background: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.75)',
        border: `1.5px solid ${isDark ? '#334155' : '#d1fae5'}`,
        boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 10px rgba(22, 163, 74, 0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.15rem' }}>🗓️</span>
          <div>
            <strong
              style={{
                fontSize: '.88rem',
                color: isDark ? '#f8fafc' : '#14532d',
                display: 'block',
              }}
            >
              Consistência de Estudos · Heatmap Diário
            </strong>
            <span style={{ fontSize: '.74rem', color: isDark ? '#94a3b8' : '#64748b' }}>
              Últimas 13 semanas · Ritmo de repetição espaçada
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b', display: 'block' }}>
              Sequência
            </span>
            <strong style={{ fontSize: '.9rem', color: isDark ? '#4ade80' : '#15803d' }}>
              🔥 {currentStreak} {currentStreak === 1 ? 'dia' : 'dias'}
            </strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b', display: 'block' }}>
              Revisões totais
            </span>
            <strong style={{ fontSize: '.9rem', color: isDark ? '#f8fafc' : '#1e293b' }}>
              ⚡ {totalPeriodReviews} cards
            </strong>
          </div>
        </div>
      </div>

      {/* Grid de quadradinhos */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 4,
          alignItems: 'center',
        }}
        title="Histórico de revisões diárias"
      >
        <div
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(7, 12px)',
            gap: 4,
          }}
        >
          {days.map((d) => (
            <div
              key={d.dateStr}
              title={`${d.dateLabel}: ${d.count} carta${d.count !== 1 ? 's' : ''} revisada${d.count !== 1 ? 's' : ''}`}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: getColor(d.count),
                border: d.count > 0 ? 'none' : `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
            />
          ))}
        </div>
      </div>

      {/* Legenda de intensidade */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          fontSize: '.68rem',
          color: isDark ? '#94a3b8' : '#64748b',
        }}
      >
        <span>Menos</span>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: isDark ? '#1e293b' : '#f1f5f9' }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: isDark ? '#14532d' : '#bbf7d0' }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: isDark ? '#166534' : '#86efac' }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: isDark ? '#15803d' : '#22c55e' }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: isDark ? '#4ade80' : '#15803d' }} />
        <span>Mais</span>
      </div>
    </div>
  )
}
