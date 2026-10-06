import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { fetchWeather } from '@/lib/weather'
import { runAllDetectors, DetectorInput } from '@/lib/patterns/index'
import type { PatternGuest, PatternFlag, PatternHorse, PatternVisit } from '@/lib/patterns/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const today = getTucsonToday()

  const [
    { data: guestsRaw,  error: guestErr  },
    { data: flagsRaw,   error: flagErr   },
    { data: visitsRaw,  error: visitErr  },
    { data: horsesRaw,  error: horseErr  },
    { data: hFlagsRaw,  error: hFlagErr  },
  ] = await Promise.all([
    supabase.from('guests').select(
      'id, check_in_date, check_out_date, checked_out_at, age, weight, gender, riding_level, horse_assignments(horse_name, incompatible, removed_at, swap_category, swap_reason, reason)'
    ),
    supabase.from('horse_status_flags').select('horse_name, flag_type, flagged_at, status'),
    supabase.from('farrier_visits').select('visit_date, farrier_name, farrier_visit_horses(horse_name, work_done)'),
    supabase.from('horses').select('name, level, weight, is_active, farrier'),
    supabase.from('horse_status_flags').select('horse_name, flag_type, status, day_off_date, flagged_at').eq('status', 'active'),
  ])

  if (guestErr) return NextResponse.json({ error: guestErr.message }, { status: 500 })
  if (flagErr)  return NextResponse.json({ error: flagErr.message  }, { status: 500 })
  if (visitErr) return NextResponse.json({ error: visitErr.message }, { status: 500 })
  if (horseErr) return NextResponse.json({ error: horseErr.message }, { status: 500 })
  if (hFlagErr) return NextResponse.json({ error: hFlagErr.message }, { status: 500 })

  const guests = (guestsRaw || []) as PatternGuest[]
  const flags  = (flagsRaw  || []) as PatternFlag[]
  const visits = (visitsRaw || []).map((v: any) => ({
    visit_date: v.visit_date,
    farrier_name: v.farrier_name ?? null,
    farrier_visit_horses: v.farrier_visit_horses || [],
  })) as PatternVisit[]

  // Build horses with their active flags
  const hFlagsByHorse: Record<string, PatternHorse['flags']> = {}
  ;(hFlagsRaw || []).forEach((f: any) => {
    if (!hFlagsByHorse[f.horse_name]) hFlagsByHorse[f.horse_name] = []
    hFlagsByHorse[f.horse_name].push({
      flag_type: f.flag_type,
      status: f.status,
      day_off_date: f.day_off_date ?? null,
      flagged_at: f.flagged_at,
    })
  })
  const horses = (horsesRaw || []).map((h: any): PatternHorse => ({
    name: h.name,
    level: h.level,
    weight: h.weight ?? null,
    is_active: h.is_active,
    farrier: h.farrier ?? null,
    flags: hFlagsByHorse[h.name] || [],
  }))

  // Weather: from earliest check-in to today
  const checkInDates = guests.map(g => g.check_in_date).filter(Boolean) as string[]
  const earliestCheckIn = checkInDates.length > 0 ? [...checkInDates].sort()[0] : today
  const { map: weatherMap } = await fetchWeather(earliestCheckIn, today, today)

  const input: DetectorInput = { guests, flags, visits, horses, weatherMap, today }
  const { findings, statuses } = runAllDetectors(input)

  return NextResponse.json({ findings, statuses, generatedAt: new Date().toISOString() })
}
