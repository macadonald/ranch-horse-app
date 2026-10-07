import { NextRequest, NextResponse } from 'next/server'
import { WARN_THRESHOLD } from '@/lib/supabase'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

const SWAP_CATEGORY_LABELS: Record<string, string> = {
  guest_request: 'Guest request',
  horse_issue:   'Horse issue',
  staff:         'Staff decision',
}

const SWAP_REASON_LABELS: Record<string, string> = {
  too_much_horse:   'too much horse',
  too_slow:         'too slow',
  behavior:         'behavior issue',
  guest_preference: 'guest preference',
  lame:             'lame',
  sore:             'sore',
  other_health:     'other health',
  other:            'other',
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  try {
    const body = await req.json()
    // source is a client-only flag — read it for logging, do not store it
    const { source, ...insertBody } = body
    const { data, error } = await supabase
      .from('horse_assignments')
      .insert([insertBody])
      .select()
      .single()

    if (error) throw error

    let guestName = '?'
    if (data.guest_id) {
      const { data: guestRow } = await supabase
        .from('guests').select('name').eq('id', data.guest_id).single()
      guestName = guestRow?.name ?? '?'
    }

    let typeLabel = data.assignment_type ?? 'primary'
    if (source === 'assign_all') typeLabel = `${typeLabel} · Assign All`
    else if (source === 'swap_replacement') typeLabel = 'swap replacement'

    await logActivity(supabase, { id: userId, email }, {
      action: 'assignment.create',
      entityType: 'horse_assignments',
      entityId: data.id,
      summary: `Assigned ${data.horse_name} to ${guestName} (${typeLabel})`,
      details: { horse_name: data.horse_name, guest_name: guestName, assignment_type: data.assignment_type, source: source ?? null },
    })

    return NextResponse.json({ assignment: data })
  } catch (err) {
    console.error('POST assignment error:', err)
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
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

    let guestName = '?'
    if (data.guest_id) {
      const { data: guestRow } = await supabase
        .from('guests').select('name').eq('id', data.guest_id).single()
      guestName = guestRow?.name ?? '?'
    }

    const isSwap = updates.status === 'removed' && updates.swap_category
    if (isSwap) {
      const catLabel = SWAP_CATEGORY_LABELS[updates.swap_category] ?? updates.swap_category
      const reasonLabel = updates.swap_reason ? SWAP_REASON_LABELS[updates.swap_reason] ?? updates.swap_reason : null
      const qualifier = updates.swap_category === 'staff' || !reasonLabel
        ? catLabel
        : `${catLabel}: ${reasonLabel}`
      await logActivity(supabase, { id: userId, email }, {
        action: 'assignment.swap',
        entityType: 'horse_assignments',
        entityId: id,
        summary: `Swapped ${data.horse_name} off ${guestName} (${qualifier})`,
        details: {
          horse_name: data.horse_name,
          guest_name: guestName,
          swap_category: updates.swap_category,
          swap_reason: updates.swap_reason ?? null,
          note: updates.reason ?? null,
        },
      })
    } else {
      await logActivity(supabase, { id: userId, email }, {
        action: 'assignment.update',
        entityType: 'horse_assignments',
        entityId: id,
        summary: `Updated assignment: ${data.horse_name} for ${guestName}`,
        details: { horse_name: data.horse_name, guest_name: guestName, updated: updates },
      })
    }

    return NextResponse.json({ assignment: data })
  } catch (err) {
    console.error('PUT assignment error:', err)
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id provided' }, { status: 400 })

    const { data: assignment } = await supabase
      .from('horse_assignments')
      .select('horse_name, guest_id, status')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('horse_assignments')
      .delete()
      .eq('id', id)

    if (error) throw error

    let guestName = '?'
    if (assignment?.guest_id) {
      const { data: guestRow } = await supabase
        .from('guests').select('name').eq('id', assignment.guest_id).single()
      guestName = guestRow?.name ?? '?'
    }

    const isRemovedRow = assignment?.status === 'removed'
    await logActivity(supabase, { id: userId, email }, {
      action: isRemovedRow ? 'assignment.swap_record_delete' : 'assignment.delete',
      entityType: 'horse_assignments',
      entityId: id,
      summary: isRemovedRow
        ? `Removed swap record: ${assignment?.horse_name ?? '?'} for ${guestName}`
        : `Removed assignment: ${assignment?.horse_name ?? '?'} from ${guestName}`,
      details: { horse_name: assignment?.horse_name, guest_name: guestName },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE assignment error:', err)
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
  }
}

// Get all active assignments to know which horses are taken
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  try {
    const today = new Date().toLocaleString('en-CA', { timeZone: 'America/Phoenix' }).split(',')[0]

    const [{ data, error }, { count }] = await Promise.all([
      supabase
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
        .eq('incompatible', false),
      supabase
        .from('horse_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('incompatible', false),
    ])

    if (error) throw error

    // Filter to only guests who haven't checked out yet
    const active = (data || []).filter(a => {
      if (!a.guests) return false
      return a.guests.check_out_date >= today
    })

    const loaded = (data || []).length
    const totalCount = count ?? loaded
    const truncated = totalCount > loaded
    const nearingLimit = !truncated && totalCount >= WARN_THRESHOLD

    return NextResponse.json({
      assignments: active,
      rowLimitStatus: { count: totalCount, loaded, truncated, nearingLimit },
    })
  } catch (err) {
    console.error('GET assignments error:', err)
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
  }
}
