import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('other_animals')
    .select('*')
    .order('group_name')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ animals: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, group_name, age, notes } = body
  if (!name || !group_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('other_animals')
    .insert({ name, group_name, age: age || null, notes: notes || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ animal: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('other_animals')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ animal: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('other_animals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
