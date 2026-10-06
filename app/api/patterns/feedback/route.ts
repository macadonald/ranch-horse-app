import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { logActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const body = await req.json()
  const { findingId, factsHash, vote, title } = body as {
    findingId: string
    factsHash: string
    vote: string
    title?: string
  }

  if (!findingId || !factsHash || !vote) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabase.from('pattern_feedback').insert({
    finding_id: findingId,
    facts_hash: factsHash,
    vote,
    user_id: userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (vote === 'down') {
    await logActivity(supabase, { id: userId, email }, {
      action: 'pattern_feedback',
      entityType: 'pattern',
      entityId: findingId,
      summary: `Marked pattern not useful: ${title || findingId}`,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await req.json()
  const { findingId, factsHash } = body as { findingId: string; factsHash: string }

  if (!findingId || !factsHash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pattern_feedback')
    .delete()
    .eq('finding_id', findingId)
    .eq('facts_hash', factsHash)
    .eq('vote', 'down')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
