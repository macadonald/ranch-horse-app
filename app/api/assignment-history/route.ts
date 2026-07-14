import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const LEARNING_CUTOFF = '2026-05-11'

// Shape a horse_assignments row (with embedded guests) into the HistoryRecord
// shape that consumers throughout the app expect.
function haToRecord(ha: any, guestOverride?: any) {
  const g = guestOverride ?? (Array.isArray(ha.guests) ? ha.guests[0] : ha.guests)
  return {
    id: ha.id,
    guest_name: g?.name ?? '',
    guest_id: ha.guest_id ?? null,
    horse_name: ha.horse_name,
    assignment_type: ha.assignment_type ?? 'primary',
    assigned_date: g?.check_in_date ?? null,
    loves_horse: ha.loves_horse ?? false,
    doesnt_work: ha.incompatible ?? false,
    doesnt_work_reason: null,
    // Derived from incompatible — non-incompatible, non-loved assignments = good match
    match_quality: ha.incompatible ? null : 1,
    archived_at: g?.checked_out ? (g?.check_out_date ?? null) : null,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const guestId = searchParams.get('guest_id')
  const guestName = searchParams.get('guest_name')
  const horseName = searchParams.get('horse_name')
  const checkReturning = searchParams.get('check_returning')
  const allReturning = searchParams.get('all_returning') === 'true'
  const since = searchParams.get('since')
  const archived = searchParams.get('archived') === 'true'

  try {
    // All returning guest names + loves entries (for guest list badges)
    if (allReturning) {
      const { data, error } = await supabase
        .from('guests')
        .select('name, horse_assignments(horse_name, loves_horse)')
        .gte('check_in_date', LEARNING_CUTOFF)
      if (error) {
        console.error('[assignment-history] allReturning error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const seen = new Set<string>()
      const names: string[] = []
      const lovesItems: { guest_name: string; horse_name: string }[] = []
      for (const g of data || []) {
        const n = g.name as string
        if (!n) continue
        const assignments = (g.horse_assignments as any[]) || []
        if (assignments.length === 0) continue
        if (!seen.has(n)) { seen.add(n); names.push(n) }
        for (const ha of assignments) {
          if (ha.loves_horse) lovesItems.push({ guest_name: n, horse_name: ha.horse_name })
        }
      }
      return NextResponse.json({ names, lovesItems })
    }

    // Checked-out guests with their ride records (History view)
    if (archived) {
      const { data, error } = await supabase
        .from('guests')
        .select('id, name, check_out_date, checked_out, horse_assignments(id, horse_name, assignment_type, loves_horse, incompatible, guest_id)')
        .eq('checked_out', true)
        .order('check_out_date', { ascending: false })
      if (error) {
        console.error('[assignment-history] archived error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const guests = (data || []).map((g: any) => ({
        guest_name: g.name,
        checkout_date: g.check_out_date || '',
        records: (g.horse_assignments || []).map((ha: any) => haToRecord(ha, g)),
      })).sort((a: any, b: any) => b.checkout_date.localeCompare(a.checkout_date))
      return NextResponse.json({ guests })
    }

    // Returning-guest detection (called onBlur when typing a name in Add Guest)
    if (checkReturning) {
      const { data, error } = await supabase
        .from('guests')
        .select('name, check_in_date, checked_out, check_out_date, horse_assignments(id, horse_name, loves_horse, incompatible, guest_id)')
        .ilike('name', checkReturning)
        .gte('check_in_date', LEARNING_CUTOFF)
        .order('check_in_date', { ascending: false })
        .limit(5)
      if (error) {
        console.error('[assignment-history] checkReturning error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const records = (data || []).flatMap((g: any) =>
        (g.horse_assignments || []).map((ha: any) => haToRecord(ha, g))
      )
      return NextResponse.json({ isReturning: records.length > 0, records })
    }

    // Bulk fetch since a cutoff date — used by Assign All for past-ride context
    if (since) {
      console.log('[assignment-history] since query, cutoff:', since)
      const { data, error } = await supabase
        .from('guests')
        .select('name, check_in_date, horse_assignments(horse_name, loves_horse, incompatible)')
        .gte('check_in_date', since)
      if (error) {
        console.error('[assignment-history] since query error (since=' + since + '):', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const history = (data || []).flatMap((g: any) =>
        (g.horse_assignments || []).map((ha: any) => ({
          guest_name: g.name,
          horse_name: ha.horse_name,
          assigned_date: g.check_in_date,
          loves_horse: ha.loves_horse ?? false,
          doesnt_work: ha.incompatible ?? false,
          match_quality: ha.incompatible ? null : 1,
        }))
      )
      console.log('[assignment-history] since query returned', history.length, 'rows')
      return NextResponse.json({ history })
    }

    // Per-guest lookup by ID
    if (guestId) {
      const { data, error } = await supabase
        .from('horse_assignments')
        .select('id, horse_name, assignment_type, loves_horse, incompatible, guest_id, guests!inner(name, check_in_date, check_out_date, checked_out)')
        .eq('guest_id', guestId)
      if (error) {
        console.error('[assignment-history] guestId query error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ history: (data || []).map((ha: any) => haToRecord(ha)) })
    }

    // Per-guest lookup by name
    if (guestName) {
      const { data, error } = await supabase
        .from('guests')
        .select('name, check_in_date, check_out_date, checked_out, horse_assignments(id, horse_name, assignment_type, loves_horse, incompatible, guest_id)')
        .ilike('name', guestName)
      if (error) {
        console.error('[assignment-history] guestName query error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const history = (data || []).flatMap((g: any) =>
        (g.horse_assignments || []).map((ha: any) => haToRecord(ha, g))
      )
      return NextResponse.json({ history })
    }

    // Per-horse lookup
    if (horseName) {
      const { data, error } = await supabase
        .from('horse_assignments')
        .select('id, horse_name, assignment_type, loves_horse, incompatible, guest_id, guests!inner(name, check_in_date, check_out_date, checked_out)')
        .eq('horse_name', horseName)
      if (error) {
        console.error('[assignment-history] horseName query error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ history: (data || []).map((ha: any) => haToRecord(ha)) })
    }

    return NextResponse.json(
      { error: 'Need guest_id, guest_name, horse_name, check_returning, all_returning, since, or archived' },
      { status: 400 }
    )
  } catch (err) {
    console.error('[assignment-history GET] unhandled exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { guest_id, horse_name } = body
    // horse_assignments is now the source of truth — find the existing assignment
    // and return it so callers that use the returned record.id for subsequent PUTs work.
    if (guest_id && horse_name) {
      const { data } = await supabase
        .from('horse_assignments')
        .select('id, horse_name, loves_horse, incompatible, guest_id, guests!inner(name, check_in_date, check_out_date, checked_out)')
        .eq('guest_id', guest_id)
        .eq('horse_name', horse_name)
        .limit(1)
        .maybeSingle()
      if (data) return NextResponse.json({ record: haToRecord(data) })
    }
    // No matching assignment found — return a stub so callers don't crash on missing .id
    return NextResponse.json({
      record: {
        id: null,
        guest_name: body.guest_name ?? '',
        horse_name: body.horse_name ?? '',
        assigned_date: body.assigned_date ?? null,
        loves_horse: false,
        doesnt_work: false,
        match_quality: null,
        archived_at: null,
      },
    })
  } catch (err) {
    console.error('[assignment-history POST] unhandled exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, doesnt_work, loves_horse, archive_guest_name } = body
    // match_quality and doesnt_work_reason are not columns on horse_assignments;
    // match_quality is derived on read (incompatible → null, else 1), so we ignore it here.

    // Checkout: mark the guest as checked_out in the guests table
    if (archive_guest_name) {
      const { error } = await supabase
        .from('guests')
        .update({ checked_out: true })
        .ilike('name', archive_guest_name)
      if (error) {
        console.error('[assignment-history PUT] archive error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (loves_horse !== undefined) update.loves_horse = loves_horse
    if (doesnt_work !== undefined) update.incompatible = doesnt_work

    if (Object.keys(update).length === 0) return NextResponse.json({ success: true })

    const { data, error } = await supabase
      .from('horse_assignments')
      .update(update)
      .eq('id', id)
      .select('id, horse_name, assignment_type, loves_horse, incompatible, guest_id')
      .single()
    if (error) {
      console.error('[assignment-history PUT] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ record: haToRecord(data) })
  } catch (err) {
    console.error('[assignment-history PUT] unhandled exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
