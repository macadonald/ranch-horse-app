import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('horse_lame_flags')
    .select('*')
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
  const body = await req.json()
  const { horse_name, flag_type, notes } = body
  if (!horse_name || !flag_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('horse_lame_flags')
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
  return NextResponse.json({ flag: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('horse_lame_flags')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flag: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('horse_lame_flags').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
