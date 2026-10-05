import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

const HEALTH_FLAG_TYPES = ['lame', 'stiff_sore', 'injured']

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { data, error } = await supabase
    .from('horse_status_flags')
    .select('*')
    .in('flag_type', HEALTH_FLAG_TYPES)
    .order('flagged_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flags = data || []
  const active = flags.filter((f: any) => f.status === 'active')

  const lameHorses = Array.from(
    new Set(active.filter((f: any) => f.flag_type === 'lame').map((f: any) => f.horse_name as string))
  )
  const stiffSoreHorses = Array.from(
    new Set(active.filter((f: any) => f.flag_type === 'stiff_sore').map((f: any) => f.horse_name as string))
  )

  return NextResponse.json({ flags, lame_horses: lameHorses, stiff_sore_horses: stiffSoreHorses })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { horse_name, flag_type, notes } = body
  if (!horse_name || !flag_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('horse_status_flags')
    .insert({
      horse_name,
      flag_type,
      notes: notes || null,
      status: 'active',
      flagged_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'health_flag.create',
    entityType: 'horse_status_flags',
    entityId: data.id,
    summary: `Flagged ${horse_name} ${flag_type.replace('_', ' ')}`,
    details: { horse_name, flag_type, notes: notes || null },
  })

  return NextResponse.json({ flag: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (fields.status === 'resolved' && !fields.resolved_at) {
    fields.resolved_at = new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('horse_status_flags')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const statusNote = fields.status === 'resolved' ? 'resolved' : 'updated'
  await logActivity(supabase, { id: userId, email }, {
    action: 'health_flag.update',
    entityType: 'horse_status_flags',
    entityId: id,
    summary: `${fields.status === 'resolved' ? 'Resolved' : 'Updated'} ${data.flag_type?.replace('_', ' ') ?? 'health flag'} for ${data.horse_name}`,
    details: { horse_name: data.horse_name, flag_type: data.flag_type, status: statusNote, updated: fields },
  })

  return NextResponse.json({ flag: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

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
    action: 'health_flag.delete',
    entityType: 'horse_status_flags',
    entityId: id,
    summary: `Resolved ${flag?.flag_type?.replace('_', ' ') ?? 'health flag'} for ${flag?.horse_name ?? '?'}`,
    details: { horse_name: flag?.horse_name, flag_type: flag?.flag_type },
  })

  return NextResponse.json({ success: true })
}
