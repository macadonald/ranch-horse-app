import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('horse_assignments')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ assignment: data })
  } catch (err) {
    console.error('POST assignment error:', err)
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const { data, error } = await supabase
      .from('horse_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ assignment: data })
  } catch (err) {
    console.error('PUT assignment error:', err)
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 })

    const { error } = await supabase
      .from('horse_assignments')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE assignment error:', err)
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
  }
}

// Get all active assignments to know which horses are taken
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('horse_assignments')
      .select(`
        *,
        guests (
          id,
          name,
          room_number,
          check_out_date
        )
      `)
      .eq('status', 'active')
      .eq('incompatible', false)

    if (error) throw error

    // Filter to only guests who haven't checked out yet
    const active = (data || []).filter(a => {
      if (!a.guests) return false
      return a.guests.check_out_date >= today
    })

    return NextResponse.json({ assignments: active })
  } catch (err) {
    console.error('GET assignments error:', err)
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
  }
}
