export type WorkCategory = 'full_set' | 'fronts' | 'rears' | 'partial' | 'trim' | 'other'

export const WORK_LABELS: Record<WorkCategory, string> = {
  full_set: 'Full set',
  fronts:   'Fronts',
  rears:    'Rears',
  partial:  'Partial',
  trim:     'Trim',
  other:    'Other',
}

export function categorizeWork(raw: string | null): WorkCategory {
  if (!raw) return 'other'
  const s = raw.trim().toLowerCase()
  if (s.includes('trim')) return 'trim'
  if (s === 'x4' || s === 'all_4s' || s === 'all 4s' || s === 'full_set' || s === 'full set') return 'full_set'
  if (s === 'fronts') return 'fronts'
  if (s === 'rears') return 'rears'
  if (s === 'x1 front' || s === 'x3' || s === '2f, 1r' || s === '1f, 1r' || s === 'partial') return 'partial'
  return 'other'
}

export const isFullSet = (raw: string | null): boolean => categorizeWork(raw) === 'full_set'
