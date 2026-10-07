import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

// AZ is UTC-7 year-round (no DST)
function toTucsonDate(d: Date): string {
  const tucson = new Date(d.getTime() - 7 * 60 * 60 * 1000)
  return tucson.toISOString().slice(0, 10)
}

function getWeekStart(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, day))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()) // roll back to Sunday
  return d.toISOString().slice(0, 10)
}

type Bucket = { picks: number; top1: number; top3: number; inList: number }

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const weeks = Math.min(52, Math.max(1, parseInt(req.nextUrl.searchParams.get('weeks') ?? '12')))
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch suggestion_outcomes ──
  const { data: soRows, error: soErr } = await supabase
    .from('suggestion_outcomes')
    .select('id, created_at, source, guest_id, picked_horse, suggested, picked_rank, assignment_id')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (soErr) return NextResponse.json({ error: soErr.message }, { status: 500 })

  // Fetch not-a-fit flags for assignments we have links for
  const assignmentIds = (soRows ?? []).map(r => r.assignment_id).filter(Boolean) as string[]
  const incompatibleSet = new Set<string>()
  if (assignmentIds.length > 0) {
    const { data: haRows } = await supabase
      .from('horse_assignments')
      .select('id, incompatible')
      .in('id', assignmentIds)
    for (const ha of haRows ?? []) {
      if (ha.incompatible) incompatibleSet.add(ha.id as string)
    }
  }

  // ── Fetch historical assign_all_suggestions (confirmed before this feature deployed) ──
  const { data: aasRows } = await supabase
    .from('assign_all_suggestions')
    .select('guest_id, final_horse, top_candidates, created_at')
    .eq('confirmed', true)
    .not('final_horse', 'is', null)
    .gte('created_at', since)

  // Build dedup key: guest_id|horse_lower|tucson_date — already recorded in suggestion_outcomes
  const soKey = new Set<string>()
  for (const row of soRows ?? []) {
    const d = toTucsonDate(new Date(row.created_at as string))
    soKey.add(`${row.guest_id}|${(row.picked_horse as string).trim().toLowerCase()}|${d}`)
  }

  // ── Build unified outcome list ──
  type OutcomeRow = { source: string; pickedRank: number | null; hasList: boolean; wasNotAFit: boolean; weekStart: string }
  const outcomes: OutcomeRow[] = []

  for (const row of soRows ?? []) {
    const suggested = Array.isArray(row.suggested) ? (row.suggested as string[]) : null
    outcomes.push({
      source: row.source as string,
      pickedRank: row.picked_rank as number | null,
      hasList: suggested != null,
      wasNotAFit: incompatibleSet.has(row.assignment_id as string),
      weekStart: getWeekStart(toTucsonDate(new Date(row.created_at as string))),
    })
  }

  for (const row of aasRows ?? []) {
    if (!row.guest_id || !row.final_horse) continue
    const d = toTucsonDate(new Date(row.created_at as string))
    const key = `${row.guest_id}|${(row.final_horse as string).trim().toLowerCase()}|${d}`
    if (soKey.has(key)) continue // already counted via suggestion_outcomes
    const topCandidates = Array.isArray(row.top_candidates)
      ? (row.top_candidates as { horse_name: string }[]).slice(0, 5).map(c => c.horse_name)
      : []
    const finalLower = (row.final_horse as string).trim().toLowerCase()
    const idx = topCandidates.findIndex(n => n.trim().toLowerCase() === finalLower)
    outcomes.push({
      source: 'assign_all',
      pickedRank: idx >= 0 ? idx + 1 : null,
      hasList: topCandidates.length > 0,
      wasNotAFit: false,
      weekStart: getWeekStart(d),
    })
  }

  // ── Aggregate ──
  const empty = (): Bucket => ({ picks: 0, top1: 0, top3: 0, inList: 0 })
  const weekMap = new Map<string, Bucket>()
  const sourceMap = new Map<string, Bucket>()

  let onListPicks = 0, onListNotAFit = 0
  let offListPicks = 0, offListNotAFit = 0

  for (const o of outcomes) {
    const w = weekMap.get(o.weekStart) ?? empty()
    w.picks++
    if (o.pickedRank === 1) w.top1++
    if (o.pickedRank != null && o.pickedRank <= 3) w.top3++
    if (o.pickedRank != null) w.inList++
    weekMap.set(o.weekStart, w)

    const s = sourceMap.get(o.source) ?? empty()
    s.picks++
    if (o.pickedRank === 1) s.top1++
    if (o.pickedRank != null && o.pickedRank <= 3) s.top3++
    if (o.pickedRank != null) s.inList++
    sourceMap.set(o.source, s)

    if (o.hasList) {
      if (o.pickedRank != null) { onListPicks++; if (o.wasNotAFit) onListNotAFit++ }
      else { offListPicks++; if (o.wasNotAFit) offListNotAFit++ }
    }
  }

  const weeksSorted = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, v]) => ({ weekStart: ws, ...v }))

  const bySource: Record<string, Bucket> = {}
  Array.from(sourceMap.entries()).forEach(([src, v]) => { bySource[src] = v })

  return NextResponse.json({
    weeks: weeksSorted,
    bySource,
    outcomes: {
      onList: { n: onListPicks, notAFitPct: onListPicks > 0 ? Math.round((onListNotAFit / onListPicks) * 1000) / 10 : null },
      offList: { n: offListPicks, notAFitPct: offListPicks > 0 ? Math.round((offListNotAFit / offListPicks) * 1000) / 10 : null },
    },
    total: outcomes.length,
  })
}
