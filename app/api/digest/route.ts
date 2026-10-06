import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { RANCH_CONTEXT } from '@/lib/ranchContext'
import { logActivity } from '@/lib/activity'
import { buildWeekFacts } from '@/lib/digest/facts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function getMostRecentCompletedWeek(): string {
  const today = getTucsonToday()
  const d = new Date(today + 'T12:00:00Z')
  const daysBack = d.getUTCDay() + 7
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function fmtWeekLabel(weekStart: string): string {
  const s = new Date(weekStart + 'T12:00:00Z')
  const e = new Date(weekStart + 'T12:00:00Z')
  e.setUTCDate(e.getUTCDate() + 6)
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const sm = mo[s.getUTCMonth()], sd = s.getUTCDate()
  const em = mo[e.getUTCMonth()], ed = e.getUTCDate()
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = await res.json()
  const text = (data.content?.[0]?.text as string | undefined)?.trim()
  if (!text) throw new Error('Empty response from Claude')
  return text
}

type DigestSection = { title: string; bullets: string[] }
type Digest = { headline: string; sections: DigestSection[]; watchlist: string[] }

function parseDigest(text: string): Digest {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  const p = JSON.parse(match[0])
  if (typeof p.headline !== 'string' || !Array.isArray(p.sections) || !Array.isArray(p.watchlist)) {
    throw new Error('Invalid digest shape')
  }
  return p as Digest
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const { searchParams } = new URL(req.url)

  // List saved weeks
  if (searchParams.get('list') === '1') {
    const { data, error } = await supabase
      .from('weekly_digests')
      .select('week_start')
      .order('week_start', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ weeks: (data || []).map((r: any) => r.week_start as string) })
  }

  const week = searchParams.get('week') || getMostRecentCompletedWeek()
  const weekEnd = addDays(week, 6)
  const today = getTucsonToday()

  if (weekEnd >= today) {
    return NextResponse.json({ error: 'Week is not yet complete' }, { status: 400 })
  }

  // Return cached digest if it exists
  const { data: saved } = await supabase
    .from('weekly_digests')
    .select('content, created_at')
    .eq('week_start', week)
    .maybeSingle()

  if (saved?.content) {
    return NextResponse.json({ week, content: saved.content, cached: true })
  }

  // Generate
  let facts: any
  try {
    facts = await buildWeekFacts(supabase, week)
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to build facts: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    )
  }

  const weekLabel = fmtWeekLabel(week)
  const prompt = `${RANCH_CONTEXT}

You are writing the weekly digest for White Stallion Ranch staff.
Week: ${weekLabel} (${week} to ${weekEnd})

DATA (exact numbers from the database):
${JSON.stringify(facts, null, 2)}

Write the weekly digest. Return ONLY valid JSON — no markdown fences, no text outside the JSON:
{
  "headline": "<one sentence summary of the week>",
  "sections": [
    { "title": "Guests",     "bullets": ["<2-4 short bullets using exact numbers>"] },
    { "title": "Horses",     "bullets": ["<2-4 bullets on horse activity and idle horses>"] },
    { "title": "Swaps",      "bullets": ["<2-4 bullets on not-a-fit swaps — omit this section if total=0>"] },
    { "title": "Health",     "bullets": ["<2-4 bullets on health flags — omit if none>"] },
    { "title": "Shoes",      "bullets": ["<2-4 bullets on farrier visits and overdue horses>"] },
    { "title": "Patterns",   "bullets": ["<2-4 bullets from top pattern findings — omit if none>"] },
    { "title": "Week ahead", "bullets": ["<2-4 bullets on forecast, holidays, incoming guests>"] }
  ],
  "watchlist": ["<0-4 specific, actionable items for staff>"]
}

Rules:
- Omit any section whose data is empty or zero.
- Use only exact numbers from the data — never invent.
- Name specific horses and guests where relevant.
- Compare to prior week when useful ("up from N last week").
- Total response ~200 words max.
- watchlist items must be specific (e.g. "Buster is 12 days past usual shoeing gap"), not vague.`

  let digest: Digest
  try {
    const text = await callClaude(prompt)
    try {
      digest = parseDigest(text)
    } catch {
      const text2 = await callClaude(
        prompt + '\n\nIMPORTANT: Return raw JSON only — no backticks, no text outside the JSON object.'
      )
      digest = parseDigest(text2)
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Digest generation failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    )
  }

  const facts_summary = {
    guests_on_property:       facts.guests.on_property,
    arrivals:                 facts.guests.arrivals,
    swaps:                    facts.swaps.total,
    new_health_flags:         facts.health.opened.length,
    farrier_visits:           facts.farrier.visits.length,
    horses_overdue:           facts.farrier.overdue.length,
    guests_on_property_prev:  facts.guests.on_property_prev,
    arrivals_prev:            facts.guests.arrivals_prev,
    swaps_prev:               facts.swaps.total_prev,
    new_health_flags_prev:    facts.health.opened_count_prev,
    farrier_visits_prev:      facts.farrier.visits_count_prev,
    horses_overdue_prev:      facts.farrier.overdue_count_prev,
  }

  const content = { facts_summary, digest }

  try {
    await supabase.from('weekly_digests').insert({ week_start: week, content, generated_by: userId })
  } catch (dbErr) {
    console.error('[digest] save failed:', dbErr)
  }

  await logActivity(supabase, { id: userId, email }, {
    action: 'digest.generate',
    entityType: 'weekly_digest',
    entityId: week,
    summary: `Generated weekly digest for ${weekLabel}`,
  })

  return NextResponse.json({ week, content, cached: false })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const week = new URL(req.url).searchParams.get('week')
  if (!week) return NextResponse.json({ error: 'Missing week' }, { status: 400 })

  const { error } = await supabase.from('weekly_digests').delete().eq('week_start', week)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(supabase, { id: userId, email }, {
    action: 'digest.delete',
    entityType: 'weekly_digest',
    entityId: week,
    summary: `Deleted weekly digest for ${fmtWeekLabel(week)} (regeneration)`,
  })

  return NextResponse.json({ ok: true })
}
