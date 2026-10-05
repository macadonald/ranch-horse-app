import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { RANCH_LAT, RANCH_LON, RANCH_TIMEZONE } from '@/lib/ranch'

export type WeatherDay = { date: string; highF: number | null; rainIn: number | null }

const COORDS   = `latitude=${RANCH_LAT}&longitude=${RANCH_LON}`
const FIELDS   = `daily=temperature_2m_max,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=${encodeURIComponent(RANCH_TIMEZONE)}`
const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function parseDays(data: unknown): WeatherDay[] {
  const d = data as { daily?: { time: string[]; temperature_2m_max: (number|null)[]; precipitation_sum: (number|null)[] } }
  const dates  = d?.daily?.time ?? []
  const highs  = d?.daily?.temperature_2m_max ?? []
  const rains  = d?.daily?.precipitation_sum   ?? []
  return dates.map((date, i) => ({ date, highF: highs[i] ?? null, rainIn: rains[i] ?? null }))
}

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') ?? ''
  const end   = searchParams.get('end')   ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return NextResponse.json({ days: [], error: 'Invalid date range' })
  }

  const today     = getTucsonToday()
  const yesterday = addDays(today, -1)
  const days: WeatherDay[] = []
  const seen = new Set<string>()

  try {
    // Archive: past dates (up through yesterday)
    if (start <= yesterday) {
      const archiveEnd = end <= yesterday ? end : yesterday
      const url = `${ARCHIVE}?${COORDS}&${FIELDS}&start_date=${start}&end_date=${archiveEnd}`
      const res = await fetch(url, { next: { revalidate: 86400 } })
      if (res.ok) {
        for (const d of parseDays(await res.json())) { days.push(d); seen.add(d.date) }
      }
    }

    // Forecast: today and future (max 16 days out)
    if (end >= today) {
      const forecastStart = start >= today ? start : today
      const maxEnd        = addDays(today, 15)
      const forecastEnd   = end <= maxEnd ? end : maxEnd
      const url = `${FORECAST}?${COORDS}&${FIELDS}&start_date=${forecastStart}&end_date=${forecastEnd}`
      const res = await fetch(url, { next: { revalidate: 10800 } })
      if (res.ok) {
        for (const d of parseDays(await res.json())) {
          if (!seen.has(d.date)) { days.push(d); seen.add(d.date) }
        }
      }
    }

    days.sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json({ days })
  } catch (err) {
    return NextResponse.json({ days: [], error: String(err) })
  }
}
