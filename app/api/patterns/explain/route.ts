import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'
import { RANCH_CONTEXT } from '@/lib/ranchContext'
import type { Finding } from '@/lib/patterns/types'

type ExplainResult = {
  meaning: string[]
  howToCheck: string[]
  whatToDo: string[]
  howSure: string
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
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`)
  const data = await res.json()
  const text = (data.content?.[0]?.text as string | undefined)?.trim()
  if (!text) throw new Error('Empty Anthropic response')
  return text
}

function parseExplain(text: string): ExplainResult {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in response')
  const parsed = JSON.parse(match[0])
  if (
    !Array.isArray(parsed.meaning) ||
    !Array.isArray(parsed.howToCheck) ||
    !Array.isArray(parsed.whatToDo) ||
    typeof parsed.howSure !== 'string'
  ) {
    throw new Error('Invalid response shape')
  }
  return parsed as ExplainResult
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await req.json()
  const finding = body.finding as (Finding & { factsHash?: string })
  if (!finding?.id || !finding?.factsHash) {
    return NextResponse.json({ error: 'Missing finding or factsHash' }, { status: 400 })
  }

  // Cache-first
  const { data: cached } = await supabase
    .from('pattern_explanations')
    .select('explanation')
    .eq('finding_id', finding.id)
    .eq('facts_hash', finding.factsHash)
    .single()

  if (cached?.explanation) {
    return NextResponse.json(cached.explanation)
  }

  const factsText = Object.entries(finding.facts)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n')

  const prompt = `${RANCH_CONTEXT}

Pattern finding detected in ranch data:
Title: ${finding.title}
Category: ${finding.category}
Detail: ${finding.detail}
Key facts:
${factsText}

Explain this pattern to a ranch manager in plain language. Return ONLY valid JSON — no markdown fences, no prose outside the JSON:
{
  "meaning": ["one sentence on what this pattern means", "additional context if needed"],
  "howToCheck": ["specific thing to look at in the barn or records"],
  "whatToDo": ["concrete action to take"],
  "howSure": "one sentence on confidence level given the data volume"
}`

  let explanation: ExplainResult
  try {
    const text = await callClaude(prompt)
    try {
      explanation = parseExplain(text)
    } catch {
      const text2 = await callClaude(
        prompt + '\n\nIMPORTANT: Your entire response must be raw JSON only. No backticks, no text before or after the JSON object.'
      )
      explanation = parseExplain(text2)
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Explanation failed' },
      { status: 500 }
    )
  }

  try {
    await supabase.from('pattern_explanations').upsert(
      { finding_id: finding.id, facts_hash: finding.factsHash, explanation },
      { onConflict: 'finding_id,facts_hash', ignoreDuplicates: true }
    )
  } catch (cacheErr) {
    console.error('[patterns/explain] cache write failed:', cacheErr)
  }

  return NextResponse.json(explanation)
}
