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
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = await res.json()
  const text = (data.content?.[0]?.text as string | undefined)?.trim()
  if (!text) throw new Error('Empty response from Claude')
  return text
}

function parseAiSummary(raw: string): { paragraph: string } {
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in response')
  const p = JSON.parse(text.slice(start, end + 1))
  if (typeof p.paragraph !== 'string' || !p.paragraph.trim()) throw new Error('Invalid shape')
  return { paragraph: p.paragraph }
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

  let summary: { paragraph: string } | undefined
  if (aiSummary) {
    const rangeLabel = fmtRange(start, end)
    const prompt = `${RANCH_CONTEXT}

You are writing a one-paragraph executive summary for a ranch operations report.
Date range: ${rangeLabel}
Sections included: ${sections.join(', ')}

DATA (exact numbers from the database — only use these, never invent numbers or thresholds):
${JSON.stringify(facts, null, 2)}

Return ONLY valid JSON — no markdown fences, no text outside the JSON object:
{ "paragraph": "<one paragraph, 3-5 sentences, covering the main points — use exact numbers, name specific horses where notable>" }

Rules:
- Only state facts present in the DATA block above. Never invent weight limits, policies, or thresholds not in the data.
- For pattern findings whose data window is longer than the report range, say "over this and prior periods" rather than "this month".
- Plain English. No bullet lists. One paragraph only.`

    try {
      const text = await callClaude(prompt)
      try {
        summary = parseAiSummary(text)
      } catch (parseErr) {
        console.error('[report] first parse failed:', parseErr instanceof Error ? parseErr.message : parseErr, '— raw (first 400):', text.slice(0, 400))
        const text2 = await callClaude(
          prompt + '\n\nIMPORTANT: Return raw JSON only — no backticks, no text outside the JSON object.'
        )
        try {
          summary = parseAiSummary(text2)
        } catch (parseErr2) {
          console.error('[report] second parse failed:', parseErr2 instanceof Error ? parseErr2.message : parseErr2, '— raw (first 400):', text2.slice(0, 400))
        }
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
