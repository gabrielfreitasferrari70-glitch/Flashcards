import { useState } from 'react'
import {
  localDay,
  localInstant,
  localTime,
  type Kind,
  type PlanningRecord,
  type RecordData,
} from './domain'
const definitions: Record<string, [string, string, string, boolean?][]> = {
  session: [
    ['subject', 'Disciplina', 'text', true],
    ['topic', 'Assunto', 'text', true],
    ['studied_at', 'Data do estudo (Cuiabá)', 'datetime-local', true],
    ['duration_minutes', 'Duração em minutos', 'number'],
    ['questions', 'Questões respondidas', 'number'],
    ['correct', 'Acertos', 'number'],
    ['activities', 'Atividades concluídas (uma por linha)', 'textarea'],
    ['notes', 'Observações', 'textarea'],
  ],
  event: [
    ['title', 'Título', 'text', true],
    ['event_type', 'Tipo de compromisso', 'event-type', true],
    ['starts_at', 'Início (Cuiabá)', 'datetime-local', true],
    ['ends_at', 'Fim (Cuiabá)', 'datetime-local', true],
    ['attendance', 'Presença', 'attendance'],
    ['subject', 'Disciplina', 'text'],
    ['topic', 'Assunto', 'text'],
    ['notes', 'Observações', 'textarea'],
  ],
  task: [
    ['subject', 'Disciplina', 'text', true],
    ['topic', 'Assunto / atividade', 'text', true],
    ['estimated_minutes', 'Duração estimada (min)', 'number', true],
    ['priority', 'Prioridade (1 a 5)', 'number'],
    ['deadline', 'Prazo', 'date'],
    ['scheduled_at', 'Horário manual (Cuiabá)', 'datetime-local'],
    ['notes', 'Observações', 'textarea'],
  ],
  material: [
    ['title', 'Título', 'text', true],
    ['system', 'Sistema', 'text'],
    ['subject', 'Disciplina', 'text'],
    ['topic', 'Tema', 'text'],
    ['url', 'Referência / link', 'url'],
    ['notes', 'Observações', 'textarea'],
  ],
  review: [
    ['subject', 'Disciplina', 'text', true],
    ['topic', 'Assunto', 'text', true],
    ['due_on', 'Data da revisão', 'date', true],
    ['notes', 'Observações', 'textarea'],
  ],
}
export default function RecordForm({
  record,
  onSave,
  onCancel,
  busy,
}: {
  record?: PlanningRecord
  onSave: (kind: Kind, data: RecordData) => Promise<void>
  onCancel: () => void
  busy: boolean
}) {
  const [kind, setKind] = useState<Kind>(record?.kind || 'session')
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(record?.data || {}).map(([key, value]) => [
        key,
        key.endsWith('_at')
          ? `${localDay(String(value))}T${localTime(String(value))}`
          : Array.isArray(value)
            ? value.join('\n')
            : String(value),
      ]),
    ),
  )
  const [error, setError] = useState('')
  return (
    <form
      className="mp-form"
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        try {
          const data: RecordData = {}
          for (const [key, , type] of definitions[kind]) {
            const value = values[key]
            if (value === undefined || value === '') continue
            data[key] =
              type === 'number'
                ? Number(value)
                : type === 'datetime-local'
                  ? localInstant(value)
                  : key === 'activities'
                    ? value
                        .split('\n')
                        .map((x) => x.trim())
                        .filter(Boolean)
                    : value.trim()
          }
          await onSave(kind, data)
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Não foi possível salvar.')
        }
      }}
    >
      <h3>{record ? 'Corrigir registro' : 'Novo registro'}</h3>
      {!record && (
        <label>
          Registro
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind)
              setValues({})
            }}
          >
            <option value="session">Assunto estudado</option>
            <option value="event">Compromisso / aula / prova</option>
            <option value="task">Tarefa de estudo</option>
            <option value="material">Material para consulta</option>
          </select>
        </label>
      )}
      <div className="mp-fields">
        {definitions[kind].map(([key, label, type, required]) => (
          <label key={key}>
            {label}
            {type === 'textarea' ? (
              <textarea
                value={values[key] || ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            ) : type === 'event-type' || type === 'attendance' ? (
              <select
                required={required}
                value={values[key] || ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              >
                <option value="">Não informado</option>
                {(type === 'event-type'
                  ? [
                      ['class', 'Aula prevista'],
                      ['exam', 'Prova'],
                      ['tutorial', 'Tutoria'],
                      ['study', 'Bloco de estudo'],
                    ]
                  : [
                      ['planned', 'Prevista'],
                      ['attended', 'Assistida'],
                      ['missed', 'Não assistida'],
                    ]
                ).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={type}
                required={required}
                min={type === 'number' ? 0 : undefined}
                step={type === 'number' ? 1 : undefined}
                value={values[key] ?? ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <p className="mp-muted">
        Presença em aula não registra estudo. Campos vazios não significam zero
        {record ? ' e mantêm o valor anterior' : ''}. Revisões usam os intervalos configurados, sem
        alterações automáticas.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="mp-actions">
        <button disabled={busy} type="submit">
          {busy ? 'Salvando…' : 'Salvar registro'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
