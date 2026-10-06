import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { fetchWeather } from '@/lib/weather'

export type { WeatherDay } from '@/lib/weather'

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') ?? ''
  const end   = searchParams.get('end')   ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return NextResponse.json({ days: [], error: 'Invalid date range' })
  }

  const today = getTucsonToday()
  const { map, errors } = await fetchWeather(start, end, today)

  const days = Object.entries(map)
    .map(([date, w]) => ({ date, ...w }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const result: { days: typeof days; errors?: string[] } = { days }
  if (errors?.length) result.errors = errors
  return NextResponse.json(result)
}
