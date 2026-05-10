export type HealthIssueType = 'wound' | 'abscess' | 'eye' | 'skin' | 'hoof' | 'sore' | 'cut' | 'sunscreen' | 'meds' | 'other'

export type HealthLocation =
  | 'left_front_hoof' | 'right_front_hoof' | 'left_rear_hoof' | 'right_rear_hoof'
  | 'all_4_hooves' | 'front_hooves' | 'rear_hooves'
  | 'left_front_leg' | 'right_front_leg' | 'left_rear_leg' | 'right_rear_leg'
  | 'front_legs' | 'rear_legs'
  | 'back' | 'cinch' | 'wither' | 'neck' | 'chest' | 'flank' | 'face' | 'na'
  | 'left_eye' | 'right_eye'

export type HealthSeverity = 'monitoring' | 'needs_treatment' | 'vet_required'
export type HealthFrequency = 'once_daily' | 'twice_daily' | 'pre_saddle' | 'as_needed'
export type HealthStatus = 'active' | 'resolved'

export interface HorseHealthIssue {
  id: string
  horse_name: string
  type: HealthIssueType
  location: HealthLocation
  severity: HealthSeverity
  frequency: HealthFrequency
  treatment_notes: string | null
  notes: string | null
  status: HealthStatus
  opened_at: string
  resolved_at: string | null
  last_treated_at: string | null
  done_today: boolean
  done_today_date: string | null
}

export const ISSUE_TYPES: { key: HealthIssueType; label: string }[] = [
  { key: 'wound',     label: 'Wound' },
  { key: 'abscess',   label: 'Abscess' },
  { key: 'cut',       label: 'Cut' },
  { key: 'eye',       label: 'Eye' },
  { key: 'skin',      label: 'Skin' },
  { key: 'hoof',      label: 'Hoof' },
  { key: 'sore',      label: 'Sore' },
  { key: 'sunscreen', label: 'Sunscreen' },
  { key: 'meds',      label: 'Meds' },
  { key: 'other',     label: 'Other' },
]

export const LOCATION_GROUPS: { group: string; items: { key: HealthLocation; label: string }[] }[] = [
  {
    group: 'Hooves',
    items: [
      { key: 'left_front_hoof',  label: 'Left front hoof' },
      { key: 'right_front_hoof', label: 'Right front hoof' },
      { key: 'left_rear_hoof',   label: 'Left rear hoof' },
      { key: 'right_rear_hoof',  label: 'Right rear hoof' },
      { key: 'all_4_hooves',     label: 'All 4 hooves' },
      { key: 'front_hooves',     label: 'Front hooves (both)' },
      { key: 'rear_hooves',      label: 'Rear hooves (both)' },
    ],
  },
  {
    group: 'Legs',
    items: [
      { key: 'left_front_leg',  label: 'Left front leg' },
      { key: 'right_front_leg', label: 'Right front leg' },
      { key: 'left_rear_leg',   label: 'Left rear leg' },
      { key: 'right_rear_leg',  label: 'Right rear leg' },
      { key: 'front_legs',      label: 'Front legs (both)' },
      { key: 'rear_legs',       label: 'Rear legs (both)' },
    ],
  },
  {
    group: 'Body',
    items: [
      { key: 'back',   label: 'Back' },
      { key: 'cinch',  label: 'Cinch' },
      { key: 'wither', label: 'Wither' },
      { key: 'neck',   label: 'Neck' },
      { key: 'chest',  label: 'Chest' },
      { key: 'flank',  label: 'Flank' },
      { key: 'face',   label: 'Face' },
      { key: 'na',     label: 'N/A' },
    ],
  },
  {
    group: 'Eyes',
    items: [
      { key: 'left_eye',  label: 'Left eye' },
      { key: 'right_eye', label: 'Right eye' },
    ],
  },
]

export const SEVERITIES: { key: HealthSeverity; label: string }[] = [
  { key: 'monitoring',      label: 'Monitoring' },
  { key: 'needs_treatment', label: 'Needs treatment' },
  { key: 'vet_required',    label: 'Vet required' },
]

export const FREQUENCIES: { key: HealthFrequency; label: string }[] = [
  { key: 'once_daily',  label: 'Once daily' },
  { key: 'twice_daily', label: 'Twice daily' },
  { key: 'pre_saddle',  label: 'Pre-saddle' },
  { key: 'as_needed',   label: 'As needed' },
]

export const LOCATION_LABELS: Record<HealthLocation, string> = {
  left_front_hoof:  'LF Hoof',
  right_front_hoof: 'RF Hoof',
  left_rear_hoof:   'LR Hoof',
  right_rear_hoof:  'RR Hoof',
  all_4_hooves:     'All 4 hooves',
  front_hooves:     'Front hooves',
  rear_hooves:      'Rear hooves',
  left_front_leg:   'LF Leg',
  right_front_leg:  'RF Leg',
  left_rear_leg:    'LR Leg',
  right_rear_leg:   'RR Leg',
  front_legs:       'Front legs',
  rear_legs:        'Rear legs',
  back:      'Back',
  cinch:     'Cinch',
  wither:    'Wither',
  neck:      'Neck',
  chest:     'Chest',
  flank:     'Flank',
  face:      'Face',
  na:        'N/A',
  left_eye:  'Left eye',
  right_eye: 'Right eye',
}

export const TYPE_LABELS: Record<HealthIssueType, string> = {
  wound:     'Wound',
  abscess:   'Abscess',
  cut:       'Cut',
  eye:       'Eye',
  skin:      'Skin',
  hoof:      'Hoof',
  sore:      'Sore',
  sunscreen: 'Sunscreen',
  meds:      'Meds',
  other:     'Other',
}

export const SEVERITY_LABELS: Record<HealthSeverity, string> = {
  monitoring:      'Monitoring',
  needs_treatment: 'Needs treatment',
  vet_required:    'Vet required',
}

export const FREQUENCY_LABELS: Record<HealthFrequency, string> = {
  once_daily:  'Once daily',
  twice_daily: 'Twice daily',
  pre_saddle:  'Pre-saddle',
  as_needed:   'As needed',
}

export function severityBorderColor(severity: HealthSeverity): string {
  if (severity === 'vet_required')    return '#dc2626'
  if (severity === 'needs_treatment') return '#d97706'
  return '#9ca3af'
}

export function severityBadgeStyle(severity: HealthSeverity): { bg: string; color: string; border: string } {
  if (severity === 'vet_required')    return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
  if (severity === 'needs_treatment') return { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }
  return { bg: 'var(--color-bg)', color: 'var(--color-text-3)', border: 'var(--color-border)' }
}

export function showDoneWarning(issue: HorseHealthIssue): boolean {
  if (issue.severity === 'monitoring') return false
  if (issue.type === 'sore' && (issue.frequency === 'as_needed' || issue.frequency === 'pre_saddle')) return false
  return true
}
