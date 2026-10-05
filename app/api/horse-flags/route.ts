import { NextRequest, NextResponse } from 'next/server'
import { getTucsonToday } from '@/lib/timezone'
import { requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
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

  await logActivity(supabase, { id: userId, email }, {
    action: 'horse_flag.create',
    entityType: 'horse_status_flags',
    entityId: data.id,
    summary: `Flagged ${horse_name} ${flag_type.replace('_', ' ')}`,
    details: { horse_name, flag_type, notes: notes || null },
  })

  return NextResponse.json({ flag: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const horseName = searchParams.get('horse_name')
  const flagType = searchParams.get('flag_type')
  const all = searchParams.get('all') === 'true'

  if (id) {
    const { data: flag } = await supabase
      .from('horse_status_flags')
      .select('horse_name, flag_type')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('horse_status_flags')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity(supabase, { id: userId, email }, {
      action: 'horse_flag.delete',
      entityType: 'horse_status_flags',
      entityId: id,
      summary: `Cleared ${flag?.flag_type?.replace('_', ' ') ?? 'flag'} for ${flag?.horse_name ?? '?'}`,
      details: { horse_name: flag?.horse_name, flag_type: flag?.flag_type },
    })

    return NextResponse.json({ success: true })
  }

  if (horseName) {
    if (all) {
      await supabase
        .from('horse_status_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('horse_name', horseName)
        .eq('status', 'active')

      await logActivity(supabase, { id: userId, email }, {
        action: 'horse_flag.delete',
        entityType: 'horse_status_flags',
        summary: `Cleared all flags for ${horseName}`,
        details: { horse_name: horseName },
      })
    } else if (flagType) {
      await supabase
        .from('horse_status_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('horse_name', horseName)
        .eq('flag_type', flagType)
        .eq('status', 'active')

      await logActivity(supabase, { id: userId, email }, {
        action: 'horse_flag.delete',
        entityType: 'horse_status_flags',
        summary: `Cleared ${flagType.replace('_', ' ')} for ${horseName}`,
        details: { horse_name: horseName, flag_type: flagType },
      })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Missing id or horse_name' }, { status: 400 })
}
