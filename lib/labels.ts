const LABEL_MAP: Record<string, string> = {
  guest_request:    'Guest request',
  horse_issue:      'Horse issue',
  staff:            'Staff',
  guest_preference: 'Guest preference',
  too_much_horse:   'Too much horse',
  too_slow:         'Too slow',
  other_health:     'Other health',
  behavior:         'Behavior',
  lame:             'Lame',
  stiff_sore:       'Stiff/sore',
  injured:          'Injured',
  day_off:          'Day off',
  full_set:         'Full set',
  fronts:           'Fronts',
  rears:            'Rears',
  trim:             'Trim',
  other:            'Other',
}

export function formatLabel(value: string): string {
  if (!value) return value
  return LABEL_MAP[value] ?? value.replace(/_/g, ' ').replace(/^(.)/, c => c.toUpperCase())
}
