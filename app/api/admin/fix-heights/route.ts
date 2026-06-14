import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Matches heights like 5'9 or 6'10 (foot mark present, no trailing inch mark)
const MISSING_INCH_MARK = /^\d+'\d+$/

// GET  — preview rows that would be updated, no changes made
export async function GET() {
  const { data, error } = await supabase
    .from('guests')
    .select('id, name, room_number, height')
    .not('height', 'is', null)
    .neq('height', '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const affected = (data || []).filter(g => MISSING_INCH_MARK.test(g.height ?? ''))

  return NextResponse.json({
    count: affected.length,
    rows: affected.map(g => ({
      id: g.id,
      name: g.name,
      room_number: g.room_number,
      height_current: g.height,
      height_fixed: g.height + '"',
    })),
  })
}

// POST — apply the fix; returns updated rows
export async function POST() {
  const { data: all, error: fetchErr } = await supabase
    .from('guests')
    .select('id, name, room_number, height')
    .not('height', 'is', null)
    .neq('height', '')

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const affected = (all || []).filter(g => MISSING_INCH_MARK.test(g.height ?? ''))

  if (affected.length === 0) return NextResponse.json({ updated: 0, rows: [] })

  const results = await Promise.all(
    affected.map(g =>
      supabase
        .from('guests')
        .update({ height: g.height + '"' })
        .eq('id', g.id)
        .select('id, name, room_number, height')
        .single()
    )
  )

  const updated = results.filter(r => !r.error).map(r => r.data)
  const errors  = results.filter(r => r.error).map(r => r.error!.message)

  return NextResponse.json({ updated: updated.length, rows: updated, errors })
}
