import { expect, it } from 'vitest'
import { scheduleCsv } from '../../src/planning/imports'
it('previews quoted schedule titles and converts explicit local times without inventing events',()=>{
 const result=scheduleCsv('title,event_type,starts_at,ends_at,subject\r\n"Aula, UC2",class,2026-10-12T08:00,2026-10-12T09:00,Medicina')
 expect(result.records[0].data.title).toBe('Aula, UC2')
 expect(result.records[0].data.starts_at).toBe('2026-10-12T12:00:00.000Z')
 expect(result.records[0].data).not.toHaveProperty('attendance')
 expect(scheduleCsv('title,event_type,starts_at,ends_at\n').records).toHaveLength(0)
})
it('rejects missing calendar data and invalid times instead of filling gaps',()=>{
 expect(()=>scheduleCsv('title,event_type,starts_at,ends_at\nAula,class,,')).toThrow()
 expect(()=>scheduleCsv('title,event_type,starts_at,ends_at\nAula,class,2026-02-30T08:00,2026-02-30T09:00')).toThrow()
})
