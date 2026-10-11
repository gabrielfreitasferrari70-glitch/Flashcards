export async function publishedVersion(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return null
    const data = await response.json()
    return typeof data.version === 'string' && data.version.length > 0 ? data.version : null
  } catch {
    // Offline and older deployments without a manifest remain usable.
    return null
  }
}

export function watchAppUpdates(currentVersion: string, onUpdate: () => void) {
  let stopped = false
  let checking = false
  const compare = (version: string | null) => {
    if (!stopped && version && version !== currentVersion) onUpdate()
  }
  const check = async () => {
    if (checking || document.visibilityState === 'hidden' || !navigator.onLine) return
    checking = true
    try {
      compare(await publishedVersion())
      // Also discover worker updates after a long-lived tab comes back online.
      const registration = await navigator.serviceWorker?.getRegistration()
      if (!stopped) await registration?.update()
    } catch {
      // A failed worker check must not interrupt the user's study session.
    } finally {
      checking = false
    }
  }
  const message = (event: MessageEvent) => {
    if (event.data?.type === 'APP_VERSION' && typeof event.data.version === 'string')
      compare(event.data.version)
  }
  const visible = () => {
    if (document.visibilityState === 'visible') void check()
  }
  const refresh = () => {
    void check()
  }
  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  document.addEventListener('visibilitychange', visible)
  navigator.serviceWorker?.addEventListener('message', message)
  const interval = window.setInterval(refresh, 60000)
  void check()
  return () => {
    stopped = true
    window.clearInterval(interval)
    window.removeEventListener('focus', refresh)
    window.removeEventListener('online', refresh)
    document.removeEventListener('visibilitychange', visible)
    navigator.serviceWorker?.removeEventListener('message', message)
  }
}
