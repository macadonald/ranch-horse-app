import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const LEARNING_CUTOFF = '2026-05-11'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const guestId = searchParams.get('guest_id')
  const guestName = searchParams.get('guest_name')
  const horseName = searchParams.get('horse_name')
  const checkReturning = searchParams.get('check_returning')
  const allReturning = searchParams.get('all_returning') === 'true'
  const since = searchParams.get('since')

  // Returns distinct guest names that have any history record
  if (allReturning) {
    const { data } = await supabase
      .from('assignment_history')
      .select('guest_name')
      .gte('assigned_date', LEARNING_CUTOFF)
    const seen = new Set<string>()
    const names: string[] = []
    for (const r of data || []) { const n = r.guest_name as string; if (!seen.has(n)) { seen.add(n); names.push(n) } }
    return NextResponse.json({ names })
  }

  // Check if a specific guest name has prior history (returning guest detection)
  if (checkReturning) {
    const { data } = await supabase
      .from('assignment_history')
      .select('id, horse_name, assigned_date, match_quality')
      .ilike('guest_name', checkReturning)
      .gte('assigned_date', LEARNING_CUTOFF)
      .order('assigned_date', { ascending: false })
      .limit(3)
    return NextResponse.json({ isReturning: (data?.length ?? 0) > 0, records: data || [] })
  }

  // Bulk fetch since a date (for AssignAll draft disclaimers)
  if (since) {
    const { data, error } = await supabase
      .from('assignment_history')
      .select('guest_name, horse_name, assigned_date, match_quality, doesnt_work')
      .gte('assigned_date', since)
      .order('assigned_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ history: data || [] })
  }

  let query = supabase
    .from('assignment_history')
    .select('*')
    .order('assigned_date', { ascending: false })

  if (guestId) query = query.eq('guest_id', guestId)
  else if (guestName) query = query.ilike('guest_name', guestName)
  else if (horseName) query = query.eq('horse_name', horseName)
  else return NextResponse.json({ error: 'Need guest_id, guest_name, horse_name, check_returning, all_returning, or since' }, { status: 400 })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ history: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { guest_name, guest_id, horse_name, assignment_type, assigned_date, source } = body
  if (!guest_name || !horse_name || !assigned_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('assignment_history')
    .insert({
      guest_name,
      guest_id: guest_id || null,
      horse_name,
      assignment_type: assignment_type || 'primary',
      assigned_date,
      source: source || 'manual',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, match_quality, doesnt_work, doesnt_work_reason, archive_guest_name } = body

  // Archive all records for a guest on proper checkout
  if (archive_guest_name) {
    const { error } = await supabase
      .from('assignment_history')
      .update({ archived_at: new Date().toISOString() })
      .ilike('guest_name', archive_guest_name)
      .is('archived_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (match_quality !== undefined) update.match_quality = match_quality
  if (doesnt_work !== undefined) update.doesnt_work = doesnt_work
  if (doesnt_work_reason !== undefined) update.doesnt_work_reason = doesnt_work_reason

  const { data, error } = await supabase
    .from('assignment_history')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data })
}
