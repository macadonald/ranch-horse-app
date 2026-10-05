import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { data, error } = await supabase
    .from('horse_supplements')
    .select('*')
    .order('horse_name')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplements: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { horse_name, supplement_name, frequency, notes } = body
  if (!horse_name || !supplement_name || !frequency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('horse_supplements')
    .insert({ horse_name, supplement_name, frequency, notes: notes || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'supplement.create',
    entityType: 'horse_supplements',
    entityId: data.id,
    summary: `Added supplement ${supplement_name} for ${horse_name}`,
    details: { horse_name, supplement_name, frequency, notes: notes || null },
  })

  return NextResponse.json({ supplement: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('horse_supplements')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const isSupDone = 'done_today' in fields || 'last_treated_at' in fields
  const isSupResolved = fields.status === 'resolved'
  let supUpdateSummary: string
  if (isSupDone) {
    supUpdateSummary = `Marked supplement done for ${data.horse_name}: ${data.supplement_name}`
  } else if (isSupResolved) {
    supUpdateSummary = `Resolved supplement for ${data.horse_name}: ${data.supplement_name}`
  } else {
    supUpdateSummary = `Updated supplement for ${data.horse_name}: ${Object.keys(fields).join(', ')}`
  }
  await logActivity(supabase, { id: userId, email }, {
    action: 'supplement.update',
    entityType: 'horse_supplements',
    entityId: id,
    summary: supUpdateSummary,
    details: { horse_name: data.horse_name, supplement_name: data.supplement_name, updated: fields },
  })

  return NextResponse.json({ supplement: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: existing } = await supabase
    .from('horse_supplements')
    .select('horse_name, supplement_name')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('horse_supplements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'supplement.delete',
    entityType: 'horse_supplements',
    entityId: id,
    summary: `Deleted supplement ${existing?.supplement_name ?? id} for ${existing?.horse_name ?? '?'}`,
    details: { horse_name: existing?.horse_name, supplement_name: existing?.supplement_name },
  })

  return NextResponse.json({ success: true })
}
