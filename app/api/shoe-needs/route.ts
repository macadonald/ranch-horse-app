import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
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
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
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

      await logActivity(supabase, { id: userId, email }, {
        action: 'shoe_need.create',
        entityType: 'shoe_needs',
        entityId: fd.id,
        summary: `Added ${horse_name} to shoe list: ${what_needed}`,
        details: { horse_name, what_needed },
      })

      return NextResponse.json({ need: fd })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity(supabase, { id: userId, email }, {
    action: 'shoe_need.create',
    entityType: 'shoe_needs',
    entityId: data.id,
    summary: `Added ${horse_name} to shoe list: ${what_needed}`,
    details: { horse_name, what_needed, shoe_type: shoe_type || 'regular' },
  })

  return NextResponse.json({ need: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
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
  // exist yet.
  if ('is_drugger' in fields && data?.horse_name) {
    await Promise.all([
      supabase.from('horses').update({ is_drugger: fields.is_drugger }).eq('name', data.horse_name),
      supabase.from('other_animals').update({ is_drugger: fields.is_drugger }).eq('name', data.horse_name),
    ])
  }

  let summary = `Updated shoe need for ${data.horse_name}`
  if ('priority' in fields) summary = `${fields.priority ? 'Marked priority' : 'Cleared priority'} for ${data.horse_name}`
  else if ('is_drugger' in fields) summary = `${fields.is_drugger ? 'Marked' : 'Cleared'} drugger flag for ${data.horse_name}`

  await logActivity(supabase, { id: userId, email }, {
    action: 'shoe_need.update',
    entityType: 'shoe_needs',
    entityId: id,
    summary,
    details: { horse_name: data.horse_name, updated: fields },
  })

  return NextResponse.json({ need: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: existing } = await supabase
    .from('shoe_needs')
    .select('horse_name, what_needed')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('shoe_needs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'shoe_need.delete',
    entityType: 'shoe_needs',
    entityId: id,
    summary: `Removed ${existing?.horse_name ?? id} from shoe list`,
    details: { horse_name: existing?.horse_name, what_needed: existing?.what_needed },
  })

  return NextResponse.json({ success: true })
}
