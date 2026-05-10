import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('farrier_visits')
    .select('*, farrier_visit_horses(*)')
    .order('visit_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ visits: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { visit_date, farrier_name, horses } = body
  if (!visit_date || !farrier_name || !horses?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: visit, error: visitError } = await supabase
    .from('farrier_visits')
    .insert({ visit_date, farrier_name })
    .select()
    .single()
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 })

  const horseRecords = horses.map((h: { horse_name: string; work_done: string; notes?: string }) => ({
    visit_id: visit.id,
    horse_name: h.horse_name,
    work_done: h.work_done,
    notes: h.notes || null,
  }))

  const { error: horsesError } = await supabase.from('farrier_visit_horses').insert(horseRecords)
  if (horsesError) return NextResponse.json({ error: horsesError.message }, { status: 500 })

  return NextResponse.json({ visit })
}
