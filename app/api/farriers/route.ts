import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { data, error } = await supabase
    .from('farriers')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ farriers: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const { data, error } = await supabase
    .from('farriers')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'farrier.create',
    entityType: 'farriers',
    entityId: data.id,
    summary: `Added farrier ${name.trim()}`,
    details: { name: name.trim() },
  })

  return NextResponse.json({ farrier: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { id, name, oldName, active } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (active !== undefined) updates.active = active

  const { data, error } = await supabase
    .from('farriers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If renaming, cascade to horses.farrier and other_animals.farrier. Do NOT touch farrier_visits history.
  if (name !== undefined && oldName) {
    await supabase.from('horses').update({ farrier: name.trim() }).eq('farrier', oldName)
    await supabase.from('other_animals').update({ farrier: name.trim() }).eq('farrier', oldName)
  }

  let summary = ''
  if (name !== undefined && oldName && oldName !== name.trim()) {
    summary = `Renamed farrier ${oldName} → ${name.trim()}`
  } else if (active !== undefined) {
    summary = `${active ? 'Activated' : 'Deactivated'} farrier ${data.name}`
  } else {
    summary = `Updated farrier ${data.name}`
  }

  await logActivity(supabase, { id: userId, email }, {
    action: 'farrier.update',
    entityType: 'farriers',
    entityId: id,
    summary,
    details: { updates, oldName: oldName ?? null },
  })

  return NextResponse.json({ farrier: data })
}
