import React, { useState, useMemo } from 'react'
import { normalizeSearchText, highlightMatch } from '@/lib/searchUtils'

interface Card {
  id: string
  deck: string
  q: string
  a: string
  group?: string
  ref?: string
  suspended?: boolean
  deleted?: boolean
  diagram_svg?: string
  image?: string
  choices?: string[] | null
  reverse?: boolean
  clinical?: boolean
  __reverse?: boolean
  occlusion?: any
  tags?: string[]
  imageUrl?: string
}

interface Deck {
  id: string
  title: string
  parent?: string
  kind?: string
}

interface Review {
  card_id?: string
  card_ref?: string
  card?: string
  rating?: string
  stability?: number
  difficulty?: number
  reviewed_at?: string
}

interface Props {
  type: 'attention' | 'critical'
  cards: Card[]
  decks: Deck[]
  reviews?: Review[]
  onClose: () => void
  onStudyAll: (cardsToStudy: Card[], sessionTitle: string) => void
  onStudySingle: (card: Card) => void
  onRemoveCard: (cardId: string) => void
  onClearAll?: () => void
}

export const SpecialCardsModal: React.FC<Props> = ({
  type,
  cards,
  decks,
  reviews = [],
  onClose,
  onStudyAll,
  onStudySingle,
  onRemoveCard,
  onClearAll,
}) => {
  const [search, setSearch] = useState('')
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all')
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  // Mapa de Decks para lookup rápido de títulos
  const deckMap = useMemo(() => {
    const map = new Map<string, Deck>()
    for (const d of decks) {
      map.set(d.id, d)
    }
    return map
  }, [decks])

  // Contagem de erros por cartão (para cartas críticas)
  const errorCountByCard = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of reviews) {
      if (r.rating === 'again') {
        const id = (r.card_id || r.card_ref || r.card) as string
        if (id) {
          counts.set(id, (counts.get(id) || 0) + 1)
        }
      }
    }
    return counts
  }, [reviews])

  // Pastas presentes nesta coleção de cartões
  const availableDecks = useMemo(() => {
    const deckIds = new Set<string>()
    for (const c of cards) {
      if (c.deck) deckIds.add(c.deck)
    }
    return Array.from(deckIds)
      .map((id) => deckMap.get(id) || { id, title: 'Pasta não identificada' })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [cards, deckMap])

  // Filtro de cartões
  const filteredCards = useMemo(() => {
    const normSearch = normalizeSearchText(search)
    return cards.filter((c) => {
      if (selectedDeckId !== 'all' && c.deck !== selectedDeckId) {
        return false
      }
      if (!normSearch) return true

      const deckTitle = deckMap.get(c.deck)?.title || ''
      const qNorm = normalizeSearchText(c.q)
      const aNorm = normalizeSearchText(c.a)
      const groupNorm = normalizeSearchText(c.group)
      const deckNorm = normalizeSearchText(deckTitle)

      return (
        qNorm.includes(normSearch) ||
        aNorm.includes(normSearch) ||
        groupNorm.includes(normSearch) ||
        deckNorm.includes(normSearch)
      )
    })
  }, [cards, selectedDeckId, search, deckMap])

  const isAttention = type === 'attention'
  const titleText = isAttention ? 'Cartas com Alerta de Atenção' : 'Cartas Críticas (Leeches)'
  const subtitleText = isAttention
    ? 'Cartas marcadas durante os estudos onde você precisa de reforço e atenção especial para dominar o assunto.'
    : 'Cartas com 2 ou mais erros acumulados nas revisões recentes do motor FSRS-5.'
  const accentColor = isAttention ? '#d97706' : '#dc2626'
  const accentBg = isAttention ? '#fef3c7' : '#fee2e2'
  const accentBorder = isAttention ? '#fcd34d' : '#fca5a5'
  const icon = isAttention ? '⚠️' : '🩸'

  const handleStudyAllClick = () => {
    if (filteredCards.length === 0) return
    const sessionName = isAttention
      ? `⚠️ Atenção · ${filteredCards.length} ${filteredCards.length === 1 ? 'carta' : 'cartas'}`
      : `🩸 Críticas · ${filteredCards.length} ${filteredCards.length === 1 ? 'carta' : 'cartas'}`
    onStudyAll(filteredCards, sessionName)
    onClose()
  }

  const handleStudySingleClick = (c: Card, e: React.MouseEvent) => {
    e.stopPropagation()
    onStudySingle(c)
    onClose()
  }

  const handleRemoveClick = (c: Card, e: React.MouseEvent) => {
    e.stopPropagation()
    onRemoveCard(c.id.replace(/::rev$/, ''))
  }

  const toggleExpand = (cardId: string) => {
    setExpandedCardId((prev) => (prev === cardId ? null : cardId))
  }

  // Renderizador simplificado de texto/html com limpeza de tags
  const renderPreviewSnippet = (text: string) => {
    if (!text) return ''
    const clean = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '[$1]')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return clean.slice(0, 160) + (clean.length > 160 ? '...' : '')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'mrFadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: 20,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'mrScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(to bottom, #ffffff, #f8fafc)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: accentBg,
                border: `1.5px solid ${accentBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {titleText}
                </h2>
                <span
                  style={{
                    padding: '2px 9px',
                    borderRadius: 999,
                    background: accentBg,
                    border: `1px solid ${accentBorder}`,
                    color: accentColor,
                    fontSize: '.75rem',
                    fontWeight: 800,
                  }}
                >
                  {cards.length} {cards.length === 1 ? 'carta' : 'cartas'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '.84rem', color: '#64748b', lineHeight: 1.4 }}>
                {subtitleText}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: 10,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              color: '#64748b',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Barra de Ações Rápidas & Filtros */}
        <div
          style={{
            padding: '12px 24px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {/* Botão de Estudo Principal */}
          <button
            type="button"
            disabled={filteredCards.length === 0}
            onClick={handleStudyAllClick}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background:
                filteredCards.length === 0
                  ? '#cbd5e1'
                  : isAttention
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#ffffff',
              fontSize: '.86rem',
              fontWeight: 800,
              cursor: filteredCards.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow:
                filteredCards.length === 0
                  ? 'none'
                  : isAttention
                    ? '0 3px 12px rgba(217, 119, 6, 0.28)'
                    : '0 3px 12px rgba(220, 38, 38, 0.28)',
              transition: 'transform 0.1s ease',
            }}
          >
            <span>▶️</span>
            <span>Estudar Todas ({filteredCards.length})</span>
          </button>

          {/* Campo de Busca & Filtro de Pasta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar na lista..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '.82rem',
                  outline: 'none',
                  background: '#f8fafc',
                  fontFamily: 'inherit',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '.8rem',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {availableDecks.length > 1 && (
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '.82rem',
                  background: '#f8fafc',
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer',
                  maxWidth: 180,
                }}
              >
                <option value="all">📁 Todas as pastas ({cards.length})</option>
                {availableDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}

            {onClearAll && cards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Deseja retirar todas as ${cards.length} cartas desta lista?`)) {
                    onClearAll()
                  }
                }}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Limpar todos os registros desta lista"
              >
                Limpar Lista
              </button>
            )}
          </div>
        </div>

        {/* Lista de Cartões (Scrollável) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {cards.length === 0 ? (
            <div
              style={{
                padding: '48px 20px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: 16,
                border: '1.5px dashed #cbd5e1',
                margin: 'auto 0',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>
                Nenhuma carta {isAttention ? 'em atenção' : 'crítica'} no momento!
              </h3>
              <p style={{ fontSize: '.86rem', color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>
                {isAttention
                  ? 'Durante suas sessões de estudo, use o botão "⚠️ Atenção" no topo do cartão sempre que encontrar um assunto que você realmente não domine.'
                  : 'Nenhum cartão acumulou 2 ou mais erros nas revisões recentes. Seu domínio e retenção estão excelentes!'}
              </p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b', fontSize: '.88rem' }}>
              Nenhuma carta encontrada com os filtros de busca atuais.
            </div>
          ) : (
            filteredCards.map((card, idx) => {
              const cleanId = card.id.replace(/::rev$/, '')
              const isExpanded = expandedCardId === cleanId
              const deckTitle = deckMap.get(card.deck)?.title || 'Pasta de Estudo'
              const errorCount = errorCountByCard.get(cleanId) || 0

              return (
                <div
                  key={card.id || idx}
                  style={{
                    background: '#ffffff',
                    borderRadius: 14,
                    border: isExpanded ? `1.5px solid ${accentBorder}` : '1px solid #e2e8f0',
                    boxShadow: isExpanded
                      ? '0 8px 24px rgba(0, 0, 0, 0.08)'
                      : '0 2px 6px rgba(0, 0, 0, 0.02)',
                    transition: 'all 0.15s ease',
                    overflow: 'hidden',
                  }}
                >
                  {/* Cabeçalho do Cartão na Lista */}
                  <div
                    onClick={() => toggleExpand(cleanId)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      cursor: 'pointer',
                      background: isExpanded ? '#fafaf9' : '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                      {/* Badge da Pasta */}
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: '#f1f5f9',
                          color: '#475569',
                          fontSize: '.72rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        📁 {deckTitle}
                      </span>

                      {/* Badge do Status (Atenção ou Erros) */}
                      {isAttention ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '.72rem',
                            fontWeight: 800,
                          }}
                        >
                          ⚠️ Atenção
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#fee2e2',
                            color: '#b91c1c',
                            fontSize: '.72rem',
                            fontWeight: 800,
                          }}
                        >
                          🩸 {errorCount} {errorCount === 1 ? 'erro' : 'erros'}
                        </span>
                      )}

                      {card.clinical && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: '.72rem',
                            fontWeight: 700,
                          }}
                        >
                          🩺 Caso Clínico
                        </span>
                      )}

                      {/* Prévia da Pergunta */}
                      <div
                        style={{
                          width: '100%',
                          fontSize: '.88rem',
                          fontWeight: 700,
                          color: '#1e293b',
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {highlightMatch(renderPreviewSnippet(card.q), search)}
                      </div>
                    </div>

                    {/* Botões de Ação do Cartão */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleStudySingleClick(card, e)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #10b981',
                          background: '#ecfdf5',
                          color: '#047857',
                          fontSize: '.74rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Estudar apenas esta carta"
                      >
                        ▶️ Estudar
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(cleanId)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: isExpanded ? '#e2e8f0' : '#ffffff',
                          color: '#334155',
                          fontSize: '.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Acessar conteúdo completo por dentro"
                      >
                        {isExpanded ? '▲ Ocultar' : '👁️ Ver por dentro'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleRemoveClick(card, e)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 8,
                          border: '1px solid #fca5a5',
                          background: '#fff1f2',
                          color: '#e11d48',
                          fontSize: '.74rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                        title={`Tirar esta carta da lista de ${isAttention ? 'Atenção' : 'Críticas'}`}
                      >
                        ✕ Tirar
                      </button>
                    </div>
                  </div>

                  {/* Painel de Visualização Completa por Dentro (Acessar Cartão) */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderTop: '1px solid #e2e8f0',
                        background: '#ffffff',
                        animation: 'mrFadeIn 0.15s ease',
                      }}
                    >
                      {/* Box da Pergunta Completa */}
                      <div style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            fontSize: '.72rem',
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            color: '#64748b',
                            marginBottom: 6,
                            textTransform: 'uppercase',
                          }}
                        >
                          ❓ Pergunta / Enunciado Clínico:
                        </div>
                        <div
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            fontSize: '.9rem',
                            color: '#0f172a',
                            lineHeight: 1.6,
                            overflowX: 'auto',
                          }}
                          dangerouslySetInnerHTML={{ __html: card.q }}
                        />
                      </div>

                      {/* Box da Resposta Completa */}
                      <div style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            fontSize: '.72rem',
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            color: '#059669',
                            marginBottom: 6,
                            textTransform: 'uppercase',
                          }}
                        >
                          💡 Resposta &amp; Conduta Médica (Verso):
                        </div>
                        <div
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            fontSize: '.9rem',
                            color: '#14532d',
                            lineHeight: 1.6,
                            overflowX: 'auto',
                          }}
                          dangerouslySetInnerHTML={{ __html: card.a }}
                        />
                      </div>

                      {/* Mídia / Imagem (se houver) */}
                      {(card.imageUrl || card.image) && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6 }}>
                            🖼️ Imagem Anexada:
                          </div>
                          <img
                            src={card.imageUrl || card.image}
                            alt="Mídia médica"
                            style={{
                              maxWidth: '100%',
                              maxHeight: 260,
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                              objectFit: 'contain',
                            }}
                          />
                        </div>
                      )}

                      {/* Rodapé Interno do Cartão Expandido */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 10,
                          borderTop: '1px solid #f1f5f9',
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                          ID: <code style={{ fontSize: '.74rem', background: '#f1f5f9', padding: '1px 4px', borderRadius: 4 }}>{cleanId}</code>
                          {card.group && <span> · Grupo: <strong>{card.group}</strong></span>}
                          {card.ref && <span> · Ref: <em>{card.ref}</em></span>}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveClick(card, e)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #fca5a5',
                              background: '#fff1f2',
                              color: '#be123c',
                              fontSize: '.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ✕ Tirar de {isAttention ? 'Atenção' : 'Crítica'}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleStudySingleClick(card, e)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#16a34a',
                              color: '#ffffff',
                              fontSize: '.78rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span>▶️ Estudar esta carta agora</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Rodapé do Modal */}
        <div
          style={{
            padding: '14px 24px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '.84rem', color: '#64748b', fontWeight: 700 }}>
            Mostrando <strong>{filteredCards.length}</strong> de <strong>{cards.length}</strong> {cards.length === 1 ? 'carta' : 'cartas'}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
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
              Fechar
            </button>

            <button
              type="button"
              disabled={filteredCards.length === 0}
              onClick={handleStudyAllClick}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background:
                  filteredCards.length === 0
                    ? '#cbd5e1'
                    : isAttention
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#ffffff',
                fontSize: '.86rem',
                fontWeight: 800,
                cursor: filteredCards.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow:
                  filteredCards.length === 0
                    ? 'none'
                    : isAttention
                      ? '0 3px 12px rgba(217, 119, 6, 0.28)'
                      : '0 3px 12px rgba(220, 38, 38, 0.28)',
              }}
            >
              ▶️ Estudar Agora ({filteredCards.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpecialCardsModal
