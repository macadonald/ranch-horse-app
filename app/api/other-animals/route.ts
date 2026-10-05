import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { data, error } = await supabase
    .from('other_animals')
    .select('*')
    .order('group_name')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ animals: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { name, group_name, age, notes } = body
  if (!name || !group_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('other_animals')
    .insert({ name, group_name, age: age || null, notes: notes || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'animal.create',
    entityType: 'other_animals',
    entityId: data.id,
    summary: `Added ${name} (${group_name})`,
    details: { name, group_name, age: age || null },
  })

  return NextResponse.json({ animal: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { id, name, group_name, age, notes, farrier } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const fields: Record<string, unknown> = {}
  if (name !== undefined) fields.name = name
  if (group_name !== undefined) fields.group_name = group_name
  if (age !== undefined) fields.age = age
  if (notes !== undefined) fields.notes = notes
  if (farrier !== undefined) fields.farrier = farrier
  const { data, error } = await supabase
    .from('other_animals')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const changedKeys = Object.keys(fields)
  await logActivity(supabase, { id: userId, email }, {
    action: 'animal.update',
    entityType: 'other_animals',
    entityId: id,
    summary: `Edited ${data.name}: ${changedKeys.join(', ')}`,
    details: { name: data.name, updated: fields },
  })

  return NextResponse.json({ animal: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: existing } = await supabase
    .from('other_animals')
    .select('name, group_name')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('other_animals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'animal.delete',
    entityType: 'other_animals',
    entityId: id,
    summary: `Deleted ${existing?.name ?? id}`,
    details: { name: existing?.name, group_name: existing?.group_name },
  })

  return NextResponse.json({ success: true })
}
