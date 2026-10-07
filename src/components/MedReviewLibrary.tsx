import { Fragment, useEffect, useMemo, useState } from 'react'
import { compareDecks } from '@/lib/deckSort'
import { parseCardsFromCsv, type ParsedCsvCard } from '@/lib/csvImport'
import {
  createCard,
  createDeck,
  deleteCard,
  deleteDeck,
  importCards,
  importCardsAuto,
  moveCard,
  moveDeck,
  renameDeck,
  resetDeck,
  setCardSuspended,
  updateCard,
  uploadCardImage,
} from '@/services/medreview'

type Deck = { id: string; title: string; kind: string; order: number; parent?: string }
type Card = {
  id: string
  deck: string
  q: string
  a: string
  group: string
  ref: string
  suspended?: boolean
  diagram_svg?: string
  image?: string
  choices?: string[] | null
  reverse?: boolean
  clinical?: boolean
  deleted?: boolean
}
type Props = {
  decks: Deck[]
  cards: Card[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onStudy: (deckId: string) => void
}
type ModalState =
  | { type: 'none' }
  | { type: 'folder'; parentId: string; defaultKind: 'tutoria' | 'prova' | 'custom' }
  | { type: 'rename'; deckId: string; title: string }
  | { type: 'card'; deckId: string; card?: Card }
  | { type: 'import'; deckId: string }
  | { type: 'importAuto' }
  | { type: 'move'; card: Card }
  | { type: 'moveDeck'; deckId: string }
  | { type: 'export' }

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.65rem 0.8rem',
  borderRadius: 9,
  border: '1px solid #cbd5e1',
  font: 'inherit',
  marginBottom: '0.55rem',
  background: '#fff',
}
const actionStyle: React.CSSProperties = {
  border: '1px solid #16a34a',
  borderRadius: 9,
  padding: '0.55rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 700,
  background: '#16a34a',
  color: '#fff',
  fontSize: '0.85rem',
}
const secondaryStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
}
const dangerStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fecaca',
}
const libCss = `
.mr-lib-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-bottom:1px solid #d1fae5;box-shadow:0 4px 18px rgba(20,83,45,.06);display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 20px;font-family:Inter,system-ui,sans-serif}
.mr-lib-back{border:1px solid #bbf7d0;border-radius:11px;padding:9px 14px;color:#15803d;background:#f0fdf4;font:700 .84rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .18s ease}
.mr-lib-back:hover{background:#dcfce7;border-color:#86efac}
.mr-lib-title{color:#14532d;font-size:1rem;font-weight:900}
.mr-lib-spacer{flex:1}
.mr-lib-count{color:#64748b;font-size:.85rem;font-weight:700}
.mr-lib-main{max-width:1120px;margin:0 auto;padding:22px 20px 60px;font-family:Inter,system-ui,sans-serif}
.mr-lib-section{border:1.5px solid #d1fae5;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.05);margin-bottom:18px;overflow:hidden}
.mr-lib-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;background:#f0fdf4;border-bottom:1px solid #d1fae5}
.mr-lib-section-head h2{margin:0;color:#14532d;font-size:1.02rem;font-weight:900}
.mr-lib-section-head p{margin:3px 0 0;color:#6b7280;font-size:.8rem}
.mr-lib-deck{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap}
.mr-lib-deck.is-dragging{opacity:.4}
.mr-lib-section-over{outline:2px dashed #16a34a;outline-offset:-2px;background:#f0fdf4;border-radius:12px}
.mr-lib-deck.drag-valid{outline:2px dashed #16a34a;outline-offset:-2px;background:#f0fdf4}
.mr-lib-deck:last-child{border-bottom:0}
.mr-lib-deck.is-child{padding-left:44px;background:#fafcfa}
.mr-lib-deck-name{display:flex;align-items:center;gap:9px;flex:1;min-width:180px;cursor:pointer;border:0;background:none;padding:0;text-align:left;font:inherit}
.mr-lib-deck-name:hover .mr-lib-deck-title{color:#15803d}
.mr-lib-twist{width:20px;height:20px;display:grid;place-items:center;color:#15803d;font-size:.8rem;flex:0 0 20px}
.mr-lib-deck-icon{font-size:1.15rem}
.mr-lib-deck-title{color:#14532d;font-weight:800;font-size:.92rem}
.mr-lib-deck-tag{padding:3px 9px;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:.7rem;font-weight:800;white-space:nowrap}
.mr-lib-deck-tag.warn{background:#fef3c7;color:#b45309}
.mr-lib-deck-actions{display:flex;gap:6px;flex-wrap:wrap}
.mr-lib-mini{border:1px solid #bbf7d0;border-radius:8px;padding:6px 10px;background:#fff;color:#15803d;font:700 .74rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .15s ease}
.mr-lib-mini:hover{background:#f0fdf4;border-color:#86efac}
.mr-lib-mini.danger{color:#b91c1c;border-color:#fecaca}
.mr-lib-mini.danger:hover{background:#fef2f2}
.mr-lib-empty{padding:26px 18px;color:#64748b;font-size:.88rem;text-align:center}
.mr-lib-panel{border:1.5px solid #d1fae5;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.05);padding:20px;margin-bottom:18px}
.mr-lib-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.mr-lib-panel-head h2{margin:0;color:#14532d;font-size:1.25rem;font-weight:900;letter-spacing:-.02em}
.mr-lib-panel-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.mr-lib-card-row{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:9px;background:#fff;flex-wrap:wrap}
.mr-lib-card-q{flex:1;min-width:200px;color:#1f2937;font-size:.9rem;font-weight:600;line-height:1.45}
.mr-lib-card-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}
.mr-lib-card-chip{padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:.68rem;font-weight:700}
.mr-lib-card-chip.susp{background:#fef3c7;color:#b45309}
.mr-lib-card-actions{display:flex;gap:5px;flex-wrap:wrap}
.mr-lib-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:18px}
.mr-lib-modal{background:#fff;border-radius:18px;padding:22px;width:100%;max-width:460px;box-shadow:0 20px 50px rgba(15,23,42,.25);max-height:88vh;overflow:auto}
.mr-lib-modal h3{margin:0 0 4px;color:#14532d;font-size:1.1rem;font-weight:900}
.mr-lib-modal p{margin:0 0 14px;color:#64748b;font-size:.83rem}
.mr-lib-label{display:block;font-size:.8rem;font-weight:700;color:#475569;margin-bottom:4px}
.mr-lib-notice{padding:0.7rem 0.9rem;border-radius:9px;margin-bottom:10px;font-size:.88rem}
@media(max-width:720px){.mr-lib-main{padding:16px 12px 48px}.mr-lib-deck{padding:11px 12px}.mr-lib-deck.is-child{padding-left:34px}.mr-lib-deck-actions{width:100%;padding-left:30px}.mr-lib-panel{padding:16px 14px}.mr-lib-panel-head h2{font-size:1.08rem}}
`

function normalizeJsonCards(input: unknown): ParsedCsvCard[] {
  let rows: any = input
  if (rows && !Array.isArray(rows))
    rows = rows.flashcards || rows.cards || rows.cartoes || rows.cartas
  if (!Array.isArray(rows))
    throw new Error('JSON deve conter uma lista em flashcards, cards ou cartoes.')
  return rows
    .map((row: any) => {
      const clinicoRaw = String(
        row.clinical ?? row.clinico ?? row['modo_clinico'] ?? row.modoClinico ?? '',
      )
        .trim()
        .toLowerCase()
      const q = String(
        row.q ?? row.question ?? row.pergunta ?? row.front ?? row.frente ?? '',
      ).trim()
      const clinicalFlag =
        clinicoRaw === ''
          ? /caso cl[ií]nico/i.test(q)
          : clinicoRaw !== '0' &&
            clinicoRaw !== 'nao' &&
            clinicoRaw !== 'não' &&
            clinicoRaw !== 'false' &&
            clinicoRaw !== 'normal'
      const imgRaw = String(
        row.imageUrl ?? row.image ?? row['imagem'] ?? row.imagem ?? row.img ?? '',
      ).trim()
      return {
        q,
        a: String(row.a ?? row.answer ?? row.resposta ?? row.back ?? row.verso ?? '').trim(),
        group: String(row.group ?? row.grupo ?? row.category ?? row.categoria ?? '').trim(),
        ref: String(row.ref ?? row.referencia ?? row.source ?? row.fonte ?? '').trim(),
        clinical: clinicalFlag,
        imageUrl: /^https?:\/\//i.test(imgRaw) ? imgRaw : '',
      }
    })
    .filter((row: ParsedCsvCard) => row.q && row.a)
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mr-lib-overlay" onClick={onClose}>
      <div className="mr-lib-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

export default function MedReviewLibrary({ decks, cards, onBack, onRefresh, onStudy }: Props) {
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [folderTitle, setFolderTitle] = useState('')
  const [folderKind, setFolderKind] = useState<'tutoria' | 'prova' | 'custom'>('custom')
  const [folderParent, setFolderParent] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [cardQ, setCardQ] = useState('')
  const [cardA, setCardA] = useState('')
  const [cardGroup, setCardGroup] = useState('')
  const [cardRef, setCardRef] = useState('')
  const [cardImg, setCardImg] = useState('')
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [cardChoices, setCardChoices] = useState('')
  const [cardReverse, setCardReverse] = useState(false)
  const [cardClinical, setCardClinical] = useState(false)
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (selectedDeckId && !decks.some((deck) => deck.id === selectedDeckId)) {
      setSelectedDeckId('')
    }
  }, [decks, selectedDeckId])

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId)
  const deckCards = useMemo(
    () => cards.filter((card) => card.deck === selectedDeckId),
    [cards, selectedDeckId],
  )
  // Contador por SUBÁRVORE: pasta organizadora tem as cartas nas filhas —
  // contar a árvore inteira, não só cartas diretas.
  const countOf = (deckId: string) => {
    const seen = new Set<string>([deckId])
    let grew = true
    while (grew) {
      grew = false
      for (const d of decks) {
        if (d.parent && seen.has(d.parent) && !seen.has(d.id) && !d.deleted) {
          seen.add(d.id)
          grew = true
        }
      }
    }
    return cards.filter((c) => seen.has(c.deck) && !c.deleted).length
  }
  const childrenOf = (deckId: string) =>
    decks.filter((d) => d.parent === deckId).sort((a, b) => compareDecks(a, b))
  const subtreeIdsOf = (deckId: string) => {
    const seen = new Set<string>([deckId])
    let grew = true
    while (grew) {
      grew = false
      for (const deck of decks) {
        if (deck.parent && seen.has(deck.parent) && !seen.has(deck.id) && !deck.deleted) {
          seen.add(deck.id)
          grew = true
        }
      }
    }
    return [...seen].filter((id) => id !== deckId)
  }
  const sections: {
    key: string
    icon: string
    title: string
    subtitle: string
    kind: 'tutoria' | 'prova' | 'custom'
  }[] = [
    {
      key: 'tutoria',
      icon: '🩺',
      title: 'Tutoria',
      subtitle: 'Decks do PBL e subpastas que você criar',
      kind: 'tutoria',
    },
    {
      key: 'prova',
      icon: '📝',
      title: 'Prova de Módulo',
      subtitle: 'Bancos de revisão dos módulos',
      kind: 'prova',
    },
    {
      key: 'custom',
      icon: '📁',
      title: 'Minhas Pastas',
      subtitle: 'Suas pastas livres, com subpastas ilimitadas',
      kind: 'custom',
    },
  ]
  const rootDecksOf = (kind: string) =>
    decks
      .filter((d) => d.kind === kind && !d.parent && !d.deleted)
      .sort((a, b) => compareDecks(a, b))
  // Só mostramos seções com conteúdo na raiz. O comando global "Nova pasta"
  // abaixo continua oferecendo todas as três categorias, então uma seção vazia
  // não vira um beco sem saída para criação.
  const visibleSections = sections.filter((section) => rootDecksOf(section.kind).length > 0)

  const run = async (task: () => Promise<void>, okMsg?: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await task()
      await onRefresh()
      if (okMsg) setMessage(okMsg)
      return true
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Não foi possível salvar as alterações.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openFolderModal = (
    parentId = '',
    defaultKind: 'tutoria' | 'prova' | 'custom' = 'custom',
  ) => {
    setFolderTitle('')
    setFolderKind(defaultKind)
    setFolderParent(parentId)
    setModal({ type: 'folder', parentId, defaultKind })
  }
  const submitFolder = async () => {
    if (!folderTitle.trim()) return setError('Informe o nome da pasta.')
    const done = await run(
      async () => {
        const result: any = await createDeck(folderTitle, folderKind, folderParent || undefined)
        if (folderParent) setExpanded((e) => ({ ...e, [folderParent]: true }))
        setSelectedDeckId(result.id)
      },
      folderParent ? 'Subpasta criada.' : 'Pasta criada.',
    )
    if (done) setModal({ type: 'none' })
  }
  const submitRename = async () => {
    if (!modal.type || modal.type !== 'rename' || !renameTitle.trim())
      return setError('Informe o novo nome.')
    const done = await run(async () => {
      await renameDeck(modal.deckId, renameTitle)
    }, 'Pasta renomeada.')
    if (done) setModal({ type: 'none' })
  }
  const removeDeck = async (deck: Deck) => {
    const kids = childrenOf(deck.id).length
    if (
      !window.confirm(
        `Excluir “${deck.title}”${kids ? ` e suas ${kids} subpasta(s)` : ''}? As cartas desta pasta também saem da sua biblioteca. Esta ação não pode ser desfeita aqui.`,
      )
    )
      return
    await run(async () => {
      await deleteDeck(deck.id)
      if (selectedDeckId === deck.id) setSelectedDeckId('')
    }, 'Pasta excluída.')
  }
  const resetDeckProgress = async (deck: Deck) => {
    const count = countOf(deck.id)
    if (
      !window.confirm(
        `Resetar o progresso de “${deck.title}”?${count ? ` As ${count} carta(s) desta pasta (e das subpastas) voltam ao estado inicial (novas, sem intervalos).` : ''} As cartas não são apagadas.`,
      )
    )
      return
    await run(async () => {
      await resetDeck(deck.id)
    }, 'Progresso resetado — cartas voltaram a ser novas.')
  }
  const openCardModal = (deckId: string, card?: Card) => {
    setCardQ(card?.q || '')
    setCardA(card?.a || '')
    setCardGroup(card?.group || '')
    setCardRef(card?.ref || '')
    setCardImg(card?.diagram_svg && /^https?:\/\//i.test(card.diagram_svg) ? card.diagram_svg : '')
    setCardFile(null)
    const existingChoices: string[] = Array.isArray(card?.choices)
      ? (card!.choices as string[])
      : []
    setCardChoices(existingChoices.join('\n'))
    setCardReverse(!!card?.reverse)
    setCardClinical(!!card?.clinical)
    setModal({ type: 'card', deckId, card })
  }
  const openMoveModal = (card: Card) => {
    setMoveTarget('')
    setMoveCardExpanded({})
    setModal({ type: 'move', card })
  }
  const [moveTarget, setMoveTarget] = useState('')
  const [moveDeckExpanded, setMoveDeckExpanded] = useState<Record<string, boolean>>({})
  const [moveCardExpanded, setMoveCardExpanded] = useState<Record<string, boolean>>({})
  const openMoveDeckModal = (deckId: string) => {
    setMoveDeckTarget('')
    setMoveDeckExpanded({})
    setModal({ type: 'moveDeck', deckId })
  }
  const [moveDeckTarget, setMoveDeckTarget] = useState('')
  const submitMoveDeck = async () => {
    if (modal.type !== 'moveDeck') return
    const deck = decks.find((d) => d.id === modal.deckId)
    const goingRoot = moveDeckTarget.startsWith('@root:')
    const rootKind = goingRoot ? moveDeckTarget.slice(6) : ''
    if (!moveDeckTarget) return setError('Escolha a pasta de destino ou o nível inicial.')
    const done = await run(
      async () => {
        await moveDeck(
          modal.deckId,
          goingRoot ? '' : moveDeckTarget,
          goingRoot ? (rootKind as 'tutoria' | 'prova' | 'custom') : undefined,
        )
        if (!goingRoot && moveDeckTarget) setExpanded((e) => ({ ...e, [moveDeckTarget]: true }))
      },
      goingRoot ? 'Pasta movida para o nível inicial.' : 'Pasta movida.',
    )
    if (done) {
      setMoveDeckTarget('')
      setModal({ type: 'none' })
    }
  }
  const [moveToRootKind, setMoveToRootKind] = useState('')
  // Arrastar e soltar de pastas: dragstart marca a pasta; dragover valida
  // destino (não pode ser a própria nem descendente); drop chama deck_move.
  const [dragDeckId, setDragDeckId] = useState('')
  const dragOverOk = (targetId: string) => {
    if (!dragDeckId || dragDeckId === targetId) return false
    let cur: string | undefined = targetId
    while (cur) {
      if (cur === dragDeckId) return false
      cur = decks.find((d) => d.id === cur)?.parent
    }
    return true
  }
  const submitDragDeck = async (targetId: string) => {
    const from = dragDeckId
    setDragDeckId('')
    const deck = decks.find((d) => d.id === from)
    const target = decks.find((d) => d.id === targetId)
    if (!deck || !target) return
    if (!window.confirm(`Mover "${deck.title}" para dentro de "${target.title}"?`)) return
    await run(async () => {
      await moveDeck(from, targetId)
      setExpanded((e) => ({ ...e, [targetId]: true }))
    }, `"${deck.title}" movida para "${target.title}".`)
  }
  // Soltar na própria seção = voltar para o nível inicial (raiz da seção).
  const submitDragToRoot = async (kind: 'tutoria' | 'prova' | 'custom') => {
    const from = dragDeckId
    setDragDeckId('')
    const deck = decks.find((d) => d.id === from)
    if (!deck) return
    if (deck.kind === kind && !deck.parent) return
    if (
      !window.confirm(
        `Mover "${deck.title}" para o nível inicial de ${kind === 'prova' ? 'Prova de Módulo' : kind === 'custom' ? 'Minhas Pastas' : 'Tutoria'}?`,
      )
    )
      return
    await run(async () => {
      await moveDeck(from, '', kind)
    }, `"${deck.title}" movida para o nível inicial.`)
  }
  const submitMove = async () => {
    if (modal.type !== 'move') return
    if (!moveTarget) return setError('Escolha a pasta de destino.')
    const done = await run(async () => {
      await moveCard(modal.card.id, moveTarget)
      setSelectedDeckId(moveTarget)
    }, 'Carta movida.')
    if (done) {
      setMoveTarget('')
      setModal({ type: 'none' })
    }
  }
  const allDecksSorted = useMemo(
    () =>
      [...decks]
        .sort((a, b) => compareDecks(a, b))
        .map((d) => ({
          id: d.id,
          label: (d.parent ? '↳ ' : '') + d.title + (d.kind === 'prova' ? ' (Prova)' : ''),
        })),
    [decks],
  )
  const renderMoveTree = (
    parentId: string,
    target: string,
    setTarget: (id: string) => void,
    expanded: Record<string, boolean>,
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    blockedIds: Set<string> = new Set(),
    depth = 0,
  ): React.ReactNode => {
    const rows = decks
      .filter((d) => (d.parent || '') === parentId && !d.deleted && !blockedIds.has(d.id))
      .sort((a, b) => compareDecks(a, b))
    return rows.map((deck) => {
      const kids = decks.filter((d) => d.parent === deck.id && !d.deleted && !blockedIds.has(d.id))
      const isOpen = !!expanded[deck.id]
      return (
        <Fragment key={deck.id}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 4px 3px ' + (depth * 18 + 4) + 'px',
            }}
          >
            <button
              type="button"
              aria-label={`${isOpen ? 'Recolher' : 'Expandir'} ${deck.title}`}
              aria-expanded={isOpen}
              disabled={!kids.length}
              onClick={() => setExpanded((prev) => ({ ...prev, [deck.id]: !prev[deck.id] }))}
              style={{
                width: 26,
                minWidth: 26,
                height: 30,
                border: 0,
                borderRadius: 6,
                background: kids.length ? '#f0fdf4' : 'transparent',
                color: '#15803d',
                cursor: kids.length ? 'pointer' : 'default',
                fontWeight: 900,
              }}
            >
              {kids.length ? (isOpen ? '▾' : '▸') : '·'}
            </button>
            <button
              type="button"
              aria-pressed={target === deck.id}
              onClick={() => setTarget(deck.id)}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                padding: '7px 10px',
                border: `1px solid ${target === deck.id ? '#16a34a' : '#e2e8f0'}`,
                borderRadius: 8,
                background: target === deck.id ? '#f0fdf4' : '#fff',
                color: '#334155',
                font: '600 .84rem Inter,system-ui,sans-serif',
                cursor: 'pointer',
              }}
            >
              {deck.kind === 'prova' ? '📝' : '🩺'} {deck.title}
              {kids.length > 0 && (
                <span style={{ color: '#64748b', fontSize: '.72rem', marginLeft: 6 }}>
                  {kids.length} sub
                </span>
              )}
            </button>
          </div>
          {kids.length > 0 &&
            isOpen &&
            renderMoveTree(
              deck.id,
              target,
              setTarget,
              expanded,
              setExpanded,
              blockedIds,
              depth + 1,
            )}
        </Fragment>
      )
    })
  }
  const downloadBackup = () => {
    const data = {
      exported_at: new Date().toISOString(),
      decks: decks.map((d) => ({ id: d.id, title: d.title, kind: d.kind, parent: d.parent || '' })),
      cartas: cards.map((c) => ({
        frente: c.q,
        verso: c.a,
        grupo: c.group || '',
        referencia: c.ref || '',
        pasta: decks.find((d) => d.id === c.deck)?.title || '',
        suspensa: !!c.suspended,
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medreview-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const submitCard = async () => {
    if (modal.type !== 'card') return
    if (!cardQ.trim() || !cardA.trim()) return setError('Preencha frente e verso.')
    const done = await run(
      async () => {
        const extras = {
          imageUrl: cardImg.trim(),
          choices: cardChoices
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          reverse: cardReverse,
          clinical: cardClinical,
        }
        let createdIds: string[] = []
        if (modal.card) {
          await updateCard({
            id: modal.card.id,
            q: cardQ,
            a: cardA,
            group: cardGroup,
            ref: cardRef,
            ...extras,
          })
          if (cardFile) await uploadCardImage(modal.card.id, cardFile)
        } else {
          const res: any = await createCard(modal.deckId, {
            q: cardQ,
            a: cardA,
            group: cardGroup,
            ref: cardRef,
            ...extras,
          })
          createdIds = res?.ids || []
          if (cardFile && createdIds[0]) await uploadCardImage(createdIds[0], cardFile)
        }
      },
      modal.card ? 'Cartão atualizado.' : 'Cartão criado.',
    )
    if (done) setModal({ type: 'none' })
  }
  const toggleSuspended = (card: Card) =>
    run(
      async () => {
        await setCardSuspended(card.id, !card.suspended)
      },
      card.suspended ? 'Cartão reativado.' : 'Cartão suspenso (sai das sessões de estudo).',
    )
  const removeCard = (card: Card) => {
    if (!window.confirm('Excluir este cartão? O histórico de revisões será preservado no banco.'))
      return
    run(async () => {
      await deleteCard(card.id)
    }, 'Cartão excluído.')
  }
  const submitImport = async () => {
    if (modal.type !== 'import') return
    if (!modal.deckId) return setError('Escolha a pasta de destino.')
    let parsed: ParsedCsvCard[]
    const trimmed = importText.trim()
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        parsed = normalizeJsonCards(JSON.parse(trimmed))
      } else {
        const result = parseCardsFromCsv(trimmed)
        if (result.error) return setError(result.error)
        parsed = result.cards
      }
    } catch (e: any) {
      return setError(e?.message || 'O arquivo JSON/CSV não pôde ser interpretado.')
    }
    if (!parsed.length) return setError('Nenhum cartão válido encontrado.')
    const done = await run(async () => {
      for (let i = 0; i < parsed.length; i += 250)
        await importCards(modal.deckId, parsed.slice(i, i + 250))
      setImportText('')
    }, `${parsed.length} cartões importados.`)
    if (done) setModal({ type: 'none' })
  }
  const submitImportAuto = async () => {
    if (modal.type !== 'importAuto') return
    let parsed: (ParsedCsvCard & { folder?: string })[]
    const trimmed = importText.trim()
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        parsed = normalizeJsonCards(JSON.parse(trimmed))
      } else {
        const result = parseCardsFromCsv(trimmed)
        if (result.error) return setError(result.error)
        parsed = result.cards
      }
    } catch (e: any) {
      return setError(e?.message || 'O arquivo JSON/CSV não pôde ser interpretado.')
    }
    if (!parsed.length) return setError('Nenhum cartão válido encontrado.')
    const withFolder = parsed.filter((c) => c.folder?.trim())
    if (!withFolder.length)
      return setError(
        'Nenhum cartão tem a coluna "pasta". Use o import por pasta, ou adicione a coluna pasta no arquivo.',
      )
    const done = await run(
      async () => {
        for (let i = 0; i < parsed.length; i += 250) await importCardsAuto(parsed.slice(i, i + 250))
        setImportText('')
      },
      `${parsed.length} cartões importados${parsed.length - withFolder.length ? ` (${withFolder.length} criaram/foram para pastas)` : ''}.`,
    )
    if (done) setModal({ type: 'none' })
  }
  const deckRow = (deck: Deck, isChild: boolean) => {
    const kids = childrenOf(deck.id)
    const count = countOf(deck.id)
    const isOpen = !!expanded[deck.id]
    const isSeed = !!deck.title.match(/Tutoria \\\d+/) && deck.kind === 'tutoria'

    return (
      <div
        key={deck.id}
        className={`mr-lib-deck${isChild ? ' is-child' : ''}${dragDeckId === deck.id ? ' is-dragging' : ''}`}
        style={isChild ? { paddingLeft: 44 + (Number(isChild) - 1) * 22 } : undefined}
        draggable
        onDragStart={(e) => {
          setDragDeckId(deck.id)
          e.dataTransfer.effectAllowed = 'move'
          try {
            e.dataTransfer.setData('text/plain', deck.id)
          } catch (_) {
            // alguns navegadores não permitem setData; segue o fluxo
          }
        }}
        onDragEnd={() => setDragDeckId('')}
        onDragOver={(e) => {
          if (!dragOverOk(deck.id)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (dragOverOk(deck.id)) submitDragDeck(deck.id)
        }}
      >
        <button
          type="button"
          className="mr-lib-deck-name"
          onClick={() => {
            setSelectedDeckId(deck.id)
            if (kids.length) setExpanded((e) => ({ ...e, [deck.id]: !e[deck.id] }))
          }}
        >
          <span className="mr-lib-twist">{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="mr-lib-deck-icon">{deck.kind === 'prova' ? '📝' : '🩺'}</span>
          <span className="mr-lib-deck-title">{deck.title}</span>
          <span className={`mr-lib-deck-tag${count === 0 ? ' warn' : ''}`}>{count} cartas</span>
          {kids.length > 0 && (
            <span className="mr-lib-deck-tag">
              {kids.length} subpasta{kids.length > 1 ? 's' : ''}
            </span>
          )}
          {isSeed && <span className="mr-lib-deck-tag">pronta</span>}
        </button>
        <div className="mr-lib-deck-actions">
          <button className="mr-lib-mini" onClick={() => onStudy(deck.id)}>
            ▶ Estudar
          </button>
          <button className="mr-lib-mini" onClick={() => openCardModal(deck.id)}>
            ＋ Carta
          </button>
          <button
            className="mr-lib-mini"
            onClick={() => openFolderModal(deck.id, deck.kind as any)}
          >
            ＋ Subpasta
          </button>
          <button className="mr-lib-mini" onClick={() => resetDeckProgress(deck)}>
            ↺ Resetar
          </button>
          <button className="mr-lib-mini" onClick={() => openMoveDeckModal(deck.id)}>
            ➡️ Mover
          </button>
          <button
            className="mr-lib-mini"
            onClick={() => {
              setRenameTitle(deck.title)
              setModal({ type: 'rename', deckId: deck.id, title: deck.title })
            }}
          >
            ✏️ Renomear
          </button>
          <button className="mr-lib-mini danger" onClick={() => removeDeck(deck)}>
            🗑️ Excluir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#f0fdf4 0%,#f8fafc 370px)',
      }}
    >
      <style>{libCss}</style>
      <div className="mr-lib-header">
        <button className="mr-lib-back" onClick={onBack}>
          ← Início
        </button>
        <strong className="mr-lib-title">📚 Biblioteca</strong>
        <span className="mr-lib-spacer" />
        <button className="mr-lib-mini" onClick={() => setModal({ type: 'importAuto' })}>
          📥 Importar
        </button>
        <button className="mr-lib-mini" onClick={() => setModal({ type: 'export' })}>
          💾 Exportar backup
        </button>
        <button className="mr-lib-mini" onClick={() => openFolderModal('', 'custom')}>
          ＋ Nova pasta
        </button>
        <span className="mr-lib-count">
          {decks.length} pastas · {cards.length} cartões
        </span>
      </div>
      <main className="mr-lib-main">
        {error && (
          <div className="mr-lib-notice" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {error}
          </div>
        )}
        {message && (
          <div className="mr-lib-notice" style={{ background: '#f0fdf4', color: '#166534' }}>
            {message}
          </div>
        )}

        <div className="mr-lib-notice" style={{ background: '#f0fdf4', color: '#166534' }}>
          Os cartões-base ficam disponíveis na sua Biblioteca. Seu progresso e suas revisões são
          pessoais.
        </div>

        {selectedDeck && (
          <section className="mr-lib-panel">
            <div className="mr-lib-panel-head">
              <div>
                <h2>
                  {selectedDeck.kind === 'prova' ? '📝' : '🩺'} {selectedDeck.title}
                </h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '.82rem' }}>
                  {deckCards.length} cartas
                  {selectedDeck.suspended !== undefined ? '' : ''} · gerencie as cartas desta pasta
                </p>
              </div>
              <button className="mr-lib-mini" onClick={() => setSelectedDeckId('')}>
                ✕ Fechar painel
              </button>
            </div>
            <div className="mr-lib-panel-actions">
              <button className="mr-lib-mini" onClick={() => onStudy(selectedDeck.id)}>
                ▶ Estudar esta pasta
              </button>
              <button className="mr-lib-mini" onClick={() => openCardModal(selectedDeck.id)}>
                ＋ Nova carta
              </button>
              <button
                className="mr-lib-mini"
                onClick={() => setModal({ type: 'import', deckId: selectedDeck.id })}
              >
                📥 Importar CSV/JSON
              </button>
              <button
                className="mr-lib-mini"
                onClick={() => openFolderModal(selectedDeck.id, selectedDeck.kind as any)}
              >
                ＋ Subpasta
              </button>
            </div>
            {deckCards.length === 0 ? (
              <div className="mr-lib-empty">
                Nenhuma carta nesta pasta ainda. Crie a primeira com “＋ Nova carta” ou importe um
                CSV/JSON.
              </div>
            ) : (
              deckCards.map((card) => (
                <article key={card.id} className="mr-lib-card-row">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="mr-lib-card-q">{card.q}</div>
                    <div className="mr-lib-card-chips">
                      {card.group && <span className="mr-lib-card-chip">{card.group}</span>}
                      {card.ref && <span className="mr-lib-card-chip">📚 {card.ref}</span>}
                      {card.suspended && <span className="mr-lib-card-chip susp">⏸ suspensa</span>}
                    </div>
                  </div>
                  <div className="mr-lib-card-actions">
                    <button
                      className="mr-lib-mini"
                      onClick={() => openCardModal(selectedDeck.id, card)}
                    >
                      ✏️ Editar
                    </button>
                    <button className="mr-lib-mini" onClick={() => openMoveModal(card)}>
                      ➡️ Mover
                    </button>
                    <button className="mr-lib-mini" onClick={() => toggleSuspended(card)}>
                      {card.suspended ? '▶ Retomar' : '⏸ Suspender'}
                    </button>
                    <button className="mr-lib-mini danger" onClick={() => removeCard(card)}>
                      🗑️
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {visibleSections.map((section) => {
          const roots = rootDecksOf(section.kind)
          return (
            <section
              key={section.key}
              className="mr-lib-section"
              onDragOver={(e) => {
                if (!dragDeckId || dragOverOk(section.key)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              className={dragDeckId && dragOverOk(section.key) ? 'mr-lib-section-over' : ''}
              onDrop={(e) => {
                e.preventDefault()
                if (dragDeckId && dragOverOk(section.key)) submitDragToRoot(section.key)
              }}
            >
              <div className="mr-lib-section-head">
                <div>
                  <h2>
                    {section.icon} {section.title}
                  </h2>
                  <p>{section.subtitle}</p>
                </div>
                <button className="mr-lib-mini" onClick={() => openFolderModal('', section.kind)}>
                  ＋ Nova pasta
                </button>
              </div>
              {roots.length === 0 ? (
                <div className="mr-lib-empty">Nenhuma pasta aqui ainda — crie a primeira.</div>
              ) : (
                roots.flatMap((deck) => {
                  const kids = childrenOf(deck.id)
                  const isOpen = !!expanded[deck.id]
                  const renderTree = (deckId: string, depth: number): any[] =>
                    childrenOf(deckId).flatMap((k) => [
                      deckRow(k, depth),
                      ...(expanded[k.id] ? renderTree(k.id, depth + 1) : []),
                    ])
                  return [deckRow(deck, false), ...(isOpen ? renderTree(deck.id, 1) : [])]
                })
              )}
            </section>
          )
        })}

        {modal.type === 'folder' && (
          <Modal
            title={folderParent ? 'Nova subpasta' : 'Nova pasta'}
            subtitle={
              folderParent
                ? `Dentro de: ${decks.find((d) => d.id === folderParent)?.title || ''}`
                : 'A pasta aparece na home, na seção correspondente ao tipo.'
            }
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Nome da pasta</label>
            <input
              style={fieldStyle}
              value={folderTitle}
              placeholder="Ex.: Cardio-respiratório"
              onChange={(e) => setFolderTitle(e.target.value)}
            />
            {!folderParent && (
              <>
                <label className="mr-lib-label">Tipo (seção da home)</label>
                <select
                  style={fieldStyle}
                  value={folderKind}
                  onChange={(e) => setFolderKind(e.target.value as any)}
                >
                  <option value="custom">📁 Minhas Pastas</option>
                  <option value="tutoria">🩺 Tutoria</option>
                  <option value="prova">📝 Prova de Módulo</option>
                </select>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitFolder}>
                {busy ? 'Salvando…' : 'Criar'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'rename' && (
          <Modal
            title="Renomear pasta"
            subtitle="O nome antigo sai de todas as telas."
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Novo nome</label>
            <input
              style={fieldStyle}
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitRename}>
                {busy ? 'Salvando…' : 'Renomear'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'moveDeck' && (
          <Modal
            title="Mover pasta"
            subtitle={`“${decks.find((d) => d.id === modal.deckId)?.title || ''}” — escolha a pasta que vai recebê-la (ela vai junto com suas subpastas).`}
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Pasta de destino</label>
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 6,
                marginBottom: 8,
              }}
            >
              {(
                [
                  ['custom', '📁 Nível inicial — Minhas Pastas'],
                  ['tutoria', '🩺 Nível inicial — Tutoria'],
                  ['prova', '📝 Nível inicial — Prova de Módulo'],
                ] as [string, string][]
              )
                .filter(([kind]) => rootDecksOf(kind).length > 0)
                .map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={moveDeckTarget === `@root:${kind}`}
                    onClick={() => setMoveDeckTarget(`@root:${kind}`)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      border: `1px solid ${moveDeckTarget === `@root:${kind}` ? '#16a34a' : 'transparent'}`,
                      borderRadius: 8,
                      background: moveDeckTarget === `@root:${kind}` ? '#f0fdf4' : '#fff',
                      color: '#334155',
                      font: '600 .82rem Inter,system-ui,sans-serif',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              {renderMoveTree(
                '',
                moveDeckTarget,
                setMoveDeckTarget,
                expanded,
                setExpanded,
                new Set([modal.deckId, ...subtreeIdsOf(modal.deckId)]),
              )}
            </div>
            <p
              className="mr-lib-hint"
              style={{ margin: '2px 0 0', fontSize: '.78rem', color: '#64748b' }}
            >
              Destinos dentro da própria pasta ficam ocultos (proteção contra ciclos).
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitMoveDeck}>
                {busy ? 'Movendo…' : 'Mover pasta'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'card' && (
          <Modal
            title={modal.card ? 'Editar carta' : 'Nova carta'}
            subtitle={`Em: ${decks.find((d) => d.id === modal.deckId)?.title || ''}`}
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Frente (pergunta)</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 70 }}
              value={cardQ}
              onChange={(e) => setCardQ(e.target.value)}
            />
            <label className="mr-lib-label">Verso (resposta)</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 90 }}
              value={cardA}
              onChange={(e) => setCardA(e.target.value)}
            />
            <label className="mr-lib-label">Grupo / objetivo (opcional)</label>
            <input
              style={fieldStyle}
              value={cardGroup}
              onChange={(e) => setCardGroup(e.target.value)}
            />
            <label className="mr-lib-label">Referência (opcional)</label>
            <input
              style={fieldStyle}
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
            />
            <label className="mr-lib-label">Imagem (URL http/https — anatomia, ECG, figuras)</label>
            <input
              style={fieldStyle}
              value={cardImg}
              placeholder="https://…/imagem.png"
              onChange={(e) => setCardImg(e.target.value)}
            />
            <label className="mr-lib-label">Ou envie do computador (JPG/PNG/WebP até 5 MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={fieldStyle}
              onChange={(e) =>
                setCardFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)
              }
            />
            <label className="mr-lib-label">
              Alternativas erradas (uma por linha — múltipla escolha)
            </label>
            <textarea
              style={{ ...fieldStyle, minHeight: 56 }}
              placeholder={'Opção errada A\nOpção errada B'}
              value={cardChoices}
              onChange={(e) => setCardChoices(e.target.value)}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '10px 0 4px',
                font: '700 .8rem Inter, system-ui, sans-serif',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={cardReverse}
                onChange={(e) => setCardReverse(e.target.checked)}
                style={{ accentColor: '#16a34a', width: 16, height: 16 }}
              />
              Gerar carta reversa (também pergunta o verso → frente)
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '10px 0 4px',
                font: '700 .8rem Inter, system-ui, sans-serif',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={cardClinical}
                onChange={(e) => setCardClinical(e.target.checked)}
                style={{ accentColor: '#16a34a', width: 16, height: 16 }}
              />
              🩺 Carta de Modo Clínico (também entra no treino do Modo Caso Clínico)
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitCard}>
                {busy ? 'Salvando…' : modal.card ? 'Salvar' : 'Criar carta'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'move' && (
          <Modal
            title="Mover carta"
            subtitle={`“${modal.card.q.slice(0, 60)}${modal.card.q.length > 60 ? '…' : ''}” — escolha a pasta de destino.`}
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Pasta de destino</label>
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 6,
                marginBottom: 8,
              }}
            >
              {renderMoveTree('', moveTarget, setMoveTarget, moveCardExpanded, setMoveCardExpanded)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitMove}>
                {busy ? 'Movendo…' : 'Mover'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'importAuto' && (
          <Modal
            title="📥 Importar com pastas automáticas"
            subtitle="CSV com colunas frente,verso,pasta (ou JSON com pergunta,resposta,categoria,pasta). As pastas da coluna pasta são criadas automaticamente se não existirem."
            onClose={() => setModal({ type: 'none' })}
          >
            <input
              type="file"
              accept=".csv,.json,.txt"
              style={{ ...fieldStyle, padding: '0.5rem' }}
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <label className="mr-lib-label">Ou cole o conteúdo aqui</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 120, fontFamily: 'monospace', fontSize: '.8rem' }}
              value={importText}
              placeholder={`frente,verso,grupo,pasta
"O que é X?","É Y","Objetivo 1","Cardio"

ou {"flashcards":[{"pergunta":"...","resposta":"...","categoria":"...","pasta":"Cardio"}]}`}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitImportAuto}>
                {busy ? 'Importando…' : 'Importar'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'export' && (
          <Modal
            title="Exportar backup"
            subtitle="Arquivo JSON com suas pastas e cartas (sem o progresso de revisões). Guarde como cópia de segurança."
            onClose={() => setModal({ type: 'none' })}
          >
            <p style={{ margin: '0 0 12px', color: '#334155', fontSize: '.88rem' }}>
              {cards.length} cartas em {decks.length} pastas serão exportadas.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={actionStyle} onClick={downloadBackup}>
                📥 Baixar JSON
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'import' && (
          <Modal
            title="Importar cartões"
            subtitle={`Destino: ${decks.find((d) => d.id === modal.deckId)?.title || ''} — CSV (frente,verso) ou JSON (flashcards).`}
            onClose={() => setModal({ type: 'none' })}
          >
            <input
              type="file"
              accept=".csv,.json,.txt"
              style={{ ...fieldStyle, padding: '0.5rem' }}
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <label className="mr-lib-label">Ou cole o conteúdo aqui</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 120, fontFamily: 'monospace', fontSize: '.8rem' }}
              value={importText}
              placeholder={`frente,verso,grupo\n"O que é X?","É Y","Objetivo 1"\n\nou {"flashcards":[{"pergunta":"...","resposta":"..."}]}`}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitImport}>
                {busy ? 'Importando…' : 'Importar'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  )
}
