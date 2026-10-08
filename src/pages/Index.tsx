import { Fragment, useEffect, useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { compareDecks } from '@/lib/deckSort'
import pb from '@/lib/pocketbase/client'
import { supabase } from '@/lib/supabase/client'

import {
  applyInitialSeed,
  createCard,
  createDeck,
  createReview,
  deleteDeck,
  moveDeck,
  moveDeckSection,
  renameDeck,
  repairSection,
  resetDeck,
  restoreBackupData,
  undoMoveSection,
} from '@/services/medreview'
import {
  MedReviewLegacyHome,
  MedReviewLegacySessionComplete,
  MedReviewLegacyStyles,
} from '@/components/MedReviewLegacyLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ImageOcclusionViewer } from '@/components/ImageOcclusionViewer'
import { ImageLightboxModal } from '@/components/ImageLightboxModal'
import { parseOcclusion } from '@/services/imageOcclusion'
import { fetchCardNote, saveCardNote } from '@/services/cardNotes'
import { extractCardTags } from '@/services/cardTags'

// Modais pesados carregados sob demanda (Code-splitting / Bundle 75% menor)
const MedReviewLibrary = lazy(() => import('@/components/MedReviewLibrary'))
const ImageOcclusionModal = lazy(() =>
  import('@/components/ImageOcclusionModal').then((m) => ({ default: m.ImageOcclusionModal })),
)
const ExamPlanModal = lazy(() =>
  import('@/components/ExamPlanModal').then((m) => ({ default: m.ExamPlanModal })),
)
const CardReportModal = lazy(() =>
  import('@/components/CardReportModal').then((m) => ({ default: m.CardReportModal })),
)
const MasterReportsModal = lazy(() =>
  import('@/components/MasterReportsModal').then((m) => ({ default: m.MasterReportsModal })),
)
const MasterAnalyticsModal = lazy(() =>
  import('@/components/MasterAnalyticsModal').then((m) => ({ default: m.MasterAnalyticsModal })),
)
const AiCardGeneratorModal = lazy(() =>
  import('@/components/AiCardGeneratorModal').then((m) => ({ default: m.AiCardGeneratorModal })),
)
const CramSessionModal = lazy(() =>
  import('@/components/CramSessionModal').then((m) => ({ default: m.CramSessionModal })),
)
const AnkiImportModal = lazy(() =>
  import('@/components/AnkiImportModal').then((m) => ({ default: m.AnkiImportModal })),
)
import { speechService } from '@/services/speech'

// ==================== Motor FSRS-5 (portado do MedReview original) ====================
const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const FSRS_DECAY = -0.5
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1
const FSRS_MAX_INTERVAL = 36500

function fsrsRetrievability(elapsedDays: number, stability: number): number {
  if (!stability || stability <= 0) return 0
  return Math.pow(1 + (FSRS_FACTOR * Math.max(0, elapsedDays)) / stability, FSRS_DECAY)
}
function fsrsIntervalFor(stability: number, r: number): number {
  const ivl = (stability / FSRS_FACTOR) * (Math.pow(r, 1 / FSRS_DECAY) - 1)
  return Math.max(0.1, Math.min(FSRS_MAX_INTERVAL, ivl))
}
function fsrsInitialDifficulty(g: number): number {
  return Math.min(10, Math.max(1, FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1))
}
function fsrsNextDifficulty(d: number, g: number): number {
  const linDamp = (10 - d) / 9
  const dPrime = d - FSRS_W[6] * (g - 3) * linDamp
  const d0g4 = fsrsInitialDifficulty(4)
  return Math.min(10, Math.max(1, FSRS_W[7] * d0g4 + (1 - FSRS_W[7]) * dPrime))
}
function fsrsInitialStability(g: number): number {
  return Math.max(0.1, FSRS_W[g - 1])
}
function fsrsStabilityAfterRecall(d: number, s: number, r: number, g: number): number {
  let inc =
    Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - r)) - 1)
  if (g === 2) inc *= FSRS_W[15]
  if (g === 4) inc *= FSRS_W[16]
  return Math.max(0.1, s * (1 + inc))
}
function fsrsStabilityAfterForget(d: number, s: number, r: number): number {
  return Math.max(
    0.1,
    FSRS_W[11] *
      Math.pow(d, -FSRS_W[12]) *
      (Math.pow(s + 1, FSRS_W[13]) - 1) *
      Math.exp(FSRS_W[14] * (1 - r)),
  )
}
function fsrsSameDayStability(s: number, g: number): number {
  return Math.max(0.1, s * Math.exp(FSRS_W[17] * (g - 3 + FSRS_W[18])))
}
function formatInterval(days: number): string {
  if (days < 1) return `${Math.round(days * 24 * 60)}min`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${(days / 30).toFixed(1)}m`
  return `${(days / 365).toFixed(1)}a`
}

// ===== Cloze deletion ({{c1::texto}}) — formato padrão dos decks médicos =====
const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g
function isCloze(text: string): boolean {
  if (!text) return false
  if (text.includes('image-occlusion:')) return false
  CLOZE_RE.lastIndex = 0
  return CLOZE_RE.test(text || '')
}
function clozeCount(text: string): number {
  const set = new Set<string>()
  let m: RegExpExecArray | null
  CLOZE_RE.lastIndex = 0
  while ((m = CLOZE_RE.exec(text || ''))) set.add(m[1])
  return set.size
}
// Renderiza o texto com as lacunas: preserva HTML e imagens do Anki; antes de virar, oculta com dica ou numeração; depois, destaca com esmeralda.
function renderClozeHtml(text: string, revealed: boolean): string {
  if (!text) return ''
  const sanitized = text
    .replace(/<!--occlusion:[\s\S]*?-->/g, '')
    .replace(/(?:\{\{c\d+::)?image-occlusion:[^}\s<]+(?:\}\})?/gi, '')
    .trim()
  if (!sanitized) return ''
  const hasHtml = /<[a-z][\s\S]*>/i.test(sanitized)
  const baseText = hasHtml ? sanitized : sanitized.replace(/\n/g, '<br/>')

  CLOZE_RE.lastIndex = 0
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = CLOZE_RE.exec(baseText))) {
    out += baseText.slice(last, m.index)
    if (revealed) {
      out += `<span style="background:#dcfce7;color:#14532d;font-weight:800;border-radius:6px;padding:2px 8px;border:1px solid #86efac;box-shadow:0 1px 3px rgba(22,163,74,0.15)">${m[2]}</span>`
    } else {
      const hint = m[3] ? m[3] : `c${m[1]}`
      out += `<span style="background:#fef3c7;color:#b45309;font-weight:800;border-radius:6px;padding:2px 8px;border:1.5px dashed #f59e0b;cursor:pointer;display:inline-block" title="Lacuna Cloze: clique para virar e conferir">[…${hint}…]</span>`
    }
    last = m.index + m[0].length
  }
  out += baseText.slice(last)
  return out
}

type Quality = 'again' | 'hard' | 'good' | 'easy'
interface CardState {
  s: number | null
  d: number | null
  state: string
  reps: number
  lapses: number
  lastReviewMs: number | null
  dueMs: number | null
}

function previewIntervals(
  cs: CardState,
  retention: number,
): Record<
  Quality,
  { label: string; value: number; newS?: number; newD?: number; g: number; state: string }
> {
  const mk = (
    g: number,
  ): { label: string; value: number; newS?: number; newD?: number; g: number; state: string } => {
    if (cs.s == null || cs.d == null) {
      const s0 = fsrsInitialStability(g)
      const ivl = fsrsIntervalFor(s0, retention)
      return {
        label: formatInterval(ivl),
        value: ivl,
        g,
        state: g === 1 || g === 2 ? 'learning' : 'review',
      }
    }
    const elapsed = cs.lastReviewMs ? Math.max(0, (Date.now() - cs.lastReviewMs) / 86400000) : 0
    const R = fsrsRetrievability(elapsed, cs.s)
    let newS: number, newState: string
    if (elapsed < 1) {
      newS = fsrsSameDayStability(cs.s, g)
      newState = g === 1 ? 'relearning' : cs.state === 'learning' ? 'review' : cs.state || 'review'
    } else if (g === 1) {
      newS = fsrsStabilityAfterForget(cs.d, cs.s, R)
      newState = 'relearning'
    } else {
      newS = fsrsStabilityAfterRecall(cs.d, cs.s, R, g)
      newState = 'review'
    }
    const ivl = fsrsIntervalFor(newS, retention)
    return {
      label: formatInterval(ivl),
      value: ivl,
      newS,
      newD: fsrsNextDifficulty(cs.d, g),
      g,
      state: newState,
    }
  }
  return { again: mk(1), hard: mk(2), good: mk(3), easy: mk(4) }
}

// ==================== Tipos e camada de dados ====================
interface Deck {
  id: string
  title: string
  kind: string
  order: number
  seed_key?: string
  parent?: string
  deleted?: boolean
  frontline?: boolean
  mode?: string
}
interface Card {
  id: string
  deck: string
  q: string
  a: string
  group: string
  ref: string
  suspended: boolean
  seed_key?: string
  deleted?: boolean
  diagram_svg?: string
  diagram_title?: string
  image?: string
  choices?: string[] | null
  reverse?: boolean
  clinical?: boolean
  __reverse?: boolean
  occlusion?: any
  tags?: string[]
  imageUrl?: string
}
interface Review {
  id: string
  card?: string
  card_ref?: string
  rating: string
  stability: number
  difficulty: number
  retrievability: number
  elapsed_days: number
  scheduled_days: number
  state: string
  due: string
  reviewed_at: string
}

function parsePbDate(value?: string): number | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`
  const ms = new Date(withZone).getTime()
  return Number.isFinite(ms) ? ms : null
}

// Estado FSRS derivado do histórico de revisões (fonte única: banco)
function cardStateFromReviews(reviews: Review[]): CardState {
  if (reviews.length === 0)
    return { s: null, d: null, state: 'new', reps: 0, lapses: 0, lastReviewMs: null, dueMs: null }
  const ordered = [...reviews].sort(
    (a, b) => (parsePbDate(a.reviewed_at) || 0) - (parsePbDate(b.reviewed_at) || 0),
  )
  const last = ordered[ordered.length - 1]
  const due = parsePbDate(last.due) || Date.now()
  return {
    s: last.stability ?? null,
    d: last.difficulty ?? null,
    state: last.state || 'review',
    reps: ordered.filter((r) => r.rating !== 'again').length,
    lapses: ordered.filter((r) => r.rating === 'again').length,
    lastReviewMs: parsePbDate(last.reviewed_at),
    dueMs: due,
  }
}

const RETENTION_KEY = 'mr_retention'
type SchedulerMode = 'automatic' | 'manual'
type ManualIntervals = Record<Quality, string>
type SchedulerSettings = { mode: SchedulerMode; intervals: ManualIntervals }
const SCHEDULER_SETTINGS_KEY = 'mr_scheduler_settings_'
const DEFAULT_MANUAL_INTERVALS: ManualIntervals = {
  again: '10 min',
  hard: '1 dia',
  good: '2 dias',
  easy: '3 dias',
}
function parseManualInterval(raw: string): { days: number; label: string } | null {
  const match = String(raw || '')
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:[.,]\d+)?)\s*(m|min|mins|minuto|minutos|d|dia|dias)?$/i)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2] || 'd'
  const isMinutes = unit === 'm' || unit.startsWith('min')
  const days = isMinutes ? amount / 1440 : amount
  if (days < 1 / 1440 || days > FSRS_MAX_INTERVAL) return null
  const amountLabel = String(amount).replace('.', ',')
  return { days, label: `${amountLabel}${isMinutes ? 'min' : 'd'}` }
}
function getSchedulerSettings(accountId?: string): SchedulerSettings {
  const defaults = {
    mode: 'automatic' as SchedulerMode,
    intervals: { ...DEFAULT_MANUAL_INTERVALS },
  }
  if (!accountId) return defaults
  try {
    const saved = JSON.parse(localStorage.getItem(SCHEDULER_SETTINGS_KEY + accountId) || 'null')
    if (!saved || (saved.mode !== 'automatic' && saved.mode !== 'manual')) return defaults
    const intervals = { ...DEFAULT_MANUAL_INTERVALS }
    for (const quality of ['again', 'hard', 'good', 'easy'] as Quality[]) {
      if (
        typeof saved.intervals?.[quality] === 'string' &&
        parseManualInterval(saved.intervals[quality])
      ) {
        intervals[quality] = saved.intervals[quality]
      }
    }
    return { mode: saved.mode, intervals }
  } catch (e) {
    return defaults
  }
}
function previewIntervalsForSettings(
  cs: CardState,
  retention: number,
  settings: SchedulerSettings,
) {
  const automatic = previewIntervals(cs, retention)
  if (settings.mode !== 'manual') return automatic
  const result = { ...automatic }
  for (const quality of ['again', 'hard', 'good', 'easy'] as Quality[]) {
    const interval = parseManualInterval(settings.intervals[quality])
    if (interval)
      result[quality] = { ...automatic[quality], value: interval.days, label: interval.label }
  }
  return result
}
function getRetention(): number {
  try {
    const v = parseFloat(localStorage.getItem(RETENTION_KEY) || '')
    if (!isNaN(v) && v >= 0.8 && v <= 0.97) return v
  } catch (e) {
    // valor inválido no localStorage — usa o default
  }
  return 0.9
}

// ===== Painel de configurações (⚙️) =====
function SettingsModal({
  accountId,
  onClose,
  onSaved,
  onRepair,
}: {
  accountId?: string
  onClose: () => void
  onSaved: () => void
  onRepair?: (kind: 'tutoria' | 'prova' | 'custom') => Promise<boolean>
}) {
  const [val, setVal] = useState(() => getRetention() * 100)
  const [schedulerMode, setSchedulerMode] = useState<SchedulerMode>(
    () => getSchedulerSettings(accountId).mode,
  )
  const [manualIntervals, setManualIntervals] = useState<ManualIntervals>(
    () => getSchedulerSettings(accountId).intervals,
  )
  const [scheduleError, setScheduleError] = useState('')
  const [saving, setSaving] = useState(false)
  const [repairing, setRepairing] = useState('')
  const repair = async (kind: 'tutoria' | 'prova' | 'custom') => {
    if (!onRepair) return
    setRepairing(kind)
    const ok = await onRepair(kind)
    setRepairing('')
    if (ok) {
      onSaved()
      onClose()
    }
  }
  const save = () => {
    setScheduleError('')
    if (!accountId) {
      setScheduleError('Entre novamente na sua conta para salvar estas preferências.')
      return
    }
    if (schedulerMode === 'manual') {
      const invalid = (['again', 'hard', 'good', 'easy'] as Quality[]).find(
        (quality) => !parseManualInterval(manualIntervals[quality]),
      )
      if (invalid) {
        const labels: Record<Quality, string> = {
          again: 'Errei',
          hard: 'Difícil',
          good: 'Bom',
          easy: 'Fácil',
        }
        setScheduleError(
          `Informe um intervalo válido para “${labels[invalid]}”, como 20 min ou 3 dias.`,
        )
        return
      }
    }
    setSaving(true)
    const v = Math.min(97, Math.max(80, val))
    localStorage.setItem(RETENTION_KEY, String(v / 100))
    localStorage.setItem(
      SCHEDULER_SETTINGS_KEY + accountId,
      JSON.stringify({ mode: schedulerMode, intervals: manualIntervals }),
    )
    setTimeout(() => {
      onSaved()
      onClose()
    }, 250)
  }
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.45)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 24,
          width: '100%',
          maxWidth: 430,
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(15,23,42,.25)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}>
          ⚙️ Configurações
        </h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '.83rem' }}>
          Ajuste o motor FSRS-5 ao seu ritmo de estudo.
        </p>
        <label
          style={{
            display: 'block',
            fontSize: '.8rem',
            fontWeight: 700,
            color: '#475569',
            marginBottom: 6,
          }}
        >
          Retenção alvo: {Math.round(val)}% — quanto maior, mais cedo as cartas voltam
        </label>
        <input
          type="range"
          min={80}
          max={97}
          value={Math.round(val)}
          onChange={(e) => setVal(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#16a34a', marginBottom: 6 }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#64748b',
            fontSize: '.72rem',
            marginBottom: 14,
          }}
        >
          <span>80% — menos cartas/dia</span>
          <span>97% — revisão intensiva</span>
        </div>
        <section
          style={{
            margin: '0 0 16px',
            padding: 12,
            border: '1px solid #d1fae5',
            borderRadius: 12,
            background: '#f8fffb',
          }}
        >
          <strong style={{ display: 'block', color: '#14532d', fontSize: '.85rem' }}>
            Como agendar as próximas revisões?
          </strong>
          <p style={{ margin: '5px 0 10px', color: '#64748b', fontSize: '.76rem' }}>
            Automático usa FSRS. Manual usa o tempo escolhido para cada nota.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(
              [
                ['automatic', '⚙️ Automático (FSRS)'],
                ['manual', '✍️ Manual'],
              ] as [SchedulerMode, string][]
            ).map(([mode, label]) => (
              <label
                key={mode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 9px',
                  border: `1px solid ${schedulerMode === mode ? '#16a34a' : '#cbd5e1'}`,
                  borderRadius: 9,
                  background: schedulerMode === mode ? '#f0fdf4' : '#fff',
                  color: '#334155',
                  fontSize: '.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="scheduler-mode"
                  checked={schedulerMode === mode}
                  onChange={() => setSchedulerMode(mode)}
                  style={{ accentColor: '#16a34a' }}
                />
                {label}
              </label>
            ))}
          </div>
          {schedulerMode === 'manual' && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {(
                [
                  ['again', 'Errei'],
                  ['hard', 'Difícil'],
                  ['good', 'Bom'],
                  ['easy', 'Fácil'],
                ] as [Quality, string][]
              ).map(([quality, label]) => (
                <label
                  key={quality}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '76px 1fr',
                    alignItems: 'center',
                    gap: 8,
                    color: '#334155',
                    fontSize: '.8rem',
                    fontWeight: 700,
                  }}
                >
                  <span>{label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Intervalo manual ${label}`}
                    placeholder="ex.: 20 min ou 3 dias"
                    value={manualIntervals[quality]}
                    onChange={(e) => {
                      setManualIntervals((current) => ({ ...current, [quality]: e.target.value }))
                      setScheduleError('')
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.5rem 0.65rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      font: 'inherit',
                      fontWeight: 500,
                    }}
                  />
                </label>
              ))}
              <span style={{ color: '#64748b', fontSize: '.72rem' }}>
                Aceita “20 min”, “5m”, “3 dias” ou “5d”. Número sem unidade significa dias. Esses
                tempos valem para as próximas avaliações.
              </span>
            </div>
          )}

          {scheduleError && (
            <p
              role="alert"
              style={{ margin: '9px 0 0', color: '#b91c1c', fontSize: '.76rem', fontWeight: 700 }}
            >
              {scheduleError}
            </p>
          )}
        </section>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              border: '1px solid #16a34a',
              borderRadius: 9,
              padding: '0.55rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#16a34a',
              color: '#fff',
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 9,
              padding: '0.55rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#fff',
              color: '#334155',
            }}
          >
            Cancelar
          </button>
        </div>
        {onRepair && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px dashed #bbf7d0',
            }}
          >
            <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: '.8rem' }}>
              🛠️ Reparo de estrutura — devolve as pastas para o lugar original
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => repair('tutoria')}
                disabled={!!repairing}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 9,
                  padding: '0.45rem 0.8rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '.78rem',
                  background: '#fff',
                  color: '#334155',
                }}
              >
                {repairing === 'tutoria' ? 'Reparando…' : '🩺 Tutorias → nível inicial'}
              </button>
              <button
                type="button"
                onClick={() => repair('prova')}
                disabled={!!repairing}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 9,
                  padding: '0.45rem 0.8rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '.78rem',
                  background: '#fff',
                  color: '#334155',
                }}
              >
                {repairing === 'prova' ? 'Reparando…' : '📝 Provas → nível inicial'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 🎛️ Montar sessão (sessão personalizada por pastas/filtros) =====
type SessionFilter = {
  id: string
  name: string
  deckIds: string[]
  includeNew: boolean
  includeDue: boolean
  includeFuture: boolean
  includeSuspended: boolean
  limit: number
}
const FILTERS_KEY = 'mr_session_filters'
function loadSessionFilters(): SessionFilter[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FILTERS_KEY) || '[]')
    if (Array.isArray(raw)) return raw
  } catch (e) {
    // corrompido — ignora
  }
  return []
}
function saveSessionFilters(filters: SessionFilter[]) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
}
function buildSessionCards(
  cards: Card[],
  reviews: Review[],
  deckIds: string[],
  opts: {
    includeNew: boolean
    includeDue: boolean
    includeFuture: boolean
    includeSuspended: boolean
    limit: number
  },
): Card[] {
  const now = Date.now()
  const deckSet = new Set(deckIds)
  let picked: Card[] = []
  for (const c of cards) {
    if (!deckSet.has(c.deck)) continue
    if (c.suspended && !opts.includeSuspended) continue
    const cs = cardStateFromReviews(reviews.filter((r) => (r.card_id || r.card_ref || r.card) === c.id))
    const isNew = cs.state === 'new'
    const isDue = cs.state !== 'new' && (cs.dueMs || 0) <= now
    const isFuture = cs.state !== 'new' && (cs.dueMs || 0) > now
    if (isNew && !opts.includeNew) continue
    if (!isNew && isDue && !opts.includeDue) continue
    if (!isNew && isFuture && !opts.includeFuture) continue
    picked.push(c)
  }
  if (opts.limit > 0 && picked.length > opts.limit) picked = picked.slice(0, opts.limit)
  return picked
}
function SessionBuilderModal({
  decks,
  cards,
  reviews,
  onClose,
  onStart,
}: {
  decks: Deck[]
  cards: Card[]
  reviews: Review[]
  onClose: () => void
  onStart: (picked: Card[], title: string) => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeNew, setIncludeNew] = useState(true)
  const [includeDue, setIncludeDue] = useState(true)
  const [includeFuture, setIncludeFuture] = useState(false)
  const [includeSuspended, setIncludeSuspended] = useState(false)
  const [limit, setLimit] = useState(0)
  const [filters, setFilters] = useState<SessionFilter[]>(() => loadSessionFilters())
  const [filterName, setFilterName] = useState('')
  const [filterMsg, setFilterMsg] = useState('')
  const visibleDecks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...decks]
      .sort((a, b) => compareDecks(a, b))
      .filter((d) => !q || d.title.toLowerCase().includes(q))
  }, [decks, search])
  const countOf = (deckId: string) => {
    const childIds = decks.filter((d) => d.parent === deckId).map((d) => d.id)
    const allIds = [deckId, ...childIds]
    return buildSessionCards(
      cards.filter((c) => allIds.includes(c.deck)),
      reviews,
      allIds,
      { includeNew, includeDue, includeFuture, includeSuspended, limit: 0 },
    ).length
  }
  const totalCount = buildSessionCards(cards, reviews, [...selected], {
    includeNew,
    includeDue,
    includeFuture,
    includeSuspended,
    limit,
  }).length
  const toggleDeck = (deckId: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(deckId)) next.delete(deckId)
      else next.add(deckId)
      return next
    })
  }
  const saveFilter = () => {
    const name = filterName.trim() || `Sessão ${filters.length + 1}`
    const f: SessionFilter = {
      id: 'f' + Date.now().toString(36),
      name,
      deckIds: [...selected],
      includeNew,
      includeDue,
      includeFuture,
      includeSuspended,
      limit,
    }
    const next = [...filters, f]
    setFilters(next)
    saveSessionFilters(next)
    setFilterName('')
    setFilterMsg(`Filtro “${name}” salvo.`)
    setTimeout(() => setFilterMsg(''), 2500)
  }
  const applyFilter = (f: SessionFilter) => {
    setSelected(new Set(f.deckIds))
    setIncludeNew(f.includeNew)
    setIncludeDue(f.includeDue)
    setIncludeFuture(f.includeFuture)
    setIncludeSuspended(f.includeSuspended)
    setLimit(f.limit)
  }
  const removeFilter = (id: string) => {
    const next = filters.filter((f) => f.id !== id)
    setFilters(next)
    saveSessionFilters(next)
  }
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(15,23,42,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 22,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(15,23,42,.25)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}>
          🎛️ Montar sessão
        </h3>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '.83rem' }}>
          Escolha as pastas e o que revisar — a fila FSRS monta na hora.
        </p>
        <input
          placeholder="🔍 Buscar tema…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.6rem 0.8rem',
            borderRadius: 9,
            border: '1.5px solid #cbd5e1',
            font: 'inherit',
            marginBottom: 10,
          }}
        />
        <div
          style={{
            maxHeight: 240,
            overflow: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          {visibleDecks.map((deck) => {
            const childIds = decks.filter((d) => d.parent === deck.id).map((d) => d.id)
            const hasParent = !!deck.parent
            return (
              <label
                key={deck.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 12px',
                  borderBottom: '1px solid #f1f5f9',
                  paddingLeft: hasParent ? 28 : 12,
                  fontSize: '.88rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(deck.id)}
                  onChange={() => toggleDeck(deck.id)}
                  style={{ accentColor: '#16a34a' }}
                />
                <span style={{ flex: 1, color: '#1f2937', fontWeight: 600 }}>
                  {deck.kind === 'prova' ? '📝' : '🩺'} {deck.title}
                </span>
                <span style={{ color: '#64748b', fontSize: '.75rem' }}>{countOf(deck.id)}</span>
                {childIds.length > 0 && (
                  <span style={{ color: '#64748b', fontSize: '.68rem' }}>
                    +{childIds.length} sub
                  </span>
                )}
              </label>
            )
          })}
          {!visibleDecks.length && (
            <div style={{ padding: 16, color: '#64748b', fontSize: '.85rem', textAlign: 'center' }}>
              Nenhuma pasta encontrada.
            </div>
          )}
        </div>
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: '.72rem',
              fontWeight: 900,
              color: '#15803d',
              letterSpacing: '.08em',
              marginBottom: 8,
            }}
          >
            CONFIGURAÇÕES
          </div>
          {[
            ['Novas cartas', includeNew, setIncludeNew],
            ['Revisões de hoje (vencidas)', includeDue, setIncludeDue],
            ['Revisões futuras', includeFuture, setIncludeFuture],
            ['Incluir suspensas', includeSuspended, setIncludeSuspended],
          ].map(([label, checked, setter]: any) => (
            <label
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '5px 0',
                fontSize: '.86rem',
                color: '#1f2937',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setter(e.target.checked)}
                style={{ accentColor: '#16a34a' }}
              />
              {label}
            </label>
          ))}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '5px 0',
              fontSize: '.86rem',
              color: '#1f2937',
            }}
          >
            Limite de cartas
            <input
              type="number"
              min={0}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
              style={{
                width: 80,
                padding: '0.35rem 0.55rem',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                font: 'inherit',
              }}
            />
            <span style={{ color: '#64748b', fontSize: '.72rem' }}>0 = sem limite</span>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: '.72rem',
              fontWeight: 900,
              color: '#15803d',
              letterSpacing: '.08em',
              marginBottom: 8,
            }}
          >
            MEUS FILTROS {filters.length ? `(${filters.length})` : ''}
          </div>
          {filters.map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                marginBottom: 6,
              }}
            >
              <span style={{ flex: 1, fontSize: '.86rem', fontWeight: 600, color: '#1f2937' }}>
                💾 {f.name}
              </span>
              <button
                onClick={() => applyFilter(f)}
                style={{
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: '4px 10px',
                  background: '#f0fdf4',
                  color: '#15803d',
                  font: '700 .74rem Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
                Aplicar
              </button>
              <button
                onClick={() => removeFilter(f.id)}
                style={{
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '4px 10px',
                  background: '#fff',
                  color: '#b91c1c',
                  font: '700 .74rem Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="Nome deste filtro…"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              style={{
                flex: 1,
                padding: '0.45rem 0.7rem',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                font: 'inherit',
                fontSize: '.84rem',
              }}
            />
            <button
              onClick={saveFilter}
              style={{
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '0.45rem 0.8rem',
                background: '#f0fdf4',
                color: '#15803d',
                font: '700 .8rem Inter, system-ui, sans-serif',
                cursor: 'pointer',
              }}
            >
              💾 Salvar filtro
            </button>
          </div>
          {filterMsg && (
            <div style={{ color: '#15803d', fontSize: '.78rem', marginTop: 6 }}>{filterMsg}</div>
          )}
        </div>
        <button
          disabled={!selected.size || !totalCount}
          onClick={() => {
            const titles = [...selected]
              .map((id) => decks.find((d) => d.id === id)?.title)
              .filter(Boolean)
              .slice(0, 3)
              .join(', ')
            onStart(
              buildSessionCards(cards, reviews, [...selected], {
                includeNew,
                includeDue,
                includeFuture,
                includeSuspended,
                limit,
              }),
              titles + (selected.size > 3 ? ` +${selected.size - 3}` : ''),
            )
          }}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 11,
            padding: '0.8rem',
            cursor: selected.size && totalCount ? 'pointer' : 'not-allowed',
            background:
              selected.size && totalCount ? 'linear-gradient(135deg,#16a34a,#22c55e)' : '#e2e8f0',
            color: selected.size && totalCount ? '#fff' : '#94a3b8',
            fontWeight: 800,
            fontSize: '.95rem',
          }}
        >
          🎯 {totalCount} cards
        </button>
      </div>
    </div>
  )
}

// ===== 📊 Estatísticas do cartão =====
function CardStatsModal({
  card,
  reviews,
  onClose,
}: {
  card: Card
  reviews: Review[]
  onClose: () => void
}) {
  const cardReviews = reviews
    .filter((r) => (r.card_id || r.card_ref || r.card) === card.id)
    .sort((a, b) => (parsePbDate(a.reviewed_at) || 0) - (parsePbDate(b.reviewed_at) || 0))
  const total = cardReviews.length
  const correct = cardReviews.filter((r) => r.rating === 'good' || r.rating === 'easy').length
  const errors = cardReviews.filter((r) => r.rating === 'again').length
  const hardCount = cardReviews.filter((r) => r.rating === 'hard').length
  const dist = [
    { label: 'Errei', value: errors, color: '#dc2626' },
    { label: 'Difícil', value: hardCount, color: '#d97706' },
    {
      label: 'Bom',
      value: cardReviews.filter((r) => r.rating === 'good').length,
      color: '#16a34a',
    },
    {
      label: 'Fácil',
      value: cardReviews.filter((r) => r.rating === 'easy').length,
      color: '#2563eb',
    },
  ]
  const cs = cardStateFromReviews(cardReviews)
  const nextDue = cs.dueMs
    ? new Date(cs.dueMs).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }) +
      ' às ' +
      new Date(cs.dueMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null
  const maxDist = Math.max(1, ...dist.map((d) => d.value))
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(15,23,42,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 22,
          width: '100%',
          maxWidth: 440,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(15,23,42,.25)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}>
          📊 Estatísticas do cartão
        </h3>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '.8rem', lineHeight: 1.4 }}>
          {card.q.slice(0, 90)}
          {card.q.length > 90 ? '…' : ''}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            { label: 'Vezes respondida', value: total, color: '#14532d' },
            { label: 'Acertos', value: correct, color: '#15803d' },
            { label: 'Erros', value: errors, color: '#b91c1c' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                border: '1px solid #d1fae5',
                borderRadius: 12,
                padding: '10px 8px',
                textAlign: 'center',
                background: '#f8fafc',
              }}
            >
              <div style={{ color: s.color, fontSize: '1.25rem', fontWeight: 900 }}>{s.value}</div>
              <div style={{ color: '#64748b', fontSize: '.68rem', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: '.72rem',
            fontWeight: 900,
            color: '#15803d',
            letterSpacing: '.08em',
            marginBottom: 8,
          }}
        >
          COMO VOCÊ RESPONDE
        </div>
        {dist.map((d) => (
          <div
            key={d.label}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
          >
            <span style={{ width: 52, color: '#475569', fontSize: '.76rem', fontWeight: 700 }}>
              {d.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 14,
                background: '#f1f5f9',
                borderRadius: 7,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round((d.value * 100) / maxDist)}%`,
                  height: '100%',
                  background: d.color,
                  borderRadius: 7,
                  transition: 'width .3s ease',
                }}
              />
            </div>
            <span style={{ width: 24, color: '#64748b', fontSize: '.76rem', textAlign: 'right' }}>
              {d.value}
            </span>
          </div>
        ))}
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            border: '1px solid #d1fae5',
            borderRadius: 12,
            background: '#f0fdf4',
            fontSize: '.84rem',
            color: '#14532d',
          }}
        >
          <strong>Situação atual:</strong>{' '}
          {cs.state === 'new'
            ? '🆕 carta nova — ainda não estudada'
            : nextDue
              ? `📅 próxima revisão em ${nextDue}`
              : '📅 sem agendamento'}
          {cs.reps > 0 && (
            <span style={{ display: 'block', marginTop: 4, color: '#15803d', fontSize: '.78rem' }}>
              Estabilidade: {cs.s ? cs.s.toFixed(1) + 'd' : '—'} · Dificuldade:{' '}
              {cs.d ? cs.d.toFixed(1) + '/10' : '—'} · Revisões: {cs.reps} · Lapsos: {cs.lapses}
            </span>
          )}
        </div>
        {!total && (
          <p
            style={{ margin: '12px 0 0', color: '#94a3b8', fontSize: '.8rem', textAlign: 'center' }}
          >
            Nenhuma revisão registrada ainda — os números aparecem depois da primeira avaliação.
          </p>
        )}
      </div>
    </div>
  )
}

// ===== ⏱️ Quiz cronometrado (treino — não grava revisões FSRS) =====
type QuizQ = {
  id: string
  deckTitle: string
  q: string
  a: string
  choices?: string[] | null
  image?: string
  diagram_svg?: string
  diagram_title?: string
}
type QuizState = {
  qs: QuizQ[]
  i: number
  picked: string | null
  score: number
  revealed: boolean
  timerOn: boolean
  endsMs: number
  done: boolean
  startedMs: number
  kind: string
  wrong: { q: QuizQ; picked: string | null }[]
}
const QUIZ_SECONDS = 30
const quizOverlay = (z: number): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  zIndex: z,
  background: 'rgba(15,23,42,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
  fontFamily: 'Inter, system-ui, sans-serif',
})
const quizPanel: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 24,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'auto',
  boxSizing: 'border-box',
  boxShadow: '0 20px 50px rgba(15,23,42,.25)',
}
const quizLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '.8rem',
  fontWeight: 700,
  color: '#475569',
  marginBottom: 4,
}
const quizInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.65rem 0.8rem',
  borderRadius: 9,
  border: '1.5px solid #cbd5e1',
  font: 'inherit',
  marginBottom: 10,
  background: '#fff',
}
// Embaralhamento determinístico por carta (ordem estável entre renders)
function seededShuffle(arr: string[], seedStr: string): string[] {
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const j = seed % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function QuizSetupModal({
  totalCards,
  onClose,
  onStart,
}: {
  totalCards: number
  onClose: () => void
  onStart: (count: number, timerOn: boolean, kind: string) => void
}) {
  const [count, setCount] = useState(10)
  const [timerOn, setTimerOn] = useState(true)
  const [kind, setKind] = useState('all')
  return (
    <div onClick={onClose} style={quizOverlay(80)}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...quizPanel, maxWidth: 430 }}>
        <h3 style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}>
          ⏱️ Quiz cronometrado
        </h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '.83rem' }}>
          Treino rápido contra o relógio — não altera seu agendamento FSRS.
        </p>
        <label style={quizLabel}>Quantidade de questões</label>
        <input
          type="number"
          min={3}
          max={50}
          value={count}
          onChange={(e) => setCount(Math.max(3, Math.min(50, parseInt(e.target.value) || 10)))}
          style={quizInput}
        />
        <label style={quizLabel}>Escopo</label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={quizInput}>
          <option value="all">📚 Todas as pastas ({totalCards} cartas)</option>
          <option value="tutoria">🩺 Tutoria</option>
          <option value="prova">📝 Prova de Módulo</option>
          <option value="custom">📁 Minhas Pastas</option>
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            font: '700 .8rem Inter, system-ui, sans-serif',
            color: '#475569',
            cursor: 'pointer',
            marginBottom: 14,
          }}
        >
          <input
            type="checkbox"
            checked={timerOn}
            onChange={(e) => setTimerOn(e.target.checked)}
            style={{ accentColor: '#16a34a', width: 16, height: 16 }}
          />
          Cronômetro de {QUIZ_SECONDS}s por questão
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onStart(count, timerOn, kind)}
            style={{
              border: '1px solid #16a34a',
              borderRadius: 9,
              padding: '0.55rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#16a34a',
              color: '#fff',
            }}
          >
            Começar
          </button>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 9,
              padding: '0.55rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
              background: '#fff',
              color: '#334155',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function QuizRunModal({
  quiz,
  onPick,
  onReveal,
  onNext,
  onRedo,
  onClose,
}: {
  quiz: QuizState
  onPick: (opt: string) => void
  onReveal: () => void
  onNext: () => void
  onRedo: () => void
  onClose: () => void
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [])
  if (quiz.done) {
    const pct = quiz.qs.length ? Math.round((quiz.score * 100) / quiz.qs.length) : 0
    const secs = Math.max(1, Math.round((Date.now() - quiz.startedMs) / 1000))
    return (
      <div onClick={onClose} style={quizOverlay(80)}>
        <div onClick={(e) => e.stopPropagation()} style={quizPanel}>
          <h3
            style={{ margin: '0 0 10px', color: '#14532d', fontSize: '1.15rem', fontWeight: 900 }}
          >
            🏁 Quiz concluído!
          </h3>
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 900,
              color: pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626',
            }}
          >
            {quiz.score}/{quiz.qs.length} · {pct}%
          </div>
          <p style={{ margin: '6px 0 14px', color: '#64748b', fontSize: '.85rem' }}>
            ⏱️ {secs}s · {quiz.timerOn ? 'com cronômetro de 30s' : 'sem cronômetro'}
          </p>
          {quiz.wrong.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: '.72rem',
                  fontWeight: 900,
                  color: '#15803d',
                  letterSpacing: '.08em',
                  marginBottom: 8,
                }}
              >
                PARA REVISAR ({quiz.wrong.length} ERROS)
              </div>
              {quiz.wrong.map((w, i) => (
                <div
                  key={i}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    borderRadius: 10,
                    padding: '0.55rem 0.8rem',
                    marginBottom: 6,
                    fontSize: '.84rem',
                    color: '#7f1d1d',
                  }}
                >
                  <strong>{w.q.q}</strong>
                  <div style={{ marginTop: 3, color: '#166534' }}>✅ {w.q.a}</div>
                  {w.picked && <div style={{ opacity: 0.8 }}>Você marcou: {w.picked}</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onRedo}
              style={{
                border: '1px solid #16a34a',
                borderRadius: 9,
                padding: '0.55rem 0.9rem',
                cursor: 'pointer',
                fontWeight: 700,
                background: '#16a34a',
                color: '#fff',
              }}
            >
              🔁 Refazer
            </button>
            <button
              onClick={onClose}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 9,
                padding: '0.55rem 0.9rem',
                cursor: 'pointer',
                fontWeight: 700,
                background: '#fff',
                color: '#334155',
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )
  }
  const cur = quiz.qs[quiz.i]
  if (!cur) return null
  const remaining =
    quiz.timerOn && !quiz.revealed ? Math.max(0, Math.ceil((quiz.endsMs - Date.now()) / 1000)) : 0
  const opts =
    cur.choices && cur.choices.length
      ? seededShuffle([...cur.choices.slice(0, 5), cur.a], cur.id)
      : null
  const imgSrc = cur.image
    ? pb.files.getURL({ collectionId: 'pbc_709748442', id: cur.id }, cur.image)
    : cur.diagram_svg
      ? /^https?:\/\//i.test(cur.diagram_svg)
        ? cur.diagram_svg
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cur.diagram_svg)}`
      : ''
  return (
    <div onClick={onClose} style={quizOverlay(80)}>
      <div onClick={(e) => e.stopPropagation()} style={quizPanel}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <strong style={{ color: '#14532d', fontSize: '.95rem' }}>
            Questão {quiz.i + 1}/{quiz.qs.length}
          </strong>
          <span style={{ color: '#64748b', fontSize: '.8rem' }}>
            ✅ {quiz.score} acertos · {cur.deckTitle}
          </span>
        </div>
        {quiz.timerOn && !quiz.revealed && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(remaining * 100) / QUIZ_SECONDS}%`,
                  height: '100%',
                  background: remaining <= 5 ? '#dc2626' : remaining <= 10 ? '#d97706' : '#16a34a',
                  borderRadius: 4,
                  transition: 'width .4s linear',
                }}
              />
            </div>
            <div style={{ color: '#64748b', fontSize: '.74rem', marginTop: 3, textAlign: 'right' }}>
              ⏱️ {remaining}s
            </div>
          </div>
        )}
        <div
          className="mr-quiz-question"
          dangerouslySetInnerHTML={{ __html: renderClozeHtml(cur.q, quiz.revealed) }}
          style={{ fontSize: '1.02rem', color: '#1e293b', lineHeight: 1.55, marginBottom: 12 }}
        />
        {imgSrc && (
          <img
            src={imgSrc}
            alt={cur.diagram_title || 'Imagem da questão'}
            style={{
              maxWidth: '100%',
              maxHeight: 260,
              display: 'block',
              margin: '0 auto 12px',
              objectFit: 'contain',
            }}
          />
        )}
        {opts ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {opts.map((opt) => {
              const isCorrect = opt === cur.a
              const isPicked = opt === quiz.picked
              return (
                <button
                  key={opt}
                  disabled={quiz.revealed}
                  onClick={() => onPick(opt)}
                  style={{
                    textAlign: 'left',
                    border: `1.5px solid ${quiz.revealed ? (isCorrect ? '#16a34a' : isPicked ? '#dc2626' : '#e2e8f0') : '#cbd5e1'}`,
                    background: quiz.revealed
                      ? isCorrect
                        ? '#f0fdf4'
                        : isPicked
                          ? '#fef2f2'
                          : '#fff'
                      : '#fff',
                    borderRadius: 10,
                    padding: '0.6rem 0.9rem',
                    cursor: quiz.revealed ? 'default' : 'pointer',
                    font: '500 .9rem Inter, system-ui, sans-serif',
                    color: '#1e293b',
                  }}
                >
                  {quiz.revealed ? (isCorrect ? '✅ ' : isPicked ? '❌ ' : '• ') : ''}
                  {opt}
                </button>
              )
            })}
          </div>
        ) : quiz.revealed ? (
          <div
            style={{
              border: '1px solid #bbf7d0',
              background: '#f0fdf4',
              borderRadius: 10,
              padding: '0.7rem 0.9rem',
            }}
          >
            <strong
              style={{
                display: 'block',
                color: '#15803d',
                fontSize: '.76rem',
                letterSpacing: '.1em',
                marginBottom: 6,
              }}
            >
              GABARITO
            </strong>
            <div style={{ color: '#1e293b', lineHeight: 1.55 }}>{cur.a}</div>
          </div>
        ) : (
          <button
            onClick={onReveal}
            style={{
              width: '100%',
              border: '1.5px dashed #cbd5e1',
              borderRadius: 10,
              padding: '0.7rem',
              background: '#fff',
              color: '#64748b',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            👀 Revelar resposta (conta como erro)
          </button>
        )}
        {quiz.revealed && (
          <button
            onClick={onNext}
            style={{
              width: '100%',
              marginTop: 12,
              border: 'none',
              borderRadius: 10,
              padding: '0.75rem',
              background: '#16a34a',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {quiz.i + 1 >= quiz.qs.length ? '🏁 Ver resultado' : 'Próxima →'}
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: 8,
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '.78rem',
            cursor: 'pointer',
          }}
        >
          ✕ Abandonar quiz (sem registrar nada)
        </button>
      </div>
    </div>
  )
}

// ===== 📈 Dashboard FSRS (heatmap, carga futura, acerto por pasta) =====
function FsrDashboardModal({
  decks,
  cards,
  reviews,
  onClose,
}: {
  decks: Deck[]
  cards: Card[]
  reviews: Review[]
  onClose: () => void
}) {
  const dayKeyOf = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  // Heatmap: últimos 119 dias (17 semanas)
  const counts = new Map<string, number>()
  for (const r of reviews) {
    const ms = parsePbDate(r.reviewed_at)
    if (ms) counts.set(dayKeyOf(ms), (counts.get(dayKeyOf(ms)) || 0) + 1)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks: { key: string; count: number; date: Date }[][] = []
  const start = new Date(today)
  start.setDate(start.getDate() - 118)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // começa na segunda
  for (let w = 0; w < 17; w++) {
    const col: { key: string; count: number; date: Date }[] = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setDate(start.getDate() + w * 7 + d)
      const key = dayKeyOf(day)
      col.push({ key, count: counts.get(key) || 0, date: day })
    }
    weeks.push(col)
  }
  const heatColor = (n: number) =>
    n === 0 ? '#eef2f0' : n <= 5 ? '#bbf7d0' : n <= 15 ? '#4ade80' : n <= 30 ? '#16a34a' : '#14532d'
  // Carga futura: vencidas + próximas janelas
  const now = Date.now()
  let overdue = 0
  let d7 = 0
  let d14 = 0
  let d30 = 0
  for (const c of cards) {
    if (c.suspended) continue
    const cs = cardStateFromReviews(reviews.filter((r) => (r.card_id || r.card_ref || r.card) === c.id))
    if (cs.state === 'new') continue
    const due = cs.dueMs || 0
    if (due <= now) overdue++
    else if (due <= now + 7 * 86400000) d7++
    else if (due <= now + 14 * 86400000) d14++
    else if (due <= now + 30 * 86400000) d30++
  }
  // Acerto por pasta (raiz + subpastas)
  const rootDecks = decks.filter((d) => !d.parent).sort((a, b) => compareDecks(a, b))
  const perDeck = rootDecks
    .map((deck) => {
      const ids = new Set([deck.id, ...decks.filter((d) => d.parent === deck.id).map((d) => d.id)])
      const deckCards = cards.filter((c) => ids.has(c.deck))
      const cardIds = new Set(deckCards.map((c) => c.id))
      const rs = reviews.filter((r) => cardIds.has(r.card_id || r.card_ref || r.card))
      const correct = rs.filter((r) => r.rating === 'good' || r.rating === 'easy').length
      return {
        title: deck.title,
        total: rs.length,
        correct,
        pct: rs.length ? Math.round((correct * 100) / rs.length) : null,
      }
    })
    .filter((d) => d.total > 0)
  const totalReviews = reviews.length
  const totalCorrect = reviews.filter((r) => r.rating === 'good' || r.rating === 'easy').length
  const overall = totalReviews ? Math.round((totalCorrect * 100) / totalReviews) : 0
  const maxLoad = Math.max(overdue, d7, d14, d30, 1)
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(15,23,42,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 18,
          padding: 22,
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 50px rgba(15,23,42,.25)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}>
          📈 Dashboard FSRS
        </h3>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '.83rem' }}>
          {totalReviews} revisões registradas · acerto geral {overall}%
        </p>
        <div
          style={{
            fontSize: '.72rem',
            fontWeight: 900,
            color: '#15803d',
            letterSpacing: '.08em',
            marginBottom: 8,
          }}
        >
          HEATMAP DE ESTUDO (17 SEMANAS)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(17,1fr)',
            gap: 3,
            marginBottom: 6,
          }}
        >
          {weeks.map((col, i) => (
            <div key={i} style={{ display: 'grid', gap: 3 }}>
              {col.map((cell) => (
                <div
                  key={cell.key}
                  title={`${cell.date.toLocaleDateString('pt-BR')}: ${cell.count} revisão(ões)`}
                  style={{
                    width: '100%',
                    paddingBottom: '100%',
                    borderRadius: 3,
                    background: heatColor(cell.count),
                    position: 'relative',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            color: '#64748b',
            fontSize: '.7rem',
            marginBottom: 16,
          }}
        >
          <span>menos</span>
          {['#eef2f0', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'].map((c) => (
            <span
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: c,
                display: 'inline-block',
              }}
            />
          ))}
          <span>mais</span>
        </div>
        <div
          style={{
            fontSize: '.72rem',
            fontWeight: 900,
            color: '#15803d',
            letterSpacing: '.08em',
            marginBottom: 8,
          }}
        >
          CARGA DE REVISÕES
        </div>
        {[
          { label: 'Vencidas agora', value: overdue, color: '#dc2626' },
          { label: 'Próximos 7 dias', value: d7, color: '#d97706' },
          { label: '8–14 dias', value: d14, color: '#16a34a' },
          { label: '15–30 dias', value: d30, color: '#2563eb' },
        ].map((row) => (
          <div
            key={row.label}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
          >
            <span style={{ width: 110, color: '#475569', fontSize: '.78rem', fontWeight: 700 }}>
              {row.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 14,
                background: '#f1f5f9',
                borderRadius: 7,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round((row.value * 100) / maxLoad)}%`,
                  height: '100%',
                  background: row.color,
                  borderRadius: 7,
                }}
              />
            </div>
            <span style={{ width: 30, color: '#64748b', fontSize: '.78rem', textAlign: 'right' }}>
              {row.value}
            </span>
          </div>
        ))}
        <div
          style={{
            fontSize: '.72rem',
            fontWeight: 900,
            color: '#15803d',
            letterSpacing: '.08em',
            margin: '16px 0 8px',
          }}
        >
          ACERTO POR PASTA
        </div>
        {perDeck.length === 0 ? (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '.82rem' }}>
            Nenhuma revisão registrada ainda — estude cartas para ver o acerto por pasta.
          </p>
        ) : (
          perDeck.map((d) => (
            <div
              key={d.title}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
            >
              <span
                style={{
                  flex: '0 0 150px',
                  color: '#475569',
                  fontSize: '.76rem',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={d.title}
              >
                {d.title}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 14,
                  background: '#f1f5f9',
                  borderRadius: 7,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${d.pct || 0}%`,
                    height: '100%',
                    background:
                      (d.pct || 0) >= 80 ? '#16a34a' : (d.pct || 0) >= 60 ? '#d97706' : '#dc2626',
                    borderRadius: 7,
                  }}
                />
              </div>
              <span style={{ width: 64, color: '#64748b', fontSize: '.74rem', textAlign: 'right' }}>
                {d.pct}% · {d.total}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ==================== App ====================
export default function Index() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading')
  const [user, setUser] = useState<any>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [route, setRoute] = useState<{
    view: 'home' | 'study' | 'library'
    deckId?: string
    folderKind?: 'tutoria' | 'prova' | 'custom'
    sessionTitle?: string
  }>({ view: 'home' })
  const [flipped, setFlipped] = useState(false)
  const [studyMode, setStudyMode] = useState<'flip' | 'write' | 'reverse'>('flip')
  const [typedAnswer, setTypedAnswer] = useState('')
  const [writeFeedback, setWriteFeedback] = useState<null | { ok: boolean; similarity: number }>(
    null,
  )
  const [mcPicked, setMcPicked] = useState<string | null>(null)
  const [queue, setQueue] = useState<Card[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [studySession, setStudySession] = useState({
    startMs: Date.now(),
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  })
  const [msg, setMsg] = useState('')
  const [undoInfo, setUndoInfo] = useState<{
    deckIds: string[]
    restoreKind: 'tutoria' | 'prova' | 'custom'
    blockId?: string
  } | null>(null)
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [authErr, setAuthErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [retentionTick, setRetentionTick] = useState(0)
  const [sessionBuilderOpen, setSessionBuilderOpen] = useState(false)
  const [cardStatsOpen, setCardStatsOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizKind, setQuizKind] = useState('all')
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [deckModal, setDeckModal] = useState<{
    type: 'card' | 'folder' | 'rename' | 'moveDeck' | 'moveSection'
    deckId: string
  } | null>(null)
  const [deckMoveTarget, setDeckMoveTarget] = useState('')
  const [deckMoveExpanded, setDeckMoveExpanded] = useState<Record<string, boolean>>({})
  const [deckQ, setDeckQ] = useState('')
  const [deckA, setDeckA] = useState('')
  const [deckClinical, setDeckClinical] = useState(false)
  const [deckTitle, setDeckTitle] = useState('')
  const [deckKind, setDeckKind] = useState<'tutoria' | 'prova' | 'custom'>('custom')
  const [deckMode, setDeckMode] = useState<'study' | 'organizer'>('study')
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false)
  const [imageOcclusionOpen, setImageOcclusionOpen] = useState(false)
  const [examPlanTarget, setExamPlanTarget] = useState<{ id: string; title: string } | null>(null)
  const [cardReportTarget, setCardReportTarget] = useState<Card | null>(null)
  const [masterReportsOpen, setMasterReportsOpen] = useState(false)
  const [masterAnalyticsOpen, setMasterAnalyticsOpen] = useState(false)
  const [currentCardNote, setCurrentCardNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [cramModalOpen, setCramModalOpen] = useState(false)
  const [cramInitialDeckId, setCramInitialDeckId] = useState<string | undefined>(undefined)
  const [sessionProtectFsrs, setSessionProtectFsrs] = useState(false)
  const [ankiImportOpen, setAnkiImportOpen] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechRate, setSpeechRate] = useState(1.0)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null)

  useEffect(() => {
    return speechService.subscribe(setIsSpeaking)
  }, [])

  // Para a voz imediatamente ao trocar de cartão ou de rota
  useEffect(() => {
    speechService.stop()
  }, [qIdx, route.view, flipped])

  const retention = useMemo(() => getRetention(), [route, retentionTick])
  const schedulerSettings = useMemo(() => getSchedulerSettings(user?.id), [user?.id, retentionTick])

  const ensureSeed = async () => {
    if (!pb.authStore.isValid) return
    try {
      await applyInitialSeed()
    } catch {
      /* safe fallback */
    }
  }

let catalogMemoryCache: { decks: any[]; cards: any[] } | null = null

async function getBaseCatalog() {
  if (catalogMemoryCache) return catalogMemoryCache
  try {
    const res = await fetch('/catalog.json')
    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.decks) && Array.isArray(data.cards)) {
        catalogMemoryCache = { decks: data.decks, cards: data.cards }
        return catalogMemoryCache
      }
    }
  } catch (err) {
    console.warn('Falha ao obter catalog.json:', err)
  }
  return null
}

  const loadData = useCallback(async () => {
    if (!pb.authStore.isValid) return

    // 1. Carregamento instantâneo via Vercel Edge CDN (<50ms)
    let baseData: { decks: any[]; cards: any[] } | null = null
    try {
      baseData = await getBaseCatalog()
      if (baseData) {
        setDecks((prev) => (prev.length === 0 ? baseData!.decks : prev))
        setCards((prev) => (prev.length === 0 ? baseData!.cards : prev))
      }
    } catch {
      /* fallback */
    }

    // 2. Sincronização com Supabase (avaliações, novos decks e cards criados pelo usuário)
    try {
      const [d, c, r] = await Promise.all([
        pb.collection('mr_decks').getFullList({ sort: 'order' }),
        pb.collection('mr_cards').getFullList({ sort: '-created' }),
        pb.collection('mr_reviews').getFullList({ sort: 'reviewed_at' }),
      ])
      const supaRawDecks = (d as any[]) || []
      const supaRawCards = (c as any[]) || []

      const supaDeletedDeckIds = new Set(supaRawDecks.filter((row) => row.deleted).map((row) => row.id))
      const supaDeletedCardIds = new Set(supaRawCards.filter((row) => row.deleted).map((row) => row.id))

      const supaActiveDecks = supaRawDecks
        .filter((row) => !row.deleted)
        .map((row) => ({ ...row, description: row.description || '' }))
      const supaActiveCards = supaRawCards.filter((row) => !row.deleted)

      // Merge unificado: preserva catálogo base + incorpora novidades do Supabase sem zerar nada
      setDecks((prev) => {
        const map = new Map<string, any>()
        if (baseData?.decks) {
          for (const item of baseData.decks) map.set(item.id, item)
        }
        for (const item of prev) map.set(item.id, item)
        for (const item of supaActiveDecks) map.set(item.id, item)
        for (const delId of supaDeletedDeckIds) map.delete(delId)
        return Array.from(map.values())
      })

      setCards((prev) => {
        const map = new Map<string, any>()
        if (baseData?.cards) {
          for (const item of baseData.cards) map.set(item.id, item)
        }
        for (const item of prev) map.set(item.id, item)
        for (const item of supaActiveCards) map.set(item.id, item)
        for (const delId of supaDeletedCardIds) map.delete(delId)
        return Array.from(map.values())
      })

      setReviews(r as any[])
    } catch (e: any) {
      console.warn('Erro ao carregar dados do Supabase:', e)
    }
  }, [])

  const reviewsByCard = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of reviews) {
      const key = (r.card_id || r.card_ref || r.card) as string
      if (!key) continue
      const arr = map.get(key)
      if (arr) arr.push(r)
      else map.set(key, [r])
    }
    return map
  }, [reviews])

  const reviewsForCard = useCallback(
    (card: Card, cardId = card.id.replace(/::rev$/, '')) => reviewsByCard.get(cardId) || [],
    [reviewsByCard],
  )

  useEffect(() => {
    if (route.view === 'study' && queue[qIdx]) {
      const realId = queue[qIdx].id.replace(/::rev$/, '')
      fetchCardNote(realId).then((n) => setCurrentCardNote(n || ''))
    }
  }, [route.view, qIdx, queue])

  const stateKey = (card: Card) => card.id.replace(/::rev$/, '')

  const allCards = cards
  const totalCards = allCards.length

  const { dueCount, masteredCount, streakDays } = useMemo(() => {
    let due = 0
    let mastered = 0
    const now = Date.now()

    for (const c of allCards) {
      const cs = cardStateFromReviews(reviewsForCard(c))
      if (cs.state !== 'new' && (cs.dueMs || 0) <= now) {
        due += 1
      }
      if ((cs.s || 0) >= 21) {
        mastered += 1
      }
    }

    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    const reviewDays = new Set(
      reviews
        .map((r) => {
          const raw = typeof r.reviewed_at === 'string' ? r.reviewed_at : ''
          if (!raw) return ''
          const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
          return Number.isNaN(date.getTime()) ? '' : dayKey(date)
        })
        .filter(Boolean),
    )
    const streakCursor = new Date()
    if (!reviewDays.has(dayKey(streakCursor))) streakCursor.setDate(streakCursor.getDate() - 1)
    let streak = 0
    while (reviewDays.has(dayKey(streakCursor)) && streak < 366) {
      streak += 1
      streakCursor.setDate(streakCursor.getDate() - 1)
    }

    return {
      dueCount: due,
      masteredCount: mastered,
      streakDays: streak,
    }
  }, [allCards, reviews, reviewsForCard])

  const reviewTodayCount = dueCount
  const masteredPercent = totalCards ? Math.round((masteredCount * 100) / totalCards) : 0

  // Cálculo O(N) memoizado de contagem de cartões por subárvore de pastas (elimina loops aninhados)
  const cardsInSubtree = useMemo(() => {
    const directCounts = new Map<string, number>()
    for (const c of cards) {
      if (!c.deleted) {
        directCounts.set(c.deck, (directCounts.get(c.deck) || 0) + 1)
      }
    }
    const childrenMap = new Map<string, string[]>()
    for (const d of decks) {
      if (d.parent) {
        const arr = childrenMap.get(d.parent)
        if (arr) arr.push(d.id)
        else childrenMap.set(d.parent, [d.id])
      }
    }
    const memo = new Map<string, number>()
    const countDeck = (id: string, visited = new Set<string>()): number => {
      if (visited.has(id)) return 0
      visited.add(id)
      if (memo.has(id)) return memo.get(id)!
      let sum = directCounts.get(id) || 0
      const kids = childrenMap.get(id)
      if (kids) {
        for (const k of kids) sum += countDeck(k, visited)
      }
      memo.set(id, sum)
      return sum
    }
    for (const d of decks) countDeck(d.id)
    return (id: string) => memo.get(id) || 0
  }, [decks, cards])

  // Boot: restaura sessão e inicializa biblioteca vazia; seed é idempotente por seed_key.
  useEffect(() => {
    let active = true
    const boot = async () => {
      try {
        // Verifica se já existe sessão ativa salva no navegador (Supabase Auth em localStorage)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (active) setAuth('out')
          return
        }

        await pb.collection('users').authRefresh()
        if (pb.authStore.record && pb.authStore.record.approved === false) {
          pb.authStore.clear()
          throw new Error('Sua conta ainda aguarda aprovação do administrador.')
        }

        if (active) {
          setUser(pb.authStore.record)
          setAuth('in')
        }

        ensureSeed().catch(() => {})
        await loadData()
      } catch (e: any) {
        if (!active) return
        pb.authStore.clear()
        setAuth('out')
      }
    }
    boot()
    return () => {
      active = false
    }
  }, [loadData])

  // Login / signup
  const doAuth = async () => {
    setAuthErr('')
    setBusy(true)
    try {
      if (loginMode === 'signup') {
        await pb
          .collection('users')
          .create({ email, password: pass, passwordConfirm: pass, name: name || 'Estudante' })
      }
      await pb.collection('users').authWithPassword(email, pass)
      
      if (pb.authStore.record && pb.authStore.record.approved === false) {
        pb.authStore.clear()
        throw new Error('Conta criada! Aguarde a aprovação do administrador para entrar.')
      }
      
      await ensureSeed()
      await loadData()
      setUser(pb.authStore.record)
      setAuth('in')
    } catch (e: any) {
      if (pb.authStore.isValid) {
        setUser(pb.authStore.record)
        setAuth('in')
        await loadData()
        setMsg(
          e?.response?.data?.message || e?.message || 'Não foi possível iniciar sua biblioteca.',
        )
      } else {
        setAuthErr(e?.message || 'Falha na autenticação')
      }
    } finally {
      setBusy(false)
    }
  }
  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setAuth('out')
    setDecks([])
    setCards([])
    setReviews([])
    setRoute({ view: 'home' })
  }

  // Fila FSRS: vencidas → novas → futuras. Cartas com "reverse" geram uma variante invertida (verso→frente) na fila.
  const startStudy = (
    candidateCards: Card[],
    deckId?: string,
    sessionTitle?: string,
    options?: { protectFsrs?: boolean; preserveOrder?: boolean },
  ) => {
    setSessionProtectFsrs(!!options?.protectFsrs)
    speechService.stop()
    const withVariants: Card[] = []
    for (const c of candidateCards) {
      if (c.suspended || c.deleted) continue
      withVariants.push(c)
      if (c.reverse && c.q && c.a && !c.occlusion) withVariants.push({ ...c, id: c.id + '::rev', __reverse: true })
    }
    const studyCards = withVariants
    let sorted = studyCards
    if (!options?.preserveOrder) {
      const states = new Map(
        studyCards.map((c) => [stateKey(c), cardStateFromReviews(reviewsForCard(c))]),
      )
      const currentTime = Date.now()
      const rank = (cs: CardState) =>
        cs.state === 'new' ? 2 : (cs.dueMs || 0) <= currentTime ? 0 : 1
      sorted = [...studyCards].sort((a, b) => {
        const ra = rank(states.get(stateKey(a))!),
          rb = rank(states.get(stateKey(b))!)
        if (ra !== rb) return ra - rb
        if (ra === 0)
          return (states.get(stateKey(a))!.dueMs || 0) - (states.get(stateKey(b))!.dueMs || 0)
        return 0
      })
    }
    setQueue(sorted)
    setQIdx(0)
    setFlipped(false)
    setTypedAnswer('')
    setWriteFeedback(null)
    setMcPicked(null)
    setStudySession({ startMs: Date.now(), again: 0, hard: 0, good: 0, easy: 0 })
    setRoute({ view: 'study', deckId, sessionTitle })
  }

  // Normaliza texto para comparação no modo escrita (sem acentos/pontuação/caixa)
  const normalizeAnswer = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const answerSimilarity = (typed: string, expected: string): number => {
    const a = normalizeAnswer(typed)
    const b = normalizeAnswer(expected)
    if (!a || !b) return 0
    if (a === b) return 1
    const wa = new Set(a.split(' '))
    const wb = new Set(b.split(' '))
    let inter = 0
    for (const w of wa) if (wb.has(w)) inter++
    return (2 * inter) / (wa.size + wb.size)
  }
  const checkWritten = () => {
    const card = queue[qIdx]
    if (!card) return
    const expected = studyMode === 'reverse' ? card.q : card.a
    const sim = answerSimilarity(typedAnswer, expected)
    setWriteFeedback({ ok: sim >= 0.7, similarity: sim })
    setFlipped(true)
  }
  const skipWrite = () => {
    setWriteFeedback(null)
    setFlipped(true)
  }

  // ===== ⏱️ Quiz cronometrado =====
  const startQuiz = (count: number, timerOn: boolean, kind: string) => {
    const pools: Record<string, string[]> = { all: [], tutoria: [], prova: [], custom: [] }
    for (const d of decks) {
      if (d.deleted) continue
      if (pools[d.kind]) pools[d.kind].push(d.id)
    }
    const ids = kind === 'all' ? Object.values(pools).flat() : pools[kind]
    const pool = cards.filter((c) => !c.deleted && !c.suspended && ids.includes(c.deck))
    if (pool.length < 3) {
      setMsg('Poucas cartas para o quiz — precisa de pelo menos 3.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    const shuffled = [...pool]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(count, pool.length))
    const qs: QuizQ[] = shuffled.map((c) => {
      const deck = decks.find((d) => d.id === c.deck)
      return {
        id: c.id,
        deckTitle: deck?.title || 'Carta',
        q: c.q,
        a: c.a,
        choices: Array.isArray(c.choices) && c.choices.length ? c.choices : null,
        image: c.image,
        diagram_svg: c.diagram_svg,
        diagram_title: c.diagram_title,
      }
    })
    setQuizOpen(false)
    setQuiz({
      qs,
      i: 0,
      picked: null,
      score: 0,
      revealed: false,
      timerOn,
      endsMs: Date.now() + QUIZ_SECONDS * 1000,
      done: false,
      startedMs: Date.now(),
      kind,
      wrong: [],
    })
  }
  const quizPick = (opt: string) => {
    setQuiz((q) => {
      if (!q || q.revealed) return q
      const cur = q.qs[q.i]
      const correct = opt === cur.a
      return {
        ...q,
        picked: opt,
        score: correct ? q.score + 1 : q.score,
        revealed: true,
        wrong: correct ? q.wrong : [...q.wrong, { q: cur, picked: opt }],
      }
    })
  }
  const quizReveal = () => {
    setQuiz((q) => {
      if (!q || q.revealed) return q
      const cur = q.qs[q.i]
      return { ...q, picked: null, revealed: true, wrong: [...q.wrong, { q: cur, picked: null }] }
    })
  }
  const quizNext = () => {
    setQuiz((q) => {
      if (!q) return q
      if (q.i + 1 >= q.qs.length) return { ...q, done: true }
      return {
        ...q,
        i: q.i + 1,
        picked: null,
        revealed: false,
        endsMs: Date.now() + QUIZ_SECONDS * 1000,
      }
    })
  }
  const quizRedo = () =>
    startQuiz(quiz?.qs.length || 10, quiz?.timerOn !== false, quiz?.kind || 'all')
  // Timer expira → revela como erro
  useEffect(() => {
    if (!quiz || quiz.done || quiz.revealed || !quiz.timerOn) return
    const t = setTimeout(
      () => {
        setQuiz((q) => {
          if (!q || q.revealed || q.done) return q
          const cur = q.qs[q.i]
          return {
            ...q,
            picked: null,
            revealed: true,
            wrong: [...q.wrong, { q: cur, picked: null }],
          }
        })
      },
      Math.max(0, quiz.endsMs - Date.now()),
    )
    return () => clearTimeout(t)
  }, [quiz?.i, quiz?.revealed, quiz?.endsMs, quiz?.timerOn, quiz?.done])

  const openDeck = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    // Pasta organizadora: abre a view com as pastas dentro (como a Tutoria).
    // Pasta de estudo: inicia a sessão de flashcards direto.
    const hasChildren = decks.some((d) => d.parent === deckId && !d.deleted)
    if (deck && ((deck as any).mode === 'organizer' || hasChildren)) {
      setRoute({ view: 'home', folderKind: 'custom', deckId })
      return
    }
    startStudy(
      cards.filter((c) => c.deck === deckId),
      deckId,
      deck?.title,
    )
  }
  const openFolderGroup = (folderKind: 'tutoria' | 'prova' | 'custom') =>
    setRoute({ view: 'home', folderKind })

  const startStudyNow = () => {
    const allCards = cards
    const dueOrNew = allCards.filter((c) => {
      if (c.suspended || c.deleted) return false
      const cs = cardStateFromReviews(reviewsForCard(c))
      return cs.state === 'new' || (cs.dueMs || 0) <= Date.now()
    })
    startStudy(
      dueOrNew.length ? dueOrNew : allCards.filter((c) => !c.suspended && !c.deleted),
      undefined,
      'Todas as cartas',
    )
  }
  const startClinicalMode = () => {
    const clinicalCards = cards.filter(
      (c) => !c.suspended && !c.deleted && (c.clinical || /caso clínico|caso clinico/i.test(c.q)),
    )
    if (!clinicalCards.length) {
      setMsg('Ainda não há cartões de caso clínico nesta biblioteca.')
      window.setTimeout(() => setMsg(''), 3500)
      return
    }
    startStudy(clinicalCards, undefined, 'Modo Caso Clínico')
  }
  const openNewFolder = (kind: 'tutoria' | 'prova' | 'custom' = 'custom') => {
    setDeckTitle('')
    setDeckKind(kind)
    setDeckMode('study')
    setDeckModal({ type: 'folder', deckId: '' })
  }
  const openNewFrontlineFolder = () => {
    setDeckTitle('')
    setDeckKind('custom')
    setDeckMode('study')
    setDeckModal({ type: 'folder', deckId: '@frontline' })
  }
  const openDeckCardModal = (deckId: string) => {
    setDeckQ('')
    setDeckA('')
    setDeckClinical(false)
    setDeckModal({ type: 'card', deckId })
  }
  const openDeckSubfolderModal = (deckId: string) => {
    setDeckTitle('')
    const parent = decks.find((d) => d.id === deckId)
    setDeckKind((parent?.kind as 'tutoria' | 'prova' | 'custom') || 'custom')
    setDeckMode('study')
    setDeckModal({ type: 'folder', deckId })
  }
  const openDeckMoveModal = (deckId: string) => {
    setDeckMoveTarget('')
    setDeckMoveExpanded({})
    setDeckModal({ type: 'moveDeck', deckId })
  }
  const openSectionMoveModal = (kind: 'tutoria' | 'prova' | 'custom') => {
    setDeckMoveTarget('')
    setDeckMoveExpanded({})
    setDeckTitle('')
    setDeckModal({ type: 'moveSection', deckId: kind })
  }
  const openDeckRenameModal = (deckId: string) => {
    setDeckTitle(decks.find((d) => d.id === deckId)?.title || '')
    setDeckModal({ type: 'rename', deckId })
  }
  const confirmDeckDelete = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    if (!deck) return
    if (
      !window.confirm(
        `Excluir “${deck.title}”? As cartas desta pasta também saem da sua biblioteca.`,
      )
    )
    // Otimista: remove da tela imediatamente
    setDecks((prev) => prev.filter((d) => d.id !== deckId && d.parent !== deckId))
    setCards((prev) => prev.filter((c) => c.deck !== deckId))
    deleteDeck(deckId)
      .then(async () => {
        const parentId = deck.parent || ''
        await loadData()
        // Se a pasta excluída estava aberta, sai dela: volta à organizadora pai,
        // ou ao portal Minhas Pastas quando era uma pasta de nível inicial.
        if (route.deckId === deckId) {
          if (parentId) {
            setRoute({ view: 'home', folderKind: 'custom', deckId: parentId })
          } else {
            setRoute({
              view: 'home',
              folderKind: deck.kind === 'tutoria' || deck.kind === 'prova' ? deck.kind : 'custom',
            })
          }
        }
        setMsg(`Pasta “${deck.title}” excluída.`)
        window.setTimeout(() => setMsg(''), 3500)
      })
      .catch((e: any) => setMsg('Erro ao excluir: ' + (e?.message || e)))
  }
  const confirmDeckReset = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    if (!deck) return
    if (
      !window.confirm(
        `Resetar o progresso de “${deck.title}”? As cartas voltam a ser novas (não são apagadas).`,
      )
    )
      return
    resetDeck(deckId)
      .then(() => {
        loadData()
        setMsg('Progresso resetado — cartas voltaram a ser novas.')
        setTimeout(() => setMsg(''), 2500)
      })
      .catch((e: any) => setMsg('Erro ao resetar: ' + (e?.message || e)))
  }
  const submitDeckQuick = async () => {
    if (!deckModal) return
    setBusy(true)
    try {
      if (deckModal.type === 'card') {
        if (!deckQ.trim() || !deckA.trim()) throw new Error('Preencha frente e verso.')
        await createCard(deckModal.deckId, {
          q: deckQ,
          a: deckA,
          group: '',
          ref: '',
          clinical: deckClinical,
        })
      } else if (deckModal.type === 'folder') {
        if (!deckTitle.trim()) throw new Error('Informe o nome da pasta.')
        await createDeck(
          deckTitle,
          deckKind,
          deckModal.deckId === '@frontline' ? undefined : deckModal.deckId || undefined,
          deckMode,
          deckModal.deckId === '@frontline',
        )
      } else if (deckModal.type === 'moveDeck') {
        if (!deckMoveTarget) throw new Error('Escolha a pasta de destino ou o nível inicial.')
        const goingRoot = deckMoveTarget.startsWith('@root:')
        const rootKind = goingRoot ? deckMoveTarget.slice(6) : ''
        await moveDeck(
          deckModal.deckId,
          goingRoot ? '' : deckMoveTarget,
          goingRoot ? (rootKind as 'tutoria' | 'prova' | 'custom') : undefined,
        )
      } else if (deckModal.type === 'moveSection') {
        if (!deckMoveTarget) throw new Error('Escolha o destino da seção.')
        const goingRoot = deckMoveTarget.startsWith('@root:')
        const rootKind = goingRoot ? deckMoveTarget.slice(6) : ''
        const fromKind = deckModal.deckId as 'tutoria' | 'prova' | 'custom'
        // snapshot para o desfazer: ids das raízes atuais da seção
        const snapshotIds = decks.filter((d) => d.kind === fromKind && !d.parent).map((d) => d.id)
        const res: any = await moveDeckSection(
          fromKind,
          goingRoot ? '' : deckMoveTarget,
          goingRoot ? (rootKind as 'tutoria' | 'prova' | 'custom') : undefined,
        )
        setUndoInfo({
          deckIds: snapshotIds,
          restoreKind: fromKind,
          blockId: res?.blockId || '',
        })
      } else {
        if (!deckTitle.trim()) throw new Error('Informe o novo nome.')
        await renameDeck(deckModal.deckId, deckTitle)
      }
      await loadData()
      const sectionName =
        deckKind === 'custom'
          ? 'Minhas Pastas (card 📁 na home)'
          : deckKind === 'tutoria'
            ? 'Tutoria'
            : 'Prova de Módulo'
      const frontline = deckModal.deckId === '@frontline'
      const createdIn =
        deckModal.type === 'folder' && !frontline
          ? ` — seção ${sectionName}`
          : deckModal.type === 'folder'
            ? ' — na tela inicial 🎯'
            : deckModal.deckId
              ? ` — dentro de "${decks.find((d) => d.id === deckModal.deckId)?.title || ''}"`
              : ''
      setDeckModal(null)
      setMsg(
        deckModal.type === 'card'
          ? 'Carta criada.'
          : deckModal.type === 'folder'
            ? `Pasta criada${createdIn}.`
            : deckModal.type === 'moveDeck'
              ? 'Pasta movida.'
              : deckModal.type === 'moveSection'
                ? 'Seção movida.'
                : 'Pasta renomeada.',
      )
      setTimeout(() => setMsg(''), 4000)
      if (deckModal.type === 'moveSection') {
        window.setTimeout(() => setUndoInfo(null), 8000)
      }
    } catch (e: any) {
      setMsg(e?.message || 'Não foi possível salvar.')
      setTimeout(() => setMsg(''), 3000)
    } finally {
      setBusy(false)
    }
  }

  // Avalia carta: grava review no banco e avança
  const rate = async (quality: Quality) => {
    speechService.stop()
    const card = queue[qIdx]
    if (!card) return
    const realId = card.id.replace(/::rev$/, '')
    const cardReviews = reviewsForCard(card, realId)
    const cs = cardStateFromReviews(cardReviews)
    const pv = previewIntervalsForSettings(cs, retention, schedulerSettings)
    const chosen = pv[quality]

    if (sessionProtectFsrs) {
      setStudySession((session) => ({ ...session, [quality]: session[quality] + 1 }))
      setMsg(`⚡ Treino de véspera: resposta salva (${quality}) com FSRS protegido.`)
      setTimeout(() => setMsg(''), 2200)
      setFlipped(false)
      setMcPicked(null)
      setQIdx((i) => i + 1)
      return
    }
    const now = new Date()
    const dueDate = new Date(now.getTime() + chosen.value * 86400000)
    const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)
    try {
      const reviewInput = {
        card_id: realId,
        card_ref: realId,
        card: realId,
        rating: quality,
        stability: chosen.newS ?? fsrsInitialStability(chosen.g),
        difficulty: chosen.newD ?? fsrsInitialDifficulty(chosen.g),
        retrievability: cs.s
          ? fsrsRetrievability(
              cs.lastReviewMs ? (now.getTime() - cs.lastReviewMs) / 86400000 : 0,
              cs.s,
            )
          : null,
        elapsed_days: cs.lastReviewMs ? (now.getTime() - cs.lastReviewMs) / 86400000 : 0,
        scheduled_days: chosen.value,
        state: chosen.state,
        due: fmt(dueDate),
        reviewed_at: fmt(now),
      }
      const created = await createReview(reviewInput)
      const savedReview = { ...(created as any), ...reviewInput, card_id: realId, card_ref: realId, card: realId }
      setReviews((rs) => [...rs, savedReview])
      setStudySession((session) => ({ ...session, [quality]: session[quality] + 1 }))
      setMsg(`Carta agendada para daqui ${chosen.label}`)
      setTimeout(() => setMsg(''), 2500)
      setFlipped(false)
      setMcPicked(null)
      setQIdx((i) => i + 1)
    } catch (e: any) {
      setMsg('Erro ao salvar revisão: ' + (e?.message || e))
    }
  }

  // ===== Tela: loading =====
  if (auth === 'loading') return <div style={center}>Carregando…</div>

  // ===== Tela: login =====
  if (auth === 'out') {
    return (
      <div style={{ ...center, background: 'linear-gradient(135deg,#f0fdf4,#ffffff)' }}>
        <div style={loginBox}>
          <h1 style={{ color: '#14532d', fontSize: '1.8rem', margin: 0 }}>🩺 MedReview</h1>
          <p style={{ color: '#15803d', margin: '0.3rem 0 1.2rem' }}>
            Revisão interativa de medicina — FSRS-5
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button style={tabBtn(loginMode === 'login')} onClick={() => setLoginMode('login')}>
              Entrar
            </button>
            <button style={tabBtn(loginMode === 'signup')} onClick={() => setLoginMode('signup')}>
              Criar conta
            </button>
          </div>
          {loginMode === 'signup' && (
            <input
              style={input}
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            style={input}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={input}
            type="password"
            placeholder="Senha (mín. 8 caracteres)"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          {authErr && <div style={errBox}>{authErr}</div>}
          <button style={primaryBtn} disabled={busy} onClick={doAuth}>
            {busy ? 'Aguarde…' : loginMode === 'signup' ? 'Criar conta e começar' : 'Entrar'}
          </button>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '1rem' }}>
            Suas cartas e progresso ficam salvos na nuvem — acesse de qualquer dispositivo.
          </p>
        </div>
      </div>
    )
  }

  // ===== Tela: estudo =====
  if (route.view === 'study') {
    const deck = decks.find((d) => d.id === route.deckId)
    const card = queue[qIdx]
    const sessionTitle = route.sessionTitle || deck?.title || 'Biblioteca'
    const categoryTitle =
      route.sessionTitle === 'Modo Caso Clínico'
        ? 'Casos Clínicos'
        : deck?.kind === 'prova'
          ? 'Prova de Módulo'
          : deck?.kind === 'custom'
            ? 'Minhas Pastas'
            : deck
              ? 'Tutoria'
              : 'Biblioteca'
    const returnToFolders = () =>
      setRoute({
        view: 'home',
        folderKind:
          deck?.kind === 'prova'
            ? 'prova'
            : deck?.kind === 'custom'
              ? 'custom'
              : deck
                ? 'tutoria'
                : undefined,
      })
    if (!card)
      return (
        <MedReviewLegacySessionComplete
          title={sessionTitle}
          tally={studySession}
          retention={retention}
          onRestart={() => {
            setStudySession({ startMs: Date.now(), again: 0, hard: 0, good: 0, easy: 0 })
            setQIdx(0)
            setFlipped(false)
          }}
          onExit={returnToFolders}
        />
      )
    const cs = cardStateFromReviews(reviewsForCard(card))
    const pv = previewIntervalsForSettings(cs, retention, schedulerSettings)
    const currentOcclusionData = parseOcclusion(card.occlusion, card.a, card.q)
    return (
      <div className="mr-legacy-study-page">
        <MedReviewLegacyStyles />
        <header className="mr-legacy-header">
          <div className="mr-legacy-study-top">
            <nav className="mr-legacy-breadcrumb">
              <button onClick={() => setRoute({ view: 'home' })}>Início</button>
              <span>/</span>
              <button onClick={returnToFolders}>{categoryTitle}</button>
              <span>/</span>
              <strong>{sessionTitle}</strong>
            </nav>
            <div className="mr-legacy-study-controls">
              <span className="mr-legacy-control">
                {qIdx + 1} / {queue.length}
              </span>
              <button
                className="mr-legacy-control"
                onClick={() => setCardReportTarget(card)}
                title="Reportar erro nesta carta"
                style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}
              >
                ⚠️ Reportar
              </button>
              <button className="mr-legacy-control" onClick={() => setQIdx(queue.length)}>
                ✓ Concluído
              </button>
              <button className="mr-legacy-control exit" onClick={returnToFolders}>
                ✕ Sair da sessão
              </button>
            </div>
          </div>
        </header>
        <main className="mr-legacy-study-main">
          <div className="mr-legacy-mode-row">
            {(
              [
                ['flip', '🔄 Virar'],
                ['write', '✍️ Escrever'],
                ['reverse', '🔁 Invertido'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                className={'mr-legacy-mode-btn' + (studyMode === mode ? ' active' : '')}
                onClick={() => {
                  setStudyMode(mode)
                  setTypedAnswer('')
                  setWriteFeedback(null)
                  setFlipped(false)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mr-legacy-progress">
            <span>
              {cs.state === 'new'
                ? '🆕 Nova'
                : (cs.dueMs || 0) <= Date.now()
                  ? '⏰ Vencida'
                  : '📅 Futura'}{' '}
              · {card.group || 'Revisão médica'}
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setCardStatsOpen(true)
                }}
                style={{
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: '4px 9px',
                  background: '#fff',
                  color: '#15803d',
                  font: '700 .74rem Inter, system-ui, sans-serif',
                  cursor: 'pointer',
                }}
                title="Estatísticas deste cartão"
              >
                📊 Stats
              </button>
              <span>
                {schedulerSettings.mode === 'manual'
                  ? '✍️ Agendamento manual'
                  : `Retenção alvo: ${Math.round(retention * 100)}%`}
              </span>
            </span>
          </div>
          <article
            className="mr-legacy-study-card"
            onClick={(e) => {
              const target = e.target as HTMLElement
              if (target.tagName === 'IMG') {
                e.stopPropagation()
                const img = target as HTMLImageElement
                setLightboxImage({ src: img.src, title: img.alt || 'Visualização Anatômica em Alta Resolução' })
                return
              }
              setFlipped((f) => !f)
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span className="mr-legacy-badge">
                  {card.__reverse
                    ? '🔁 Cartão reverso (verso → frente)'
                    : currentOcclusionData
                      ? '🎯 Oclusão de Imagem (Anatomia)'
                      : isCloze(card.q)
                        ? `🧩 Cartão Cloze (${clozeCount(card.q)} lacuna${clozeCount(card.q) > 1 ? 's' : ''})`
                        : card.clinical
                          ? '🩺 Cartão de Modo Clínico'
                          : '🩺 Cartão de revisão'}
                </span>
                {(card.q?.includes('<img') || card.a?.includes('<img') || card.image || card.diagram_svg) && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '.72rem',
                      fontWeight: 800,
                    }}
                    title="Imagens em alta definição. Clique na imagem para zoom 4K, arrastar e modo contraste."
                  >
                    🔍 Zoom 4K disponível (clique na imagem)
                  </span>
                )}
                {extractCardTags(card).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: '#fef3c7',
                      color: '#b45309',
                      fontSize: '.72rem',
                      fontWeight: 800,
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Controles de Áudio TTS */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isSpeaking) {
                      speechService.stop()
                    } else {
                      const textToRead = flipped ? card.a : card.q
                      speechService.speak(textToRead, flipped, speechRate)
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: `1.5px solid ${isSpeaking ? '#f59e0b' : '#86efac'}`,
                    background: isSpeaking ? '#fffbeb' : '#f0fdf4',
                    color: isSpeaking ? '#b45309' : '#15803d',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: '.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title="Ouvir em voz alta em português"
                >
                  {isSpeaking ? '⏹️ Parar' : flipped ? '🔊 Ouvir Resposta' : '🔊 Ouvir Pergunta'}
                </button>
                <select
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '2px 4px',
                    fontSize: '.7rem',
                    color: '#64748b',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                  title="Velocidade de leitura"
                >
                  <option value={1.0}>1.0x</option>
                  <option value={1.2}>1.2x</option>
                  <option value={1.5}>1.5x</option>
                </select>
              </div>
            </div>
            <h1
              className="mr-legacy-question"
              dangerouslySetInnerHTML={{
                __html: card.__reverse
                  ? (renderClozeHtml(card.a, flipped) || '📸 Identifique a estrutura ilustrada:')
                  : studyMode === 'reverse' && !flipped && !currentOcclusionData
                    ? (renderClozeHtml(card.a, false) || '📸 Identifique a estrutura ilustrada:')
                    : renderClozeHtml(card.q, flipped),
              }}
            />
            {currentOcclusionData && (
              <ErrorBoundary fallbackTitle="Erro ao exibir oclusão deste cartão">
                <ImageOcclusionViewer
                  data={currentOcclusionData}
                  revealed={flipped}
                  cardPrompt={card.q}
                  cardAnswer={card.a}
                />
              </ErrorBoundary>
            )}
            {!flipped &&
              studyMode === 'flip' &&
              !card.__reverse &&
              Array.isArray(card.choices) &&
              card.choices.length > 0 && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 14, display: 'grid', gap: 8 }}
                >
                  {seededShuffle([...card.choices.slice(0, 5), card.a], card.id).map((opt) => {
                    const isCorrect = opt === card.a
                    const isPicked = mcPicked === opt
                    return (
                      <button
                        key={opt}
                        onClick={() => {
                          setMcPicked(opt)
                          setFlipped(true)
                        }}
                        style={{
                          textAlign: 'left',
                          border: '1.5px solid #cbd5e1',
                          background: '#fff',
                          borderRadius: 10,
                          padding: '0.6rem 0.9rem',
                          cursor: 'pointer',
                          font: '500 .9rem Inter, system-ui, sans-serif',
                          color: '#1e293b',
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            {!flipped && studyMode === 'write' && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}
              >
                <input
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') checkWritten()
                  }}
                  placeholder={
                    studyMode === 'reverse'
                      ? 'Digite a pergunta correspondente…'
                      : 'Digite a resposta…'
                  }
                  autoFocus
                  style={{
                    flex: 1,
                    minWidth: 220,
                    boxSizing: 'border-box',
                    padding: '0.7rem 0.9rem',
                    borderRadius: 10,
                    border: '1.5px solid #cbd5e1',
                    font: 'inherit',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={checkWritten}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '0.7rem 1rem',
                    background: '#16a34a',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Conferir
                </button>
                <button
                  onClick={skipWrite}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '0.7rem 1rem',
                    background: '#fff',
                    color: '#475569',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Não sei
                </button>
              </div>
            )}
            {!flipped &&
              studyMode !== 'write' &&
              !(
                studyMode === 'flip' &&
                !card.__reverse &&
                Array.isArray(card.choices) &&
                card.choices.length > 0
              ) && (
                <p className="mr-legacy-hint">
                  {isCloze(card.q)
                    ? 'Pense na lacuna e toque no cartão para conferir'
                    : 'Toque no cartão para revelar a resposta'}
                </p>
              )}
            {flipped && (
              <div className="mr-legacy-answer">
                {writeFeedback && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '0.6rem 0.9rem',
                      borderRadius: 10,
                      background: writeFeedback.ok ? '#f0fdf4' : '#fef2f2',
                      color: writeFeedback.ok ? '#166534' : '#991b1b',
                      fontWeight: 700,
                      fontSize: '.86rem',
                    }}
                  >
                    {writeFeedback.ok ? '✅ Correto!' : '❌ Não exatamente —'}{' '}
                    <span style={{ fontWeight: 600, opacity: 0.85 }}>
                      semelhança {Math.round(writeFeedback.similarity * 100)}%
                    </span>
                  </div>
                )}
                <strong
                  style={{
                    display: 'block',
                    color: '#15803d',
                    fontSize: '.76rem',
                    letterSpacing: '.1em',
                    marginBottom: 8,
                  }}
                >
                  {card.__reverse
                    ? 'CARTÃO REVERSO — PERGUNTA ORIGINAL'
                    : studyMode === 'reverse'
                      ? 'PERGUNTA'
                      : 'GABARITO'}
                </strong>
                {mcPicked && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '0.6rem 0.9rem',
                      borderRadius: 10,
                      background: mcPicked === card.a ? '#f0fdf4' : '#fef2f2',
                      color: mcPicked === card.a ? '#166534' : '#991b1b',
                      fontWeight: 700,
                      fontSize: '.86rem',
                    }}
                  >
                    {mcPicked === card.a ? '✅ Correto!' : `❌ Você marcou: ${mcPicked}`}
                  </div>
                )}
                <div
                  className="mr-legacy-answer-body"
                  style={{ fontSize: '1.05rem', lineHeight: 1.6, color: '#1e293b' }}
                  dangerouslySetInnerHTML={{
                    __html: renderClozeHtml(
                      card.__reverse ? card.q : studyMode === 'reverse' ? card.q : card.a,
                      true,
                    ),
                  }}
                />
                {card.__reverse && (card.diagram_svg || card.image) && (
                  <figure style={{ margin: '18px 0 0' }}>
                    {card.diagram_title && (
                      <figcaption style={{ color: '#64748b', fontSize: '.8rem', marginBottom: 5 }}>
                        {card.diagram_title}
                      </figcaption>
                    )}
                    <img
                      src={
                        card.image
                          ? pb.files.getURL(
                              { collectionId: 'pbc_709748442', id: card.id.replace(/::rev$/, '') },
                              card.image,
                            )
                          : /^https?:\/\//i.test(card.diagram_svg)
                            ? card.diagram_svg
                            : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.diagram_svg)}`
                      }
                      alt={card.diagram_title || 'Diagrama do cartão'}
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 320,
                        margin: '0 auto',
                        objectFit: 'contain',
                      }}
                    />
                  </figure>
                )}
                {(card.diagram_svg || card.image) && !card.__reverse && (
                  <figure style={{ margin: '18px 0 0' }}>
                    {card.diagram_title && (
                      <figcaption style={{ color: '#64748b', fontSize: '.8rem', marginBottom: 5 }}>
                        {card.diagram_title}
                      </figcaption>
                    )}
                    <img
                      src={
                        card.image
                          ? pb.files.getURL(
                              { collectionId: 'pbc_709748442', id: card.id },
                              card.image,
                            )
                          : /^https?:\/\//i.test(card.diagram_svg)
                            ? card.diagram_svg
                            : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.diagram_svg)}`
                      }
                      alt={card.diagram_title || 'Diagrama do cartão'}
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 320,
                        margin: '0 auto',
                        objectFit: 'contain',
                      }}
                    />
                  </figure>
                )}
                {card.ref && (
                  <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: 12 }}>
                    📚 {card.ref}
                  </div>
                )}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 18,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '.76rem',
                        fontWeight: 800,
                        color: '#15803d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>💡</span> MINHA ANOTAÇÃO PESSOAL (PRIVADA)
                    </span>
                    {noteSaving && (
                      <span style={{ fontSize: '.72rem', color: '#16a34a', fontWeight: 700 }}>
                        ✓ Salvo
                      </span>
                    )}
                  </div>
                  <textarea
                    value={currentCardNote}
                    onChange={(e) => {
                      const val = e.target.value
                      setCurrentCardNote(val)
                      setNoteSaving(true)
                      saveCardNote(card.id.replace(/::rev$/, ''), val).then(() => {
                        setTimeout(() => setNoteSaving(false), 800)
                      })
                    }}
                    placeholder="Escreva seus mnemônicos, observações ou pegadinhas pessoais sobre esta carta..."
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '.84rem',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            )}
          </article>
          {flipped && (
            <div className="mr-legacy-rating-row">
              {(['again', 'hard', 'good', 'easy'] as Quality[]).map((q) => (
                <button key={q} style={qualityBtn(q)} onClick={() => rate(q)}>
                  <div style={{ fontWeight: 800 }}>
                    {q === 'again'
                      ? 'Errei'
                      : q === 'hard'
                        ? 'Difícil'
                        : q === 'good'
                          ? 'Bom'
                          : 'Fácil'}
                  </div>
                  <div style={{ fontSize: '.72rem', opacity: 0.9 }}>{pv[q].label}</div>
                </button>
              ))}
            </div>
          )}
          {msg && (
            <div style={toast}>
              {msg}
              {undoInfo && (
                <button
                  type="button"
                  onClick={async () => {
                    const info = undoInfo
                    setUndoInfo(null)
                    setMsg('')
                    try {
                      await undoMoveSection(info.deckIds, info.restoreKind, info.blockId)
                      await loadData()
                      setMsg('Desfeito — pastas de volta no lugar original.')
                    } catch (e: any) {
                      setMsg(e?.message || 'Não foi possível desfazer.')
                    }
                    window.setTimeout(() => setMsg(''), 4000)
                  }}
                  style={{
                    marginLeft: 10,
                    border: '1px solid #86efac',
                    borderRadius: 999,
                    padding: '0.25rem 0.7rem',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '.78rem',
                    background: '#16a34a',
                    color: '#fff',
                  }}
                >
                  ↩️ Desfazer
                </button>
              )}
            </div>
          )}
          {cardStatsOpen && (
            <CardStatsModal
              card={{ ...card, id: card.id.replace(/::rev$/, '') }}
              reviews={reviewsForCard(card)}
              onClose={() => setCardStatsOpen(false)}
            />
          )}
        </main>
      </div>
    )
  }

  // ===== Tela: home =====
  if (route.view === 'library') {
    return (
      <Suspense fallback={<div style={center}><div style={{ color: '#16a34a', fontWeight: 800 }}>Carregando Biblioteca…</div></div>}>
        <MedReviewLibrary
          decks={decks}
          cards={cards}
          onBack={() => setRoute({ view: 'home' })}
          onRefresh={loadData}
          onStudy={openDeck}
        />
      </Suspense>
    )
  }

  const tutorias = decks.filter((d) => d.kind === 'tutoria')
  const provas = decks.filter((d) => d.kind === 'prova')
  const customs = decks.filter((d) => d.kind === 'custom')
  // Contagem de SEÇÃO = soma das subárvores das pastas de NÍVEL INICIAL apenas.
  // Somar todas as pastas do kind contava carta 2x (bloco + filhas dentro dele).
  const rootsOfKind = (kind: string) =>
    decks.filter((d) => d.kind === kind && !d.parent && !d.deleted)
  // Pastas criadas pela usuária (sem seed_key) — aparecem como cards no grid
  // "Pastas de Estudo" da home, no mesmo estilo das seções.
  // Cards do grid da home = pastas "🎯 Na tela inicial" (frontline). As demais
  // ficam no portal Minhas Pastas (feedback: pasta criada lá dentro aparecia
  // duplicada na tela inicial).
  const userDecks = decks
    .filter((d) => d.kind === 'custom' && !d.parent && d.frontline)
    .sort((a, b) => compareDecks(a, b))
  // Card fixo da seção SÓ aparece se ela tem pastas em nível inicial — se a
  // seção foi movida (Anki: mover = some da origem), o card some da home.
  // Sem card vazio duplicado com a pasta movida.
  const sectionHasRoots = (kind: string) =>
    decks.some((d) => d.kind === kind && !d.parent && !d.deleted)
  const categories = [
    ...(sectionHasRoots('tutoria')
      ? [
          {
            icon: '🩺',
            tag: 'PBL / Tutoria',
            title: 'Tutoria',
            description:
              'Caso Atual em andamento, tutorias e casos clínicos integrados com repetição espaçada FSRS-5.',
            count: rootsOfKind('tutoria').reduce((n, d) => n + cardsInSubtree(d.id), 0),
            onClick: () => openFolderGroup('tutoria'),
            deckId: tutorias.find((d) => !d.parent)?.id,
            sectionKind: 'tutoria' as const,
          },
        ]
      : []),
    ...(sectionHasRoots('prova')
      ? [
          {
            icon: '📝',
            tag: 'Módulos',
            title: 'Prova de Módulo',
            description: 'Bancos de revisão focados para os módulos e avaliações do curso.',
            count: rootsOfKind('prova').reduce((n, d) => n + cardsInSubtree(d.id), 0),
            onClick: () => openFolderGroup('prova'),
            deckId: provas.find((d) => !d.parent)?.id,
            sectionKind: 'prova' as const,
          },
        ]
      : []),
    // Minhas Pastas SEMPRE aparece (portal de navegação) — mesmo vazia.
    // Título FIXO: o card é um portal, NÃO é a pasta capa (renomear uma pasta
    // dentro não pode mudar o card da home — feedback da Nathalia).
    {
      icon: '📁',
      tag: 'Suas pastas livres',
      title: 'Minhas Pastas',
      description: 'Pastas que você criou — organização livre, com subpastas ilimitadas.',
      count: rootsOfKind('custom').reduce((n, d) => n + cardsInSubtree(d.id), 0),
      onClick: () => openFolderGroup('custom'),
      deckId: customs.find((d) => !d.parent)?.id,
      sectionKind: 'custom' as const,
    },
    {
      icon: '📚',
      tag: 'Biblioteca',
      title: 'Todos os Cards',
      description: 'Acesso completo a todas as cartas médicas, pastas e subpastas.',
      count: totalCards,
      onClick: () => setRoute({ view: 'library' }),
    },
  ]
  return (
    <>
      {decks.length === 0 && (
        <div
          style={{
            background: '#eff6ff',
            borderBottom: '1.5px solid #93c5fd',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            zIndex: 50,
          }}
        >
          <span style={{ fontSize: '.92rem', color: '#1e40af', fontWeight: 600 }}>
            Pastas ou cartões sumiram? Restaure sua biblioteca completa (34 pastas e 1.352 cartões):
          </span>
          <button
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '.88rem',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
            }}
            onClick={async () => {
              setMsg('Restaurando suas 34 pastas e 1.352 cartões do backup...')
              try {
                await restoreBackupData(true)
                await loadData()
                setMsg('Sucesso! 34 pastas e 1.352 cartões restaurados com perfeição.')
              } catch (e: any) {
                setMsg('Erro ao restaurar: ' + (e?.message || e))
              }
            }}
          >
            🚀 Restaurar 1.352 Cartões Agora
          </button>
        </div>
      )}
      <MedReviewLegacyHome
        userEmail={user?.email}
        totalCards={totalCards}
        reviewTodayCount={reviewTodayCount}
        masteredPercent={masteredPercent}
        streakDays={streakDays}
        categories={categories}
        decks={decks}
        cards={cards}
        folderKind={route.folderKind}
        onOpenGroup={openFolderGroup}
        onHome={() => setRoute({ view: 'home' })}
        onOpenDeck={openDeck}
        onClinical={startClinicalMode}
        onStudyNow={startStudyNow}
        onSessionBuilder={() => setSessionBuilderOpen(true)}
        onQuiz={() => {
          setQuizKind('all')
          setQuizOpen(true)
        }}
        onNewFolderIn={openNewFolder}
        onNewFrontlineFolder={openNewFrontlineFolder}
        onSectionMove={openSectionMoveModal}
        onLibrary={() => setRoute({ view: 'library' })}
        onLogout={logout}
        onSettings={() => setSettingsOpen(true)}
        onDashboard={() => setDashboardOpen(true)}
        onDeckAddCard={openDeckCardModal}
        onDeckAddSubfolder={openDeckSubfolderModal}
        onDeckRename={openDeckRenameModal}
        onDeckDelete={confirmDeckDelete}
        onDeckReset={confirmDeckReset}
        onDeckMove={openDeckMoveModal}
        onDeckClick={openDeck}
        userDecks={userDecks}
        openDeckId={route.deckId}
        onOpenAiGenerator={() => setAiGeneratorOpen(true)}
        onOpenImageOcclusion={() => setImageOcclusionOpen(true)}
        onOpenExamPlan={(dId, dTitle) => setExamPlanTarget({ id: dId, title: dTitle })}
        onOpenMasterReports={() => setMasterReportsOpen(true)}
        onOpenMasterAnalytics={() => setMasterAnalyticsOpen(true)}
        reviews={reviews}
        onOpenCramMode={(dId) => {
          setCramInitialDeckId(dId)
          setCramModalOpen(true)
        }}
        onOpenAnkiImport={() => setAnkiImportOpen(true)}
      />
      <Suspense fallback={null}>
        {cramModalOpen && (
          <CramSessionModal
            decks={decks}
            cards={cards}
            reviews={reviews}
            initialDeckId={cramInitialDeckId}
            onClose={() => setCramModalOpen(false)}
            onStart={(pickedCards, options) => {
              setCramModalOpen(false)
              startStudy(pickedCards, undefined, options.title, {
                protectFsrs: options.protectFsrs,
                preserveOrder: true,
              })
            }}
          />
        )}
        {ankiImportOpen && (
          <AnkiImportModal
            decks={decks}
            onClose={() => setAnkiImportOpen(false)}
            onSuccess={(count, deckTitle) => {
              setAnkiImportOpen(false)
              loadData()
              setMsg(`Sucesso! ${count} cartas importadas do Anki para "${deckTitle}".`)
              setTimeout(() => setMsg(''), 4000)
            }}
          />
        )}
        {aiGeneratorOpen && (
          <AiCardGeneratorModal
            decks={decks}
            initialDeckId={route.deckId}
            onClose={() => setAiGeneratorOpen(false)}
            onSuccess={() => {
              loadData()
              setMsg('Cartões gerados e salvos com sucesso!')
              setTimeout(() => setMsg(''), 3000)
            }}
          />
        )}
        {imageOcclusionOpen && (
          <ErrorBoundary
            isModal
            fallbackTitle="Erro no editor de oclusão de imagem"
            onReset={() => setImageOcclusionOpen(false)}
          >
            <ImageOcclusionModal
              decks={decks}
              initialDeckId={route.deckId}
              onClose={() => setImageOcclusionOpen(false)}
              onSuccess={() => {
                loadData()
                setMsg('Cartões de oclusão de imagem criados!')
                setTimeout(() => setMsg(''), 3000)
              }}
            />
          </ErrorBoundary>
        )}
        {examPlanTarget && (
          <ExamPlanModal
            deckId={examPlanTarget.id}
            deckTitle={examPlanTarget.title}
            totalCards={cards.filter((c) => c.deck === examPlanTarget.id).length}
            onClose={() => setExamPlanTarget(null)}
            onSaved={() => {
              setMsg('Plano do Modo Prova atualizado!')
              setTimeout(() => setMsg(''), 3000)
            }}
          />
        )}
        {cardReportTarget && (
          <CardReportModal
            cardId={cardReportTarget.id.replace(/::rev$/, '')}
            cardQ={cardReportTarget.q}
            onClose={() => setCardReportTarget(null)}
            onSuccess={() => {
              setMsg('Relatório de erro enviado à moderação. Obrigado!')
              setTimeout(() => setMsg(''), 3500)
            }}
          />
        )}
        {masterReportsOpen && (
          <MasterReportsModal
            onClose={() => setMasterReportsOpen(false)}
            onOpenCard={(cId) => {
              const found = cards.find((c) => c.id === cId)
              if (found) startStudy([found], found.deck, 'Revisar Cartão')
            }}
          />
        )}
        {masterAnalyticsOpen && (
          <MasterAnalyticsModal
            cards={cards}
            reviews={reviews}
            decks={decks}
            onClose={() => setMasterAnalyticsOpen(false)}
            onOpenCard={(cId) => {
              const found = cards.find((c) => c.id === cId)
              if (found) startStudy([found], found.deck, 'Revisar Cartão')
            }}
          />
        )}
      </Suspense>
      {settingsOpen && (
        <SettingsModal
          accountId={user?.id}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setRetentionTick((t) => t + 1)}
          onRepair={async (kind) => {
            try {
              const pattern = kind === 'tutoria' ? '^Tutoria ' : '^Prova '
              const res: any = await repairSection(kind, pattern)
              await loadData()
              setMsg(`Reparo concluído — ${res?.restored ?? 0} pasta(s) de volta ao nível inicial.`)
              window.setTimeout(() => setMsg(''), 4500)
              return true
            } catch (e: any) {
              setMsg(e?.message || 'Não foi possível reparar.')
              window.setTimeout(() => setMsg(''), 4000)
              return false
            }
          }}
        />
      )}
      {dashboardOpen && (
        <FsrDashboardModal
          decks={decks}
          cards={cards}
          reviews={reviews}
          onClose={() => setDashboardOpen(false)}
        />
      )}
      {quizOpen && (
        <QuizSetupModal
          totalCards={cards.filter((c) => !c.deleted && !c.suspended).length}
          onClose={() => setQuizOpen(false)}
          onStart={startQuiz}
        />
      )}
      {quiz && (
        <QuizRunModal
          quiz={quiz}
          onPick={quizPick}
          onReveal={quizReveal}
          onNext={quizNext}
          onRedo={quizRedo}
          onClose={() => setQuiz(null)}
        />
      )}
      {sessionBuilderOpen && (
        <SessionBuilderModal
          decks={decks}
          cards={cards}
          reviews={reviews}
          onClose={() => setSessionBuilderOpen(false)}
          onStart={(picked, title) => {
            setSessionBuilderOpen(false)
            startStudy(picked, undefined, title || 'Sessão personalizada')
          }}
        />
      )}
      {deckModal && (
        <div
          onClick={() => setDeckModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(15,23,42,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              padding: 24,
              width: '100%',
              maxWidth: 430,
              boxShadow: '0 20px 50px rgba(15,23,42,.25)',
            }}
          >
            <h3
              style={{ margin: '0 0 4px', color: '#14532d', fontSize: '1.1rem', fontWeight: 900 }}
            >
              {deckModal.type === 'card'
                ? '＋ Nova carta'
                : deckModal.type === 'folder'
                  ? deckModal.deckId && deckModal.deckId !== '@frontline'
                    ? '＋ Nova subpasta'
                    : '＋ Nova pasta'
                  : deckModal.type === 'moveDeck' || deckModal.type === 'moveSection'
                    ? '➡️ Mover pasta'
                    : '✏️ Renomear pasta'}
            </h3>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '.83rem' }}>
              {deckModal.type === 'moveDeck'
                ? `Mover “${decks.find((d) => d.id === deckModal.deckId)?.title || ''}” para dentro de outra pasta — ela vai junto com suas subpastas.`
                : deckModal.type === 'moveSection'
                  ? `Mover a seção inteira — todas as pastas vão para o destino escolhido.`
                  : deckModal.deckId === '@frontline'
                    ? 'A pasta nasce como card na tela inicial, junto das outras pastas. 🎯'
                    : deckModal.deckId
                      ? `Em: ${decks.find((d) => d.id === deckModal.deckId)?.title || ''}`
                      : 'A pasta aparece na home, na seção do tipo escolhido.'}
            </p>
            {deckModal.type === 'moveSection' && (
              <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: '.83rem' }}>
                A seção vai como UMA pasta no destino (com o nome dela) — dentro dela ficam todas as
                pastas da seção, cada uma com suas subpastas. Nada solto, nada apagado.
              </p>
            )}
            {(deckModal.type === 'moveDeck' || deckModal.type === 'moveSection') &&
              (() => {
                const rootOptions = (['custom', 'tutoria', 'prova'] as const).filter((kind) => {
                  if (!decks.some((d) => d.kind === kind && !d.parent && !d.deleted)) return false
                  return !(deckModal.type === 'moveSection' && deckModal.deckId === kind)
                })
                const movingRoots =
                  deckModal.type === 'moveSection'
                    ? decks
                        .filter((d) => d.kind === deckModal.deckId && !d.parent && !d.deleted)
                        .map((d) => d.id)
                    : deckModal.type === 'moveDeck'
                      ? [deckModal.deckId]
                      : []
                const blockedIds = new Set<string>(movingRoots)
                let grew = true
                while (grew) {
                  grew = false
                  for (const d of decks) {
                    if (d.parent && blockedIds.has(d.parent) && !blockedIds.has(d.id)) {
                      blockedIds.add(d.id)
                      grew = true
                    }
                  }
                }
                const renderRows = (parentId: string, depth: number): any =>
                  decks
                    .filter(
                      (d) => (d.parent || '') === parentId && !d.deleted && !blockedIds.has(d.id),
                    )
                    .sort((a, b) => compareDecks(a, b))
                    .map((d) => {
                      const children = decks.filter(
                        (c) => c.parent === d.id && !c.deleted && !blockedIds.has(c.id),
                      )
                      const isOpen = !!deckMoveExpanded[d.id]
                      return (
                        <Fragment key={d.id}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: `3px 4px 3px ${depth * 18 + 4}px`,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`${isOpen ? 'Recolher' : 'Expandir'} ${d.title}`}
                              aria-expanded={isOpen}
                              disabled={!children.length}
                              onClick={() =>
                                setDeckMoveExpanded((prev) => ({ ...prev, [d.id]: !prev[d.id] }))
                              }
                              style={{
                                width: 26,
                                minWidth: 26,
                                height: 30,
                                border: 0,
                                borderRadius: 6,
                                background: children.length ? '#f0fdf4' : 'transparent',
                                color: '#15803d',
                                cursor: children.length ? 'pointer' : 'default',
                                fontWeight: 900,
                              }}
                            >
                              {children.length ? (isOpen ? '▾' : '▸') : '·'}
                            </button>
                            <button
                              type="button"
                              aria-pressed={deckMoveTarget === d.id}
                              onClick={() => setDeckMoveTarget(d.id)}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                textAlign: 'left',
                                padding: '7px 10px',
                                border: `1px solid ${deckMoveTarget === d.id ? '#16a34a' : '#e2e8f0'}`,
                                borderRadius: 8,
                                background: deckMoveTarget === d.id ? '#f0fdf4' : '#fff',
                                color: '#334155',
                                font: '600 .82rem Inter,system-ui,sans-serif',
                                cursor: 'pointer',
                              }}
                            >
                              {d.kind === 'prova' ? '📝' : '🩺'} {d.title}
                              {children.length > 0 && (
                                <span
                                  style={{ color: '#64748b', fontSize: '.72rem', marginLeft: 6 }}
                                >
                                  {children.length} sub
                                </span>
                              )}
                            </button>
                          </div>
                          {children.length > 0 && isOpen && renderRows(d.id, depth + 1)}
                        </Fragment>
                      )
                    })
                return (
                  <div style={{ width: '100%' }}>
                    <p
                      style={{
                        margin: '0 0 6px',
                        color: '#475569',
                        fontSize: '.8rem',
                        fontWeight: 700,
                      }}
                    >
                      Escolha um destino; abra as subpastas pela seta.
                    </p>
                    <div
                      style={{
                        maxHeight: 260,
                        overflowY: 'auto',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: 6,
                        marginBottom: 8,
                      }}
                    >
                      {rootOptions.map((kind) => {
                        const label =
                          kind === 'custom'
                            ? '📁 Nível inicial — Minhas Pastas'
                            : kind === 'tutoria'
                              ? '🩺 Nível inicial — Tutoria'
                              : '📝 Nível inicial — Prova de Módulo'
                        return (
                          <button
                            key={kind}
                            type="button"
                            aria-pressed={deckMoveTarget === `@root:${kind}`}
                            onClick={() => setDeckMoveTarget(`@root:${kind}`)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 10px',
                              border: `1px solid ${deckMoveTarget === `@root:${kind}` ? '#16a34a' : 'transparent'}`,
                              borderRadius: 8,
                              background: deckMoveTarget === `@root:${kind}` ? '#f0fdf4' : '#fff',
                              color: '#334155',
                              font: '600 .82rem Inter,system-ui,sans-serif',
                              cursor: 'pointer',
                            }}
                          >
                            {label}
                          </button>
                        )
                      })}
                      {renderRows('', 0)}
                    </div>
                  </div>
                )
              })()}
            {deckModal.type === 'card' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#475569' }}>Frente (pergunta)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const textarea = document.getElementById('deck-modal-q-textarea') as HTMLTextAreaElement | null
                      if (textarea) {
                        const start = textarea.selectionStart
                        const end = textarea.selectionEnd
                        const sel = deckQ.substring(start, end)
                        const nextClozeNum = clozeCount(deckQ) + 1
                        const wrapped = sel ? `{{c${nextClozeNum}::${sel}}}` : `{{c${nextClozeNum}::palavra_oculta::dica}}`
                        const newText = deckQ.substring(0, start) + wrapped + deckQ.substring(end)
                        setDeckQ(newText)
                        if (!deckA.trim()) setDeckA('Revisão da Lacuna (Cloze)')
                        setTimeout(() => textarea.focus(), 50)
                      }
                    }}
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 8,
                      padding: '3px 8px',
                      fontSize: '.74rem',
                      fontWeight: 800,
                      color: '#1d4ed8',
                      cursor: 'pointer',
                    }}
                    title="Selecione um trecho e clique para transformar em lacuna Cloze {{c1::...}}"
                  >
                    🧩 + Ocultar Seleção (Cloze)
                  </button>
                </div>
                <textarea
                  id="deck-modal-q-textarea"
                  placeholder="Frente (pergunta) — selecione um termo e clique em 'Ocultar Seleção' para criar Cloze"
                  value={deckQ}
                  onChange={(e) => setDeckQ(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.65rem 0.8rem',
                    borderRadius: 9,
                    border: '1.5px solid #cbd5e1',
                    font: 'inherit',
                    marginBottom: 8,
                    minHeight: 70,
                  }}
                />
                <textarea
                  placeholder="Verso (resposta)"
                  value={deckA}
                  onChange={(e) => setDeckA(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.65rem 0.8rem',
                    borderRadius: 9,
                    border: '1.5px solid #cbd5e1',
                    font: 'inherit',
                    marginBottom: 12,
                    minHeight: 90,
                  }}
                />
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    margin: '0 0 12px',
                    font: '700 .8rem Inter, system-ui, sans-serif',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={deckClinical}
                    onChange={(e) => setDeckClinical(e.target.checked)}
                    style={{ accentColor: '#16a34a', width: 16, height: 16 }}
                  />
                  🩺 Modo Clínico (também entra no treino do Modo Caso Clínico)
                </label>
              </>
            ) : (
              <>
                {deckModal.type === 'folder' &&
                  (!deckModal.deckId || deckModal.deckId === '@frontline') && (
                    <select
                      value={
                        deckModal.deckId === '@frontline' || deckModal.deckId?.startsWith('deck:')
                          ? deckModal.deckId
                          : deckKind
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '@frontline') {
                          setDeckModal({ type: 'folder', deckId: '@frontline' })
                          setDeckKind('custom')
                        } else if (v.startsWith('deck:')) {
                          // criar DENTRO de uma pasta real (contexto dinâmico)
                          setDeckModal({ type: 'folder', deckId: v.slice(5) })
                          setDeckKind('custom')
                        } else {
                          setDeckModal({ type: 'folder', deckId: '' })
                          setDeckKind(v as any)
                        }
                      }}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '0.65rem 0.8rem',
                        borderRadius: 9,
                        border: '1.5px solid #cbd5e1',
                        font: 'inherit',
                        marginBottom: 8,
                        background: '#fff',
                      }}
                    >
                      <option value="@frontline">
                        🎯 Na tela inicial (junto das outras pastas)
                      </option>
                      {(() => {
                        // Dinâmico: mostra só as seções que EXISTEM na home agora
                        // (com pastas em nível inicial) — seção movida não aparece.
                        const hasRoots = (k: string) =>
                          decks.some((d) => d.kind === k && !d.parent && !d.deleted)
                        return (
                          <>
                            {hasRoots('custom') && <option value="custom">📁 Minhas Pastas</option>}
                            {hasRoots('tutoria') && <option value="tutoria">🩺 Tutoria</option>}
                            {hasRoots('prova') && <option value="prova">📝 Prova de Módulo</option>}
                            {/* pastas reais da usuária (raiz custom) para criar DENTRO */}
                            {decks
                              .filter(
                                (d) =>
                                  d.kind === 'custom' &&
                                  !d.parent &&
                                  !d.deleted &&
                                  d.id !== deckModal.deckId,
                              )
                              .sort((a, b) => compareDecks(a, b))
                              .map((d) => (
                                <option key={d.id} value={`deck:${d.id}`}>
                                  ↳ dentro de {d.title}
                                </option>
                              ))}
                          </>
                        )
                      })()}
                    </select>
                  )}
                {deckModal.type === 'folder' &&
                  (!deckModal.deckId || deckModal.deckId === '@frontline') && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <button
                        type="button"
                        onClick={() => setDeckMode('study')}
                        style={{
                          flex: 1,
                          border:
                            deckMode === 'study' ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
                          borderRadius: 9,
                          padding: '0.55rem 0.7rem',
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: '.78rem',
                          background: deckMode === 'study' ? '#f0fdf4' : '#fff',
                          color: deckMode === 'study' ? '#166534' : '#64748b',
                        }}
                      >
                        ⚡ Estudo
                        <span style={{ display: 'block', fontWeight: 500, fontSize: '.68rem' }}>
                          clica e estuda os flashcards
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeckMode('organizer')}
                        style={{
                          flex: 1,
                          border:
                            deckMode === 'organizer' ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
                          borderRadius: 9,
                          padding: '0.55rem 0.7rem',
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: '.78rem',
                          background: deckMode === 'organizer' ? '#f0fdf4' : '#fff',
                          color: deckMode === 'organizer' ? '#166534' : '#64748b',
                        }}
                      >
                        📂 Organizadora
                        <span style={{ display: 'block', fontWeight: 500, fontSize: '.68rem' }}>
                          abre e mostra as pastas dentro
                        </span>
                      </button>
                    </div>
                  )}
                {deckModal.type !== 'moveDeck' && (
                  <input
                    placeholder="Nome da pasta"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.65rem 0.8rem',
                      borderRadius: 9,
                      border: '1.5px solid #cbd5e1',
                      font: 'inherit',
                      marginBottom: 12,
                    }}
                  />
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={submitDeckQuick}
                disabled={busy}
                style={{
                  border: '1px solid #16a34a',
                  borderRadius: 9,
                  padding: '0.55rem 0.9rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  background: '#16a34a',
                  color: '#fff',
                }}
              >
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setDeckModal(null)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 9,
                  padding: '0.55rem 0.9rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  background: '#fff',
                  color: '#334155',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {lightboxImage && (
        <ImageLightboxModal
          src={lightboxImage.src}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </>
  )
}

const center: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Inter, system-ui, sans-serif',
}
const loginBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '2rem',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  width: 340,
  textAlign: 'center',
}
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.7rem 0.9rem',
  borderRadius: 10,
  border: '1.5px solid #cbd5e1',
  fontSize: '0.95rem',
  marginBottom: '0.7rem',
  outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.8rem',
  borderRadius: 10,
  border: 'none',
  background: '#16a34a',
  color: '#fff',
  fontWeight: 800,
  fontSize: '0.95rem',
  cursor: 'pointer',
  marginTop: '0.4rem',
}
const errBox: React.CSSProperties = {
  background: '#fef2f2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '0.6rem',
  fontSize: '0.82rem',
  marginBottom: '0.6rem',
}
const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '0.55rem',
  borderRadius: 8,
  border: active ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
  background: active ? '#f0fdf4' : '#fff',
  color: active ? '#14532d' : '#64748b',
  fontWeight: 700,
  cursor: 'pointer',
})
const qualityBtn = (q: Quality): React.CSSProperties => ({
  flex: 1,
  minWidth: 100,
  padding: '0.7rem 0.5rem',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  background:
    q === 'again' ? '#dc2626' : q === 'hard' ? '#d97706' : q === 'good' ? '#16a34a' : '#2563eb',
})
const toast: React.CSSProperties = {
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#14532d',
  color: '#fff',
  padding: '0.6rem 1.2rem',
  borderRadius: 999,
  fontSize: '0.85rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
}
