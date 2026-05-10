export type SupplementFrequency = 'once_daily' | 'twice_daily' | 'as_needed'

export interface HorseSupplement {
  id: string
  horse_name: string
  supplement_name: string
  frequency: SupplementFrequency
  notes: string | null
  done_today: boolean
  done_today_date: string | null
  created_at: string
}

export const SUPPLEMENT_FREQUENCIES: { key: SupplementFrequency; label: string }[] = [
  { key: 'once_daily',  label: 'Once daily' },
  { key: 'twice_daily', label: 'Twice daily' },
  { key: 'as_needed',   label: 'As needed' },
]

export const SUPPLEMENT_FREQUENCY_LABELS: Record<SupplementFrequency, string> = {
  once_daily:  'Once daily',
  twice_daily: 'Twice daily',
  as_needed:   'As needed',
}
