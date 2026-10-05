import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { data, error } = await supabase
    .from('farrier_visits')
    .select('*, farrier_visit_horses(*)')
    .order('visit_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ visits: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { visit_date, farrier_name, horses } = body
  if (!visit_date || !farrier_name || !horses?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: visit, error: visitError } = await supabase
    .from('farrier_visits')
    .insert({ visit_date, farrier_name })
    .select()
    .single()
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 })

  const horseRecords = horses.map((h: {
    horse_name: string; work_done: string; shoe_type?: string
    shoe_size?: string; placement?: string; notes?: string
  }) => ({
    visit_id: visit.id,
    horse_name: h.horse_name,
    work_done: h.work_done,
    shoe_type: h.shoe_type || null,
    shoe_size: h.shoe_size || null,
    placement: h.placement || null,
    notes: h.notes || null,
  }))

  const { error: horsesError } = await supabase.from('farrier_visit_horses').insert(horseRecords)
  if (horsesError) return NextResponse.json({ error: horsesError.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'farrier_visit.create',
    entityType: 'farrier_visits',
    entityId: visit.id,
    summary: `Logged farrier visit: ${farrier_name}, ${horses.length} horse${horses.length !== 1 ? 's' : ''}`,
    details: { visit_date, farrier_name, horses: horses.map((h: { horse_name: string; work_done: string }) => ({ horse: h.horse_name, work: h.work_done })) },
  })

  return NextResponse.json({ visit })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

  const { data: visit } = await supabase
    .from('farrier_visits')
    .select('visit_date, farrier_name')
    .eq('id', id)
    .single()

  const { error: horsesError } = await supabase.from('farrier_visit_horses').delete().eq('visit_id', id)
  if (horsesError) return NextResponse.json({ error: horsesError.message }, { status: 500 })
  const { error: visitError } = await supabase.from('farrier_visits').delete().eq('id', id)
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'farrier_visit.delete',
    entityType: 'farrier_visits',
    entityId: id,
    summary: `Deleted farrier visit by ${visit?.farrier_name ?? '?'} on ${visit?.visit_date ?? '?'}`,
    details: { visit_date: visit?.visit_date, farrier_name: visit?.farrier_name },
  })

  return NextResponse.json({ success: true })
}
