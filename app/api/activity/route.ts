import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

const ACTION_GROUPS: Record<string, string[]> = {
  guests:      ['guest.'],
  assignments: ['assignment.'],
  horses:      ['horse.', 'horse_flag.', 'animal.'],
  health:      ['health_flag.', 'health_issue.'],
  shoes:       ['shoe_need.', 'farrier_visit.'],
  farriers:    ['farrier.'],
  other:       ['rider_count.', 'supplement.'],
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const userId   = searchParams.get('user_id') ?? ''
  const person   = searchParams.get('person') ?? ''
  const group    = searchParams.get('group') ?? ''
  const since    = searchParams.get('since') ?? ''
  const until    = searchParams.get('until') ?? ''
  const pageSize = 50

  let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (userId)      query = query.eq('user_id', userId)
  else if (person) query = query.eq('user_email', person)
  if (since)  query = query.gte('created_at', since + 'T00:00:00.000Z')
  if (until)  query = query.lte('created_at', until + 'T23:59:59.999Z')

  if (group && ACTION_GROUPS[group]) {
    const filter = ACTION_GROUPS[group].map(p => `action.like.${p}*`).join(',')
    query = (query as any).or(filter)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Distinct people for the filter dropdown
  const { data: peopleRows } = await supabase
    .from('activity_log')
    .select('user_email')
    .not('user_email', 'is', null)
    .order('user_email')

  const peopleSet = new Set((peopleRows || []).map((r: any) => r.user_email as string))
  const people = Array.from(peopleSet).filter(Boolean).sort()

  return NextResponse.json({ logs: data || [], total: count ?? 0, page, pageSize, people })
}
