import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { HORSES } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'

function isFlagActive(flag: any, today: string): boolean {
  if (flag.status !== 'active') return false
  if (flag.flag_type === 'day_off') return flag.day_off_date === today
  return true
}

export async function GET() {
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

  const [horsesResult, statusFlagsResult, lameFlagsResult, shoeResult] = await Promise.all([
    supabase.from('horses').select('*').order('name'),
    supabase.from('horse_status_flags').select('*').eq('status', 'active'),
    supabase.from('horse_lame_flags').select('*').eq('status', 'active'),
    supabase.from('shoe_needs').select('*'),
  ])

  const horses = horsesResult.data || []
  const statusFlags = statusFlagsResult.data || []
  const lameFlags = lameFlagsResult.data || []
  const shoeNeeds = shoeResult.data || []

  // Build shoe map (by horse name)
  const shoeMap: Record<string, { id: string; what_needed: string; notes: string | null }[]> = {}
  shoeNeeds.forEach((n: any) => {
    if (!shoeMap[n.horse_name]) shoeMap[n.horse_name] = []
    shoeMap[n.horse_name].push({ id: n.id, what_needed: n.what_needed, notes: n.notes ?? null })
  })

  // Convert legacy lame flags to DbHorseFlag shape
  const legacyFlagsByHorse: Record<string, any[]> = {}
  lameFlags.forEach((f: any) => {
    const mapped = {
      id: f.id,
      horse_name: f.horse_name,
      flag_type: f.flag_type === 'stiff_sore' ? 'injured' : 'lame',
      notes: f.notes ?? null,
      flagged_at: f.flagged_at,
      day_off_date: null,
      status: f.status,
      legacy: true,
    }
    if (!legacyFlagsByHorse[f.horse_name]) legacyFlagsByHorse[f.horse_name] = []
    legacyFlagsByHorse[f.horse_name].push(mapped)
  })

  const enriched = horses.map((h: any) => {
    const newFlags = statusFlags.filter((f: any) => f.horse_name === h.name && isFlagActive(f, today))
    // Include legacy flags that don't duplicate an existing new flag of the same type
    const newFlagTypes = new Set(newFlags.map((f: any) => f.flag_type))
    const legacy = (legacyFlagsByHorse[h.name] || []).filter((f: any) => !newFlagTypes.has(f.flag_type))
    const flags = [...newFlags, ...legacy]
    const shoe_flags = shoeMap[h.name] || []
    return { ...h, flags, shoe_flags }
  })

  return NextResponse.json({ horses: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, level, weight, size, notes, is_active, exclude_from_ai, rank_last } = body
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
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ horse: { ...data, flags: [], shoe_flags: [] } })
}

export async function PUT(req: NextRequest) {
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
  return NextResponse.json({ horse: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Get horse name before deleting (for flag cleanup)
  const { data: horse } = await supabase.from('horses').select('name').eq('id', id).single()
  if (horse?.name) {
    await supabase.from('horse_status_flags').update({ status: 'resolved' }).eq('horse_name', horse.name)
  }
  const { error } = await supabase.from('horses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
