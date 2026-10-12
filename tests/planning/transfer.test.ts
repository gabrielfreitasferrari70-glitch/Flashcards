import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/client',()=>({supabase:{}}))
import { exportPlanning, previewImport, importIdempotencyKey } from '../../src/planning/service'
import type { PlanningRecord } from '../../src/planning/domain'
it('manual conversation operations preserve their idempotency key and exact commands across retries',()=>{
 const commands=[{action:'create',kind:'session',data:{subject:'Medicina',topic:'Assunto informado',studied_at:'2026-10-12T12:00:00Z',questions:0,correct:0}}]
 const text=JSON.stringify({format:'medreview-planning-operations-v1',idempotency_key:'manual-conversation-1',commands})
 expect(previewImport(text,[])).toEqual(commands)
 expect(importIdempotencyKey(text)).toBe('manual-conversation-1')
 expect(()=>previewImport(JSON.stringify({format:'medreview-planning-operations-v1',commands}),[])).toThrow()
})
it('exports source records and read-only review identifiers; import retains stable source IDs',()=>{
 const common={owner_id:'admin',revision:1,created_at:'',updated_at:''}
 const records:PlanningRecord[]=[{...common,id:'11111111-1111-4111-8111-111111111111',kind:'session',data:{subject:'X',topic:'Y',studied_at:'2026-10-12T12:00:00Z'}},{...common,id:'22222222-2222-4222-8222-222222222222',kind:'review',data:{session_id:'11111111-1111-4111-8111-111111111111',due_on:'2026-10-13'}}]
 const exported=exportPlanning(records)
 expect(exported.records).toHaveLength(1);expect(exported.reviews[0].id).toBe(records[1].id)
 const commands=previewImport(JSON.stringify(exported),[])
 expect(commands[0]).toMatchObject({action:'create',id:records[0].id})
})
