import { handlePlanningMcp, type PlanningBackend } from './mcp.ts'
import { PLANNING_ADMIN } from './domain.ts'
export async function planningMcpHttp(
  request: Request,
  authenticate: (token: string) => Promise<{ userId: string; backend: PlanningBackend } | null>,
  siteOrigin?: string | string[],
  oauth?: { resource: string; issuer: string },
) {
  const origin = request.headers.get('origin')
  const allowedOrigins = Array.isArray(siteOrigin) ? siteOrigin : siteOrigin ? [siteOrigin] : []
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
  const challenge = oauth ? `Bearer resource_metadata="${oauth.resource}?metadata=1"` : 'Bearer'
  if (
    request.method === 'GET' &&
    new URL(request.url).searchParams.get('metadata') === '1' &&
    oauth
  ) {
    return new Response(
      JSON.stringify({
        resource: oauth.resource,
        authorization_servers: [oauth.issuer],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email'],
      }),
      { headers: { ...headers, 'Access-Control-Allow-Origin': '*' } },
    )
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization,content-type,mcp-protocol-version'
    headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS'
  }
  const error = (status: number, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: status === 401 ? { ...headers, 'WWW-Authenticate': challenge } : headers,
    })
  if (origin && !allowedOrigins.includes(origin)) return error(403, 'Origin not allowed')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST')
    return new Response(
      JSON.stringify({
        error: 'Use authenticated POST JSON-RPC; SSE subscriptions are not supported.',
      }),
      { status: 405, headers: { ...headers, Allow: 'POST,OPTIONS' } },
    )
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer '))
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...headers, 'WWW-Authenticate': challenge },
    })
  let actor
  try {
    actor = await authenticate(bearer.slice(7))
  } catch {
    return error(401, 'Invalid authentication')
  }
  if (!actor) return error(401, 'Invalid or expired authentication')
  if (actor.userId !== PLANNING_ADMIN) return error(403, 'Administrator only')
  if (!request.headers.get('content-type')?.includes('application/json'))
    return error(415, 'JSON required')
  try {
    const body = await request.text()
    if (body.length > 500000) return error(413, 'Payload too large')
    const result = await handlePlanningMcp(JSON.parse(body), actor.backend)
    return new Response(result === null ? null : JSON.stringify(result), {
      status: result === null ? 202 : 200,
      headers,
    })
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Invalid JSON request' },
      }),
      { status: 400, headers },
    )
  }
}
