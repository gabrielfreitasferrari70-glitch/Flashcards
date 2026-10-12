import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { database, command, ADMIN, STUDENT } from './database'
let db:PGlite
beforeAll(async()=>{db=await database()},30000)
afterAll(async()=>{await db?.close()})
const session=(at='2026-10-12T04:00:00Z',topic='Anatomia')=>({action:'create',kind:'session',data:{subject:'Medicina',topic,studied_at:at,questions:0,correct:0}})
describe('PostgreSQL planning transactions and server authorization',()=>{
 it('creates a session and review series atomically and retries without duplicates',async()=>{
  await command(db,{action:'create',kind:'settings',data:{review_days:[1,7,30],availability:[]}})
  const key=crypto.randomUUID(),input=session()
  const first=await command(db,input,key),second=await command(db,input,key)
  expect(second).toEqual(first);expect(first.reviews).toHaveLength(3)
  expect(first.reviews.map((r:any)=>r.data.due_on)).toEqual(['2026-10-13','2026-10-19','2026-11-11'])
  expect(first.record.data.questions).toBe(0);expect(first.record.data.duration_minutes).toBeUndefined()
  expect((await db.query<{n:number}>("select count(*)::int n from public.mr_planning_records where kind='session'")).rows[0].n).toBe(1)
  await expect(command(db,{...input,data:{...input.data,questions:1}},key)).rejects.toThrow('Chave já utilizada')
  const another=await command(db,input)
  expect(another.record.id).toBe(first.record.id);expect(another.reviews).toHaveLength(0)
  const partial=await command(db,{action:'create',kind:'session',data:{subject:'Medicina',topic:'Anatomia',studied_at:'2026-10-12T00:00:00-04:00'}})
  expect(partial.record.id).toBe(first.record.id);expect(partial.record.data.correct).toBe(0);expect(partial.reviews).toHaveLength(0)
 })
 it('uses the Cuiaba midnight boundary and never creates historical backlog',async()=>{
  const old=await command(db,session('2026-10-12T03:59:59Z','Histórico'))
  expect(old.reviews).toHaveLength(0)
  const current=await command(db,session('2026-10-12T04:00:00Z','Marco inicial'))
  expect(current.reviews[0].data.due_on).toBe('2026-10-13')
 })
 it('does not modify earlier series when intervals change',async()=>{
  const settings=(await db.query<any>("select * from public.mr_planning_records where kind='settings'")).rows[0]
  await command(db,{action:'update',id:settings.id,expected_revision:settings.revision,patch:{review_days:[2,9]},confirmed:true})
  const original=(await db.query<any>("select * from public.mr_planning_records where kind='session' and data->>'topic'='Anatomia'")).rows[0]
  const replay=await command(db,session())
  expect(replay.record.id).toBe(original.id);expect(replay.reviews).toHaveLength(0)
  expect((await db.query("select * from public.mr_planning_records where kind='review' and data->>'session_id'=$1",[original.id])).rows).toHaveLength(3)
  const created=await command(db,session('2026-10-13T04:00:00Z','Novos intervalos'))
  expect(created.reviews.map((r:any)=>r.data.interval_days)).toEqual([2,9])
  expect((await db.query<{n:number}>("select count(*)::int n from public.mr_planning_records where kind='review' and data->>'interval_days'='30'")).rows[0].n).toBe(2)
 })
 it('denies anonymous, nonadmin reads/writes and direct authenticated writes',async()=>{
  await db.exec(`select set_config('request.jwt.claim.sub','${STUDENT}',false)`)
  expect((await db.query('select * from public.mr_planning_records')).rows).toHaveLength(0)
  expect((await db.query('select * from public.mr_planning_history')).rows).toHaveLength(0)
  await expect(command(db,session())).rejects.toThrow('Acesso exclusivo')
  await expect(db.query("insert into public.mr_planning_records(owner_id,kind,data) values($1,'material','{}')",[STUDENT])).rejects.toThrow('permission denied')
  await db.exec('reset role; set role anon')
  await expect(command(db,session())).rejects.toThrow('permission denied')
  await expect(db.query('select * from public.mr_planning_records')).rejects.toThrow('permission denied')
  await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${ADMIN}',false)`)
 })
 it('validates data, confirmation and optimistic revisions, recording audit history',async()=>{
  await expect(command(db,{action:'create',kind:'session',data:{subject:'X',topic:'Y',studied_at:'2026-10-12T08:00',questions:1,correct:2}})).rejects.toThrow()
  const r=(await command(db,{action:'create',kind:'event',data:{title:'Compromisso real de teste',event_type:'class',starts_at:'2026-10-12T12:00:00Z',ends_at:'2026-10-12T13:00:00Z'}})).record
  await expect(command(db,{action:'update',id:r.id,expected_revision:1,patch:{starts_at:'2026-10-12T12:30:00Z'}})).rejects.toThrow('Confirme')
  const updated=await command(db,{action:'update',id:r.id,expected_revision:1,patch:{attendance:'attended'}})
  expect(updated.record.revision).toBe(2)
  await expect(command(db,{action:'complete',id:r.id,expected_revision:2})).rejects.toThrow('Presença')
  await expect(command(db,{action:'update',id:r.id,expected_revision:1,patch:{title:'Outra'}})).rejects.toThrow('outro dispositivo')
  expect((await db.query('select * from public.mr_planning_history where record_id=$1',[r.id])).rows).toHaveLength(2)
 })
 it('requires import confirmation and rolls back the entire batch on invalid data',async()=>{
  await expect(command(db,{action:'import',records:[]})).rejects.toThrow('confirmação')
  await expect(command(db,{action:'import',confirmed:true,records:[{action:'create',kind:'material',data:{title:'Não deve ser salvo'}},{action:'create',kind:'session',data:{subject:'Inválida'}}]})).rejects.toThrow()
  expect((await db.query("select * from public.mr_planning_records where data->>'title'='Não deve ser salvo'")).rows).toHaveLength(0)
 })
 it('rejects conflicting schedules and requires configured availability and explicit changes',async()=>{
  const settings=(await db.query<any>("select * from public.mr_planning_records where kind='settings'")).rows[0]
  await command(db,{action:'update',id:settings.id,expected_revision:settings.revision,patch:{availability:[{weekday:1,start:'08:00',end:'12:00'}]}})
  const task=(topic:string,at:string)=>({action:'create',kind:'task',data:{subject:'Medicina',topic,estimated_minutes:60,scheduled_at:at}})
  const manual=(await command(db,task('Manual','2026-10-12T14:00:00Z'))).record
  await expect(command(db,task('Sobreposição','2026-10-12T14:30:00Z'))).rejects.toThrow('conflita')
  await expect(command(db,task('Fora da janela','2026-10-12T16:00:00Z'))).rejects.toThrow('disponibilidade')
  await expect(command(db,{action:'update',id:manual.id,expected_revision:1,patch:{scheduled_at:'2026-10-12T13:00:00Z'}})).rejects.toThrow('Confirme')
 })
 it('survives closing the database and reopens with the same identifiers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'medreview-planning-'));const disk=await database(dir)
  const saved=await command(disk,session('2026-10-12T05:00:00Z','Persistente'))
  await disk.close();const reopened=new PGlite(dir)
  expect((await reopened.query<any>('select id,data from public.mr_planning_records where id=$1',[saved.record.id])).rows[0].data.topic).toBe('Persistente')
  await reopened.close();await rm(dir,{recursive:true,force:true})
 },30000)
})
