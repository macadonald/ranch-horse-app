import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Returns per-horse historical stats derived from all non-incompatible assignments.
// Consumers use this to compute per-horse weight soft ceilings and data-driven level ranges.
export async function GET() {
  const { data, error } = await supabase
    .from('horse_assignments')
    .select('horse_name, guests!inner(weight, riding_level)')
    .eq('incompatible', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const raw: Record<string, { levels: Set<string>; maxWeight: number; count: number }> = {}
  for (const row of data || []) {
    const g = Array.isArray(row.guests) ? row.guests[0] : row.guests
    if (!g) continue
    const name = row.horse_name as string
    if (!raw[name]) raw[name] = { levels: new Set(), maxWeight: 0, count: 0 }
    if (g.riding_level) raw[name].levels.add(g.riding_level as string)
    if (g.weight) raw[name].maxWeight = Math.max(raw[name].maxWeight, g.weight as number)
    raw[name].count++
  }

  const stats: Record<string, { historicalLevels: string[]; historicalMaxWeight: number; totalAssignments: number }> = {}
  for (const [name, e] of Object.entries(raw)) {
    stats[name] = {
      historicalLevels: Array.from(e.levels),
      historicalMaxWeight: e.maxWeight,
      totalAssignments: e.count,
    }
  }

  return NextResponse.json({ stats })
}
