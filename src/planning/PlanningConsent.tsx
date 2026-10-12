import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { PLANNING_ADMIN } from './domain'
import './planning.css'
function redirectTrusted(url: string) {
  const target = new URL(url)
  if (target.protocol !== 'https:') throw new Error('Redirecionamento OAuth exige HTTPS.')
  window.location.assign(target.href)
}
export default function PlanningConsent() {
  const [details, setDetails] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    setAllowed(false)
    setDetails(null)
    try {
      if (!authorizationId || !/^[a-zA-Z0-9_-]{1,200}$/.test(authorizationId))
        throw new Error('Solicitação OAuth ausente ou inválida. Inicie a conexão pelo cliente MCP.')
      const { data, error } = await supabase.auth.getUser()
      if (error || data.user?.id !== PLANNING_ADMIN)
        throw new Error('Entre no MedReview com a conta do administrador e tente novamente.')
      setAllowed(true)
      const result = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (result.error)
        throw new Error(
          'O servidor OAuth do Supabase não está habilitado ou a solicitação expirou. Verifique a configuração documentada.',
        )
      setDetails(result.data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [authorizationId])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <main className="mp-consent mp-panel">
      <h1>Conectar ao Planejamento do MedReview</h1>
      <p>
        Autorização exclusiva do administrador. Nenhuma conexão é concluída sem sua decisão e uma
        solicitação válida do servidor OAuth.
      </p>
      {error && (
        <p role="alert" className="mp-alert">
          {error}
        </p>
      )}
      {!allowed && (
        <p>
          <a href="/" target="_blank" rel="noopener noreferrer">
            Entrar no MedReview em outra aba
          </a>
        </p>
      )}
      <button disabled={busy} onClick={() => void load()}>
        {busy ? 'Verificando…' : 'Verificar minha sessão e solicitação'}
      </button>
      {allowed && details && (
        <section>
          <h2>{details.client?.name || 'Cliente OAuth'}</h2>
          {(details.redirect_uri || details.redirect_url) && (
            <p>
              Aplicativo de destino: {new URL(details.redirect_uri || details.redirect_url).origin}
            </p>
          )}
          {details.scope && <p>Permissões solicitadas: {details.scope}</p>}
          <p>
            As ferramentas podem consultar sua agenda, registrar estudos, concluir atividades e
            corrigir registros. Mudanças importantes no cronograma exigem confirmação explícita;
            exclusões não estão disponíveis.
          </p>
          <div className="mp-actions">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  if (details.redirect_url) {
                    redirectTrusted(details.redirect_url)
                    return
                  }
                  const { data, error } = await supabase.auth.oauth.approveAuthorization(
                    authorizationId!,
                    { skipBrowserRedirect: true },
                  )
                  if (error) throw error
                  redirectTrusted(data.redirect_url)
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Autorizar conexão
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const { data, error } = await supabase.auth.oauth.denyAuthorization(
                    authorizationId!,
                    { skipBrowserRedirect: true },
                  )
                  if (error) throw error
                  redirectTrusted(data.redirect_url)
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Negar
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
