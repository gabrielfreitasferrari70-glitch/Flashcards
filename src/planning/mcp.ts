import {
  addDays,
  isPending,
  localDay,
  PLANNING_START,
  PLANNING_ZONE,
  proposePlan,
  type Command,
  type PlanningRecord,
} from './domain.ts'
export type PlanningBackend = {
  list: () => Promise<PlanningRecord[]>
  command: (command: Command, key: string) => Promise<unknown>
}
const keySchema = {
  type: 'string',
  minLength: 8,
  maxLength: 200,
  description: 'Stable idempotency key. Reuse exactly the same key and data on a retry.',
}
const properties = {
  id: { type: 'string', format: 'uuid' },
  expected_revision: { type: 'integer', minimum: 1 },
  idempotency_key: keySchema,
}
const tool = (
  name: string,
  description: string,
  props: object,
  required: string[],
  readOnly = false,
) => ({
  name,
  description,
  inputSchema: { type: 'object', properties: props, required, additionalProperties: false },
  annotations: {
    readOnlyHint: readOnly,
    destructiveHint: name === 'correct_record',
    idempotentHint: true,
    openWorldHint: false,
  },
})
export const planningTools = [
  tool(
    'consult_agenda_plan',
    'Consult agenda and a proposed plan for a date in America/Cuiaba. Read only; no events are invented.',
    { date: { type: 'string', format: 'date' } },
    ['date'],
    true,
  ),
  tool(
    'consult_tasks_reviews',
    'Consult tasks and due reviews as of a date, starting 2026-10-12.',
    { date: { type: 'string', format: 'date' } },
    ['date'],
    true,
  ),
  tool(
    'register_study_session',
    'Register only relevant structured study facts. Missing fields stay absent, zero stays zero. Never copy conversation messages. Same retry key returns the saved identifier and confirmed data.',
    {
      idempotency_key: keySchema,
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['subject', 'topic', 'studied_at'],
        properties: {
          subject: { type: 'string' },
          topic: { type: 'string' },
          studied_at: {
            type: 'string',
            format: 'date-time',
            description: 'ISO instant with timezone; interpreted in America/Cuiaba',
          },
          duration_minutes: { type: 'integer', minimum: 1 },
          questions: { type: 'integer', minimum: 0 },
          correct: { type: 'integer', minimum: 0 },
          activities: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
    ['idempotency_key', 'data'],
  ),
  tool(
    'complete_activity',
    'Mark an identified task or review complete. An attended class is NOT a completed study session.',
    properties,
    ['id', 'expected_revision', 'idempotency_key'],
  ),
  tool(
    'correct_record',
    'Correct an identified record using its current revision. IMPORTANT: get explicit confirmation from the user before changing event times, review dates or scheduled tasks; then pass confirmed=true. Do not change review intervals automatically. No deletion is available.',
    {
      ...properties,
      patch: { type: 'object', minProperties: 1 },
      confirmed: {
        type: 'boolean',
        description: 'True only after explicit confirmation of important schedule changes.',
      },
    },
    ['id', 'expected_revision', 'idempotency_key', 'patch'],
  ),
  tool(
    'propose_reorganization',
    'Read-only proposal respecting fixed commitments, availability, estimated duration, priorities and exams. Return reasons and unscheduled tasks; never apply or change intervals.',
    {
      date: { type: 'string', format: 'date' },
      days: { type: 'integer', minimum: 1, maximum: 14 },
    },
    ['date'],
    true,
  ),
]
function day(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + 'T12:00:00Z')) ||
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value
  )
    throw new Error('Invalid date')
  return value
}
export async function handlePlanningMcp(message: any, backend: PlanningBackend, now = new Date()) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
    return {
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: { code: -32600, message: 'Invalid Request' },
    }
  if (message.method.startsWith('notifications/')) return null
  const respond = (result: unknown) => ({ jsonrpc: '2.0', id: message.id ?? null, result })
  if (message.method === 'initialize')
    return respond({
      protocolVersion: ['2025-03-26', '2025-06-18'].includes(message.params?.protocolVersion)
        ? message.params.protocolVersion
        : '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'medreview-admin-planning', version: '1.0.0' },
      instructions:
        'Administrator only. Structured study records only. Never assume missing values are zero. Ask explicit confirmation before important schedule corrections. No deletion.',
    })
  if (message.method === 'ping') return respond({})
  if (message.method === 'tools/list') return respond({ tools: planningTools })
  if (message.method !== 'tools/call')
    return {
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: { code: -32601, message: 'Method not found' },
    }
  const name = message.params?.name,
    args = message.params?.arguments || {},
    definition = planningTools.find((t) => t.name === name)
  try {
    if (!definition) throw new Error('Unknown tool')
    if (
      typeof args !== 'object' ||
      Array.isArray(args) ||
      definition.inputSchema.required.some((k) => args[k] === undefined) ||
      Object.keys(args).some((k) => !(k in definition.inputSchema.properties))
    )
      throw new Error('Invalid structured arguments')
    let result: any
    if (
      name === 'register_study_session' ||
      name === 'complete_activity' ||
      name === 'correct_record'
    ) {
      if (
        typeof args.idempotency_key !== 'string' ||
        args.idempotency_key.length < 8 ||
        args.idempotency_key.length > 200
      )
        throw new Error('Invalid idempotency key')
      if (
        name !== 'register_study_session' &&
        (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.id) ||
          !Number.isInteger(args.expected_revision) ||
          args.expected_revision < 1)
      )
        throw new Error('Identifier and current revision are required')
      const command: Command =
        name === 'register_study_session'
          ? { action: 'create', kind: 'session', data: args.data }
          : name === 'complete_activity'
            ? { action: 'complete', id: args.id, expected_revision: args.expected_revision }
            : {
                action: 'update',
                id: args.id,
                expected_revision: args.expected_revision,
                patch: args.patch,
                confirmed: args.confirmed === true,
              }
      result = await backend.command(command, args.idempotency_key)
    } else {
      const date = day(args.date),
        records = await backend.list()
      if (name === 'consult_tasks_reviews')
        result = {
          date,
          timezone: PLANNING_ZONE,
          tracking_start: PLANNING_START,
          records: records.filter((r) => isPending(r, date)),
        }
      else if (name === 'consult_agenda_plan')
        result = {
          date,
          timezone: PLANNING_ZONE,
          agenda: records.filter(
            (r) => r.kind === 'event' && localDay(String(r.data.starts_at)) === date,
          ),
          studies: records.filter(
            (r) => r.kind === 'session' && localDay(String(r.data.studied_at)) === date,
          ),
          tasks: records.filter(
            (r) =>
              r.kind === 'task' &&
              r.data.scheduled_at &&
              localDay(String(r.data.scheduled_at)) === date,
          ),
          plan: date < PLANNING_START ? null : proposePlan(records, date, 1, now),
        }
      else {
        if (
          args.days !== undefined &&
          (!Number.isInteger(args.days) || args.days < 1 || args.days > 14)
        )
          throw new Error('Invalid horizon')
        result = {
          date,
          through: addDays(date, (args.days || 7) - 1),
          timezone: PLANNING_ZONE,
          ...proposePlan(records, date, args.days || 7, now),
          applied: false,
        }
      }
    }
    return respond({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      isError: false,
    })
  } catch (e) {
    return respond({
      content: [{ type: 'text', text: e instanceof Error ? e.message : 'Operation failed' }],
      isError: true,
    })
  }
}
