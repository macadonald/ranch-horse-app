import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  let query = supabase
    .from('horse_health_issues')
    .select('*')
    .order('opened_at', { ascending: false })
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
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
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
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

  await logActivity(supabase, { id: userId, email }, {
    action: 'health_issue.create',
    entityType: 'horse_health_issues',
    entityId: data.id,
    summary: `Added health issue for ${horse_name}: ${type} (${severity})`,
    details: { horse_name, type, location, severity, frequency, treatment_notes: treatment_notes || null },
  })

  return NextResponse.json({ issue: data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  console.log('[PUT /api/health] id:', id, 'fields:', JSON.stringify(fields))
  const { data, error } = await supabase
    .from('horse_health_issues')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  console.log('[PUT /api/health] supabase data:', JSON.stringify(data), 'error:', error?.message)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const isResolved = fields.status === 'resolved'
  const isDone = 'done_today' in fields || 'last_treated_at' in fields
  let healthUpdateSummary: string
  if (isDone) {
    healthUpdateSummary = `Marked treatment done for ${data.horse_name}: ${data.type}`
  } else if (isResolved) {
    healthUpdateSummary = `Resolved health issue for ${data.horse_name}: ${data.type}`
  } else {
    healthUpdateSummary = `Updated health issue for ${data.horse_name}: ${data.type}`
  }
  await logActivity(supabase, { id: userId, email }, {
    action: 'health_issue.update',
    entityType: 'horse_health_issues',
    entityId: id,
    summary: healthUpdateSummary,
    details: { horse_name: data.horse_name, type: data.type, updated: fields },
  })

  return NextResponse.json({ issue: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: issue } = await supabase
    .from('horse_health_issues')
    .select('horse_name, type')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('horse_health_issues').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'health_issue.delete',
    entityType: 'horse_health_issues',
    entityId: id,
    summary: `Deleted health issue for ${issue?.horse_name ?? '?'}: ${issue?.type ?? '?'}`,
    details: { horse_name: issue?.horse_name, type: issue?.type },
  })

  return NextResponse.json({ success: true })
}
