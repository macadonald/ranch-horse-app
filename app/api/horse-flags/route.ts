import { NextRequest, NextResponse } from 'next/server'
import { getTucsonToday } from '@/lib/timezone'
import { requireAdmin } from '@/lib/auth-server'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const today = getTucsonToday()
  const body = await req.json()
  const { horse_name, flag_type, notes } = body
  if (!horse_name || !flag_type) {
    return NextResponse.json({ error: 'Missing horse_name or flag_type' }, { status: 400 })
  }

  // Resolve any existing active flag of the same type for this horse
  await supabase
    .from('horse_status_flags')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('horse_name', horse_name)
    .eq('flag_type', flag_type)
    .eq('status', 'active')

  const payload: any = {
    horse_name,
    flag_type,
    notes: notes || null,
    status: 'active',
    flagged_at: new Date().toISOString(),
  }
  if (flag_type === 'day_off') payload.day_off_date = today

  const { data, error } = await supabase
    .from('horse_status_flags')
    .insert(payload)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flag: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const horseName = searchParams.get('horse_name')
  const flagType = searchParams.get('flag_type')
  const all = searchParams.get('all') === 'true'

  if (id) {
    const { error } = await supabase
      .from('horse_status_flags')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (horseName) {
    if (all) {
      await supabase
        .from('horse_status_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('horse_name', horseName)
        .eq('status', 'active')
    } else if (flagType) {
      await supabase
        .from('horse_status_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('horse_name', horseName)
        .eq('flag_type', flagType)
        .eq('status', 'active')
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Missing id or horse_name' }, { status: 400 })
}
