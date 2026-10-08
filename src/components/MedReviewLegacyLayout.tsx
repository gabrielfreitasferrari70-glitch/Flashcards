import React, { useEffect, useState } from 'react'
import { StudyHeatmap } from './StudyHeatmap'
import {
  compareDecks,
  DECK_SORT_EVENT,
  DECK_SORT_OPTIONS,
  getDeckSort,
  setDeckSort,
  type DeckSortMode,
} from '@/lib/deckSort'

export type LegacyDeck = {
  id: string
  title: string
  kind: string
  order?: number
  parent?: string
  description?: string
  mode?: string
}
export type LegacyCard = {
  id: string
  deck: string
  q: string
  a: string
  group?: string
  suspended?: boolean
}
export type SessionTally = {
  startMs: number
  again: number
  hard: number
  good: number
  easy: number
}

const legacyCss = `
:root{--mr-green:#16a34a;--mr-dark:#14532d;--mr-ink:#15803d;--mr-pale:#f0fdf4;--mr-mint:#d1fae5;--mr-line:#d1fae5;--mr-text:#1f2937;--mr-muted:#64748b}
.mr-legacy-shell{min-height:100vh;background:linear-gradient(180deg,#f0fdf4 0%,#f8fafc 370px);color:var(--mr-text);font-family:Inter,system-ui,sans-serif}
.mr-legacy-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-bottom:1px solid #d1fae5;box-shadow:0 4px 18px rgba(20,83,45,.06)}
.mr-legacy-header-inner{max-width:1160px;min-height:72px;margin:0 auto;padding:10px 22px;display:flex;align-items:center;gap:16px}
.mr-legacy-brand{display:flex;align-items:center;gap:12px;min-width:0;flex:1;color:#14532d}
.mr-legacy-brand-icon{width:42px;height:42px;flex:0 0 42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#dcfce7,#bbf7d0);font-size:22px;box-shadow:inset 0 0 0 1px #a7f3d0}
.mr-legacy-brand-title{font-size:.75rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;line-height:1.3}
.mr-legacy-brand-short{display:none}
@media(max-width:600px){.mr-legacy-brand-full{display:none}.mr-legacy-brand-short{display:inline}.mr-legacy-brand-sub{display:none}}
.mr-legacy-brand-sub{display:block;margin-top:3px;color:#6b7280;font-size:.63rem;font-weight:700;letter-spacing:.1em}
.mr-legacy-header-actions{display:flex;align-items:center;gap:8px}
.mr-legacy-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;border:1px solid #bbf7d0;border-radius:11px;padding:9px 14px;color:#15803d;background:#f0fdf4;font:700 .84rem Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;white-space:nowrap;transition:all .18s ease}
.mr-legacy-button:hover{background:#dcfce7;border-color:#86efac;transform:translateY(-1px)}
.mr-legacy-button.primary{color:white;border-color:#16a34a;background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 4px 12px rgba(22,163,74,.18)}
.mr-legacy-button.primary:hover{background:linear-gradient(135deg,#15803d,#16a34a)}
.mr-legacy-button.logout{min-width:40px;padding-inline:11px;color:#64748b;background:#fff;border-color:#e2e8f0}
.mr-legacy-main{max-width:1160px;margin:0 auto;padding:30px 22px 56px}
.mr-legacy-hero{position:relative;overflow:hidden;padding:30px 34px 24px;margin:0 0 32px;border:1.5px solid #bbf7d0;border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.99),#f0fdf4 80%);box-shadow:0 12px 34px rgba(22,163,74,.09)}
.mr-legacy-hero:after{content:'🩺';position:absolute;right:36px;top:30px;font-size:64px;opacity:.08;pointer-events:none}
.mr-legacy-badge{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid #bbf7d0;border-radius:999px;background:#dcfce7;color:#15803d;font-size:.72rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
.mr-legacy-hero h1{position:relative;z-index:1;margin:12px 0 7px;color:#14532d;font-size:clamp(1.65rem,3vw,2.15rem);line-height:1.15;letter-spacing:-.035em}
.mr-legacy-copy{max-width:690px;margin:0;color:#64748b;font-size:.97rem;line-height:1.55}
.mr-legacy-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:22px}
.mr-legacy-metric{display:flex;align-items:center;gap:10px;min-height:58px;padding:10px 13px;border:1px solid #d1fae5;border-radius:14px;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(22,163,74,.045)}
.mr-legacy-metric-icon{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:10px;background:#f0fdf4;font-size:17px}
.mr-legacy-metric-label{color:#6b7280;font-size:.69rem;line-height:1.25}
.mr-legacy-metric-value{display:block;margin-top:2px;color:#14532d;font-size:1.02rem;font-weight:900}
.mr-legacy-actions{display:flex;flex-wrap:wrap;gap:10px;padding-top:18px;margin-top:18px;border-top:1px dashed #bbf7d0}
.mr-legacy-section-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:4px 0 15px}
.mr-legacy-section-title{margin:0;color:#14532d;font-size:1.36rem;font-weight:900;letter-spacing:-.025em}
.mr-legacy-section-sub{margin:4px 0 0;color:#6b7280;font-size:.87rem}
.mr-legacy-category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}
.mr-legacy-category{display:flex;flex-direction:column;align-items:stretch;text-align:left;min-height:238px;padding:22px;border:1.5px solid #d1fae5;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.055);cursor:pointer;transition:all .2s ease}
.mr-legacy-category:hover{transform:translateY(-4px);border-color:#86efac;box-shadow:0 13px 27px rgba(22,163,74,.13)}
.mr-legacy-category-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.mr-legacy-category-icon{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,#f0fdf4,#dcfce7);font-size:27px}
.mr-legacy-tag{padding:5px 10px;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:.72rem;font-weight:800;white-space:nowrap}
.mr-legacy-category h3{margin:18px 0 6px;color:#14532d;font-size:1.14rem;font-weight:900}
.mr-legacy-category p{margin:0;color:#6b7280;font-size:.86rem;line-height:1.5}
.mr-legacy-category-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:18px;color:#15803d;font-size:.82rem;font-weight:800}
.mr-legacy-arrow{width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:#f0fdf4;font-size:18px}
.mr-legacy-breadcrumb{display:flex;align-items:center;flex-wrap:wrap;gap:8px;color:#6b7280;font-size:.86rem}
.mr-legacy-breadcrumb button{border:0;padding:0;background:none;color:#15803d;font:700 .86rem Inter,system-ui,sans-serif;cursor:pointer}
.mr-legacy-breadcrumb strong{color:#14532d}
.mr-legacy-folder-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin:25px 0 17px}
.mr-legacy-folder-head h1{margin:7px 0 4px;color:#14532d;font-size:1.8rem;letter-spacing:-.03em}
.mr-legacy-folder-head p{margin:0;color:#6b7280}
.mr-legacy-subdecks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.mr-legacy-subdeck{display:flex;flex-direction:column;align-items:flex-start;min-height:205px;padding:20px;border:1.5px solid #d1fae5;border-radius:17px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.05);text-align:left;cursor:pointer;transition:all .18s ease}
.mr-legacy-subdeck:hover{transform:translateY(-3px);border-color:#86efac;box-shadow:0 12px 23px rgba(22,163,74,.12)}
.mr-legacy-subdeck h3{margin:13px 0 8px;color:#14532d;font-size:1rem}
.mr-legacy-subdeck-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto}
.mr-legacy-subdeck-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;width:100%}
.mr-legacy-subdeck-actions button{border:1px solid #bbf7d0;border-radius:8px;padding:5px 9px;background:#fff;color:#15803d;font:700 .72rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .15s ease}
.mr-legacy-subdeck-actions button:hover{background:#f0fdf4;border-color:#86efac}
.mr-legacy-subdeck-actions button.danger{color:#b91c1c;border-color:#fecaca}
.mr-legacy-subdeck-actions button.danger:hover{background:#fef2f2}
.mr-legacy-folder-head-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.mr-legacy-button.danger{color:#b91c1c;border-color:#fecaca;background:#fff}
.mr-legacy-folder-manage{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 16px;padding:12px 14px;border:1px solid #bbf7d0;border-radius:13px;background:#f0fdf4}
.mr-legacy-folder-manage-label{flex-basis:100%;color:#14532d;font-size:.78rem;font-weight:900}
.mr-legacy-newfolder-card{justify-content:center;align-items:center;text-align:center;border-style:dashed;border-color:#86efac;color:#15803d;background:rgba(240,253,244,.6)}
.mr-legacy-newfolder-card:hover{border-color:#16a34a;background:#f0fdf4}
@media(max-width:720px){.mr-legacy-subdecks{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-legacy-subdeck-actions button{padding:6px 8px}}
@media(max-width:480px){.mr-legacy-subdecks{grid-template-columns:1fr}}
.mr-legacy-pill{padding:5px 9px;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:.73rem;font-weight:800}
.mr-legacy-study-page{min-height:100vh;background:linear-gradient(180deg,#f0fdf4,#f8fafc 310px);font-family:Inter,system-ui,sans-serif}
.mr-legacy-study-top{max-width:1120px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.mr-legacy-study-controls{display:flex;flex-wrap:wrap;gap:8px}
.mr-legacy-control{border:1px solid #bbf7d0;border-radius:10px;padding:9px 12px;background:#fff;color:#15803d;font-weight:800;cursor:pointer}
.mr-legacy-control.exit{border-color:#e5e7eb;color:#475569}
.mr-legacy-study-main{max-width:960px;margin:0 auto;padding:12px 22px 55px}
.mr-legacy-study-card{background:#fff;border:1.5px solid #d1fae5;border-radius:21px;padding:clamp(22px,4vw,42px);box-shadow:0 10px 30px rgba(20,83,45,.07);cursor:pointer}
.mr-legacy-progress{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 16px;color:#15803d;font-size:.83rem;font-weight:800}
.mr-legacy-question{margin:9px 0 0;color:#1f2937;font-size:clamp(1.3rem,2.7vw,1.8rem);line-height:1.45}
.mr-legacy-answer{margin-top:20px;padding-top:18px;border-top:1px solid #d1fae5;color:#334155;font-size:1rem;line-height:1.7;white-space:pre-wrap}
.mr-legacy-mode-row{display:flex;gap:7px;margin:14px 0 4px;flex-wrap:wrap}
.mr-legacy-mode-btn{border:1px solid #bbf7d0;border-radius:9px;padding:7px 12px;background:#fff;color:#15803d;font:700 .78rem Inter,system-ui,sans-serif;cursor:pointer;transition:all .15s ease}
.mr-legacy-mode-btn:hover{background:#f0fdf4;border-color:#86efac}
.mr-legacy-mode-btn.active{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border-color:#16a34a;box-shadow:0 3px 9px rgba(22,163,74,.2)}
.mr-legacy-hint{margin-top:22px;color:#94a3b8;text-align:center;font-size:.84rem}
.mr-legacy-rating-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
.mr-legacy-session{max-width:820px;margin:18px auto 0;padding:clamp(24px,5vw,50px);border:1.5px solid #d1fae5;border-radius:24px;background:linear-gradient(145deg,#fff,#f0fdf4);box-shadow:0 14px 38px rgba(22,163,74,.09);text-align:center}
.mr-legacy-session-icon{width:76px;height:76px;display:grid;place-items:center;margin:0 auto 14px;border:1px solid #bbf7d0;border-radius:23px;background:#fff;color:#16a34a;font-size:37px;box-shadow:0 7px 18px rgba(22,163,74,.1)}
.mr-legacy-session h1{margin:0;color:#166534;font-size:clamp(1.7rem,3.2vw,2.15rem);font-weight:900;letter-spacing:-.035em}
.mr-legacy-session-sub{margin:8px auto 0;color:#6b7280;line-height:1.55}
.mr-legacy-session-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin:24px 0 13px}
.mr-legacy-session-stat{padding:15px 10px;border:1px solid #d1fae5;border-radius:15px;background:#fff}
.mr-legacy-session-stat span{display:block;color:#6b7280;font-size:.78rem}
.mr-legacy-session-stat strong{display:block;margin-top:5px;color:#14532d;font-size:1.25rem}
.mr-legacy-session-ratings{display:inline-flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:5px 0 18px;padding:9px 13px;border-radius:999px;background:#fff;border:1px solid #d1fae5;color:#475569;font-size:.83rem;font-weight:800}
.mr-legacy-session-note{max-width:560px;margin:0 auto 25px;color:#475569;line-height:1.65}
.mr-legacy-session-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:10px}
.mr-legacy-empty{padding:30px;border:1px dashed #86efac;border-radius:16px;background:rgba(255,255,255,.75);color:#64748b;text-align:center}
@media(max-width:850px){.mr-legacy-category-grid,.mr-legacy-subdecks{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-legacy-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.mr-legacy-header-inner{padding:9px 12px;gap:8px}.mr-legacy-brand-title{font-size:.61rem}.mr-legacy-brand-sub{font-size:.56rem}.mr-legacy-brand-icon{width:36px;height:36px;flex-basis:36px}.mr-legacy-header-actions{gap:5px}.mr-legacy-button{padding:8px 9px;font-size:.7rem}.mr-legacy-main{padding:18px 14px 36px}.mr-legacy-hero{padding:20px 17px;margin-bottom:24px}.mr-legacy-hero:after{right:15px;top:18px;font-size:44px}.mr-legacy-metrics{gap:7px;margin-top:17px}.mr-legacy-metric{padding:8px;gap:7px}.mr-legacy-metric-icon{width:30px;height:30px;flex-basis:30px;font-size:15px}.mr-legacy-metric-label{font-size:.63rem}.mr-legacy-metric-value{font-size:.9rem}.mr-legacy-actions{display:grid;grid-template-columns:1fr}.mr-legacy-button,.mr-legacy-actions .mr-legacy-button{width:100%;box-sizing:border-box}.mr-legacy-section-head{align-items:flex-start}.mr-legacy-section-title{font-size:1.18rem}.mr-legacy-section-sub{font-size:.77rem}.mr-legacy-category-grid,.mr-legacy-subdecks{grid-template-columns:1fr}.mr-legacy-category{min-height:195px;padding:18px}.mr-legacy-study-top{align-items:flex-start;flex-direction:column;padding:12px 14px}.mr-legacy-study-main{padding:8px 14px 36px}.mr-legacy-study-card{padding:22px 18px}.mr-legacy-rating-row{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-legacy-session-stats{gap:6px}.mr-legacy-session-stat{padding:12px 6px}.mr-legacy-session-stat span{font-size:.68rem}.mr-legacy-session-stat strong{font-size:1.05rem}.mr-legacy-session-ratings{border-radius:13px;line-height:1.7}}
@media(prefers-reduced-motion:reduce){.mr-legacy-category,.mr-legacy-button,.mr-legacy-control{transition:none!important}}
`

export function MedReviewLegacyStyles() {
  return <style>{legacyCss}</style>
}

type CategoryItem = {
  icon: string
  tag: string
  title: string
  description: string
  count: number
  onClick: () => void
  deckId?: string
  sectionKind?: string
}
type HomeProps = {
  userEmail?: string
  totalCards: number
  reviewTodayCount: number
  masteredPercent: number
  streakDays: number
  categories: CategoryItem[]
  decks: LegacyDeck[]
  cards: LegacyCard[]
  folderKind?: 'tutoria' | 'prova' | 'custom'
  onOpenGroup: (kind: 'tutoria' | 'prova') => void
  onHome: () => void
  onOpenDeck: (deckId: string) => void
  onLibrary: () => void
  onClinical: () => void
  onStudyNow: () => void
  onSessionBuilder: () => void
  onQuiz: () => void
  onNewFolder: () => void
  onLogout: () => void
  onSettings: () => void
  onDashboard: () => void
  onDeckAddCard?: (deckId: string) => void
  onDeckAddSubfolder?: (deckId: string) => void
  onDeckRename?: (deckId: string) => void
  onDeckDelete?: (deckId: string) => void
  onDeckReset?: (deckId: string) => void
  onDeckMove?: (deckId: string) => void
  onDeckClick: (deckId: string) => void | boolean | Promise<void | boolean>
  userDecks: LegacyDeck[]
  onNewFolderIn: (kind: 'tutoria' | 'prova' | 'custom') => void
  onNewFrontlineFolder: () => void
  onSectionMove?: (kind: 'tutoria' | 'prova' | 'custom') => void
  openDeckId?: string
  onOpenAiGenerator?: () => void
  onOpenImageOcclusion?: () => void
  onOpenExamPlan?: (deckId: string, deckTitle: string) => void
  onOpenMasterReports?: () => void
  onOpenMasterAnalytics?: () => void
  reviews?: any[]
  onOpenCramMode?: (deckId?: string) => void
  onOpenAnkiImport?: () => void
}

export function MedReviewLegacyHome(props: HomeProps) {
  const {
    userEmail,
    totalCards,
    reviewTodayCount,
    masteredPercent,
    streakDays,
    categories,
    decks,
    cards,
    folderKind,
    onOpenGroup,
    onHome,
    onOpenDeck,
    onClinical,
    onStudyNow,
    onSessionBuilder,
    onQuiz,
    onNewFolder,
    onLibrary,
    onLogout,
    onSettings,
    onDashboard,
    onDeckAddCard,
    onDeckAddSubfolder,
    onDeckRename,
    onDeckDelete,
    onDeckReset,
    onDeckMove,
    onDeckClick,
    userDecks,
    onNewFolderIn,
    onNewFrontlineFolder,
    onSectionMove,
    openDeckId,
    onOpenAiGenerator,
    onOpenImageOcclusion,
    onOpenExamPlan,
    onOpenMasterReports,
    onOpenMasterAnalytics,
    reviews,
    onOpenCramMode,
    onOpenAnkiImport,
  } = props
  const isMaster = userEmail === 'gabrielfreitasferrari70@gmail.com'
  // Quando um deck específico é aberto (pasta organizadora), mostra só a subárvore dele;
  // senão, a seção inteira (Tutoria/Prova/Minhas Pastas).
  // HIERARQUIA DE VERDADE: a view da seção mostra só as pastas de nível inicial
  // (sem parent). O que está DENTRO de uma pasta aparece abrindo a pasta —
  // nunca achatado junto, senão parece que a seção "dissolveu".
  const [sortMode, setSortMode] = useState<DeckSortMode>(getDeckSort)
  useEffect(() => {
    const sync = () => setSortMode(getDeckSort())
    window.addEventListener(DECK_SORT_EVENT, sync)
    return () => window.removeEventListener(DECK_SORT_EVENT, sync)
  }, [])
  const folderDecks = (
    openDeckId
      ? decks.filter((d) => d.parent === openDeckId && !d.deleted)
      : folderKind
        ? decks.filter((d) => d.kind === folderKind && !d.parent && !d.deleted)
        : []
  ).sort((a, b) => compareDecks(a, b, sortMode))
  const openDeck = openDeckId ? decks.find((d) => d.id === openDeckId) : null
  // Contador por SUBÁRVORE: pasta organizadora (bloco "Tutoria", view de seção)
  // tem as cartas nas FILHAS — contar a árvore inteira, não só cartas diretas.
  const subtreeIdsOf = (rootId: string): Set<string> => {
    const seen = new Set<string>([rootId])
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
    return seen
  }
  const cardsInSubtree = (deckId: string) => {
    const ids = subtreeIdsOf(deckId)
    return cards.filter((c) => ids.has(c.deck) && !c.deleted).length
  }

  const title = openDeck
    ? openDeck.title
    : folderKind === 'prova'
      ? 'Prova de Módulo'
      : folderKind === 'custom'
        ? 'Minhas Pastas'
        : 'Tutoria'
  const description =
    folderKind === 'prova'
      ? 'Bancos de revisão focados para os módulos do curso.'
      : folderKind === 'custom'
        ? 'Suas pastas livres — organização que você criar, com subpastas ilimitadas.'
        : 'Caso Atual em andamento, tutorias e casos clínicos integrados com FSRS-5.'
  return (
    <div className="mr-legacy-shell">
      <MedReviewLegacyStyles />
      <header className="mr-legacy-header">
        <div className="mr-legacy-header-inner">
          <div className="mr-legacy-brand">
            <span className="mr-legacy-brand-icon">🩺</span>
            <span className="mr-legacy-brand-title">
              <span className="mr-legacy-brand-full">Plataforma de Fixação Médica</span>
              <span className="mr-legacy-brand-short">MedReview</span>
              <span className="mr-legacy-brand-sub">MedReview · FSRS-5</span>
            </span>
          </div>
          <div className="mr-legacy-header-actions">
            {isMaster && (
              <>
                <button
                  className="mr-legacy-button"
                  onClick={onOpenMasterAnalytics}
                  style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}
                  title="Painel Docente & Desempenho da Turma"
                >
                  🎓 Docente
                </button>
                <button
                  className="mr-legacy-button"
                  onClick={onOpenMasterReports}
                  style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}
                  title="Erros reportados por alunos"
                >
                  ⚠️ Erros
                </button>
              </>
            )}
            <button className="mr-legacy-button" onClick={onOpenAiGenerator} title="Gerar cartas com IA">
              🤖 Criar com IA
            </button>
            <button className="mr-legacy-button" onClick={onOpenImageOcclusion} title="Oclusão de Imagem">
              🖼️ Oclusão
            </button>
            <button className="mr-legacy-button" onClick={onClinical}>
              📋 Modo Clínico
            </button>
            <button
              className="mr-legacy-button"
              onClick={() => onOpenCramMode?.()}
              style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309', fontWeight: 800 }}
              title="Revisão Intensiva de Véspera de Prova (Cram Mode)"
            >
              ⚡ Véspera
            </button>
            <button
              className="mr-legacy-button"
              onClick={onOpenAnkiImport}
              title="Importar baralhos do Anki (.apkg, .txt, .csv)"
            >
              📥 Importar Anki
            </button>
            <button className="mr-legacy-button primary" onClick={onNewFrontlineFolder}>
              ＋ Nova Pasta
            </button>
            <button
              className="mr-legacy-button logout"
              onClick={onDashboard}
              aria-label="Dashboard FSRS"
              title="Dashboard FSRS — heatmap, carga de revisões e acerto por pasta"
            >
              📈
            </button>
            <button
              className="mr-legacy-button logout"
              onClick={onSettings}
              aria-label="Configurações"
              title="Configurações"
            >
              ⚙️
            </button>
            <button
              className="mr-legacy-button logout"
              onClick={onLogout}
              aria-label={`Sair de ${userEmail || 'sua conta'}`}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mr-legacy-main">
        {folderKind ? (
          <>
            <nav className="mr-legacy-breadcrumb">
              <button onClick={onHome}>Início</button>
              {(openDeckId
                ? (() => {
                    const chain: { id: string; title: string }[] = []
                    let cur: LegacyDeck | undefined = decks.find((d) => d.id === openDeckId)
                    while (cur) {
                      chain.unshift({ id: cur.id, title: cur.title })
                      const pid = cur.parent
                      cur = pid ? decks.find((d) => d.id === pid) : undefined
                    }
                    return chain
                  })()
                : [{ id: 'section', title }]
              ).map((d, i, arr) => (
                <span key={d.id} style={{ display: 'contents' }}>
                  <span>/</span>
                  {i === arr.length - 1 ? (
                    <strong>{d.title}</strong>
                  ) : (
                    <button onClick={() => onOpenDeck(d.id)}>{d.title}</button>
                  )}
                </span>
              ))}
            </nav>
            <div className="mr-legacy-folder-head">
              <div>
                <h1>
                  {folderKind === 'prova' ? '📝' : folderKind === 'custom' ? '📁' : '🩺'} {title}
                </h1>
                <p>{description}</p>
              </div>
              <div className="mr-legacy-folder-head-actions">
                <select
                  className="mr-legacy-button"
                  value={sortMode}
                  onChange={(e) => setDeckSort(e.target.value as DeckSortMode)}
                  aria-label="Ordenar pastas"
                  title="Ordenar pastas"
                >
                  {DECK_SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      ↕️ {o.label}
                    </option>
                  ))}
                </select>
                <button
                  className="mr-legacy-button"
                  onClick={() =>
                    openDeckId ? onDeckAddSubfolder?.(openDeckId) : onNewFolderIn(folderKind)
                  }
                >
                  ＋ Nova Pasta
                </button>
              </div>
            </div>
            {openDeckId && (
              <div className="mr-legacy-folder-manage" aria-label="Gerenciar a pasta aberta">
                <span className="mr-legacy-folder-manage-label">Gerenciar esta pasta</span>
                <button
                  className="mr-legacy-button"
                  onClick={() => onOpenExamPlan?.(openDeckId, title)}
                  style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}
                >
                  🎯 Modo Prova (Data-Alvo)
                </button>
                <button className="mr-legacy-button" onClick={() => onDeckRename?.(openDeckId)}>
                  ✏️ Renomear pasta
                </button>
                <button className="mr-legacy-button" onClick={() => onDeckMove?.(openDeckId)}>
                  ➡️ Mover pasta
                </button>
                <button
                  className="mr-legacy-button danger"
                  onClick={() => onDeckDelete?.(openDeckId)}
                >
                  🗑️ Excluir pasta
                </button>
              </div>
            )}
            {folderDecks.length ? (
              <div className="mr-legacy-subdecks">
                {folderDecks.map((deck) => {
                  const dc = cards.filter((c) => c.deck === deck.id && !c.deleted)
                  const total = cardsInSubtree(deck.id)
                  return (
                    <div
                      key={deck.id}
                      className="mr-legacy-subdeck"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenDeck(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onOpenDeck(deck.id)
                      }}
                    >
                      <span className="mr-legacy-category-top" style={{ width: '100%' }}>
                        <span className="mr-legacy-category-icon">
                          {folderKind === 'prova' ? '📝' : folderKind === 'custom' ? '📁' : '🩺'}
                        </span>
                        <span className="mr-legacy-tag">
                          {deck.parent
                            ? 'Subpasta'
                            : folderKind === 'prova'
                              ? 'Módulos'
                              : folderKind === 'custom'
                                ? 'Pasta livre'
                                : 'PBL / Tutoria'}
                        </span>
                      </span>
                      <h3>{deck.title}</h3>
                      <p className="mr-legacy-section-sub">
                        {deck.mode === 'organizer'
                          ? 'Pasta organizadora — abre e mostra as pastas dentro.'
                          : 'Pasta de estudo — clica e revisa os flashcards (FSRS-5).'}
                      </p>
                      <span className="mr-legacy-subdeck-meta">
                        <span className="mr-legacy-pill">📚 {total} cartas</span>
                      </span>
                      <span
                        className="mr-legacy-subdeck-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="Revisão intensiva de véspera nesta pasta"
                          onClick={() => onOpenCramMode?.(deck.id)}
                          style={{ color: '#b45309', fontWeight: 800 }}
                        >
                          ⚡ Véspera
                        </button>
                        <button
                          type="button"
                          title="Criar carta nesta pasta"
                          onClick={() => onDeckAddCard?.(deck.id)}
                        >
                          ＋ Carta
                        </button>
                        <button
                          type="button"
                          title="Criar subpasta"
                          onClick={() => onDeckAddSubfolder?.(deck.id)}
                        >
                          🗂 Subpasta
                        </button>
                        <button
                          type="button"
                          title="Mover esta pasta"
                          aria-label={`Mover pasta ${deck.title}`}
                          onClick={() => onDeckMove?.(deck.id)}
                        >
                          ➡️ Mover
                        </button>
                        <button
                          type="button"
                          title="Renomear esta pasta"
                          aria-label={`Renomear pasta ${deck.title}`}
                          onClick={() => onDeckRename?.(deck.id)}
                        >
                          ✏️ Renomear
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="Excluir esta pasta"
                          aria-label={`Excluir pasta ${deck.title}`}
                          onClick={() => onDeckDelete?.(deck.id)}
                        >
                          🗑️ Excluir
                        </button>
                      </span>
                      <span className="mr-legacy-category-foot" style={{ width: '100%' }}>
                        Abrir pasta <span className="mr-legacy-arrow">→</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mr-legacy-empty">
                {openDeckId
                  ? 'Nenhuma pasta dentro desta ainda — use "＋ Nova Pasta" para criar uma.'
                  : 'Nenhuma pasta nesta seção ainda. Crie uma pasta na Biblioteca para começar.'}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="mr-legacy-hero">
              <span className="mr-legacy-badge">✦ Plataforma de Fixação Médica</span>
              <h1>Bom estudo, futuro colega! 🩺</h1>
              <p className="mr-legacy-copy">
                Revisão médica ativa com FSRS-5 para retenção clínica de longo prazo.
              </p>
              <p className="mr-legacy-copy" style={{ marginTop: 8, fontWeight: 700 }}>
                Para renomear, mover ou apagar uma pasta, abra “Gerenciar pastas” ou use os botões
                em cada pasta real.
              </p>
              <div className="mr-legacy-metrics">
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">⚡</span>
                  <div>
                    <span className="mr-legacy-metric-label">Para revisar hoje</span>
                    <strong className="mr-legacy-metric-value">{reviewTodayCount}</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">📚</span>
                  <div>
                    <span className="mr-legacy-metric-label">Total de cartas</span>
                    <strong className="mr-legacy-metric-value">{totalCards}</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">🎯</span>
                  <div>
                    <span className="mr-legacy-metric-label">Domínio geral</span>
                    <strong className="mr-legacy-metric-value">{masteredPercent}%</strong>
                  </div>
                </div>
                <div className="mr-legacy-metric">
                  <span className="mr-legacy-metric-icon">🗓️</span>
                  <div>
                    <span className="mr-legacy-metric-label">Sequência</span>
                    <strong className="mr-legacy-metric-value">
                      {streakDays} {streakDays === 1 ? 'dia' : 'dias'}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="mr-legacy-actions">
                <button className="mr-legacy-button primary" onClick={onStudyNow}>
                  ⚡ Estudar agora
                </button>
                <button className="mr-legacy-button" onClick={onSessionBuilder}>
                  🎛️ Montar sessão
                </button>
                <button className="mr-legacy-button" onClick={onQuiz}>
                  ⏱️ Quiz
                </button>
                <button className="mr-legacy-button" onClick={onClinical}>
                  📋 Modo Caso Clínico
                </button>
                <button className="mr-legacy-button" onClick={onOpenAiGenerator}>
                  🤖 Criar com IA
                </button>
                <button className="mr-legacy-button" onClick={onOpenImageOcclusion}>
                  🖼️ Oclusão
                </button>
                <button
                  className="mr-legacy-button"
                  onClick={() => onOpenCramMode?.()}
                  style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309', fontWeight: 800 }}
                  title="Revisão Intensiva Pré-Prova (Cram Mode)"
                >
                  ⚡ Véspera de Prova
                </button>
                <button
                  className="mr-legacy-button"
                  onClick={onOpenAnkiImport}
                  title="Importar baralhos do Anki (.apkg, .txt, .csv)"
                >
                  📥 Importar Anki
                </button>
                <button className="mr-legacy-button" onClick={() => onNewFolderIn('custom')}>
                  ＋ Nova pasta
                </button>
              </div>
            </section>
            <StudyHeatmap reviews={reviews || []} cards={cards} />
            <section>
              <header className="mr-legacy-section-head">
                <div>
                  <h2 className="mr-legacy-section-title">📁 Pastas de Estudo</h2>
                  <p className="mr-legacy-section-sub">
                    Navegue pelas disciplinas, casos clínicos e bancos de revisão
                  </p>
                </div>
                <div className="mr-legacy-folder-head-actions">
                  <button className="mr-legacy-button" onClick={() => onNewFolderIn('custom')}>
                    ＋ Nova Pasta
                  </button>
                  <button className="mr-legacy-button" onClick={onLibrary}>
                    📚 Gerenciar pastas
                  </button>
                </div>
              </header>
              <div className="mr-legacy-category-grid">
                {categories.map((item) => (
                  <div
                    key={item.title}
                    className="mr-legacy-category"
                    role="button"
                    tabIndex={0}
                    onClick={item.onClick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') item.onClick()
                    }}
                  >
                    <div className="mr-legacy-category-top">
                      <span className="mr-legacy-category-icon">{item.icon}</span>
                      <span className="mr-legacy-tag">{item.tag}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="mr-legacy-category-foot">
                      <span>{item.count} cartas</span>
                      <span className="mr-legacy-arrow">→</span>
                    </div>
                    {item.deckId && (
                      <span
                        className="mr-legacy-subdeck-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="Criar carta nesta pasta"
                          onClick={() => onDeckAddCard?.(item.deckId)}
                        >
                          ＋ Carta
                        </button>
                        {/* Card fixo = PORTAL da seção, não é a pasta: sem ✏️/🗑️
                            aqui (renomear/excluir a capa mudava a pasta real de
                            dentro — feedback da Nathalia). A gestão das pastas é
                            dentro da view / Minhas Pastas / Biblioteca. */}
                        {item.deckId && onSectionMove && item.sectionKind && (
                          <button
                            type="button"
                            title="Mover a seção inteira (todas as pastas de dentro)"
                            onClick={() => onSectionMove(item.sectionKind as any)}
                          >
                            ➡️
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                ))}
                {userDecks.map((deck) => {
                  const dc = cards.filter((c) => c.deck === deck.id && !c.deleted)
                  const total = cardsInSubtree(deck.id)
                  const icon = deck.kind === 'prova' ? '📝' : '📁'
                  const tag =
                    deck.kind === 'prova'
                      ? 'Módulos'
                      : deck.kind === 'custom'
                        ? 'Pasta livre'
                        : 'PBL / Tutoria'
                  return (
                    <div
                      key={deck.id}
                      className="mr-legacy-category"
                      role="button"
                      tabIndex={0}
                      onClick={() => onDeckClick(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onDeckClick(deck.id)
                      }}
                    >
                      <div className="mr-legacy-category-top">
                        <span className="mr-legacy-category-icon">{icon}</span>
                        <span className="mr-legacy-tag">{tag}</span>
                      </div>
                      <h3>{deck.title}</h3>
                      <p>
                        {deck.description ||
                          'Pasta de revisão médica com repetição espaçada FSRS-5.'}
                      </p>
                      <div className="mr-legacy-category-foot">
                        <span>{total} cartas</span>
                        <span className="mr-legacy-arrow">→</span>
                      </div>
                      <span
                        className="mr-legacy-subdeck-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="Criar carta nesta pasta"
                          onClick={() => onDeckAddCard?.(deck.id)}
                        >
                          ＋ Carta
                        </button>
                        <button
                          type="button"
                          title="Criar subpasta"
                          onClick={() => onDeckAddSubfolder?.(deck.id)}
                        >
                          🗂 Subpasta
                        </button>
                        <button
                          type="button"
                          title="Mover para dentro de outra pasta"
                          onClick={() => onDeckMove?.(deck.id)}
                        >
                          ➡️
                        </button>
                        <button
                          type="button"
                          title="Renomear esta pasta"
                          aria-label={`Renomear pasta ${deck.title}`}
                          onClick={() => onDeckRename?.(deck.id)}
                        >
                          ✏️ Renomear
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="Excluir esta pasta"
                          aria-label={`Excluir pasta ${deck.title}`}
                          onClick={() => onDeckDelete?.(deck.id)}
                        >
                          🗑️ Excluir
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

type SessionCompleteProps = {
  title: string
  tally: SessionTally
  retention: number
  onRestart: () => void
  onExit: () => void
}
export function MedReviewLegacySessionComplete({
  title,
  tally,
  retention,
  onRestart,
  onExit,
}: SessionCompleteProps) {
  const total = tally.again + tally.hard + tally.good + tally.easy
  const recall = total ? Math.round(((tally.good + tally.easy) * 100) / total) : 0
  const minutes = Math.max(1, Math.round((Date.now() - tally.startMs) / 60000))
  const note =
    total === 0
      ? 'Sessão encerrada antes de avaliar cartas. O FSRS-5 preservou seu progresso.'
      : recall >= 85
        ? 'Excelente evocação ativa! 🔥'
        : recall >= 60
          ? 'Bom trabalho — revise os pontos cegos. 💪'
          : 'Sessão difícil: vale revisitar o conteúdo-fonte. 📖'
  return (
    <div className="mr-legacy-study-page">
      <MedReviewLegacyStyles />
      <header className="mr-legacy-header">
        <div className="mr-legacy-study-top">
          <nav className="mr-legacy-breadcrumb">
            <button onClick={onExit}>Início</button>
            <span>/</span>
            <button onClick={onExit}>Tutoria</button>
            <span>/</span>
            <strong>{title}</strong>
          </nav>
          <div className="mr-legacy-study-controls">
            <button className="mr-legacy-control" onClick={onExit}>
              ✓ Concluído
            </button>
            <button className="mr-legacy-control exit" onClick={onExit}>
              ✕ Sair da sessão
            </button>
          </div>
        </div>
      </header>
      <main className="mr-legacy-study-main">
        <article className="mr-legacy-session">
          <div className="mr-legacy-session-icon">🎉</div>
          <h1>Sessão Concluída!</h1>
          <p className="mr-legacy-session-sub">{title}</p>
          <div className="mr-legacy-session-stats">
            <div className="mr-legacy-session-stat">
              <span>📚 Cartas</span>
              <strong>{total}</strong>
            </div>
            <div className="mr-legacy-session-stat">
              <span>⏱️ Tempo de estudo</span>
              <strong>{minutes} min</strong>
            </div>
            <div className="mr-legacy-session-stat">
              <span>🎯 Evocação</span>
              <strong
                style={{ color: recall >= 85 ? '#166534' : recall >= 60 ? '#b45309' : '#b91c1c' }}
              >
                {recall}%
              </strong>
            </div>
          </div>
          <div className="mr-legacy-session-ratings" title="Errei · Difícil · Bom · Fácil">
            ❌ {tally.again} · ⚠️ {tally.hard} · ✅ {tally.good} · ⭐ {tally.easy}
          </div>
          <p className="mr-legacy-session-note">
            {note}{' '}
            {total > 0 && (
              <>
                O FSRS-5 recalculou S, D e os próximos intervalos com base na sua retenção alvo (
                {Math.round(retention * 100)}%).
              </>
            )}
          </p>
          <div className="mr-legacy-session-actions">
            <button className="mr-legacy-button primary" onClick={onRestart}>
              🔄 Revisar Novamente
            </button>
            <button className="mr-legacy-button" onClick={onExit}>
              Voltar para Pastas
            </button>
          </div>
        </article>
      </main>
    </div>
  )
}
