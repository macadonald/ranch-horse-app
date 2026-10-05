import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'

const LEVEL_ORDER = ['B', 'AB', 'I', 'I/AI', 'AI', 'A']
const LEVEL_LABELS: Record<string, string> = {
  B: 'Beginner', AB: 'Advanced Beginner', I: 'Intermediate',
  'I/AI': 'Intermediate/Advanced Intermediate', AI: 'Advanced Intermediate', A: 'Advanced',
}

function fallbackExplanation(
  guest: { riding_level: string; weight: number },
  horse: { level: string; weight: number | null } | null
): string {
  if (!horse) return 'Horse details unavailable.'
  const gi = LEVEL_ORDER.indexOf(guest.riding_level)
  const hi = LEVEL_ORDER.indexOf(horse.level)
  const gl = LEVEL_LABELS[guest.riding_level] || guest.riding_level
  const hl = LEVEL_LABELS[horse.level] || horse.level
  if (gi < 0 || hi < 0) return `Guest is ${gl}, horse is rated ${hl}.`
  const diff = Math.abs(gi - hi)
  if (diff === 0) return `Riding levels match exactly — guest and horse are both ${gl}.`
  const dir = gi > hi ? 'above' : 'below'
  if (diff === 1) return `Guest rides at ${gl}, one level ${dir} this horse's ${hl} base level.`
  return `Guest is ${gl} but horse is rated ${hl} — ${diff} levels ${dir}.`
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth
  let fallbackReason = 'Explanation temporarily unavailable.'

  try {
    const body = await req.json()
    const { guest, horseName } = body as {
      guest: { age: number; weight: number; height: string; riding_level: string; gender: string; name: string }
      horseName: string
    }

    if (!guest?.riding_level || !horseName) {
      return NextResponse.json({ error: 'Missing guest or horseName' }, { status: 400 })
    }

    // Fetch horse details and all non-incompatible rides for this horse in parallel
    const [horseResult, rideResult] = await Promise.all([
      supabase.from('horses').select('level, weight, notes').eq('name', horseName).single(),
      supabase
        .from('horse_assignments')
        .select('guests!inner(weight, riding_level, gender, age, checked_out)')
        .eq('horse_name', horseName)
        .eq('incompatible', false),
    ])

    const horseData = horseResult.data as { level: string; weight: number | null; notes: string | null } | null

    // Build fallback now — available even if the Anthropic call fails below
    fallbackReason = fallbackExplanation(guest, horseData)

    // Compute per-horse historical stats (mirrors >=5 threshold convention in assign-all/route.ts)
    let weightSum = 0, weightCount = 0, ageSum = 0, ageCount = 0
    const genderCounts: Record<string, number> = {}
    let totalWithGender = 0

    for (const row of rideResult.data || []) {
      const g = Array.isArray(row.guests) ? row.guests[0] : (row.guests as any)
      if (!g) continue
      if (g.checked_out && g.weight) { weightSum += g.weight as number; weightCount++ }
      if (g.age != null) { ageSum += g.age as number; ageCount++ }
      if (g.gender) {
        const gen = (g.gender as string).toLowerCase()
        genderCounts[gen] = (genderCounts[gen] || 0) + 1
        totalWithGender++
      }
    }

    const historicalAvgWeight = weightCount >= 5 ? Math.round(weightSum / weightCount) : null
    const historicalAvgAge = ageCount >= 5 ? Math.round(ageSum / ageCount) : null
    const genderDistribution = totalWithGender >= 5 ? genderCounts : null

    const guestLevelLabel = LEVEL_LABELS[guest.riding_level] || guest.riding_level
    const horseLevelLabel = horseData ? (LEVEL_LABELS[horseData.level] || horseData.level) : 'unknown'

    const statsParts: string[] = []
    if (historicalAvgWeight != null) statsParts.push(`average rider weight: ${historicalAvgWeight} lbs`)
    if (historicalAvgAge != null) statsParts.push(`average rider age: ${historicalAvgAge}`)
    if (genderDistribution) {
      const total = Object.values(genderDistribution).reduce((a, b) => a + b, 0)
      const sorted = Object.entries(genderDistribution).sort(([, a], [, b]) => b - a)
      statsParts.push(`rider gender breakdown: ${sorted.map(([g, c]) => `${Math.round((c / total) * 100)}% ${g}`).join(', ')}`)
    }
    const statsContext = statsParts.length > 0
      ? `Historical data for ${horseName} (${rideResult.data?.length ?? 0} rides): ${statsParts.join('; ')}.`
      : `Limited historical data for ${horseName} — fewer than 5 completed rides for reliable statistics.`

    const prompt = `You are an experienced head wrangler at a dude ranch. Explain in 1-2 sentences why this horse-guest pairing is or isn't a good fit.

Guest: age ${guest.age}, ${guest.weight} lbs, ${guestLevelLabel} rider${guest.gender ? `, ${guest.gender}` : ''}.
Horse: ${horseName}, rated ${horseLevelLabel}${horseData?.weight ? `, max weight ${horseData.weight} lbs` : ''}${horseData?.notes ? `, notes: ${horseData.notes}` : ''}.
${statsContext}

If historical average stats are available, incorporate them naturally (e.g. "This horse's average rider weighs around X lbs, close to this guest's weight" or "Typical riders here are X years older"). If stats are limited, base the explanation on level and weight compatibility only. Be concise and practical — the tone of a wrangler briefing staff. Do not use the guest's name. Do not start with "I".`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) throw new Error(`Anthropic error: ${anthropicRes.status}`)

    const anthropicData = await anthropicRes.json()
    const reason = (anthropicData.content?.[0]?.text as string | undefined)?.trim()
    if (!reason) throw new Error('Empty Anthropic response')

    return NextResponse.json({ reason })
  } catch (err) {
    console.error('[assign-all/explain]', err)
    return NextResponse.json({ reason: fallbackReason })
  }
}
