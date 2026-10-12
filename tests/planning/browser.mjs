// Local E2E: fake Auth/catalog responses, REAL PostgreSQL persistence and RPC.
// Does not connect to or modify the production Supabase database.
import { chromium } from 'playwright-core'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const admin='2c337bd5-b283-4ce8-9c0a-c817e4cdd697',student='11111111-1111-4111-8111-111111111111'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${admin}'),('${student}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
await db.exec(readFileSync(new URL('../../supabase/migrations/003_admin_planning.sql',import.meta.url),'utf8'))
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']})
const artifact=process.env.PLANNING_SCREENSHOTS||'/tmp/medreview-planning-screenshots';mkdirSync(artifact,{recursive:true})
let sql=Promise.resolve()
try{
 for(const [name,id,viewport] of [['desktop',admin,{width:1440,height:1000}],['iphone',admin,{width:390,height:844}],['student',student,{width:390,height:844}]]){
  const context=await browser.newContext({viewport,timezoneId:'America/Cuiaba'});const page=await context.newPage();page.setDefaultTimeout(20000)
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  const user={id,email:id===admin?'gabrielfreitasferrari70@gmail.com':'student@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:{name:'Teste'},app_metadata:{provider:'email'},created_at:new Date().toISOString()}
  const token=[{alg:'HS256',typ:'JWT'},{sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'test'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.')
  await context.route('**/catalog.json',route=>route.fulfill({json:{cards:[],decks:[]}}))
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data=[]
   if(url.pathname.endsWith('/token'))data={access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fixture',user}
   else if(url.pathname.endsWith('/user'))data=user
   else if(url.pathname.includes('/profiles'))data={id,name:'Teste',approved:true}
   else if(url.pathname.includes('/mr_planning')){
    let failure=null
    sql=sql.then(async()=>{
     await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)
     try{
      if(url.pathname.includes('/rpc/')){const body=req.postDataJSON();data=(await db.query('select public.mr_planning_command($1::jsonb,$2) result',[JSON.stringify(body.command),body.idempotency_key])).rows[0].result}
      else if(url.pathname.includes('history'))data=(await db.query('select * from public.mr_planning_history where record_id=$1',[url.searchParams.get('record_id')?.slice(3)])).rows
      else {const offset=Number(url.searchParams.get('offset')||0);data=(await db.query('select * from public.mr_planning_records order by created_at,id limit 500 offset $1',[offset])).rows}
     }catch(e){failure=e.message}
    });await sql
    if(failure)return route.fulfill({status:400,json:{message:failure,code:'P0001'}})
   }
   return route.fulfill({status:200,json:data,headers:{'access-control-allow-origin':'*'}})
  })
  await page.goto(process.env.PLANNING_BASE_URL||'http://127.0.0.1:8082/',{waitUntil:'networkidle'})
  await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Senha',{exact:true}).fill('fixture-only');await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click()
  if(id===student){await page.getByRole('heading',{name:'Um passo a mais na sua preparação.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Planejamento',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:/Docente/}).count(),0);await context.close();console.log('PASS student: administrative entry absent');continue}
  await page.getByRole('button',{name:/Docente/}).click();await page.getByRole('button',{name:'Planejamento',exact:true}).click();await page.getByRole('button',{name:'Revisões',exact:true}).click()
  await page.getByLabel('Dias após o estudo (separados por vírgula)').fill('1, 7')
  page.on('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();await page.getByRole('status').filter({hasText:'Salvo e confirmado'}).waitFor()
  await page.getByRole('button',{name:'Estudos',exact:true}).click();await page.getByRole('button',{name:'Novo registro',exact:true}).click()
  await page.getByLabel('Disciplina',{exact:true}).fill('Medicina')
  await page.getByLabel('Assunto',{exact:true}).fill('Fluxo persistente '+name)
  await page.getByLabel('Data do estudo (Cuiabá)').fill('2026-10-12T08:00')
  await page.getByLabel('Duração em minutos').fill('45');await page.getByLabel('Questões respondidas').fill('10');await page.getByLabel('Acertos',{exact:true}).fill('0')
  await page.getByRole('button',{name:'Salvar registro',exact:true}).click();await page.getByRole('heading',{name:'Fluxo persistente '+name,exact:true}).waitFor()
  const before=(await db.query("select id from public.mr_planning_records where kind='session'")).rows.length
  await page.getByRole('button',{name:'Fechar planejamento'}).click();await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Docente/}).click();await page.getByRole('button',{name:'Planejamento',exact:true}).click();await page.getByRole('button',{name:'Estudos',exact:true}).click();await page.getByRole('heading',{name:'Fluxo persistente '+name,exact:true}).waitFor()
  assert.equal((await db.query("select id from public.mr_planning_records where kind='session'")).rows.length,before)
  await page.getByRole('button',{name:'Desempenho',exact:true}).click();assert(await page.getByText('0.0% · 0/10 questões',{exact:true}).count()>0)
  assert(await page.locator('.mp-shell').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Planning must fit the iPhone viewport')
  await page.screenshot({path:artifact+'/'+name+'-performance.png',fullPage:true})
  await page.getByRole('button',{name:'Revisões',exact:true}).click();await page.getByLabel('Data de referência').fill('2026-10-13');await page.getByText('Fila até 2026-10-13').waitFor();assert(await page.getByRole('button',{name:'Concluir',exact:true}).count()>0)
  await page.getByRole('button',{name:'Concluir',exact:true}).first().click();await page.getByRole('status').filter({hasText:'Salvo e confirmado'}).waitFor()
  await page.getByRole('button',{name:'Semana',exact:true}).click();await page.screenshot({path:artifact+'/'+name+'-week.png',fullPage:true});assert.equal(errors.length,0,errors.join(';'))
  await context.close();console.log('PASS '+name+': session saved in PostgreSQL, found after reload, zero accuracy preserved, review completed, mobile layout')
 }
}finally{await browser.close();await db.close()}
