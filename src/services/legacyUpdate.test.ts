import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const html = readFileSync(new URL('../../public/atualizar.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]

afterEach(() => vi.useRealTimers())

function recovery(ok = true) {
  const version = '1234567890abcdef1234'
  const origin = 'https://medreview.example'
  let click!: () => Promise<void>
  const button = {
    disabled: false,
    addEventListener: (_: string, handler: typeof click) => {
      click = handler
    },
  }
  const status = { textContent: '' }
  const storage = { clear: vi.fn(), removeItem: vi.fn() }
  const replace = vi.fn()
  const fetch = vi.fn(async () => ({ ok, json: async () => ({ version }) }))
  const active = { state: 'activated', scriptURL: `${origin}/sw.js?release=${version}` }
  const update = vi.fn(async () => {})
  const register = vi.fn(async () => ({ active, update }))
  runInNewContext(script, {
    document: { getElementById: (id: string) => (id === 'update' ? button : status) },
    fetch,
    URL,
    Date,
    setInterval,
    clearInterval,
    navigator: { serviceWorker: { register, controller: active } },
    location: { origin, replace },
    localStorage: storage,
  })
  return { click, fetch, register, update, replace, storage, status, button, version }
}

describe('legacy browser recovery', () => {
  it('bypasses stale URLs and waits for the versioned worker without clearing account data', async () => {
    vi.useFakeTimers()
    const r = recovery()
    const done = r.click()
    await vi.advanceTimersByTimeAsync(200)
    await done
    expect(r.fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/version\.json\?check=\d+$/), {
      cache: 'no-store',
    })
    expect(r.register).toHaveBeenCalledWith(`/sw.js?release=${r.version}`, {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(r.replace).toHaveBeenCalledWith(`/?mr_release=${r.version}`)
    expect(r.storage.clear).not.toHaveBeenCalled()
    expect(r.storage.removeItem).not.toHaveBeenCalled()
  })

  it('allows retry after a network failure and does not open an unverified version', async () => {
    const r = recovery(false)
    await r.click()
    expect(r.button.disabled).toBe(false)
    expect(r.status.textContent).toContain('não está disponível')
    expect(r.register).not.toHaveBeenCalled()
    expect(r.replace).not.toHaveBeenCalled()
  })
})
