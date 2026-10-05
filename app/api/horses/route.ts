import { NextRequest, NextResponse } from 'next/server'
import { HORSES } from '@/lib/horses'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { logActivity } from '@/lib/activity'

function isFlagActive(flag: any, today: string): boolean {
  if (flag.status !== 'active') return false
  if (flag.flag_type === 'day_off') return flag.day_off_date === today
  return true
}

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const today = getTucsonToday()

  // Auto-seed from static array on first use
  const { count } = await supabase
    .from('horses')
    .select('*', { count: 'exact', head: true })

  if (count === 0) {
    const seeds = HORSES.map(h => ({
      name: h.name,
      level: h.level,
      weight: h.weight,
      size: h.size,
      notes: h.notes,
      is_active: h.status === 'active' || h.status === 'backup',
      exclude_from_ai: h.excludeFromAI ?? false,
      rank_last: h.rankLast ?? false,
    }))
    // Use upsert so partial prior seeds don't fail
    await supabase.from('horses').upsert(seeds, { onConflict: 'name', ignoreDuplicates: true })
  }

  const [horsesResult, statusFlagsResult, shoeResult] = await Promise.all([
    supabase.from('horses').select('*').order('name'),
    supabase.from('horse_status_flags').select('*').eq('status', 'active'),
    supabase.from('shoe_needs').select('*'),
  ])

  const horses = horsesResult.data || []
  const statusFlags = statusFlagsResult.data || []
  const shoeNeeds = shoeResult.data || []

  // Build shoe map (by horse name)
  const shoeMap: Record<string, { id: string; what_needed: string; notes: string | null }[]> = {}
  shoeNeeds.forEach((n: any) => {
    if (!shoeMap[n.horse_name]) shoeMap[n.horse_name] = []
    shoeMap[n.horse_name].push({ id: n.id, what_needed: n.what_needed, notes: n.notes ?? null })
  })

  const enriched = horses.map((h: any) => {
    const flags = statusFlags.filter((f: any) => f.horse_name === h.name && isFlagActive(f, today))
    const shoe_flags = shoeMap[h.name] || []
    return { ...h, flags, shoe_flags }
  })

  return NextResponse.json({ horses: enriched })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { name, level, weight, size, notes, is_active, exclude_from_ai, rank_last, is_deceased, is_draft, takes_kids } = body
  if (!name?.trim() || !level || !size) {
    return NextResponse.json({ error: 'Name, level, and size are required.' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('horses')
    .insert({
      name: name.trim(),
      level,
      weight: weight ? parseInt(weight) : null,
      size,
      notes: notes || '',
      is_active: is_active ?? true,
      exclude_from_ai: exclude_from_ai ?? false,
      rank_last: rank_last ?? false,
      is_deceased: is_deceased ?? false,
      is_draft: is_draft ?? false,
      takes_kids: takes_kids ?? false,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'horse.create',
    entityType: 'horses',
    entityId: data.id,
    summary: `Added horse ${data.name}`,
    details: { name: data.name, level, size, is_active: data.is_active },
  })

  return NextResponse.json({ horse: { ...data, flags: [], shoe_flags: [] } })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { id, flags, shoe_flags, created_at, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('horses')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let summary: string
  if ('is_active' in fields) {
    summary = `${fields.is_active ? 'Activated' : 'Deactivated'} ${data.name}`
  } else if ('is_deceased' in fields && fields.is_deceased) {
    summary = `Marked ${data.name} deceased`
  } else if ('farrier' in fields) {
    summary = `Set farrier for ${data.name}: ${fields.farrier ?? 'none'}`
  } else {
    summary = `Edited ${data.name}: ${Object.keys(fields).join(', ')}`
  }

  await logActivity(supabase, { id: userId, email }, {
    action: 'horse.update',
    entityType: 'horses',
    entityId: id,
    summary,
    details: { name: data.name, updated: fields },
  })

  return NextResponse.json({ horse: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Get horse name before deleting (for flag cleanup and logging)
  const { data: horse } = await supabase.from('horses').select('name').eq('id', id).single()
  if (horse?.name) {
    await supabase.from('horse_status_flags').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('horse_name', horse.name)
  }
  const { error } = await supabase.from('horses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'horse.delete',
    entityType: 'horses',
    entityId: id,
    summary: `Deleted horse ${horse?.name ?? id}`,
    details: { name: horse?.name },
  })

  return NextResponse.json({ success: true })
}
