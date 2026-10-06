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
  const dates = d?.daily?.time ?? []
  const highs = d?.daily?.temperature_2m_max ?? []
  const rains = d?.daily?.precipitation_sum   ?? []
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

  const today         = getTucsonToday()
  // Archive lags 5–7 days; stop 6 days before today to stay in the reliable zone
  const archiveCutoff = addDays(today, -6)
  const days: WeatherDay[] = []
  const seen = new Set<string>()
  const errors: string[] = []

  // 1. Archive: start → today-6, in chunks of ≤365 days
  if (start <= archiveCutoff) {
    const archiveEnd = end <= archiveCutoff ? end : archiveCutoff
    let chunkStart = start
    while (chunkStart <= archiveEnd) {
      const chunkEnd = (() => {
        const candidate = addDays(chunkStart, 364)  // 365-day chunk
        return candidate <= archiveEnd ? candidate : archiveEnd
      })()
      const url = `${ARCHIVE}?${COORDS}&${FIELDS}&start_date=${chunkStart}&end_date=${chunkEnd}`
      try {
        const res = await fetch(url, { next: { revalidate: 86400 } })
        if (res.ok) {
          for (const d of parseDays(await res.json())) {
            if (!seen.has(d.date)) { days.push(d); seen.add(d.date) }
          }
        } else {
          errors.push(`archive ${chunkStart}–${chunkEnd}: HTTP ${res.status}`)
        }
      } catch (e) {
        errors.push(`archive ${chunkStart}–${chunkEnd}: ${String(e)}`)
      }
      chunkStart = addDays(chunkEnd, 1)
    }
  }

  // 2. Forecast with past_days=7 covers the recent gap (today-7 → today+7)
  //    Fills only dates the archive missed, within the requested range
  if (end >= archiveCutoff) {
    const url = `${FORECAST}?${COORDS}&${FIELDS}&past_days=7&forecast_days=8`
    try {
      const res = await fetch(url, { next: { revalidate: 10800 } })
      if (res.ok) {
        for (const d of parseDays(await res.json())) {
          if (d.date >= start && d.date <= end && !seen.has(d.date)) {
            days.push(d); seen.add(d.date)
          }
        }
      } else {
        errors.push(`forecast: HTTP ${res.status}`)
      }
    } catch (e) {
      errors.push(`forecast: ${String(e)}`)
    }
  }

  days.sort((a, b) => a.date.localeCompare(b.date))
  const result: { days: WeatherDay[]; errors?: string[] } = { days }
  if (errors.length) result.errors = errors
  return NextResponse.json(result)
}
