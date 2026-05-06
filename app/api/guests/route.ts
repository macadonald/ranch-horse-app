import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('guests')
      .select(`*, horse_assignments (*)`)
      .order('room_number', { ascending: true })
    if (error) throw error
    return NextResponse.json({ guests: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase.from('guests').insert([body]).select().single()
    if (error) throw error
    return NextResponse.json({ guest: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const { data, error } = await supabase.from('guests').update(updates).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ guest: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete guest' }, { status: 500 })
  }
}
