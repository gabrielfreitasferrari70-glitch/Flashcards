import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyFuzz } from './fsrsFuzz'

afterEach(() => vi.restoreAllMocks())

describe('FSRS interval fuzz at save time', () => {
  it('preserves short learning steps exactly without drawing random numbers', () => {
    const random = vi.spyOn(Math, 'random')
    for (const days of [10 / 1440, 0.1, 1, 2.4999]) expect(applyFuzz(days)).toBe(days)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([
    [2.5, 2, 4],
    [6.9, 6, 8],
    [7, 6, 8],
    [19.9, 18, 22],
    [20, 19, 21],
    [100, 95, 105],
  ])('keeps %s days within its inclusive fuzz range [%s, %s]', (days, min, max) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(applyFuzz(days)).toBe(min)
    random.mockReturnValue(1 - Number.EPSILON)
    expect(applyFuzz(days)).toBe(max)
    random.mockReturnValue(0.5)
    expect(applyFuzz(days)).toBe(Math.round(days))
  })
})
