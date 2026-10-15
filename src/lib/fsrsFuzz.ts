// Apply only when saving automatic schedules; previews and manual intervals stay exact.
export function applyFuzz(days: number): number {
  if (days < 2.5) return days
  const range = days < 7 ? 0.15 : days < 20 ? 0.1 : 0.05
  const delta = Math.max(1, Math.round(days * range))
  return Math.max(1, Math.round(days) + Math.floor(Math.random() * (2 * delta + 1)) - delta)
}
