import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('shoe_needs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Normalize priority to boolean — guards against null (pre-migration rows) or missing column
  const needs = (data || []).map((n: any) => ({ ...n, priority: n.priority ?? false }))
  return NextResponse.json({ needs })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { horse_name, what_needed, shoe_type, is_drugger, notes } = body
  if (!horse_name || !what_needed) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If is_drugger not explicitly provided, read from horses and other_animals tables so
  // the flag persists across remove/re-add cycles. Errors ignored — column may not exist yet.
  let resolvedDrugger = is_drugger ?? false
  if (!is_drugger) {
    const [{ data: horseRow }, { data: otherRow }] = await Promise.all([
      supabase.from('horses').select('is_drugger').eq('name', horse_name).maybeSingle(),
      supabase.from('other_animals').select('is_drugger').eq('name', horse_name).maybeSingle(),
    ])
    if (horseRow?.is_drugger || otherRow?.is_drugger) resolvedDrugger = true
  }

  const { data, error } = await supabase
    .from('shoe_needs')
    .insert({
      horse_name,
      what_needed,
      shoe_type: shoe_type || 'regular',
      is_drugger: resolvedDrugger,
      notes: notes || null,
    })
    .select()
    .single()
  if (error) {
    // Fallback: enhanced columns may not exist if migration hasn't been run yet
    if (error.message.includes('shoe_type') || error.message.includes('is_drugger')) {
      const { data: fd, error: fe } = await supabase
        .from('shoe_needs')
        .insert({ horse_name, what_needed, notes: notes || null })
        .select()
        .single()
      if (fe) return NextResponse.json({ error: fe.message }, { status: 500 })
      return NextResponse.json({ need: fd })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ need: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('shoe_needs')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync is_drugger to both horses and other_animals tables so it survives remove/re-add
  // cycles regardless of which table the animal lives in. Errors ignored — columns may not
  // exist yet. Requires migrations:
  //   ALTER TABLE horses ADD COLUMN IF NOT EXISTS is_drugger boolean DEFAULT false;
  //   ALTER TABLE other_animals ADD COLUMN IF NOT EXISTS is_drugger boolean DEFAULT false;
  if ('is_drugger' in fields && data?.horse_name) {
    await Promise.all([
      supabase.from('horses').update({ is_drugger: fields.is_drugger }).eq('name', data.horse_name),
      supabase.from('other_animals').update({ is_drugger: fields.is_drugger }).eq('name', data.horse_name),
    ])
  }

  return NextResponse.json({ need: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('shoe_needs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
