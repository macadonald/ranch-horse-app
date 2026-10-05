import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireUser, requireAdmin } from '@/lib/auth-server'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
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
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const { data, error } = await supabase
    .from('farriers')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ farrier: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
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

  return NextResponse.json({ farrier: data })
}
