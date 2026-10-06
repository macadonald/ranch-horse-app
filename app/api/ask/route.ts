import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'
import { getTucsonToday } from '@/lib/timezone'
import { RANCH_CONTEXT } from '@/lib/ranchContext'
import { runTool, TOOL_DEFS } from '@/lib/ask/tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYSTEM = (today: string) => `${RANCH_CONTEXT}

Today's date (Tucson time): ${today}

You are an assistant for White Stallion Ranch staff. Always call tools to get real data before answering. Never invent or estimate numbers.

Counting & accuracy rules:
- Tool results include: total (accurate count of ALL matching records, never capped), rows[] (sample, max 200), truncated (true when rows is a partial sample), and summary (aggregate stats computed over all records).
- For any counting or "how many" question, always report the total field — never count rows[] yourself, since rows[] may be a partial sample.
- Use group_by (values: 'horse', 'level', 'weight_band', 'month', 'age_band') on get_guests or get_assignments to get complete per-bucket counts with no cap (e.g. group_by='age_band' for youth counts, group_by='horse' for per-horse counts of guests).
- If truncated=true and the answer requires detail not covered by summary or grouped, say so explicitly instead of guessing from the sample.

If the data can't answer the question (e.g. revenue, marketing, things not in the app), explain that in cannotAnswer.

Keep answers in plain language, under ~100 words. Name specific horses and guests when relevant.

After gathering data, respond with ONLY raw JSON — no markdown fences, no text outside the JSON:
{
  "answer": "<plain language answer>",
  "numbers": [{ "label": "<label>", "value": "<value>" }],
  "table": { "columns": ["col1", ...], "rows": [["val", ...], ...] },
  "chart": { "type": "bar" | "line", "title": "<title>", "labels": ["..."], "values": [0] },
  "cannotAnswer": "<reason if data can't answer>",
  "toolsUsed": ["tool_name", ...]
}
Omit "table", "chart", and "cannotAnswer" when not needed. "numbers" may be an empty array.`

type HistoryEntry = { q: string; a: string }

function parseAnswer(text: string): any {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found in response')
  const parsed = JSON.parse(match[0])
  if (typeof parsed.answer !== 'string') throw new Error('Missing answer field')
  return parsed
}

async function callClaude(messages: any[], today: string, signal: AbortSignal): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: SYSTEM(today),
      tools: TOOL_DEFS,
      messages,
    }),
    signal,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await req.json()
  const { question, history } = body as { question: string; history?: HistoryEntry[] }

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 })
  }

  const today = getTucsonToday()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const messages: any[] = []

    // Inject last 3 history entries as context
    for (const h of (history || []).slice(-3)) {
      messages.push({ role: 'user', content: h.q })
      messages.push({ role: 'assistant', content: h.a })
    }
    messages.push({ role: 'user', content: question })

    const toolsUsed: string[] = []
    let rounds = 0

    while (rounds < 6) {
      rounds++
      const data = await callClaude(messages, today, controller.signal)
      messages.push({ role: 'assistant', content: data.content })

      const toolUseBlocks = (data.content as any[]).filter(b => b.type === 'tool_use')

      if (data.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        const textBlock = (data.content as any[]).find(b => b.type === 'text')
        if (!textBlock?.text) {
          return NextResponse.json({ error: 'No answer generated' }, { status: 500 })
        }

        let parsed: any
        try {
          parsed = parseAnswer(textBlock.text)
        } catch {
          // One retry with explicit JSON instruction
          messages.push({
            role: 'user',
            content: 'Your response must be raw JSON only — no backticks, no text before or after the JSON object.',
          })
          const retry = await callClaude(messages, today, controller.signal)
          const retryText = (retry.content as any[]).find((b: any) => b.type === 'text')?.text
          if (!retryText) return NextResponse.json({ error: 'Could not parse answer' }, { status: 500 })
          parsed = parseAnswer(retryText)
        }

        clearTimeout(timeout)
        return NextResponse.json({ ...parsed, toolsUsed })
      }

      // Execute tool calls
      const toolResults: any[] = []
      for (const block of toolUseBlocks) {
        if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name)
        try {
          const result = await runTool(block.name, block.input, supabase, today)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        } catch (err) {
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id, is_error: true,
            content: err instanceof Error ? err.message : 'Tool error',
          })
        }
      }
      messages.push({ role: 'user', content: toolResults })
    }

    clearTimeout(timeout)
    return NextResponse.json({ error: 'Could not complete in time — try a simpler question.' }, { status: 500 })
  } catch (err) {
    clearTimeout(timeout)
    if ((err as any)?.name === 'AbortError') {
      return NextResponse.json({ error: 'Timed out — try a simpler question.' }, { status: 504 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unexpected error' }, { status: 500 })
  }
}
