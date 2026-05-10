import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('horse_health_issues')
    .select('*')
    .order('opened_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const issues = data || []

  // Derive vet-flagged horse names from currently active vet_required issues.
  // The board page uses this list to remove those horses from the assignment pool.
  const vetFlaggedHorses = Array.from(
    new Set(
      issues
        .filter((i: any) => i.status === 'active' && i.severity === 'vet_required')
        .map((i: any) => i.horse_name as string)
    )
  )

  return NextResponse.json({ issues, vet_flagged_horses: vetFlaggedHorses })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { horse_name, type, location, severity, frequency, treatment_notes, notes } = body
  if (!horse_name || !type || !location || !severity || !frequency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('horse_health_issues')
    .insert({
      horse_name,
      type,
      location,
      severity,
      frequency,
      treatment_notes: treatment_notes || null,
      notes: notes || null,
      status: 'active',
      opened_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ issue: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('horse_health_issues')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ issue: data })
}
