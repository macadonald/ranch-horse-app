import { LEVEL_LABELS } from '@/lib/horses'
import { WEIGHT_BANDS, getWeightBand } from '@/lib/weightBands'
import { horseWeightCeiling, isHorseBlockedToday } from '@/lib/horseFit'
import { categorizeWork, isFullSet } from '@/lib/shoeWork'
import { fetchWeather } from '@/lib/weather'
import { runAllDetectors } from '@/lib/patterns/index'

const CAP = 200
const FULL_FETCH_CAP = 10000

// ─── Tool implementations ─────────────────────────────────────────────────────

async function get_guests(supabase: any, args: any, today: string) {
  let q = supabase.from('guests').select(
    'id, name, room_number, check_in_date, check_out_date, checked_out_at, age, weight, gender, riding_level, repeat_guest, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason)'
  )
  if (args.from)         q = q.gte('check_in_date', args.from)
  if (args.to)           q = q.lte('check_out_date', args.to)
  if (args.here_now)     q = q.lte('check_in_date', today).gte('check_out_date', today).is('checked_out_at', null)
  if (args.min_weight != null) q = q.gte('weight', args.min_weight)
  if (args.max_weight != null) q = q.lte('weight', args.max_weight)
  if (args.level)              q = q.eq('riding_level', args.level)
  if (args.min_age != null)    q = q.gte('age', args.min_age)
  if (args.max_age != null)    q = q.lte('age', args.max_age)
  if (args.repeat_guest !== undefined) q = q.eq('repeat_guest', args.repeat_guest)
  if (args.name)               q = q.ilike('name', `%${args.name}%`)

  const { data, error } = await q.limit(FULL_FETCH_CAP)
  if (error) throw new Error(error.message)

  const all = data || []
  const total = all.length
  const truncated = total > CAP

  const ages    = all.map((g: any) => g.age).filter((v: any): v is number => v != null)
  const weights = all.map((g: any) => g.weight).filter((v: any): v is number => v != null)
  const levelCounts: Record<string, number> = {}
  for (const g of all) {
    const lbl = LEVEL_LABELS[g.riding_level] || g.riding_level || 'unknown'
    levelCounts[lbl] = (levelCounts[lbl] || 0) + 1
  }
  const summary = {
    avg_age:      ages.length    ? Math.round(ages.reduce((a: number, b: number) => a + b, 0) / ages.length) : null,
    avg_weight:   weights.length ? Math.round(weights.reduce((a: number, b: number) => a + b, 0) / weights.length) : null,
    repeat_count: all.filter((g: any) => g.repeat_guest).length,
    level_counts: levelCounts,
  }

  let grouped: any = undefined
  if (args.group_by) {
    const counts: Record<string, number> = {}
    for (const g of all) {
      if (args.group_by === 'horse') {
        const seen = new Set<string>()
        for (const a of g.horse_assignments || []) {
          if (!seen.has(a.horse_name)) {
            seen.add(a.horse_name)
            counts[a.horse_name] = (counts[a.horse_name] || 0) + 1
          }
        }
      } else {
        let key: string
        if (args.group_by === 'level') {
          key = LEVEL_LABELS[g.riding_level] || g.riding_level || 'unknown'
        } else if (args.group_by === 'month') {
          key = (g.check_in_date || '').slice(0, 7) || 'unknown'
        } else if (args.group_by === 'age_band') {
          const a = g.age
          key = a == null ? 'unknown' : a < 18 ? 'under_18' : a < 30 ? '18-29' : a < 50 ? '30-49' : a < 65 ? '50-64' : '65+'
        } else if (args.group_by === 'weight_band') {
          const band = getWeightBand(g.weight)
          key = band ? band.label : 'unknown'
        } else {
          key = 'unknown'
        }
        counts[key] = (counts[key] || 0) + 1
      }
    }
    grouped = { by: args.group_by, counts }
  }

  const applied_filters: Record<string, any> = {}
  if (args.from)               applied_filters.from = args.from
  if (args.to)                 applied_filters.to = args.to
  if (args.here_now)           applied_filters.here_now = true
  if (args.min_weight != null) applied_filters.min_weight = args.min_weight
  if (args.max_weight != null) applied_filters.max_weight = args.max_weight
  if (args.level)              applied_filters.level = args.level
  if (args.min_age != null)    applied_filters.min_age = args.min_age
  if (args.max_age != null)    applied_filters.max_age = args.max_age
  if (args.repeat_guest !== undefined) applied_filters.repeat_guest = args.repeat_guest
  if (args.name)               applied_filters.name = args.name
  if (args.group_by)           applied_filters.group_by = args.group_by

  const agePart = args.min_age != null && args.max_age != null ? ` aged ${args.min_age}–${args.max_age}`
    : args.max_age != null ? ` aged ≤${args.max_age}`
    : args.min_age != null ? ` aged ≥${args.min_age}` : ''
  const wtPart  = args.min_weight != null && args.max_weight != null ? ` weighing ${args.min_weight}–${args.max_weight} lb`
    : args.min_weight != null ? ` weighing ≥${args.min_weight} lb`
    : args.max_weight != null ? ` weighing ≤${args.max_weight} lb` : ''
  const lvlPart  = args.level ? ` level ${args.level}` : ''
  const herePart = args.here_now ? ', currently on property' : ''
  const guestBase = `${total} guests${agePart}${wtPart}${lvlPart}${herePart}`
  const population = args.group_by === 'horse'
    ? `${guestBase}; horse counts = how many of these guests had each horse assigned (guests with no assignments are excluded from horse counts but included in total)`
    : `${guestBase} (includes guests with and without horse assignments)`

  return {
    total,
    truncated,
    applied_filters,
    population,
    rows: all.slice(0, CAP).map((g: any) => ({
      name: g.name,
      room: g.room_number,
      check_in: g.check_in_date,
      check_out: g.check_out_date,
      age: g.age,
      weight: g.weight,
      level: LEVEL_LABELS[g.riding_level] || g.riding_level,
      gender: g.gender,
      repeat: g.repeat_guest,
      horses: (g.horse_assignments || []).map((a: any) => ({
        horse: a.horse_name,
        not_a_fit: a.incompatible,
        swap_category: a.swap_category,
        swap_reason: a.swap_reason,
        reason: a.reason,
        removed: !!a.removed_at,
      })),
    })),
    summary,
    ...(grouped != null ? { grouped } : {}),
  }
}

async function get_assignments(supabase: any, args: any, today: string) {
  let q = supabase.from('guests').select(
    'id, name, age, check_in_date, check_out_date, weight, riding_level, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason, assigned_at)'
  )
  if (args.from)               q = q.gte('check_in_date', args.from)
  if (args.to)                 q = q.lte('check_out_date', args.to)
  if (args.guest)              q = q.ilike('name', `%${args.guest}%`)
  if (args.min_age != null)    q = q.gte('age', args.min_age)
  if (args.max_age != null)    q = q.lte('age', args.max_age)
  if (args.min_weight != null) q = q.gte('weight', args.min_weight)
  if (args.max_weight != null) q = q.lte('weight', args.max_weight)
  if (args.level)              q = q.eq('riding_level', args.level)

  const { data, error } = await q.limit(FULL_FETCH_CAP)
  if (error) throw new Error(error.message)

  const all: any[] = []
  for (const g of data || []) {
    for (const a of g.horse_assignments || []) {
      if (args.horse && a.horse_name.toLowerCase() !== args.horse.toLowerCase()) continue
      if (args.not_a_fit !== undefined && a.incompatible !== args.not_a_fit) continue
      if (args.swap_category && a.swap_category !== args.swap_category) continue
      all.push({
        guest: g.name,
        guest_age: g.age,
        check_in: g.check_in_date,
        check_out: g.check_out_date,
        guest_weight: g.weight,
        guest_level: LEVEL_LABELS[g.riding_level] || g.riding_level,
        horse: a.horse_name,
        not_a_fit: a.incompatible,
        swap_category: a.swap_category,
        swap_reason: a.swap_reason,
        reason: a.reason,
        assigned_at: a.assigned_at,
        removed_at: a.removed_at,
      })
    }
  }

  const total = all.length
  const truncated = total > CAP

  const swapCats: Record<string, number> = {}
  for (const a of all) {
    if (a.swap_category) swapCats[a.swap_category] = (swapCats[a.swap_category] || 0) + 1
  }
  const summary = {
    total_not_a_fit: all.filter(a => a.not_a_fit).length,
    swap_category_counts: swapCats,
  }

  let grouped: any = undefined
  if (args.group_by) {
    const counts: Record<string, number> = {}
    for (const a of all) {
      let key: string
      if (args.group_by === 'horse') {
        key = a.horse
      } else if (args.group_by === 'level') {
        key = a.guest_level || 'unknown'
      } else if (args.group_by === 'weight_band') {
        const band = getWeightBand(a.guest_weight)
        key = band ? band.label : 'unknown'
      } else if (args.group_by === 'month') {
        key = (a.check_in || '').slice(0, 7) || 'unknown'
      } else if (args.group_by === 'age_band') {
        const age = a.guest_age
        key = age == null ? 'unknown' : age < 18 ? 'under_18' : age < 30 ? '18-29' : age < 50 ? '30-49' : age < 65 ? '50-64' : '65+'
      } else {
        key = 'unknown'
      }
      counts[key] = (counts[key] || 0) + 1
    }
    grouped = { by: args.group_by, counts }
  }

  const applied_filters: Record<string, any> = {}
  if (args.from)               applied_filters.from = args.from
  if (args.to)                 applied_filters.to = args.to
  if (args.guest)              applied_filters.guest = args.guest
  if (args.horse)              applied_filters.horse = args.horse
  if (args.min_age != null)    applied_filters.min_age = args.min_age
  if (args.max_age != null)    applied_filters.max_age = args.max_age
  if (args.min_weight != null) applied_filters.min_weight = args.min_weight
  if (args.max_weight != null) applied_filters.max_weight = args.max_weight
  if (args.level)              applied_filters.level = args.level
  if (args.not_a_fit !== undefined) applied_filters.not_a_fit = args.not_a_fit
  if (args.swap_category)      applied_filters.swap_category = args.swap_category
  if (args.group_by)           applied_filters.group_by = args.group_by

  const agePart = args.min_age != null && args.max_age != null ? ` aged ${args.min_age}–${args.max_age}`
    : args.max_age != null ? ` aged ≤${args.max_age}`
    : args.min_age != null ? ` aged ≥${args.min_age}` : ''
  const wtPart  = args.min_weight != null && args.max_weight != null ? ` weighing ${args.min_weight}–${args.max_weight} lb`
    : args.min_weight != null ? ` weighing ≥${args.min_weight} lb`
    : args.max_weight != null ? ` weighing ≤${args.max_weight} lb` : ''
  const lvlPart = args.level ? ` level ${args.level}` : ''
  const population = `${total} assignments for guests${agePart}${wtPart}${lvlPart}; guests without assignments are excluded`

  return {
    total,
    truncated,
    applied_filters,
    population,
    rows: all.slice(0, CAP),
    summary,
    ...(grouped != null ? { grouped } : {}),
  }
}

async function get_horses(supabase: any, args: any, today: string) {
  let q = supabase.from('horses').select('name, level, weight, is_active, is_draft, takes_kids, farrier')
  if (args.name)        q = q.ilike('name', `%${args.name}%`)
  if (args.active !== undefined) q = q.eq('is_active', args.active)
  if (args.draft !== undefined)  q = q.eq('is_draft', args.draft)
  if (args.takes_kids !== undefined) q = q.eq('takes_kids', args.takes_kids)
  if (args.farrier)     q = q.eq('farrier', args.farrier)

  const [{ data: horsesRaw, error }, { data: flagsRaw }] = await Promise.all([
    q.limit(CAP),
    supabase.from('horse_status_flags').select('horse_name, flag_type, status, day_off_date, flagged_at').eq('status', 'active'),
  ])
  if (error) throw new Error(error.message)

  const flagsByHorse: Record<string, any[]> = {}
  for (const f of flagsRaw || []) {
    if (!flagsByHorse[f.horse_name]) flagsByHorse[f.horse_name] = []
    flagsByHorse[f.horse_name].push(f)
  }

  let horses = (horsesRaw || []) as any[]
  if (args.available_today) {
    horses = horses.filter((h: any) => {
      if (!h.is_active) return false
      return !isHorseBlockedToday(flagsByHorse[h.name] || [], today)
    })
  }

  return {
    horses: horses.map((h: any) => ({
      name: h.name,
      level: LEVEL_LABELS[h.level] || h.level,
      weight_limit: h.weight,
      weight_ceiling: horseWeightCeiling(h.weight, 0),
      draft: h.is_draft,
      takes_kids: h.takes_kids,
      farrier: h.farrier,
      active: h.is_active,
      active_flags: (flagsByHorse[h.name] || []).map((f: any) => ({
        type: f.flag_type,
        since: f.flagged_at?.slice(0, 10),
      })),
    })),
    total: horses.length,
  }
}

async function get_horse_activity(supabase: any, args: any, today: string) {
  const name = args.horse as string
  const MS = 86400000

  const [{ data: guestsRaw }, { data: flagsRaw }, { data: visitsRaw }, { data: horseRow }] = await Promise.all([
    supabase.from('guests').select(
      'name, check_in_date, check_out_date, checked_out_at, weight, riding_level, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason)'
    ).not('check_in_date', 'is', null),
    supabase.from('horse_status_flags').select('flag_type, status, day_off_date, flagged_at').eq('horse_name', name).order('flagged_at', { ascending: false }),
    supabase.from('farrier_visits').select('visit_date, farrier_name, farrier_visit_horses!inner(horse_name, work_done)').eq('farrier_visit_horses.horse_name', name),
    supabase.from('horses').select('level, weight, farrier').eq('name', name).single(),
  ])

  const allAssign: any[] = []
  for (const g of guestsRaw || []) {
    for (const a of g.horse_assignments || []) {
      if (a.horse_name !== name) continue
      allAssign.push({ guest: g.name, check_in: g.check_in_date, incompatible: a.incompatible, swap_reason: a.swap_reason, swap_category: a.swap_category })
    }
  }

  const eightWeeksAgo = new Date(new Date(today + 'T12:00:00').getTime() - 56 * MS).toISOString().slice(0, 10)
  const recentCount = allAssign.filter(a => a.check_in >= eightWeeksAgo).length
  const notAFit = allAssign.filter(a => a.incompatible)

  const sortedDates = allAssign.map(a => a.check_in).filter(Boolean).sort()
  const lastAssigned = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null

  const fullSets = (visitsRaw || [])
    .flatMap((v: any) => v.farrier_visit_horses.map((h: any) => ({ date: v.visit_date, farrier: v.farrier_name, work: h.work_done })))
    .filter((f: any) => isFullSet(f.work))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))

  const lastFS = fullSets.length > 0 ? fullSets[fullSets.length - 1] : null
  let avgGap: number | null = null
  if (fullSets.length >= 2) {
    let tot = 0
    for (let i = 1; i < fullSets.length; i++) {
      tot += Math.round((new Date(fullSets[i].date + 'T12:00:00').getTime() - new Date(fullSets[i - 1].date + 'T12:00:00').getTime()) / MS)
    }
    avgGap = Math.round(tot / (fullSets.length - 1))
  }
  const daysSinceFS = lastFS
    ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastFS.date + 'T12:00:00').getTime()) / MS)
    : null
  const estNextFS = lastFS && avgGap
    ? new Date(new Date(lastFS.date + 'T12:00:00').getTime() + avgGap * MS).toISOString().slice(0, 10)
    : null

  return {
    horse: name,
    level: LEVEL_LABELS[horseRow?.level] || horseRow?.level,
    weight_limit: horseRow?.weight,
    last_assigned: lastAssigned,
    guest_days_last_8_weeks: recentCount,
    total_assignments: allAssign.length,
    not_a_fit_count: notAFit.length,
    not_a_fit_reasons: notAFit.slice(0, 5).map((a: any) => ({ category: a.swap_category, reason: a.swap_reason })).filter((r: any) => r.reason || r.category),
    active_flags: (flagsRaw || []).filter((f: any) => f.status === 'active').map((f: any) => ({ type: f.flag_type, since: f.flagged_at?.slice(0, 10) })),
    flags_history: (flagsRaw || []).slice(0, 10).map((f: any) => ({ type: f.flag_type, status: f.status, date: f.flagged_at?.slice(0, 10) })),
    last_full_set: lastFS?.date,
    last_farrier: lastFS?.farrier || horseRow?.farrier,
    usual_gap_days: avgGap,
    days_since_full_set: daysSinceFS,
    est_next_full_set: estNextFS,
  }
}

async function get_shoe_visits(supabase: any, args: any, today: string) {
  let q = supabase.from('farrier_visits')
    .select('visit_date, farrier_name, farrier_visit_horses(horse_name, work_done)')
    .order('visit_date', { ascending: false })
  if (args.from)    q = q.gte('visit_date', args.from)
  if (args.to)      q = q.lte('visit_date', args.to)
  if (args.farrier) q = q.eq('farrier_name', args.farrier)

  const { data, error } = await q.limit(CAP)
  if (error) throw new Error(error.message)

  const rows: any[] = []
  for (const v of data || []) {
    for (const h of v.farrier_visit_horses || []) {
      if (args.horse && h.horse_name.toLowerCase() !== args.horse.toLowerCase()) continue
      const cat = categorizeWork(h.work_done)
      if (args.work_category && cat !== args.work_category) continue
      rows.push({ date: v.visit_date, farrier: v.farrier_name, horse: h.horse_name, work: h.work_done, category: cat })
    }
  }
  return { visits: rows.slice(0, CAP), total: rows.length, capped: rows.length > CAP }
}

async function get_health_flags(supabase: any, args: any, today: string) {
  let q = supabase.from('horse_status_flags')
    .select('horse_name, flag_type, status, flagged_at, day_off_date, notes')
    .order('flagged_at', { ascending: false })
  if (args.horse)  q = q.ilike('horse_name', `%${args.horse}%`)
  if (args.type)   q = q.eq('flag_type', args.type)
  if (args.status) q = q.eq('status', args.status)
  if (args.from)   q = q.gte('flagged_at', args.from)
  if (args.to)     q = q.lte('flagged_at', args.to)

  const { data, error } = await q.limit(CAP)
  if (error) throw new Error(error.message)
  return {
    flags: (data || []).map((f: any) => ({
      horse: f.horse_name, type: f.flag_type, status: f.status,
      date: f.flagged_at?.slice(0, 10), day_off_date: f.day_off_date, notes: f.notes,
    })),
    total: data?.length || 0,
  }
}

async function get_patterns(supabase: any, args: any, today: string) {
  const [
    { data: guestsRaw },
    { data: flagsRaw },
    { data: visitsRaw },
    { data: horsesRaw },
    { data: hFlagsRaw },
  ] = await Promise.all([
    supabase.from('guests').select('id, check_in_date, check_out_date, checked_out_at, age, weight, gender, riding_level, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason)'),
    supabase.from('horse_status_flags').select('horse_name, flag_type, flagged_at, status'),
    supabase.from('farrier_visits').select('visit_date, farrier_name, farrier_visit_horses(horse_name, work_done)'),
    supabase.from('horses').select('name, level, weight, is_active, farrier'),
    supabase.from('horse_status_flags').select('horse_name, flag_type, status, day_off_date, flagged_at').eq('status', 'active'),
  ])

  const hFlagsByHorse: Record<string, any[]> = {}
  for (const f of hFlagsRaw || []) {
    if (!hFlagsByHorse[f.horse_name]) hFlagsByHorse[f.horse_name] = []
    hFlagsByHorse[f.horse_name].push({ flag_type: f.flag_type, status: f.status, day_off_date: f.day_off_date ?? null, flagged_at: f.flagged_at })
  }
  const horses = (horsesRaw || []).map((h: any) => ({
    name: h.name, level: h.level, weight: h.weight ?? null, is_active: h.is_active, farrier: h.farrier ?? null,
    flags: hFlagsByHorse[h.name] || [],
  }))
  const visits = (visitsRaw || []).map((v: any) => ({
    visit_date: v.visit_date, farrier_name: v.farrier_name ?? null, farrier_visit_horses: v.farrier_visit_horses || [],
  }))

  const checkInDates = (guestsRaw || []).map((g: any) => g.check_in_date).filter(Boolean) as string[]
  const earliestCheckIn = checkInDates.length > 0 ? [...checkInDates].sort()[0] : today
  const { map: weatherMap } = await fetchWeather(earliestCheckIn, today, today)

  const { findings } = runAllDetectors({
    guests: guestsRaw || [], flags: flagsRaw || [], visits, horses, weatherMap, today,
  })

  return {
    findings: findings.map(f => ({ id: f.id, kind: f.kind, category: f.category, title: f.title, detail: f.detail, n: f.n })),
    count: findings.length,
  }
}

async function get_weather(supabase: any, args: any, today: string) {
  const { map } = await fetchWeather(args.from, args.to, today)
  const rows = Object.entries(map)
    .filter(([d]) => d >= args.from && d <= args.to)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, w]) => ({ date, high_f: w.highF, rain_in: w.rainIn }))
  return { weather: rows, from: args.from, to: args.to }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const TOOL_FNS: Record<string, (s: any, a: any, t: string) => Promise<any>> = {
  get_guests, get_assignments, get_horses, get_horse_activity,
  get_shoe_visits, get_health_flags, get_patterns, get_weather,
}

export async function runTool(name: string, args: any, supabase: any, today: string): Promise<any> {
  const fn = TOOL_FNS[name]
  if (!fn) throw new Error(`Unknown tool: ${name}`)
  return fn(supabase, args, today)
}

// ─── Claude API tool definitions ─────────────────────────────────────────────

export const TOOL_DEFS = [
  {
    name: 'get_guests',
    description: 'Fetch guests with optional filters. Returns { total, truncated, rows (sample ≤200), summary (avg_age, avg_weight, repeat_count, level_counts over ALL records), grouped? }. Use total for counts — never count rows[] yourself. Use group_by to get per-bucket counts over the full population.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD — filter check_in_date >= from' },
        to: { type: 'string', description: 'YYYY-MM-DD — filter check_out_date <= to' },
        here_now: { type: 'boolean', description: 'Only guests currently on property' },
        min_weight: { type: 'number' }, max_weight: { type: 'number' },
        level: { type: 'string', description: 'Riding level code: B, AB, I, I/AI, AI, A' },
        min_age: { type: 'number' }, max_age: { type: 'number' },
        repeat_guest: { type: 'boolean' },
        name: { type: 'string', description: 'Partial name match' },
        group_by: { type: 'string', description: 'Group ALL matching guests by: horse | level | weight_band | month | age_band. Returns complete counts (no cap) in grouped.counts.' },
      },
      required: [],
    },
  },
  {
    name: 'get_assignments',
    description: 'Fetch horse-guest assignment records filtered by guest attributes (age, weight, level) AND assignment attributes (horse, not_a_fit, swap_category). Returns { total, truncated, applied_filters, population, rows (sample ≤200), summary (total_not_a_fit, swap_category_counts over ALL records), grouped? }. Filters are applied before all aggregates — use total for counts, never count rows[] yourself.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD — filter check_in_date >= from' },
        to: { type: 'string', description: 'YYYY-MM-DD — filter check_out_date <= to' },
        horse: { type: 'string', description: 'Exact horse name' },
        guest: { type: 'string', description: 'Partial guest name' },
        min_age: { type: 'number', description: 'Guest age >= min_age' },
        max_age: { type: 'number', description: 'Guest age <= max_age (e.g. 17 for guests aged 17 or younger)' },
        min_weight: { type: 'number' }, max_weight: { type: 'number' },
        level: { type: 'string', description: 'Riding level code: B, AB, I, I/AI, AI, A' },
        not_a_fit: { type: 'boolean' },
        swap_category: { type: 'string' },
        group_by: { type: 'string', description: 'Group ALL matching assignments by: horse | level | weight_band | month | age_band. Returns complete counts (no cap) in grouped.counts. Counts are over the already-filtered population.' },
      },
      required: [],
    },
  },
  {
    name: 'get_horses',
    description: 'Fetch horses with their level, weight limits, draft/kids flags, farrier, and active health flags.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Partial name match' },
        active: { type: 'boolean' },
        available_today: { type: 'boolean', description: 'Exclude horses blocked by active flags today' },
        draft: { type: 'boolean' },
        takes_kids: { type: 'boolean' },
        farrier: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_horse_activity',
    description: 'Detailed activity summary for a single horse: last assigned, guest-days last 8 weeks, total assignments, Not-a-fit count, flag history, shoeing history, usual gap, next full-set estimate.',
    input_schema: {
      type: 'object',
      properties: {
        horse: { type: 'string', description: 'Exact horse name' },
      },
      required: ['horse'],
    },
  },
  {
    name: 'get_shoe_visits',
    description: 'Fetch farrier visit records with work done per horse.',
    input_schema: {
      type: 'object',
      properties: {
        horse: { type: 'string' }, farrier: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' },
        work_category: { type: 'string', description: 'full_set | fronts | rears | partial | trim | other' },
      },
      required: [],
    },
  },
  {
    name: 'get_health_flags',
    description: 'Fetch horse health/status flags (lame, injured, stiff_sore, day_off, in_training, retired).',
    input_schema: {
      type: 'object',
      properties: {
        horse: { type: 'string' },
        type: { type: 'string', description: 'lame | injured | stiff_sore | day_off | in_training | retired' },
        status: { type: 'string', description: 'active | resolved' },
        from: { type: 'string' }, to: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_patterns',
    description: 'Run all pattern detectors and return current findings (actionable and background).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_weather',
    description: 'Fetch historical and forecast weather for the ranch (Tucson/Marana AZ) for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['from', 'to'],
    },
  },
]
