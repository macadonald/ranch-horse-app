export type FindingCategory = 'calendar' | 'guests' | 'weather' | 'swaps' | 'health' | 'shoes' | 'horses'

export type Finding = {
  id: string
  kind: 'action' | 'background'
  category: FindingCategory
  title: string
  detail: string
  n: number
  nLabel: string
  strength: 'strong' | 'moderate'
  facts: Record<string, number | string>
}

export type DetectorStatus = {
  category: FindingCategory
  checked: string
  error?: string
}

export type DetectorResult = {
  findings: Finding[]
  status: DetectorStatus
}

// ── Shared input types used by multiple detectors ─────────────────────────────

export type PatternAssignment = {
  horse_name: string
  incompatible: boolean
  removed_at: string | null
  swap_category: string | null
  swap_reason: string | null
  reason: string | null
}

export type PatternGuest = {
  id?: string
  check_in_date: string | null
  check_out_date: string | null
  checked_out_at: string | null
  age: number | null
  weight: number | null
  gender: string | null
  riding_level: string | null
  horse_assignments: PatternAssignment[]
}

export type PatternFlag = {
  horse_name: string
  flag_type: string
  flagged_at: string
  status: string
}

export type PatternVisitHorse = {
  horse_name: string
  work_done: string
}

export type PatternVisit = {
  visit_date: string
  farrier_name: string | null
  farrier_visit_horses: PatternVisitHorse[]
}

export type PatternHorseFlag = {
  flag_type: string
  status: string
  day_off_date: string | null
  flagged_at: string
}

export type PatternHorse = {
  name: string
  level: string
  weight: number | null
  is_active: boolean
  farrier: string | null
  flags: PatternHorseFlag[]
}
