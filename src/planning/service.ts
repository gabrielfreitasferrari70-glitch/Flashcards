import { scheduleCsv } from './imports'
import { supabase } from '@/lib/supabase/client'
import type { Command, PlanningRecord } from './domain'
export async function loadPlanning(): Promise<PlanningRecord[]> {
  const result: PlanningRecord[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('mr_planning_records')
      .select('*')
      .order('created_at')
      .order('id')
      .range(from, from + 499)
    if (error)
      throw new Error(
        error.code === '42P01' || error.code === 'PGRST205'
          ? 'Planejamento ainda não configurado no banco. Aplique a migração 003_admin_planning.sql conforme a documentação.'
          : error.message,
      )
    result.push(...(data as PlanningRecord[]))
    if (data.length < 500) return result
  }
}
export async function savePlanning(command: Command, key: string) {
  const { data, error } = await supabase.rpc('mr_planning_command', {
    command,
    idempotency_key: key,
  })
  if (error) throw new Error(error.message)
  return data as { record?: PlanningRecord; records?: unknown[]; reviews?: PlanningRecord[] }
}
export function exportPlanning(records: PlanningRecord[]) {
  return {
    format: 'medreview-planning-v1',
    derived_reviews: 'read_only_existing_series_are_preserved_on_import',
    reviews: records
      .filter((r) => r.kind === 'review')
      .map((r) => ({ id: r.id, data: r.data, revision: r.revision })),
    timezone: 'America/Cuiaba',
    tracking_start: '2026-10-12',
    records: records
      .filter((r) => r.kind !== 'review')
      .sort((a, b) => Number(b.kind === 'settings') - Number(a.kind === 'settings'))
      .map((r) => ({ id: r.id, kind: r.kind, data: r.data, revision: r.revision })),
  }
}
export function previewImport(text: string, existing: PlanningRecord[]): Command[] {
  if (text.length > 500000) throw new Error('Arquivo excede 500 KB.')
  const parsed = text.trimStart().startsWith('{') ? JSON.parse(text) : scheduleCsv(text)
  if (parsed.format === 'medreview-planning-operations-v1') {
    if (
      typeof parsed.idempotency_key !== 'string' ||
      parsed.idempotency_key.length < 8 ||
      parsed.idempotency_key.length > 200 ||
      !Array.isArray(parsed.commands) ||
      parsed.commands.length > 200 ||
      parsed.commands.some(
        (c: Command) => !c || !['create', 'update', 'complete'].includes(c.action),
      )
    )
      throw new Error(
        'Operações exigem uma chave estável e até 200 comandos de criação, correção ou conclusão.',
      )
    return parsed.commands
  }
  if (
    parsed.format !== 'medreview-planning-v1' ||
    !Array.isArray(parsed.records) ||
    parsed.records.length > 200
  )
    throw new Error('Use medreview-planning-v1, com até 200 registros por arquivo.')
  return parsed.records.map(
    (r: { id?: string; kind: PlanningRecord['kind']; data: PlanningRecord['data'] }) => {
      if (
        !['session', 'event', 'task', 'material', 'settings'].includes(r.kind) ||
        !r.data ||
        typeof r.data !== 'object' ||
        Array.isArray(r.data)
      )
        throw new Error(
          'Tipo/dados inválidos. Revisões são geradas pelo servidor; não importe séries duplicadas.',
        )
      const found = r.id && existing.find((x) => x.id === r.id)
      if (found && found.kind !== r.kind)
        throw new Error('Identificador pertence a outro tipo de registro.')
      return found
        ? {
            action: 'update',
            id: found.id,
            expected_revision: found.revision,
            patch: r.data,
            confirmed: true,
          }
        : { action: 'create', kind: r.kind, data: r.data, ...(r.id ? { id: r.id } : {}) }
    },
  )
}

export function importIdempotencyKey(text: string): string | undefined {
  if (!text.trimStart().startsWith('{')) return undefined
  const parsed = JSON.parse(text)
  return parsed.format === 'medreview-planning-operations-v1' ? parsed.idempotency_key : undefined
}
