import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Opt out of Next.js route caching so every request hits Supabase fresh (prevents 304/empty responses)
export const dynamic = 'force-dynamic'

// Returns per-horse historical stats derived from all non-incompatible assignments.
// Consumers use this to compute per-horse weight soft ceilings, data-driven level ranges, age routing, and kid eligibility.
export async function GET() {
  console.log('[horse-stats] GET called')
  try {
    const { data, error } = await supabase
      .from('horse_assignments')
      .select('horse_name, guests!inner(weight, riding_level, checked_out, age)')
      .eq('incompatible', false)

    if (error) {
      console.error('[horse-stats] supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const raw: Record<string, {
      levels: Set<string>; maxWeight: number; count: number;
      weightSum: number; weightCount: number;
      ageSum: number; ageCount: number; kidCount: number;
    }> = {}
    for (const row of data || []) {
      const g = Array.isArray(row.guests) ? row.guests[0] : row.guests
      if (!g) continue
      const name = row.horse_name as string
      if (!raw[name]) raw[name] = { levels: new Set(), maxWeight: 0, count: 0, weightSum: 0, weightCount: 0, ageSum: 0, ageCount: 0, kidCount: 0 }
      if (g.riding_level) raw[name].levels.add(g.riding_level as string)
      if (g.weight) raw[name].maxWeight = Math.max(raw[name].maxWeight, g.weight as number)
      raw[name].count++
      if (g.checked_out && g.weight) {
        raw[name].weightSum += g.weight as number
        raw[name].weightCount++
      }
      if (g.age != null) {
        raw[name].ageSum += g.age as number
        raw[name].ageCount++
        if ((g.age as number) < 13) raw[name].kidCount++
      }
    }

    const stats: Record<string, {
      historicalLevels: string[]; historicalMaxWeight: number; totalAssignments: number;
      historicalAvgWeight: number | null; historicalAvgAge: number | null; hasKidHistory: boolean;
    }> = {}
    for (const [name, e] of Object.entries(raw)) {
      stats[name] = {
        historicalLevels: Array.from(e.levels),
        historicalMaxWeight: e.maxWeight,
        totalAssignments: e.count,
        historicalAvgWeight: e.weightCount >= 5 ? Math.round(e.weightSum / e.weightCount) : null,
        historicalAvgAge: e.ageCount >= 5 ? Math.round(e.ageSum / e.ageCount) : null,
        hasKidHistory: e.kidCount > 0,
      }
    }

    console.log('[horse-stats] returning stats for', Object.keys(stats).length, 'horses')
    return NextResponse.json({ stats }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[horse-stats] unhandled exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
