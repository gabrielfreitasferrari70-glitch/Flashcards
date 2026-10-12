import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Download,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase/client'
import RecordForm from './RecordForm'
import {
  addDays,
  isPending,
  localDay,
  localTime,
  performance,
  PLANNING_ADMIN,
  PLANNING_START,
  proposePlan,
  type Availability,
  type Command,
  type PlanningRecord,
  type Kind,
  type RecordData,
} from './domain'
import {
  exportPlanning,
  importIdempotencyKey,
  loadPlanning,
  previewImport,
  savePlanning,
} from './service'
import './planning.css'
const tabs = ['Hoje', 'Semana', 'Estudos', 'Revisões', 'Materiais', 'Desempenho'] as const
const label: Record<string, string> = {
  class: 'Aula prevista',
  exam: 'Prova',
  tutorial: 'Tutoria',
  study: 'Bloco de estudo',
  attended: 'Aula assistida',
  missed: 'Não assistida',
  session: 'Assunto estudado',
  task: 'Tarefa',
  review: 'Revisão',
  material: 'Material',
}
function when(r: PlanningRecord) {
  return String(
    r.data.starts_at ||
      r.data.studied_at ||
      r.data.scheduled_at ||
      r.data.due_on ||
      r.data.deadline ||
      '',
  )
}
export default function AdminPlanning({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<PlanningRecord[]>([])
  const [tab, setTab] = useState<(typeof tabs)[number]>('Hoje')
  const [day, setDay] = useState(() => localDay())
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<PlanningRecord | 'new' | null>(null)
  const [intervals, setIntervals] = useState('')
  const [availability, setAvailability] = useState<Availability[]>([])
  const [importText, setImportText] = useState('')
  const [preview, setPreview] = useState<Command[] | null>(null)
  const [proposal, setProposal] = useState<ReturnType<typeof proposePlan> | null>(null)
  const [history, setHistory] = useState<
    | { created_at: string; operation_key: string; before_data: unknown; after_data: unknown }[]
    | null
  >(null)
  const pending = useRef<{ payload: string; key: string } | null>(null)
  const refreshing = useRef(false)
  const reload = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const all = await loadPlanning()
      setRecords(all)
      setError('')
      return all
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na leitura.')
      throw e
    } finally {
      refreshing.current = false
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active) return
      if (error || data.user?.id !== PLANNING_ADMIN) {
        setError('Acesso exclusivo do administrador.')
        setLoading(false)
        return
      }
      setAllowed(true)
      try {
        const all = await reload()
        if (active) {
          const settings = all?.find((r) => r.kind === 'settings')
          setIntervals(((settings?.data.review_days as number[]) || []).join(', '))
          setAvailability((settings?.data.availability as Availability[]) || [])
        }
      } catch {
        /* error is displayed */
      }
    })
    const refresh = () => {
      if (document.visibilityState === 'visible' && !refreshing.current)
        void supabase.auth.getUser().then(({ data }) => {
          if (active && data.user?.id === PLANNING_ADMIN) void reload().catch(() => {})
        })
    }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  const commit = async (command: Command, suppliedKey?: string) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    const payload = JSON.stringify(command)
    if (
      pending.current?.payload !== payload ||
      (suppliedKey && suppliedKey !== pending.current?.key)
    )
      pending.current = { payload, key: suppliedKey || crypto.randomUUID() }
    try {
      const result = await savePlanning(command, pending.current.key)
      pending.current = null
      setMessage(`Salvo e confirmado no banco${result.record ? `: ${result.record.id}` : ''}.`)
      setForm(null)
      setPreview(null)
      setProposal(null)
      try {
        await reload()
      } catch {
        setMessage(
          'Gravação confirmada. Não foi possível atualizar a lista; use Atualizar para consultar o registro salvo.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
      throw e
    } finally {
      setBusy(false)
    }
  }
  const settings = records.find((r) => r.kind === 'settings')
  const agenda = records
    .filter((r) => r.kind === 'event' && localDay(String(r.data.starts_at)) === day)
    .sort((a, b) => Date.parse(String(a.data.starts_at)) - Date.parse(String(b.data.starts_at)))
  const nextExam = records
    .filter(
      (r) =>
        r.kind === 'event' &&
        r.data.event_type === 'exam' &&
        localDay(String(r.data.starts_at)) >= day,
    )
    .sort((a, b) => Date.parse(String(a.data.starts_at)) - Date.parse(String(b.data.starts_at)))[0]
  const pendingRecords = records
    .filter((r) => isPending(r, day))
    .sort(
      (a, b) =>
        Number(b.data.priority || 0) - Number(a.data.priority || 0) ||
        when(a).localeCompare(when(b)),
    )
  const plan = day >= PLANNING_START ? proposePlan(records, day, 1) : null
  const stats = performance(records)
  const saveForm = async (kind: Kind, data: RecordData) => {
    if (form && form !== 'new') {
      const important =
        (kind === 'event' &&
          (data.starts_at !== form.data.starts_at || data.ends_at !== form.data.ends_at)) ||
        (kind === 'task' &&
          data.scheduled_at !== undefined &&
          data.scheduled_at !== form.data.scheduled_at) ||
        (kind === 'session' && data.studied_at !== form.data.studied_at) ||
        kind === 'review'
      if (
        important &&
        !window.confirm(
          'Confirmar a alteração deste compromisso/revisão? Os outros registros e intervalos não serão alterados.',
        )
      )
        return
      await commit({
        action: 'update',
        id: form.id,
        expected_revision: form.revision,
        patch: data,
        confirmed: important,
      })
    } else await commit({ action: 'create', kind, data })
  }
  const card = (r: PlanningRecord) => (
    <article className="mp-card" key={r.id}>
      <div className="mp-card-top">
        <span className={`mp-tag mp-tag-${r.kind}`}>
          {r.kind === 'event'
            ? r.data.attendance === 'attended'
              ? 'Aula assistida'
              : label[String(r.data.event_type)]
            : r.kind === 'review' && r.data.status === 'done'
              ? 'Assunto revisado'
              : label[r.kind]}
        </span>
        {r.data.status === 'done' && (
          <span className="mp-done">
            <Check size={14} /> Concluída
          </span>
        )}
      </div>
      <h3>{String(r.data.title || r.data.topic)}</h3>
      {r.data.subject && (
        <p>
          {String(r.data.subject)}
          {r.data.system ? ` · ${r.data.system}` : ''}
        </p>
      )}
      {when(r) && (
        <p className="mp-muted">
          {when(r).includes('T') ? `${localDay(when(r))} · ${localTime(when(r))}` : when(r)}
          {r.data.ends_at ? `–${localTime(String(r.data.ends_at))}` : ''}
        </p>
      )}
      {r.kind === 'session' && (
        <p>
          {r.data.duration_minutes === undefined
            ? 'Duração não informada'
            : `${r.data.duration_minutes} min`}
          {r.data.questions !== undefined ? ` · ${r.data.questions} questões` : ''}
          {r.data.correct !== undefined ? ` · ${r.data.correct} acertos` : ''}
        </p>
      )}
      {r.data.activities && (
        <ul>
          {(r.data.activities as string[]).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {r.kind === 'task' && (
        <p>
          {String(r.data.estimated_minutes)} min · prioridade{' '}
          {r.data.priority === undefined ? 'não informada' : String(r.data.priority)}
        </p>
      )}
      {r.kind === 'review' && <p>Intervalo registrado: {String(r.data.interval_days)} dias</p>}
      {r.data.notes && <p>{String(r.data.notes)}</p>}
      {r.kind === 'material' && r.data.topic && <p>Tema: {String(r.data.topic)}</p>}
      {r.kind === 'material' && r.data.url && (
        <a href={String(r.data.url)} target="_blank" rel="noopener noreferrer">
          Abrir referência ↗
        </a>
      )}
      <div className="mp-actions">
        {(r.kind === 'task' || r.kind === 'review') && r.data.status !== 'done' && (
          <button
            disabled={busy}
            onClick={() =>
              void commit({ action: 'complete', id: r.id, expected_revision: r.revision }).catch(
                () => {},
              )
            }
          >
            <Check size={15} /> Concluir
          </button>
        )}
        <button className="secondary" disabled={busy} onClick={() => setForm(r)}>
          Corrigir
        </button>
        <button
          className="secondary"
          onClick={async () => {
            const { data, error } = await supabase
              .from('mr_planning_history')
              .select('created_at,operation_key,before_data,after_data')
              .eq('record_id', r.id)
              .order('created_at')
            if (error) setError(error.message)
            else setHistory(data)
          }}
        >
          Histórico
        </button>
      </div>
    </article>
  )
  const list = (items: PlanningRecord[]) =>
    items.length ? (
      <div className="mp-grid">{items.map(card)}</div>
    ) : (
      <p className="mp-empty">
        Nenhum registro para este período. Adicione informações reais para começar.
      </p>
    )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="mp-shell" aria-describedby="mp-description">
        <header className="mp-header">
          <div>
            <DialogTitle>
              <CalendarDays size={22} /> Planejamento de Medicina
            </DialogTitle>
            <DialogDescription id="mp-description">
              Seu acompanhamento desde 12/10/2026 · America/Cuiaba · exclusivo do administrador
            </DialogDescription>
          </div>
          <button className="secondary" onClick={onClose} aria-label="Fechar planejamento">
            <X size={18} />
          </button>
        </header>
        {loading ? (
          <p role="status">Consultando registros no banco…</p>
        ) : (
          <>
            {error && (
              <p className="mp-alert" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="mp-success" role="status">
                {message}
              </p>
            )}
            {allowed && (
              <>
                <nav className="mp-tabs" aria-label="Seções de planejamento">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      aria-pressed={tab === t}
                      onClick={() => {
                        setTab(t)
                        setForm(null)
                        setHistory(null)
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </nav>
                <div className="mp-toolbar">
                  <label>
                    Data de referência
                    <input
                      type="date"
                      value={day}
                      onChange={(e) => {
                        if (e.target.value) setDay(e.target.value)
                        setProposal(null)
                      }}
                    />
                  </label>
                  <div className="mp-actions">
                    <button disabled={busy || !!error} onClick={() => setForm('new')}>
                      <Plus size={16} /> Novo registro
                    </button>
                    <button className="secondary" onClick={() => void reload().catch(() => {})}>
                      <RefreshCw size={16} /> Atualizar
                    </button>
                  </div>
                </div>
                {form && (
                  <RecordForm
                    key={form === 'new' ? 'new' : form.id}
                    record={form === 'new' ? undefined : form}
                    busy={busy}
                    onSave={saveForm}
                    onCancel={() => setForm(null)}
                  />
                )}
                {history && (
                  <section className="mp-panel">
                    <h3>Histórico de alterações</h3>
                    <button className="secondary" onClick={() => setHistory(null)}>
                      Fechar histórico
                    </button>
                    {history.map((h, i) => (
                      <details key={i}>
                        <summary>
                          {localDay(h.created_at)} · {localTime(h.created_at)} ·{' '}
                          {h.before_data ? 'Correção' : 'Criação'}
                        </summary>
                        <pre>
                          {JSON.stringify({ antes: h.before_data, depois: h.after_data }, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </section>
                )}
                {tab === 'Hoje' && (
                  <>
                    <div className="mp-metrics">
                      <article>
                        <Clock />
                        <strong>
                          {plan
                            ? plan.freeMinutes === null
                              ? 'Não informada'
                              : `${plan.freeMinutes} min`
                            : 'Fora do acompanhamento'}
                        </strong>
                        <span>
                          {settings
                            ? 'Disponibilidade livre de compromissos'
                            : 'Disponibilidade não configurada'}
                        </span>
                      </article>
                      <article>
                        <CalendarDays />
                        <strong>
                          {nextExam ? String(nextExam.data.title) : 'Nenhuma prova cadastrada'}
                        </strong>
                        <span>
                          {nextExam
                            ? `${localDay(String(nextExam.data.starts_at))} · ${localTime(String(nextExam.data.starts_at))}`
                            : 'Sem previsão inventada'}
                        </span>
                      </article>
                      <article>
                        <BookOpen />
                        <strong>{pendingRecords.length}</strong>
                        <span>Tarefas e revisões prioritárias</span>
                      </article>
                    </div>
                    <h2>Compromissos</h2>
                    {list(agenda)}
                    <h2>Prioridades</h2>
                    {list(pendingRecords)}
                  </>
                )}
                {tab === 'Semana' && (
                  <>
                    <p className="mp-muted">
                      Aulas previstas, provas e tutorias vêm apenas dos registros/importações
                      confirmados. Blocos manuais são preservados.
                    </p>
                    <div className="mp-week">
                      {Array.from({ length: 7 }, (_, i) => addDays(day, i)).map((date) => (
                        <section key={date}>
                          <h3>{date}</h3>
                          {records
                            .filter(
                              (r) =>
                                (r.kind === 'event' || r.kind === 'task') &&
                                when(r).includes('T') &&
                                localDay(when(r)) === date,
                            )
                            .sort((a, b) => when(a).localeCompare(when(b)))
                            .map(card)}
                        </section>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        try {
                          setProposal(proposePlan(records, day, 7))
                        } catch (e) {
                          setError((e as Error).message)
                        }
                      }}
                    >
                      Propor distribuição da semana
                    </button>
                    {proposal && (
                      <section className="mp-panel">
                        <h3>Proposta — nada foi alterado</h3>
                        {proposal.suggestions.map((s) => (
                          <p key={s.id}>
                            <strong>
                              {String(records.find((r) => r.id === s.id)?.data.topic)}
                            </strong>{' '}
                            · {localDay(s.starts_at)} {localTime(s.starts_at)}–
                            {localTime(s.ends_at)}
                            <br />
                            {s.reason}
                          </p>
                        ))}
                        {proposal.unscheduled.map((s) => (
                          <p key={s.id}>
                            {String(records.find((r) => r.id === s.id)?.data.topic)}: {s.reason}
                          </p>
                        ))}
                        <p>
                          Revise os horários antes de confirmar. Você pode ajustá-los em Corrigir.
                        </p>
                        <button
                          disabled={busy || !proposal.suggestions.length}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Aplicar somente os horários de tarefas mostrados nesta prévia?',
                              )
                            )
                              void commit({
                                action: 'import',
                                confirmed: true,
                                records: proposal.suggestions.map((s) => ({
                                  action: 'update',
                                  id: s.id,
                                  expected_revision: s.revision,
                                  patch: { scheduled_at: s.starts_at },
                                  confirmed: true,
                                })),
                              }).catch(() => {})
                          }}
                        >
                          Confirmar proposta
                        </button>
                      </section>
                    )}
                  </>
                )}
                {tab === 'Estudos' && (
                  <>
                    <p className="mp-muted">
                      Aulas assistidas ficam na agenda. Aqui entram somente sessões de estudo
                      registradas. Estudos antigos ficam disponíveis para consulta.
                    </p>
                    {list(
                      records
                        .filter((r) => r.kind === 'session')
                        .sort((a, b) => when(b).localeCompare(when(a))),
                    )}
                  </>
                )}
                {tab === 'Revisões' && (
                  <>
                    <section className="mp-panel">
                      <h3>Intervalos e disponibilidade</h3>
                      <p>
                        Os intervalos são escolhidos por você. Salvar configurações não modifica
                        séries já criadas. Sem intervalos definidos, novas sessões não geram
                        revisões.
                      </p>
                      <label>
                        Dias após o estudo (separados por vírgula)
                        <input
                          value={intervals}
                          placeholder="Informe seus intervalos"
                          onChange={(e) => setIntervals(e.target.value)}
                        />
                      </label>
                      {availability.map((slot, i) => (
                        <div className="mp-slot" key={i}>
                          <select
                            aria-label={`Dia da janela ${i + 1}`}
                            value={slot.weekday}
                            onChange={(e) =>
                              setAvailability(
                                availability.map((s, j) =>
                                  j === i ? { ...s, weekday: Number(e.target.value) } : s,
                                ),
                              )
                            }
                          >
                            {[
                              'Domingo',
                              'Segunda',
                              'Terça',
                              'Quarta',
                              'Quinta',
                              'Sexta',
                              'Sábado',
                            ].map((d, n) => (
                              <option value={n} key={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`Início da janela ${i + 1}`}
                            type="time"
                            value={slot.start}
                            onChange={(e) =>
                              setAvailability(
                                availability.map((s, j) =>
                                  j === i ? { ...s, start: e.target.value } : s,
                                ),
                              )
                            }
                          />
                          <input
                            aria-label={`Fim da janela ${i + 1}`}
                            type="time"
                            value={slot.end}
                            onChange={(e) =>
                              setAvailability(
                                availability.map((s, j) =>
                                  j === i ? { ...s, end: e.target.value } : s,
                                ),
                              )
                            }
                          />
                          <button
                            className="secondary"
                            aria-label={`Remover janela ${i + 1}`}
                            onClick={() => setAvailability(availability.filter((_, j) => j !== i))}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <div className="mp-actions">
                        <button
                          className="secondary"
                          onClick={() =>
                            setAvailability([...availability, { weekday: 1, start: '', end: '' }])
                          }
                        >
                          Adicionar disponibilidade
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const review_days = intervals.trim()
                              ? intervals.split(',').map((x) => Number(x.trim()))
                              : []
                            if (review_days.some((x) => !Number.isInteger(x) || x < 1)) {
                              setError('Informe dias inteiros positivos.')
                              return
                            }
                            const data = { review_days, availability }
                            if (
                              settings &&
                              !window.confirm(
                                'Salvar novos intervalos somente para estudos futuros e atualizar sua disponibilidade?',
                              )
                            )
                              return
                            void commit(
                              settings
                                ? {
                                    action: 'update',
                                    id: settings.id,
                                    expected_revision: settings.revision,
                                    patch: data,
                                    confirmed: true,
                                  }
                                : { action: 'create', kind: 'settings', data },
                            ).catch(() => {})
                          }}
                        >
                          Salvar configurações
                        </button>
                      </div>
                    </section>
                    <h2>Fila até {day}</h2>
                    {list(pendingRecords.filter((r) => r.kind === 'review'))}
                    <details>
                      <summary>Concluídas e próximas revisões</summary>
                      {list(
                        records
                          .filter(
                            (r) =>
                              r.kind === 'review' && !pendingRecords.some((p) => p.id === r.id),
                          )
                          .sort((a, b) => when(a).localeCompare(when(b))),
                      )}
                    </details>
                  </>
                )}
                {tab === 'Materiais' && (
                  <>
                    <p className="mp-muted">
                      Referências para consulta, organizadas por sistema, disciplina e tema. Esta
                      área mantém referências; os arquivos do Google Drive não são importados
                      automaticamente.
                    </p>
                    {list(
                      records
                        .filter((r) => r.kind === 'material')
                        .sort(
                          (a, b) =>
                            String(a.data.system || '').localeCompare(
                              String(b.data.system || ''),
                            ) ||
                            String(a.data.subject || '').localeCompare(
                              String(b.data.subject || ''),
                            ),
                        ),
                    )}
                  </>
                )}
                {tab === 'Desempenho' && (
                  <>
                    <p className="mp-muted">
                      Somente sessões desde 12/10/2026. Ausência de questões/acertos não significa
                      aproveitamento zero. Assuntos abaixo de 70% aparecem como atenção, sem gerar
                      mudanças automáticas.
                    </p>
                    {stats.length ? (
                      <div className="mp-grid">
                        {stats.map((s) => (
                          <article className="mp-card" key={s.subject + s.topic}>
                            <h3>{s.topic}</h3>
                            <p>{s.subject}</p>
                            <strong>{s.timed ? `${s.minutes} min` : 'Tempo não informado'}</strong>
                            <p>
                              {s.accuracy === null
                                ? 'Aproveitamento não calculável'
                                : `${s.accuracy.toFixed(1)}% · ${s.correct}/${s.questions} questões`}
                            </p>
                            {s.accuracy !== null && s.accuracy < 70 && (
                              <span className="mp-warning">Requer atenção</span>
                            )}
                            <p>
                              {s.sessions} {s.sessions === 1 ? 'sessão' : 'sessões'} ·{' '}
                              {s.sessions - s.timed} sem duração · {s.sessions - s.measured} sem
                              questões/acertos completos
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="mp-empty">
                        Ainda não há estudos registrados neste acompanhamento.
                      </p>
                    )}
                  </>
                )}
                <details className="mp-transfer">
                  <summary>
                    <Upload size={16} /> Importar cronograma/estudos e exportar dados
                  </summary>
                  <p>
                    Esta interface não verifica se uma conversa está conectada ao ChatGPT. Até
                    configurar e autorizar o aplicativo, use arquivos estruturados
                    (medreview-planning-v1) como alternativa manual. Importe até 200 registros; o
                    banco valida tudo antes de confirmar. Arquivos antigos não viram pendências.
                  </p>
                  <div className="mp-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(exportPlanning(records), null, 2)], {
                          type: 'application/json',
                        })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = 'medreview-planejamento.json'
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download size={16} /> Exportar registros
                    </button>
                    <label className="mp-file">
                      Ler arquivo JSON/CSV
                      <input
                        type="file"
                        accept="application/json,text/csv,.json,.csv"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 500000) {
                            setError('Arquivo excede 500 KB.')
                            return
                          }
                          setImportText(await file.text())
                          setPreview(null)
                        }}
                      />
                    </label>
                  </div>
                  <label>
                    Registros estruturados
                    <textarea
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value)
                        setPreview(null)
                      }}
                      rows={5}
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={() => {
                      try {
                        setPreview(previewImport(importText, records))
                        setError('')
                      } catch (e) {
                        setError((e as Error).message)
                      }
                    }}
                  >
                    Ver prévia (não grava)
                  </button>
                  {preview && (
                    <section className="mp-panel">
                      <h3>Prévia de {preview.length} operações</h3>
                      {preview.map((c, i) => (
                        <pre key={i}>{JSON.stringify(c, null, 2)}</pre>
                      ))}
                      <button
                        disabled={busy || !preview.length}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Confirma os registros e alterações mostrados na prévia?',
                            )
                          )
                            void commit(
                              {
                                action: 'import',
                                records: preview,
                                confirmed: true,
                              },
                              importIdempotencyKey(importText),
                            ).catch(() => {})
                        }}
                      >
                        Confirmar importação
                      </button>
                    </section>
                  )}
                </details>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
