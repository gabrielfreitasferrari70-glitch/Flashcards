import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { watchAppUpdates } from '@/services/appUpdates'

export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (import.meta.env.PROD) return watchAppUpdates(__APP_VERSION__, () => setAvailable(true))
  }, [])
  if (!available) return null
  return (
    <aside className="mr-app-update" role="status" aria-live="polite">
      <div>
        <strong>Uma nova versão está disponível</strong>
        <p>Conclua sua revisão e atualize para receber as melhorias.</p>
      </div>
      <button type="button" onClick={() => window.location.assign('/atualizar.html')}>
        <RefreshCw size={16} aria-hidden="true" /> Atualizar aplicativo
      </button>
    </aside>
  )
}
