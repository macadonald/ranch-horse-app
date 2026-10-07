import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const [{ data: groupsRaw, error }, { data: guestRows }] = await Promise.all([
    supabase.from('guest_groups').select('id, name, notes, created_at').order('name'),
    supabase.from('guests').select('group_id').not('group_id', 'is', null),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const countMap: Record<string, number> = {}
  for (const row of (guestRows || [])) {
    if (row.group_id) countMap[row.group_id] = (countMap[row.group_id] || 0) + 1
  }

  const groups = (groupsRaw || []).map((g: any) => ({
    ...g,
    guest_count: countMap[g.id] ?? 0,
  }))
  return NextResponse.json({ groups })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const body = await req.json()
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('guest_groups').select('id, name, notes').ilike('name', name).maybeSingle()
  if (existing) return NextResponse.json({ group: existing, existed: true })

  const { data, error } = await supabase
    .from('guest_groups')
    .insert({ name, notes: body.notes ?? null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'group.create',
    entityType: 'guest_groups',
    entityId: data.id,
    summary: `Created group ${data.name}`,
  })
  return NextResponse.json({ group: data, existed: false })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (updates.name) updates.name = updates.name.trim()

  const { data, error } = await supabase
    .from('guest_groups').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'group.update',
    entityType: 'guest_groups',
    entityId: id,
    summary: `Updated group ${data.name}`,
  })
  return NextResponse.json({ group: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: existing } = await supabase.from('guest_groups').select('name').eq('id', id).single()
  const { error } = await supabase.from('guest_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'group.delete',
    entityType: 'guest_groups',
    entityId: id,
    summary: `Deleted group ${existing?.name ?? id}`,
  })
  return NextResponse.json({ ok: true })
}
