import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { RANCH_CONTEXT } from '@/lib/ranchContext'
import { logActivity } from '@/lib/activity'
import { buildRangeFacts } from '@/lib/report/facts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00Z')
  const e = new Date(end   + 'T12:00:00Z')
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${mo[s.getUTCMonth()]} ${s.getUTCDate()} – ${mo[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
}

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
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = await res.json()
  const text = (data.content?.[0]?.text as string | undefined)?.trim()
  if (!text) throw new Error('Empty response from Claude')
  return text
}

function parseAiSummary(text: string): { overview: string; highlights: string[] } {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  const p = JSON.parse(match[0])
  if (typeof p.overview !== 'string' || !Array.isArray(p.highlights)) throw new Error('Invalid shape')
  return { overview: p.overview, highlights: p.highlights as string[] }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, email, supabase } = auth

  const body = await req.json()
  const { start, end, sections, aiSummary } = body

  if (!start || !end || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'Missing start, end, or sections' }, { status: 400 })
  }

  let facts: any
  try {
    facts = await buildRangeFacts(supabase, start, end, sections)
  } catch (err) {
    console.error('[report] buildRangeFacts error:', err)
    return NextResponse.json(
      { error: 'Failed to build facts: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    )
  }

  let summary: { overview: string; highlights: string[] } | undefined
  if (aiSummary) {
    const rangeLabel = fmtRange(start, end)
    const prompt = `${RANCH_CONTEXT}

You are writing an executive summary for a ranch operations report.
Date range: ${rangeLabel}
Sections included: ${sections.join(', ')}

DATA (exact numbers from the database — only use these, never invent numbers):
${JSON.stringify(facts, null, 2)}

Return ONLY valid JSON — no markdown fences, no text outside the JSON object:
{
  "overview": "<3-4 sentences summarising the period — use exact numbers, name specific horses where notable>",
  "highlights": ["<3-6 specific highlights or concerns — actionable, reference horses or people by name>"]
}

Rules: plain English, only numbers from the data above.`

    try {
      const text = await callClaude(prompt)
      try {
        summary = parseAiSummary(text)
      } catch {
        const text2 = await callClaude(
          prompt + '\n\nIMPORTANT: Return raw JSON only — no backticks, no text outside the JSON object.'
        )
        summary = parseAiSummary(text2)
      }
    } catch (err) {
      console.error('[report] AI summary failed (non-fatal):', err)
    }
  }

  const rangeLabel = fmtRange(start, end)
  const sectionLabels = (sections as string[]).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')

  await logActivity(supabase, { id: userId, email }, {
    action: 'report.generate',
    entityType: 'report',
    summary: `Generated report: ${rangeLabel} (${sectionLabels})`,
    details: { start, end, sections },
  })

  return NextResponse.json({ facts, summary, generatedBy: email })
}
