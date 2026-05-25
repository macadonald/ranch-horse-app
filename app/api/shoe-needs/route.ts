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

  // If is_drugger not explicitly provided, read from horses table so the flag persists
  // across remove/re-add cycles. Ignore errors — column may not exist yet.
  let resolvedDrugger = is_drugger ?? false
  if (!is_drugger) {
    const { data: horseRow } = await supabase
      .from('horses')
      .select('is_drugger')
      .eq('name', horse_name)
      .maybeSingle()
    if (horseRow?.is_drugger) resolvedDrugger = true
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

  // Sync is_drugger back to the horses table so it survives remove/re-add cycles.
  // Requires: ALTER TABLE horses ADD COLUMN IF NOT EXISTS is_drugger boolean DEFAULT false;
  // Errors are intentionally ignored — column may not exist yet.
  if ('is_drugger' in fields && data?.horse_name) {
    await supabase
      .from('horses')
      .update({ is_drugger: fields.is_drugger })
      .eq('name', data.horse_name)
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
