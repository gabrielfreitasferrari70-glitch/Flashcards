import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishedVersion, watchAppUpdates } from './appUpdates'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('publishedVersion', () => {
  it('bypasses HTTP cache when checking the release', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 'new' }) })
    vi.stubGlobal('fetch', fetch)
    expect(await publishedVersion()).toBe('new')
    expect(fetch).toHaveBeenCalledWith(
      '/version.json',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it.each(['offline', 'html', 'missing', 'invalid'])(
    'ignores %s without interrupting study',
    async (failure) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (failure === 'offline') throw new Error('offline')
          return {
            ok: failure !== 'missing',
            json: async () => {
              if (failure === 'html') throw new SyntaxError('HTML fallback')
              return { version: 42 }
            },
          }
        }),
      )
      expect(await publishedVersion()).toBeNull()
    },
  )
})

describe('watchAppUpdates', () => {
  it('notifies separate sessions on return to the app and stops after cleanup', async () => {
    vi.useFakeTimers()
    const windowEvents = new EventTarget()
    vi.stubGlobal('window', Object.assign(windowEvents, { setInterval, clearInterval }))
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
    vi.stubGlobal('navigator', { onLine: true })
    let version = 'current'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ version }) })),
    )
    const a = vi.fn(),
      b = vi.fn()
    const stopA = watchAppUpdates('current', a)
    const stopB = watchAppUpdates('current', b)
    await vi.advanceTimersByTimeAsync(0)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
    version = 'next'
    windowEvents.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    stopA()
    stopB()
    windowEvents.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })
})
