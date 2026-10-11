import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushOfflineReviews, getOfflineReviews, saveOfflineReview } from './offlineSync'
import type { OfflineReview } from './offlineSync'

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ insert })) },
}))

function review(id: string): OfflineReview {
  return {
    id,
    user_id: 'user-1',
    card_id: `card-${id}`,
    rating: 'good',
    stability: 3,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 3,
    state: 'review',
    due: '2026-10-14T00:00:00Z',
    reviewed_at: '2026-10-11T00:00:00Z',
  }
}

function deferredInsert() {
  let resolve!: (value: { error: { message: string } | null }) => void
  const promise = new Promise<{ error: { message: string } | null }>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('navigator', {})
  insert.mockReset().mockResolvedValue({ error: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('offline review synchronization', () => {
  it('does not send an empty queue', async () => {
    expect(await flushOfflineReviews()).toEqual({ synced: 0 })
    expect(insert).not.toHaveBeenCalled()
  })

  it('preserves and then uploads reviews added while the first batch is in flight', async () => {
    const first = deferredInsert()
    insert.mockImplementationOnce(() => first.promise)
    saveOfflineReview(review('rev_a'))
    const flush = flushOfflineReviews()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    saveOfflineReview(review('rev_b'))
    expect(getOfflineReviews().map((r) => r.id)).toEqual(['rev_a', 'rev_b'])

    first.resolve({ error: null })
    expect(await flush).toEqual({ synced: 2 })
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert.mock.calls[1][0]).toEqual([expect.objectContaining({ card_id: 'card-rev_b' })])
    expect(getOfflineReviews()).toEqual([])
  })

  it('coalesces simultaneous flushes into one upload', async () => {
    const upload = deferredInsert()
    insert.mockImplementationOnce(() => upload.promise)
    saveOfflineReview(review('rev_a'))
    const first = flushOfflineReviews()
    const second = flushOfflineReviews()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    upload.resolve({ error: null })

    expect(await Promise.all([first, second])).toEqual([{ synced: 1 }, { synced: 1 }])
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('keeps the original and newly queued reviews after a failed upload, and allows retry', async () => {
    const upload = deferredInsert()
    insert.mockImplementationOnce(() => upload.promise)
    saveOfflineReview(review('rev_a'))
    const flush = flushOfflineReviews()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    saveOfflineReview(review('rev_b'))
    upload.resolve({ error: { message: 'Disconnected' } })

    expect(await flush).toEqual({ synced: 0, error: 'Disconnected' })
    expect(getOfflineReviews().map((r) => r.id)).toEqual(['rev_a', 'rev_b'])
    expect(await flushOfflineReviews()).toEqual({ synced: 2 })
    expect(getOfflineReviews()).toEqual([])
  })

  it('retains the remaining batch if it fails after the first batch succeeded', async () => {
    const upload = deferredInsert()
    insert
      .mockImplementationOnce(() => upload.promise)
      .mockResolvedValueOnce({ error: { message: 'Retry later' } })
    saveOfflineReview(review('rev_a'))
    const flush = flushOfflineReviews()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    saveOfflineReview(review('rev_b'))
    upload.resolve({ error: null })

    expect(await flush).toEqual({ synced: 1, error: 'Retry later' })
    expect(getOfflineReviews().map((r) => r.id)).toEqual(['rev_b'])
  })

  it('preserves UUIDs and strips synthetic IDs only from the server payload', async () => {
    const uuid = '12345678-1234-4234-8234-123456789abc'
    saveOfflineReview(review(uuid))
    saveOfflineReview(review('rev_a'))
    await flushOfflineReviews()

    expect(insert.mock.calls[0][0][0].id).toBe(uuid)
    expect(insert.mock.calls[0][0][1]).not.toHaveProperty('id')
  })

  it('serializes separate tab instances through Web Locks and rereads the queue after acquiring the lock', async () => {
    let tail = Promise.resolve()
    const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
      const next = tail.then(callback)
      tail = next.then(() => {})
      return next
    })
    vi.stubGlobal('navigator', { locks: { request } })
    vi.resetModules()
    const firstTab = await import('./offlineSync')
    vi.resetModules()
    const secondTab = await import('./offlineSync')
    const upload = deferredInsert()
    insert.mockImplementationOnce(() => upload.promise)
    firstTab.saveOfflineReview(review('rev_a'))
    const first = firstTab.flushOfflineReviews()
    const second = secondTab.flushOfflineReviews()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    upload.resolve({ error: null })

    expect(await Promise.all([first, second])).toEqual([{ synced: 1 }, { synced: 0 }])
    expect(request).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
