import React, { useMemo, useState } from 'react'

interface Props {
  reviews: Array<{
    id?: string
    rating?: string
    reviewed_at?: string
    due?: string
    card?: string
    card_ref?: string
    card_id?: string
  }>
  cards?: Array<{
    id: string
    suspended?: boolean
  }>
  compact?: boolean
}

function parseDateMs(dateStr?: string): number | null {
  if (!dateStr) return null
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`
  const ms = new Date(withZone).getTime()
  return Number.isFinite(ms) ? ms : null
}

function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const StudyHeatmap: React.FC<Props> = ({ reviews, cards = [], compact = false }) => {
  const [hoverInfo, setHoverInfo] = useState<{ text: string; x: number; y: number } | null>(null)
  const [timeRange, setTimeRange] = useState<'6m' | '1y'>('6m')

  const {
    weeks,
    currentStreak,
    maxStreak,
    totalReviewsCount,
    reviewsToday,
    forecastNext7Days,
  } = useMemo(() => {
    // 1. Agrupa revisões por dia (chave YYYY-MM-DD local)
    const countsByDay = new Map<string, number>()
    for (const r of reviews) {
      const ms = parseDateMs(r.reviewed_at)
      if (ms) {
        const key = dateKey(new Date(ms))
        countsByDay.set(key, (countsByDay.get(key) || 0) + 1)
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = dateKey(today)
    const reviewsToday = countsByDay.get(todayKey) || 0

    // 2. Calcula streak atual e recorde
    let streak = 0
    let checkDate = new Date(today)
    // Se hoje ainda não estudou, verifica se ontem estudou para manter a sequência ativa
    if (!countsByDay.has(todayKey)) {
      checkDate.setDate(checkDate.getDate() - 1)
    }
    while (countsByDay.has(dateKey(checkDate)) && (countsByDay.get(dateKey(checkDate)) || 0) > 0) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    }

    // Recorde histórico de streak
    let maxStrk = 0
    let tempStrk = 0
    const sortedKeys = Array.from(countsByDay.keys()).sort()
    for (let i = 0; i < sortedKeys.length; i++) {
      if ((countsByDay.get(sortedKeys[i]) || 0) > 0) {
        tempStrk++
        if (tempStrk > maxStrk) maxStrk = tempStrk
        // Se o próximo dia não for consecutivo, reseta tempStrk
        if (i < sortedKeys.length - 1) {
          const curD = new Date(sortedKeys[i])
          const nxtD = new Date(sortedKeys[i + 1])
          const diffDays = Math.round((nxtD.getTime() - curD.getTime()) / 86400000)
          if (diffDays !== 1) tempStrk = 0
        }
      }
    }
    if (streak > maxStrk) maxStrk = streak

    // 3. Monta a grade de semanas
    const numWeeks = timeRange === '1y' ? 52 : 26
    const totalDays = numWeeks * 7
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - totalDays + 1)
    // Ajusta para começar na segunda-feira
    const dayOfWeek = (startDate.getDay() + 6) % 7 // 0 = Seg, 6 = Dom
    startDate.setDate(startDate.getDate() - dayOfWeek)

    const weeksData: Array<Array<{ key: string; date: Date; count: number; isToday: boolean; isFuture: boolean }>> = []
    let curDate = new Date(startDate)

    for (let w = 0; w < numWeeks; w++) {
      const col: Array<{ key: string; date: Date; count: number; isToday: boolean; isFuture: boolean }> = []
      for (let d = 0; d < 7; d++) {
        const dKey = dateKey(curDate)
        const isToday = dKey === todayKey
        const isFuture = curDate.getTime() > today.getTime()
        const count = isFuture ? 0 : countsByDay.get(dKey) || 0

        col.push({
          key: dKey,
          date: new Date(curDate),
          count,
          isToday,
          isFuture,
        })
        curDate.setDate(curDate.getDate() + 1)
      }
      weeksData.push(col)
    }

    // 4. Previsão de carga para os próximos 7 dias
    let forecast7 = 0
    const in7Days = today.getTime() + 7 * 86400000
    for (const r of reviews) {
      if (!r.due) continue
      const dueMs = parseDateMs(r.due)
      if (dueMs && dueMs >= today.getTime() && dueMs <= in7Days) {
        forecast7++
      }
    }

    return {
      weeks: weeksData,
      currentStreak: streak,
      maxStreak: maxStrk,
      totalReviewsCount: reviews.length,
      reviewsToday,
      forecastNext7Days: forecast7,
    }
  }, [reviews, timeRange])

  const getCellColor = (count: number, isFuture: boolean) => {
    if (isFuture) return '#f8fafc'
    if (count === 0) return '#e2e8f0'
    if (count <= 5) return '#bbf7d0'
    if (count <= 15) return '#4ade80'
    if (count <= 35) return '#16a34a'
    return '#14532d'
  }

  const formatTooltipDate = (d: Date, count: number) => {
    const formatted = d.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    })
    if (count === 0) return `${formatted} • Nenhuma revisão`
    if (count === 1) return `${formatted} • 1 revisão realizada`
    return `${formatted} • ${count} revisões realizadas`
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #d1fae5',
        borderRadius: 20,
        padding: compact ? '16px' : '22px 24px',
        boxShadow: '0 4px 20px rgba(16, 185, 129, 0.06)',
        marginBottom: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Header do Heatmap com KPIs de Hábito */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>🔥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#14532d', fontWeight: 900 }}>
                Consistência & Frequência Diária
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: '#64748b' }}>
                Seu mapa de fixação médica e disciplina nos estudos.
              </p>
            </div>
          </div>
        </div>

        {/* Badges de Gamificação */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '6px 12px',
              fontSize: '.82rem',
              fontWeight: 800,
              color: '#b45309',
            }}
          >
            <span>🔥</span>
            <span>{currentStreak} {currentStreak === 1 ? 'dia de ofensiva' : 'dias seguidos'}</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 12,
              padding: '6px 12px',
              fontSize: '.82rem',
              fontWeight: 800,
              color: '#065f46',
            }}
          >
            <span>🏆</span>
            <span>Recorde: {maxStreak}d</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 12,
              padding: '6px 12px',
              fontSize: '.82rem',
              fontWeight: 800,
              color: '#1e40af',
            }}
          >
            <span>⚡</span>
            <span>Hoje: {reviewsToday} cards</span>
          </div>

          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
            <button
              onClick={() => setTimeRange('6m')}
              style={{
                background: timeRange === '6m' ? '#16a34a' : '#fff',
                color: timeRange === '6m' ? '#fff' : '#64748b',
                border: 'none',
                padding: '4px 8px',
                fontSize: '.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              6 meses
            </button>
            <button
              onClick={() => setTimeRange('1y')}
              style={{
                background: timeRange === '1y' ? '#16a34a' : '#fff',
                color: timeRange === '1y' ? '#fff' : '#64748b',
                border: 'none',
                padding: '4px 8px',
                fontSize: '.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              1 ano
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Calor dos Dias */}
      <div style={{ position: 'relative', overflowX: 'auto', paddingBottom: 6 }}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {/* Rótulo dos dias da semana */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 12px)',
              gap: 4,
              paddingRight: 6,
              fontSize: '.65rem',
              fontWeight: 700,
              color: '#94a3b8',
              userSelect: 'none',
              alignItems: 'center',
            }}
          >
            <span>Seg</span>
            <span style={{ visibility: 'hidden' }}>Ter</span>
            <span>Qua</span>
            <span style={{ visibility: 'hidden' }}>Qui</span>
            <span>Sex</span>
            <span style={{ visibility: 'hidden' }}>Sáb</span>
            <span>Dom</span>
          </div>

          {/* Colunas de Semanas */}
          {weeks.map((week, wIdx) => (
            <div
              key={wIdx}
              style={{
                display: 'grid',
                gridTemplateRows: 'repeat(7, 12px)',
                gap: 4,
              }}
            >
              {week.map((day) => (
                <div
                  key={day.key}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoverInfo({
                      text: formatTooltipDate(day.date, day.count),
                      x: rect.left + rect.width / 2,
                      y: rect.top - 8,
                    })
                  }}
                  onMouseLeave={() => setHoverInfo(null)}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: getCellColor(day.count, day.isFuture),
                    border: day.isToday ? '1.5px solid #2563eb' : 'none',
                    cursor: day.isFuture ? 'default' : 'pointer',
                    transition: 'transform 0.1s ease',
                    boxSizing: 'border-box',
                  }}
                  onMouseOver={(e) => {
                    if (!day.isFuture) (e.currentTarget.style.transform = 'scale(1.35)')
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legenda de Intensidade */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 6,
            marginTop: 12,
            fontSize: '.72rem',
            color: '#64748b',
          }}
        >
          <span>Menos</span>
          <div style={{ width: 11, height: 11, borderRadius: 2, background: '#e2e8f0' }} />
          <div style={{ width: 11, height: 11, borderRadius: 2, background: '#bbf7d0' }} />
          <div style={{ width: 11, height: 11, borderRadius: 2, background: '#4ade80' }} />
          <div style={{ width: 11, height: 11, borderRadius: 2, background: '#16a34a' }} />
          <div style={{ width: 11, height: 11, borderRadius: 2, background: '#14532d' }} />
          <span>Mais</span>
        </div>
      </div>

      {/* Tooltip flutuante */}
      {hoverInfo && (
        <div
          style={{
            position: 'fixed',
            left: hoverInfo.x,
            top: hoverInfo.y,
            transform: 'translate(-50%, -100%)',
            background: '#0f172a',
            color: '#ffffff',
            padding: '5px 10px',
            borderRadius: 6,
            fontSize: '.75rem',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          }}
        >
          {hoverInfo.text}
        </div>
      )}
    </div>
  )
}
