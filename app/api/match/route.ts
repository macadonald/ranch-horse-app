import { NextRequest, NextResponse } from 'next/server'
import { ACTIVE_HORSES } from '@/lib/horses'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { age, weight, height, level, notes } = body

    if (!age || !weight || !height || !level) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const weightNum = parseInt(weight)
    const ageNum = parseInt(age)

    // Hard filter: weight limit
    const eligible = ACTIVE_HORSES.filter(h => {
      if (h.weight === null) return false
      return weightNum <= h.weight
    })

    // Build roster text
    const rosterText = eligible.map(h =>
      `- ${h.name} (level: ${h.level}, max weight: ${h.weight}lbs, size: ${h.size}${h.notes ? ', notes: ' + h.notes : ''})`
    ).join('\n')

    // Age-based level adjustment warning
    const ageWarning = ageNum >= 70
      ? 'IMPORTANT: This rider is 70+ years old. Older riders frequently overstate their riding level — their body may not match what they once rode. Strongly consider horses one to two levels below what they marked. Flag this in your reasoning.'
      : ageNum >= 60
      ? 'NOTE: This rider is 60+. Some older riders overstate their level. Consider whether a slightly easier horse might be more appropriate and flag it if so.'
      : ''

    const prompt = `You are an experienced head wrangler at a dude ranch in Arizona assigning horses to guests. Your job is to find the best 10 horse matches for this rider from the eligible herd.

Level scale (low to high): Beginner (B) → Advanced Beginner (AB) → Intermediate (I) → Advanced Intermediate (AI) → Advanced (A)

Key matching rules:
1. Prioritize horses whose level matches the rider's exact level.
2. If not enough exact matches, bleed to nearest adjacent level. For lower-level riders prefer slightly easier; for heavier experienced riders it is acceptable to use lower-level bigger horses when high-level big horses are unavailable.
3. Match horse SIZE to rider size — smaller riders should get smaller horses, larger riders need larger or draft horses. Size categories: small, medium, large, draft.
4. The notes field may contain critical info: injuries, recent wreck, wants smooth/calm/fast horse, nervous, bad back, etc. Factor these heavily.
5. Weight limit is already enforced — all listed horses are within limit.
6. Mark each result as "exact" (rider level matches) or "adjacent" (neighboring level bleed).
7. Only include genuinely suitable horses — do not pad with poor fits.
8. Horses marked as "backup" should only appear if options are very limited.

${ageWarning}

Rider profile:
- Age: ${age}
- Weight: ${weight} lbs
- Height: ${height}
- Riding level: ${level}
- Notes: ${notes || 'none'}

Eligible horses (already weight-filtered):
${rosterText}

Respond ONLY with a valid JSON array, no markdown, no preamble:
[{"name":"HorseName","fit":"exact","reason":"1-2 sentences specific to this rider using their profile and the horse notes.","warning":"optional short warning if there is something staff should know, otherwise empty string"}]`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.content.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const matches = JSON.parse(jsonMatch[0])
    return NextResponse.json({ matches })

  } catch (err) {
    console.error('Match API error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
