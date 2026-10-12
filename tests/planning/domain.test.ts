import { describe, expect, it } from 'vitest'
import { localDay, localInstant, proposePlan, performance, isPending, type PlanningRecord } from '../../src/planning/domain'
const r=(id:string,kind:PlanningRecord['kind'],data:PlanningRecord['data']):PlanningRecord=>({id,kind,data,owner_id:'admin',revision:1,created_at:'',updated_at:''})
describe('Planning dates and suggestions',()=>{
 it('uses Cuiaba instead of the device zone and rejects nonexistent dates',()=>{
  expect(localInstant('2026-10-12T00:00')).toBe('2026-10-12T04:00:00.000Z')
  expect(localDay('2026-10-12T03:59:59Z')).toBe('2026-10-11')
  expect(()=>localInstant('2026-02-30T08:00')).toThrow()
  expect(isPending(r('old','review',{due_on:'2026-10-11'}),'2026-10-12')).toBe(false)
 })
 it('respects fixed events, manual tasks, duration and exam deadlines',()=>{
  const records=[r('prefs','settings',{review_days:[3,8],availability:[{weekday:1,start:'08:00',end:'12:00'}]}),r('class','event',{starts_at:'2026-10-12T12:00:00Z',ends_at:'2026-10-12T13:00:00Z'}),r('manual','task',{subject:'X',topic:'Manual',scheduled_at:'2026-10-12T13:00:00Z',estimated_minutes:60}),r('task','task',{subject:'X',topic:'Estudo',estimated_minutes:60,priority:5}),r('exam','event',{subject:'X',event_type:'exam',starts_at:'2026-10-12T15:00:00Z',ends_at:'2026-10-12T16:00:00Z'}),r('long','task',{subject:'X',topic:'Não cabe',estimated_minutes:180,priority:1})]
  const snapshot=JSON.stringify(records);const p=proposePlan(records,'2026-10-12',1,new Date('2026-10-12T04:00:00Z'))
  expect(p.suggestions[0].starts_at).toBe('2026-10-12T14:00:00.000Z')
  expect(p.suggestions[0].reason).toContain('antes da prova')
  expect(p.unscheduled).toHaveLength(2);expect(JSON.stringify(records)).toBe(snapshot)
 })
 it('preserves unknown versus zero metrics and excludes history from current performance',()=>{
  const stats=performance([r('old','session',{subject:'X',topic:'Y',studied_at:'2026-10-11T12:00:00Z',duration_minutes:99}),r('a','session',{subject:'X',topic:'Y',studied_at:'2026-10-12T12:00:00Z'}),r('b','session',{subject:'X',topic:'Y',studied_at:'2026-10-12T13:00:00Z',duration_minutes:30,questions:10,correct:0})])
  expect(stats[0].accuracy).toBe(0);expect(stats[0].sessions).toBe(2);expect(stats[0].timed).toBe(1);expect(stats[0].minutes).toBe(30)
 })
})
it('does not present missing availability as zero available minutes',()=>{
 expect(proposePlan([],'2026-10-12',1,new Date('2026-10-12T04:00:00Z')).freeMinutes).toBeNull()
 expect(proposePlan([r('prefs','settings',{review_days:[],availability:[]})],'2026-10-12',1,new Date('2026-10-12T04:00:00Z')).freeMinutes).toBe(0)
})
