import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

// AZ is UTC-7 year-round (no DST)
function toTucsonDate(d: Date): string {
  return new Date(d.getTime() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // Build last-30-days array (Tucson dates, oldest first)
  const days: string[] = []
  const nowMs = Date.now()
  for (let i = 29; i >= 0; i--) {
    days.push(toTucsonDate(new Date(nowMs - i * 86400000)))
  }
  const since = days[0]

  const [asgRes, horsesRes, aasRes] = await Promise.all([
    // Non-incompatible assignments where the guest checked out on/after `since`
    supabase
      .from('horse_assignments')
      .select('horse_name, assigned_at, removed_at, guests!inner(check_in_date, check_out_date, checked_out, checked_out_at)')
      .eq('incompatible', false)
      .gte('guests.check_out_date', since),
    // Active non-deceased horses (to compute "unused" count)
    supabase
      .from('horses')
      .select('name')
      .eq('is_active', true)
      .eq('is_deceased', false),
    // All assign_all_suggestions rows in the window (to find latest run per day + pass=3 count)
    supabase
      .from('assign_all_suggestions')
      .select('run_id, pass, created_at')
      .gte('created_at', since + 'T00:00:00Z'),
  ])

  if (asgRes.error) return NextResponse.json({ error: asgRes.error.message }, { status: 500 })

  const totalHorses = (horsesRes.data ?? []).length

  // Preprocess assignment records into a simple timeline-ready shape
  type AsgRecord = { horseName: string; assignedDate: string; guestEnd: string; removedDate: string | null }
  const records: AsgRecord[] = []

  for (const row of asgRes.data ?? []) {
    const g = Array.isArray(row.guests) ? row.guests[0] : row.guests
    if (!g) continue
    // Use assigned_at when present; fall back to check_in_date
    const assignedDate = row.assigned_at
      ? toTucsonDate(new Date(row.assigned_at as string))
      : (g.check_in_date as string)
    if (!assignedDate) continue
    // Guest's last day on property: checked_out_at date if checked out, else check_out_date
    const guestEnd = g.checked_out && g.checked_out_at
      ? toTucsonDate(new Date(g.checked_out_at as string))
      : (g.check_out_date as string)
    // Assignment removal date (if swapped/removed)
    const removedDate = row.removed_at ? toTucsonDate(new Date(row.removed_at as string)) : null
    records.push({ horseName: row.horse_name as string, assignedDate, guestEnd, removedDate })
  }

  // Per-day stats: for each day, count riders per horse, then bucket by 1/2/3+/unused
  type DayStat = { date: string; single: number; doubled: number; tripled: number; unused: number }
  const dayStats: DayStat[] = days.map(day => {
    const riderCount: Record<string, number> = {}
    for (const r of records) {
      if (r.assignedDate > day) continue         // not yet assigned
      if (r.guestEnd < day) continue             // guest already left
      if (r.removedDate !== null && r.removedDate < day) continue  // removed before this day
      riderCount[r.horseName] = (riderCount[r.horseName] ?? 0) + 1
    }
    let single = 0, doubled = 0, tripled = 0
    for (const n of Object.values(riderCount)) {
      if (n === 1) single++
      else if (n === 2) doubled++
      else tripled++
    }
    const unused = Math.max(0, totalHorses - (single + doubled + tripled))
    return { date: day, single, doubled, tripled, unused }
  })

  // No-suggestion data: group assign_all_suggestions by (Tucson day, run_id)
  // For each day, find the latest run, count its pass=3 rows
  const dateRunMap = new Map<string, Map<string, { ts: string; pass3: number }>>()
  for (const row of aasRes.data ?? []) {
    if (!row.run_id) continue
    const d = toTucsonDate(new Date(row.created_at as string))
    let runMap = dateRunMap.get(d)
    if (!runMap) { runMap = new Map(); dateRunMap.set(d, runMap) }
    const runId = row.run_id as string
    const existing = runMap.get(runId)
    if (existing) {
      if ((row.created_at as string) > existing.ts) existing.ts = row.created_at as string
      if ((row.pass as number) === 3) existing.pass3++
    } else {
      runMap.set(runId, { ts: row.created_at as string, pass3: (row.pass as number) === 3 ? 1 : 0 })
    }
  }

  const noSuggestion: { date: string; count: number }[] = []
  let noSuggestionTotal = 0
  for (const day of days) {
    const runMap = dateRunMap.get(day)
    if (!runMap || runMap.size === 0) continue
    // Latest run for this day
    let latestTs = '', latestRunId = ''
    Array.from(runMap.entries()).forEach(([runId, info]) => {
      if (info.ts > latestTs) { latestTs = info.ts; latestRunId = runId }
    })
    const count = runMap.get(latestRunId)?.pass3 ?? 0
    if (count > 0) {
      noSuggestion.push({ date: day, count })
      noSuggestionTotal += count
    }
  }

  return NextResponse.json({
    days: dayStats,
    today: dayStats[dayStats.length - 1],
    noSuggestion,
    noSuggestionTotal,
  })
}
