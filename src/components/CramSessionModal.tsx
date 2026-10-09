import React, { useState, useMemo } from 'react'
import FolderTreeSelect from '@/components/FolderTreeSelect'

interface Deck {
  id: string
  title: string
  parent?: string
  kind?: string
}

interface Card {
  id: string
  deck: string
  q: string
  a: string
  group?: string
  ref?: string
  suspended?: boolean
  deleted?: boolean
  tags?: string[]
}

interface Review {
  card_id?: string
  card_ref?: string
  card?: string
  rating?: string
  stability?: number
}

interface Props {
  decks: Deck[]
  cards: Card[]
  reviews: Review[]
  initialDeckId?: string
  onClose: () => void
  onStart: (
    selectedCards: Card[],
    options: {
      title: string
      protectFsrs: boolean
      isCramMode: boolean
    }
  ) => void
}

export const CramSessionModal: React.FC<Props> = ({
  decks,
  cards,
  reviews,
  initialDeckId,
  onClose,
  onStart,
}) => {
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId || 'all')
  const [cardLimit, setCardLimit] = useState<number>(30)
  const [orderMode, setOrderMode] = useState<'random' | 'hardest' | 'dueFirst'>('random')
  const [protectFsrs, setProtectFsrs] = useState<boolean>(true)
  const [selectedTag, setSelectedTag] = useState<string>('all')

  // Mapeia erros por cartão para o modo "Mais Difíceis"
  const cardDifficultyMap = useMemo(() => {
    const map = new Map<string, { total: number; lapses: number }>()
    for (const r of reviews) {
      const cid = r.card_id || r.card_ref || r.card
      if (!cid) continue
      const cur = map.get(cid) || { total: 0, lapses: 0 }
      cur.total++
      if (r.rating === 'again') cur.lapses++
      map.set(cid, cur)
    }
    return map
  }, [reviews])

  // Coleta todas as tags disponíveis
  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>()
    for (const c of cards) {
      if (Array.isArray(c.tags)) {
        for (const t of c.tags) {
          if (t && t.trim()) tagsSet.add(t.trim())
        }
      }
    }
    return Array.from(tagsSet).sort()
  }, [cards])

  const cramDecks = useMemo(() => [
    { id: 'all', title: `📚 Todas as cartas da biblioteca médica (${cards.filter(c => !c.deleted).length} cartas)` },
    ...decks,
  ], [decks, cards])

  // Filtra e ordena as cartas com base nas escolhas
  const filteredAndSortedCards = useMemo(() => {
    // 1. Identifica IDs de pastas consideradas (se deck selecionado, inclui subpastas)
    let allowedDeckIds: Set<string> | null = null
    if (selectedDeckId !== 'all') {
      const ids = new Set<string>([selectedDeckId])
      let added = true
      while (added) {
        added = false
        for (const d of decks) {
          if (d.parent && ids.has(d.parent) && !ids.has(d.id)) {
            ids.add(d.id)
            added = true
          }
        }
      }
      allowedDeckIds = ids
    }

    // 2. Filtra cartas válidas
    let pool = cards.filter((c) => {
      if (c.deleted || c.suspended) return false
      if (allowedDeckIds && !allowedDeckIds.has(c.deck) && !allowedDeckIds.has((c as any).deck_id)) return false
      if (selectedTag !== 'all') {
        if (!c.tags || !c.tags.includes(selectedTag)) return false
      }
      return true
    })

    // 3. Aplica a ordenação desejada
    if (orderMode === 'random') {
      pool = [...pool].sort(() => Math.random() - 0.5)
    } else if (orderMode === 'hardest') {
      pool = [...pool].sort((a, b) => {
        const da = cardDifficultyMap.get(a.id)
        const db = cardDifficultyMap.get(b.id)
        const rateA = da && da.total > 0 ? da.lapses / da.total : 0
        const rateB = db && db.total > 0 ? db.lapses / db.total : 0
        if (rateB !== rateA) return rateB - rateA
        return (db?.lapses || 0) - (da?.lapses || 0)
      })
    }

    // 4. Limita a quantidade
    if (cardLimit > 0 && pool.length > cardLimit) {
      pool = pool.slice(0, cardLimit)
    }

    return pool
  }, [cards, decks, selectedDeckId, selectedTag, orderMode, cardLimit, cardDifficultyMap])

  const handleStart = () => {
    if (filteredAndSortedCards.length === 0) return
    const deckTitle = selectedDeckId === 'all'
      ? 'Geral da Biblioteca'
      : decks.find((d) => d.id === selectedDeckId)?.title || 'Pasta Selecionada'

    const title = `⚡ Véspera: ${deckTitle}`
    onStart(filteredAndSortedCards, {
      title,
      protectFsrs,
      isCramMode: true,
    })
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
          maxWidth: '540px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem' }}>⚡</span>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>
                Revisão de Véspera de Prova (Cram Mode)
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '.84rem', opacity: 0.94 }}>
              Treino intensivo para fixar conteúdos antes de avaliações, provas de módulo ou internato.
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
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Seletor de Pasta / Tema */}
          <div>
            <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
              📁 Escolha a Pasta ou Conteúdo
            </label>
            <FolderTreeSelect
              decks={cramDecks}
              selectedDeckId={selectedDeckId}
              onSelect={(id) => setSelectedDeckId(id)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Filtro por Tag (se houver) */}
          {availableTags.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
                🏷️ Filtrar por Tag (Opcional)
              </label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  fontSize: '.85rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  background: '#f8fafc',
                }}
              >
                <option value="all">Todas as tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantidade de Cartões */}
          <div>
            <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
              🎯 Quantidade de Cartões para a Sessão
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[15, 30, 50, 0].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCardLimit(num)}
                  style={{
                    padding: '9px',
                    borderRadius: 10,
                    border: `1.5px solid ${cardLimit === num ? '#d97706' : '#e2e8f0'}`,
                    background: cardLimit === num ? '#fffbeb' : '#ffffff',
                    color: cardLimit === num ? '#b45309' : '#475569',
                    fontWeight: cardLimit === num ? 800 : 600,
                    fontSize: '.84rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {num === 0 ? 'Todas' : `${num} cartas`}
                </button>
              ))}
            </div>
          </div>

          {/* Critério de Ordenação */}
          <div>
            <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
              🔄 Ordem dos Cartões
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => setOrderMode('random')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${orderMode === 'random' ? '#d97706' : '#e2e8f0'}`,
                  background: orderMode === 'random' ? '#fffbeb' : '#ffffff',
                  color: orderMode === 'random' ? '#b45309' : '#475569',
                  fontWeight: orderMode === 'random' ? 800 : 600,
                  fontSize: '.82rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                🎲 <strong>Embaralhado</strong>
                <div style={{ fontSize: '.72rem', opacity: 0.8, marginTop: 2 }}>Aleatório para simular prova</div>
              </button>

              <button
                type="button"
                onClick={() => setOrderMode('hardest')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${orderMode === 'hardest' ? '#d97706' : '#e2e8f0'}`,
                  background: orderMode === 'hardest' ? '#fffbeb' : '#ffffff',
                  color: orderMode === 'hardest' ? '#b45309' : '#475569',
                  fontWeight: orderMode === 'hardest' ? 800 : 600,
                  fontSize: '.82rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                🚨 <strong>Mais Difíceis</strong>
                <div style={{ fontSize: '.72rem', opacity: 0.8, marginTop: 2 }}>Foco nas cartas com mais erros</div>
              </button>
            </div>
          </div>

          {/* Toggle Chave: Proteção de Intervalos FSRS */}
          <div
            onClick={() => setProtectFsrs(!protectFsrs)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              background: protectFsrs ? '#f0fdf4' : '#fff7ed',
              border: `1.5px solid ${protectFsrs ? '#86efac' : '#fed7aa'}`,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={protectFsrs}
              onChange={() => {}}
              style={{ accentColor: '#16a34a', width: 18, height: 18, marginTop: 2, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: '.86rem', fontWeight: 800, color: protectFsrs ? '#15803d' : '#9a3412' }}>
                🛡️ Proteger intervalos FSRS (Estudo Livre)
              </div>
              <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
                {protectFsrs
                  ? 'Ativado: você revisa livremente sem bagunçar suas datas de vencimento reais. Ideal para pré-prova!'
                  : 'Desativado: suas respostas atualizarão as datas oficiais de repetição espaçada das cartas no banco.'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer com Botão de Ação */}
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
          <div style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 700 }}>
            {filteredAndSortedCards.length === 0 ? (
              <span style={{ color: '#ef4444' }}>Nenhuma carta encontrada</span>
            ) : (
              <span>🎯 <strong>{filteredAndSortedCards.length}</strong> cartas prontas para o treino</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '.85rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              disabled={filteredAndSortedCards.length === 0}
              onClick={handleStart}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: filteredAndSortedCards.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                fontSize: '.88rem',
                fontWeight: 800,
                cursor: filteredAndSortedCards.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: filteredAndSortedCards.length === 0 ? 'none' : '0 4px 14px rgba(217, 119, 6, 0.3)',
              }}
            >
              ⚡ Iniciar Maratona ({filteredAndSortedCards.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
