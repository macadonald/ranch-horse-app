import { NextRequest, NextResponse } from 'next/server'
import { WARN_THRESHOLD } from '@/lib/supabase'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  try {
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from('guests').select(`*, horse_assignments (*)`),
      supabase.from('guests').select('*', { count: 'exact', head: true }),
    ])

    if (error) throw error

    // Sort by room number numerically, then by created_at ascending for same room
    const sorted = (data || []).sort((a, b) => {
      const aNum = parseInt(a.room_number) || 0
      const bNum = parseInt(b.room_number) || 0
      if (aNum !== bNum) return aNum - bNum
      return (a.created_at || '').localeCompare(b.created_at || '')
    })

    const loaded = sorted.length
    const totalCount = count ?? loaded
    const truncated = totalCount > loaded
    const nearingLimit = !truncated && totalCount >= WARN_THRESHOLD

    return NextResponse.json({
      guests: sorted,
      rowLimitStatus: { count: totalCount, loaded, truncated, nearingLimit },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch guests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  try {
    const body = await req.json()
    const { data, error } = await supabase.from('guests').insert([body]).select().single()
    if (error) throw error

    await logActivity(supabase, { id: userId, email }, {
      action: 'guest.create',
      entityType: 'guests',
      entityId: data.id,
      summary: `Added guest ${data.name} (Room ${data.room_number})`,
      details: { name: data.name, room_number: data.room_number, check_in_date: data.check_in_date },
    })

    return NextResponse.json({ guest: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const { data, error } = await supabase.from('guests').update(updates).eq('id', id).select().single()
    if (error) throw error

    let summary: string
    if (updates.checked_out === true) {
      summary = `Checked out ${data.name}`
    } else {
      summary = `Edited guest ${data.name}: ${Object.keys(updates).join(', ')}`
    }

    await logActivity(supabase, { id: userId, email }, {
      action: updates.checked_out === true ? 'guest.checkout' : 'guest.update',
      entityType: 'guests',
      entityId: id,
      summary,
      details: { name: data.name, updated: updates },
    })

    return NextResponse.json({ guest: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const { data: existing } = await supabase
      .from('guests')
      .select('name, room_number')
      .eq('id', id)
      .single()

    // Explicit delete of horse_assignments first (belt-and-suspenders before the
    // FK cascade migration runs in environments where it hasn't been applied yet).
    await supabase.from('horse_assignments').delete().eq('guest_id', id)
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (error) throw error

    await logActivity(supabase, { id: userId, email }, {
      action: 'guest.delete',
      entityType: 'guests',
      entityId: id,
      summary: `Deleted guest ${existing?.name ?? id}`,
      details: { name: existing?.name, room_number: existing?.room_number },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete guest' }, { status: 500 })
  }
}
