import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
export const ADMIN = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'
export const STUDENT = '11111111-1111-4111-8111-111111111111'
export async function database(path?: string) {
 const db = new PGlite(path)
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${ADMIN}'),('${STUDENT}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
 await db.exec(readFileSync(new URL('../../supabase/migrations/003_admin_planning.sql',import.meta.url),'utf8'))
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${ADMIN}',false)`)
 return db
}
export async function command(db:PGlite, data:unknown, key=crypto.randomUUID()) {
 const result=await db.query<{result:any}>('select public.mr_planning_command($1::jsonb,$2) as result',[JSON.stringify(data),key])
 return result.rows[0].result
}
