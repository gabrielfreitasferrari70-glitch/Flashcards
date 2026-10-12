// --no-verify-jwt disables only the gateway check. Every request is still
// explicitly validated with Auth.getUser(), then the immutable admin UUID.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { planningMcpHttp } from '../../../src/planning/mcpHttp.ts'
Deno.serve((request: Request) => planningMcpHttp(request, async token => {
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await client.auth.getUser(token)
 if(error||!data.user)return null
 return {userId:data.user.id,backend:{
  list:async()=>{const all=[];for(let from=0;;from+=500){const {data,error}=await client.from('mr_planning_records').select('*').order('created_at').order('id').range(from,from+499);if(error)throw new Error(error.message);all.push(...data);if(data.length<500)return all}},
  command:async(command,key)=>{const {data,error}=await client.rpc('mr_planning_command',{command,idempotency_key:key});if(error)throw new Error(error.message);return data},
 }}
},(Deno.env.get('PLANNING_ALLOWED_ORIGINS') || Deno.env.get('PLANNING_SITE_ORIGIN') || '').split(',').map(s=>s.trim()).filter(Boolean), Deno.env.get('PLANNING_OAUTH_ISSUER') && Deno.env.get('PLANNING_MCP_PUBLIC_URL') ? { issuer: Deno.env.get('PLANNING_OAUTH_ISSUER')!, resource: Deno.env.get('PLANNING_MCP_PUBLIC_URL')! } : undefined))
