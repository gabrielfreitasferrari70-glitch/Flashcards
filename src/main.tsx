/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './main.css'
import './styles/refinement.css'

// Version the registration URL too: older browsers may retain an outdated worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registerWorker = () => {
    void navigator.serviceWorker
      .register(`/sw.js?release=${__APP_VERSION__}`, { updateViaCache: 'none' })
      .catch((error) => console.warn('[PWA] Falha ao registrar Service Worker:', error))
  }
  if (document.readyState === 'complete') registerWorker()
  else window.addEventListener('load', registerWorker, { once: true })
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
