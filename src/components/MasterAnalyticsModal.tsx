import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Props {
  cards: any[]
  reviews: any[]
  decks: any[]
  onClose: () => void
  onOpenCard?: (cardId: string) => void
}

interface CardStatAggregate {
  reviews: number
  lapses: number
  goodCount: number
  students: Set<string> | number
}

// Retorna todos os IDs da subárvore de uma pasta (incluindo subpastas recursivamente)
function getAllSubDeckIds(rootId: string, allDecks: any[]): Set<string> {
  const ids = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const d of allDecks) {
      if (d.parent && ids.has(d.parent) && !ids.has(d.id)) {
        ids.add(d.id)
        added = true
      }
    }
  }
  return ids
}

export const MasterAnalyticsModal: React.FC<Props> = ({
  cards,
  reviews: localReviews,
  decks,
  onClose,
  onOpenCard,
}) => {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'cards' | 'decks'>('cards')
  const [search, setSearch] = useState('')
  const [minReviewsFilter, setMinReviewsFilter] = useState<number>(1)
  const [dataOrigin, setDataOrigin] = useState<'global_rpc' | 'global_table' | 'local_fallback'>('local_fallback')

  // Estado consolidado por card_id: { [card_id]: { reviews, lapses, goodCount, students } }
  const [cardStatsMap, setCardStatsMap] = useState<Map<string, { reviews: number; lapses: number; goodCount: number; studentCount: number }>>(new Map())
  const [totalStudentsCount, setTotalStudentsCount] = useState<number>(1)

  const loadGlobalStats = useCallback(async () => {
    setLoading(true)
    let fetchedMap = new Map<string, { reviews: number; lapses: number; goodCount: number; studentCount: number }>()
    let totalStudents = 1
    let origin: 'global_rpc' | 'global_table' | 'local_fallback' = 'local_fallback'

    try {
      // 1. Tenta chamar o RPC master_card_stats() criado nas migrações do Supabase
      const { data: rpcData, error: rpcErr } = await supabase.rpc('master_card_stats')

      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        origin = 'global_rpc'
        let maxStudents = 0
        for (const row of rpcData) {
          const cId = String(row.card_id).replace(/::rev$/, '')
          const revs = Number(row.reviews || 0)
          const laps = Number(row.lapses || 0)
          const studs = Number(row.students || 1)
          if (studs > maxStudents) maxStudents = studs
          fetchedMap.set(cId, {
            reviews: revs,
            lapses: laps,
            goodCount: Math.max(0, revs - laps),
            studentCount: studs,
          })
        }
        totalStudents = Math.max(1, maxStudents)
      } else {
        // 2. Se o RPC não estiver disponível ou vazio, tenta ler as revisões da turma via mr_reviews
        const { data: allRevs, error: revErr } = await supabase
          .from('mr_reviews')
          .select('card_id, rating, user_id')
          .limit(25000)

        if (!revErr && Array.isArray(allRevs) && allRevs.length > 0) {
          origin = 'global_table'
          const studentSet = new Set<string>()
          const cardAggMap = new Map<string, { reviews: number; lapses: number; goodCount: number; students: Set<string> }>()

          for (const r of allRevs) {
            const cId = String(r.card_id || '').replace(/::rev$/, '')
            if (!cId) continue
            if (r.user_id) studentSet.add(r.user_id)

            let entry = cardAggMap.get(cId)
            if (!entry) {
              entry = { reviews: 0, lapses: 0, goodCount: 0, students: new Set<string>() }
              cardAggMap.set(cId, entry)
            }
            entry.reviews += 1
            if (r.rating === 'again') entry.lapses += 1
            else if (r.rating === 'good' || r.rating === 'easy') entry.goodCount += 1
            if (r.user_id) entry.students.add(r.user_id)
          }

          totalStudents = Math.max(1, studentSet.size)
          cardAggMap.forEach((val, key) => {
            fetchedMap.set(key, {
              reviews: val.reviews,
              lapses: val.lapses,
              goodCount: val.goodCount,
              studentCount: Math.max(1, val.students.size),
            })
          })
        }
      }
    } catch (err) {
      console.warn('Não foi possível ler métricas globais da turma no Supabase, usando local:', err)
    }

    // 3. Fallback: se não conseguiu dados globais do banco, usa as avaliações passadas
    if (fetchedMap.size === 0 && Array.isArray(localReviews)) {
      origin = 'local_fallback'
      const cardAggMap = new Map<string, { reviews: number; lapses: number; goodCount: number }>()
      for (const r of localReviews) {
        const cId = String(r.card_id || r.card_ref || r.card || '').replace(/::rev$/, '')
        if (!cId) continue
        let entry = cardAggMap.get(cId)
        if (!entry) {
          entry = { reviews: 0, lapses: 0, goodCount: 0 }
          cardAggMap.set(cId, entry)
        }
        entry.reviews += 1
        if (r.rating === 'again') entry.lapses += 1
        else if (r.rating === 'good' || r.rating === 'easy') entry.goodCount += 1
      }
      cardAggMap.forEach((val, key) => {
        fetchedMap.set(key, {
          reviews: val.reviews,
          lapses: val.lapses,
          goodCount: val.goodCount,
          studentCount: 1,
        })
      })
    }

    setCardStatsMap(fetchedMap)
    setTotalStudentsCount(totalStudents)
    setDataOrigin(origin)
    setLoading(false)
  }, [localReviews])

  useEffect(() => {
    loadGlobalStats()
  }, [loadGlobalStats])

  // Consolidação matemática de métricas
  const analytics = useMemo(() => {
    let totalReviews = 0
    let totalLapses = 0
    let totalGoods = 0

    // Mapeamento de cada card com estatísticas completas
    const cardList = cards.map((c) => {
      const cleanId = String(c.id).replace(/::rev$/, '')
      const stat = cardStatsMap.get(cleanId) || { reviews: 0, lapses: 0, goodCount: 0, studentCount: 0 }
      totalReviews += stat.reviews
      totalLapses += stat.lapses
      totalGoods += stat.goodCount

      const errorRate = stat.reviews > 0 ? Math.round((stat.lapses / stat.reviews) * 100) : 0
      return {
        card: c,
        reviews: stat.reviews,
        lapses: stat.lapses,
        goodCount: stat.goodCount,
        studentCount: stat.studentCount,
        errorRate,
      }
    })

    const cohortRetention = totalReviews > 0 ? Math.round(((totalReviews - totalLapses) / totalReviews) * 100) : 0

    // Cartas mais difíceis (com pelo menos minReviewsFilter revisões)
    const mostDifficult = cardList
      .filter((e) => e.reviews >= minReviewsFilter)
      .sort((a, b) => b.errorRate - a.errorRate || b.lapses - a.lapses || b.reviews - a.reviews)

    // Agrupamento por pasta / disciplina usando hierarquia completa (subpastas somadas)
    const deckStats = decks.map((d) => {
      const subtreeIds = getAllSubDeckIds(d.id, decks)
      const deckCards = cards.filter((c) => {
        const deckId = c.deck || c.deck_id
        return subtreeIds.has(deckId)
      })

      let dReviews = 0
      let dLapses = 0
      let dStudentsMax = 0

      for (const dc of deckCards) {
        const cleanId = String(dc.id).replace(/::rev$/, '')
        const stat = cardStatsMap.get(cleanId)
        if (stat) {
          dReviews += stat.reviews
          dLapses += stat.lapses
          if (stat.studentCount > dStudentsMax) dStudentsMax = stat.studentCount
        }
      }

      const errorRate = dReviews > 0 ? Math.round((dLapses / dReviews) * 100) : 0
      const retentionRate = 100 - errorRate

      return {
        id: d.id,
        title: d.title,
        cardsCount: deckCards.length,
        reviews: dReviews,
        lapses: dLapses,
        errorRate,
        retentionRate,
        studentCount: dStudentsMax,
      }
    })
      .filter((ds) => ds.cardsCount > 0)
      .sort((a, b) => b.reviews - a.reviews || b.errorRate - a.errorRate)

    return {
      totalReviews,
      totalLapses,
      totalGoods,
      cohortRetention,
      mostDifficult,
      deckStats,
    }
  }, [cards, decks, cardStatsMap, minReviewsFilter])

  // Filtragem de cartas por busca de texto
  const filteredDifficultCards = useMemo(() => {
    if (!search.trim()) return analytics.mostDifficult
    const q = search.toLowerCase()
    return analytics.mostDifficult.filter(
      (item) =>
        item.card.q.toLowerCase().includes(q) ||
        (item.card.group && item.card.group.toLowerCase().includes(q)) ||
        (item.card.ref && item.card.ref.toLowerCase().includes(q)),
    )
  }, [analytics.mostDifficult, search])

  // Filtragem de pastas por busca de texto
  const filteredDeckStats = useMemo(() => {
    if (!search.trim()) return analytics.deckStats
    const q = search.toLowerCase()
    return analytics.deckStats.filter((d) => d.title.toLowerCase().includes(q))
  }, [analytics.deckStats, search])

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
          maxWidth: '880px',
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
              <span>🎓</span> Painel Docente & Desempenho da Turma
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: '.8rem', color: '#64748b' }}>
                Métricas de fixação médica e pontos cegos dos alunos.
              </span>
              <span
                style={{
                  fontSize: '.72rem',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontWeight: 700,
                  background:
                    dataOrigin === 'global_rpc' || dataOrigin === 'global_table'
                      ? '#dcfce7'
                      : '#fef3c7',
                  color:
                    dataOrigin === 'global_rpc' || dataOrigin === 'global_table'
                      ? '#166534'
                      : '#b45309',
                }}
              >
                {dataOrigin === 'global_rpc'
                  ? '🟢 Nuvem Supabase (RPC)'
                  : dataOrigin === 'global_table'
                  ? '🟢 Base Compartilhada da Turma'
                  : '🟡 Modo Local'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={loadGlobalStats}
              disabled={loading}
              title="Recarregar métricas"
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

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Cartões KPI do Topo */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                padding: '16px',
                borderRadius: 14,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
              }}
            >
              <span style={{ fontSize: '.74rem', color: '#15803d', fontWeight: 800, textTransform: 'uppercase' }}>
                Total de Revisões
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#14532d', marginTop: 4 }}>
                {loading ? '…' : analytics.totalReviews.toLocaleString('pt-BR')}
              </div>
              <span style={{ fontSize: '.72rem', color: '#16a34a' }}>
                {cards.length.toLocaleString('pt-BR')} flashcards no acervo
              </span>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: 14,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
              }}
            >
              <span style={{ fontSize: '.74rem', color: '#1d4ed8', fontWeight: 800, textTransform: 'uppercase' }}>
                Retenção Média Geral
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>
                {loading ? '…' : `${analytics.cohortRetention}%`}
              </div>
              <span style={{ fontSize: '.72rem', color: '#2563eb' }}>
                Taxa de acertos (Bom / Fácil)
              </span>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: 14,
                background: '#fef2f2',
                border: '1px solid #fecaca',
              }}
            >
              <span style={{ fontSize: '.74rem', color: '#b91c1c', fontWeight: 800, textTransform: 'uppercase' }}>
                Erros Acumulados
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#991b1b', marginTop: 4 }}>
                {loading ? '…' : analytics.totalLapses.toLocaleString('pt-BR')}
              </div>
              <span style={{ fontSize: '.72rem', color: '#dc2626' }}>
                Classificados como &apos;Errei&apos; (Again)
              </span>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: 14,
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
              }}
            >
              <span style={{ fontSize: '.74rem', color: '#7e22ce', fontWeight: 800, textTransform: 'uppercase' }}>
                Alunos na Base
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#581c87', marginTop: 4 }}>
                {loading ? '…' : totalStudentsCount}
              </div>
              <span style={{ fontSize: '.72rem', color: '#9333ea' }}>
                Estudantes ativos acompanhados
              </span>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderBottom: '2px solid #e2e8f0',
              marginBottom: 16,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setActiveTab('cards')}
                style={{
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: '.88rem',
                  border: 'none',
                  borderBottom: activeTab === 'cards' ? '3px solid #2563eb' : '3px solid transparent',
                  background: 'none',
                  color: activeTab === 'cards' ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                  marginBottom: -2,
                }}
              >
                🚨 Cartas Mais Erradas (Pontos Críticos)
              </button>
              <button
                onClick={() => setActiveTab('decks')}
                style={{
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: '.88rem',
                  border: 'none',
                  borderBottom: activeTab === 'decks' ? '3px solid #2563eb' : '3px solid transparent',
                  background: 'none',
                  color: activeTab === 'decks' ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                  marginBottom: -2,
                }}
              >
                📊 Desempenho por Pasta & Disciplina
              </button>
            </div>

            <div style={{ paddingBottom: 6 }}>
              <input
                type="text"
                placeholder={activeTab === 'cards' ? 'Filtrar cartas ou temas…' : 'Buscar pasta…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                  fontSize: '.82rem',
                  width: '200px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Conteúdo da Aba 1: Cartas Mais Erradas */}
          {activeTab === 'cards' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: '.84rem', color: '#64748b' }}>
                  Exibindo {filteredDifficultCards.length} carta(s) com pelo menos {minReviewsFilter} revisão:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.76rem', color: '#64748b' }}>Mínimo de revisões:</span>
                  <select
                    value={minReviewsFilter}
                    onChange={(e) => setMinReviewsFilter(Number(e.target.value))}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: '.78rem',
                      background: '#fff',
                    }}
                  >
                    <option value={1}>1+ revisão</option>
                    <option value={2}>2+ revisões</option>
                    <option value={5}>5+ revisões</option>
                    <option value={10}>10+ revisões</option>
                  </select>
                </div>
              </div>

              {filteredDifficultCards.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#64748b',
                    background: '#f8fafc',
                    borderRadius: 14,
                    border: '1px dashed #cbd5e1',
                  }}
                >
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}>🎉</span>
                  <strong>Nenhum ponto crítico detectado com os filtros atuais.</strong>
                  <p style={{ margin: '6px 0 0', fontSize: '.82rem' }}>
                    Assim que os estudantes realizarem revisões com o status &quot;Errei&quot;, as cartas aparecerão ordenadas aqui.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {filteredDifficultCards.slice(0, 30).map((item, idx) => {
                    return (
                      <div
                        key={item.card.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          border: item.errorRate >= 50 ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
                          background: item.errorRate >= 50 ? '#fff5f5' : '#f8fafc',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 14,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: '.72rem',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: '#e2e8f0',
                                color: '#334155',
                              }}
                            >
                              #{idx + 1}
                            </span>
                            <span style={{ fontSize: '.74rem', color: '#64748b', fontWeight: 700 }}>
                              {item.card.group || 'Geral'}
                            </span>
                            {item.studentCount > 1 && (
                              <span
                                style={{
                                  fontSize: '.7rem',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: '#e0e7ff',
                                  color: '#3730a3',
                                  fontWeight: 600,
                                }}
                              >
                                {item.studentCount} alunos
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '.88rem',
                              color: '#0f172a',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={item.card.q}
                          >
                            {item.card.q}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div>
                            <div
                              style={{
                                fontSize: '.9rem',
                                fontWeight: 900,
                                color: item.errorRate >= 40 ? '#dc2626' : item.errorRate >= 20 ? '#d97706' : '#15803d',
                              }}
                            >
                              {item.errorRate}% erro
                            </div>
                            <div style={{ fontSize: '.72rem', color: '#64748b' }}>
                              {item.lapses} erros em {item.reviews} rev.
                            </div>
                          </div>

                          {onOpenCard && (
                            <button
                              onClick={() => {
                                onOpenCard(item.card.id)
                                onClose()
                              }}
                              title="Revisar ou editar esta carta"
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
                              🔍 Ver
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Conteúdo da Aba 2: Desempenho por Pasta & Disciplina */}
          {activeTab === 'decks' && (
            <div>
              <div style={{ marginBottom: 12, fontSize: '.84rem', color: '#64748b' }}>
                Taxa de retenção e índice de erros consolidados por pasta (inclui subpastas médicas):
              </div>

              {filteredDeckStats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Nenhuma pasta encontrada com os filtros aplicados.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {filteredDeckStats.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '.9rem', color: '#1e293b' }}>{d.title}</strong>
                          <span style={{ marginLeft: 8, fontSize: '.75rem', color: '#64748b' }}>
                            ({d.cardsCount} cartas)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              fontSize: '.78rem',
                              fontWeight: 800,
                              color: d.errorRate >= 35 ? '#dc2626' : d.errorRate >= 20 ? '#d97706' : '#15803d',
                            }}
                          >
                            {d.reviews > 0 ? `${d.errorRate}% erro` : 'Sem revisões'}
                          </span>
                          <span style={{ fontSize: '.75rem', color: '#64748b' }}>
                            {d.reviews} revisões
                          </span>
                        </div>
                      </div>

                      {/* Barra de Retenção Visual */}
                      <div
                        style={{
                          height: 8,
                          borderRadius: 4,
                          background: '#e2e8f0',
                          overflow: 'hidden',
                          display: 'flex',
                        }}
                      >
                        <div
                          style={{
                            width: `${d.reviews > 0 ? d.retentionRate : 0}%`,
                            background: '#16a34a',
                            height: '100%',
                          }}
                          title={`Retenção: ${d.retentionRate}%`}
                        />
                        <div
                          style={{
                            width: `${d.reviews > 0 ? d.errorRate : 0}%`,
                            background: '#dc2626',
                            height: '100%',
                          }}
                          title={`Erro: ${d.errorRate}%`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
