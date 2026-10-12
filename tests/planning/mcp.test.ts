import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { database, command, ADMIN, STUDENT } from './database'
import { planningMcpHttp } from '../../src/planning/mcpHttp'
import { PGlite } from '@electric-sql/pglite'
let db:PGlite
beforeAll(async()=>{db=await database()},30000)
afterAll(async()=>{await db?.close()})
const backend={list:async()=>(await db.query<any>('select * from public.mr_planning_records')).rows,command:(c:any,key:string)=>command(db,c,key)}
const authenticate=async(token:string)=>token==='admin'?{userId:ADMIN,backend}:token==='student'?{userId:STUDENT,backend}:null
function request(message:unknown,token?:string,origin?:string){return new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(message)})}
describe('Authenticated MCP uses the same database transactions',()=>{
 it('denies anonymous, invalid and nonadmin tokens before tool discovery or mutation',async()=>{
  const m={jsonrpc:'2.0',id:1,method:'tools/list'}
  expect((await planningMcpHttp(request(m),authenticate)).status).toBe(401)
  expect((await planningMcpHttp(request(m,'forged'),authenticate)).status).toBe(401)
  expect((await planningMcpHttp(request(m,'student'),authenticate)).status).toBe(403)
  expect((await planningMcpHttp(request(m,'admin','https://attacker.test'),authenticate,'https://medreview.test')).status).toBe(403)
 })
 it('initializes and exposes all six tools only after administrator authentication',async()=>{
  const response=await planningMcpHttp(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'}},'admin'),authenticate)
  expect((await response.json()).result.protocolVersion).toBe('2025-03-26')
  const tools=await (await planningMcpHttp(request({jsonrpc:'2.0',id:2,method:'tools/list'},'admin'),authenticate)).json()
  expect(tools.result.tools).toHaveLength(6)
 })
 it('registers zero correctly, retries with the same id and queries the saved data',async()=>{
  const m={jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'register_study_session',arguments:{idempotency_key:'conversation-op-1',data:{subject:'Medicina',topic:'Assunto real',studied_at:'2026-10-12T12:00:00Z',questions:0,correct:0}}}}
  const first=await (await planningMcpHttp(request(m,'admin'),authenticate)).json()
  const second=await (await planningMcpHttp(request(m,'admin'),authenticate)).json()
  expect(first.result.isError).toBe(false);expect(second.result.structuredContent.record.id).toBe(first.result.structuredContent.record.id)
  expect(first.result.structuredContent.record.data).not.toHaveProperty('duration_minutes')
  expect((await backend.list())[0].data.correct).toBe(0)
 })
 it('returns proposal reasons without writing and does not accept deletion tools',async()=>{
  const before=(await backend.list()).length
  const proposal=await (await planningMcpHttp(request({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'propose_reorganization',arguments:{date:'2026-10-12'}}},'admin'),authenticate)).json()
  expect(proposal.result.structuredContent.applied).toBe(false);expect((await backend.list()).length).toBe(before)
  const deletion=await (await planningMcpHttp(request({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'delete_record',arguments:{}}},'admin'),authenticate)).json()
  expect(deletion.result.isError).toBe(true)
 })
})
it('advertises configured OAuth resource metadata without exposing planning data',async()=>{
 const oauth={resource:'https://project.supabase.co/functions/v1/planning-mcp',issuer:'https://project.supabase.co/auth/v1'}
 const metadata=await planningMcpHttp(new Request(oauth.resource+'?metadata=1'),authenticate,undefined,oauth)
 expect(metadata.status).toBe(200)
 expect((await metadata.json()).authorization_servers).toEqual([oauth.issuer])
 const denied=await planningMcpHttp(request({jsonrpc:'2.0',id:1,method:'tools/list'}),authenticate,undefined,oauth)
 expect(denied.status).toBe(401);expect(denied.headers.get('www-authenticate')).toContain('resource_metadata')
})
