export const WEIGHT_BANDS = [
  { key: 'lt150',   label: 'Under 150', min: 0,   max: 149 },
  { key: '150_179', label: '150–179',   min: 150, max: 179 },
  { key: '180_199', label: '180–199',   min: 180, max: 199 },
  { key: '200_219', label: '200–219',   min: 200, max: 219 },
  { key: '220_259', label: '220–259',   min: 220, max: 259 },
  { key: '260plus', label: '260+',      min: 260, max: Infinity },
] as const

export type WeightBand = typeof WEIGHT_BANDS[number]

export function getWeightBand(weight: number | null): WeightBand | null {
  if (weight == null || weight <= 0) return null
  return WEIGHT_BANDS.find(b => weight >= b.min && weight <= b.max) ?? null
}
