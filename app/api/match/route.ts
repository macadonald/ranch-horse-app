import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTucsonToday } from '@/lib/timezone'

// Bracket-matches to find the next complete JSON object in accumulated text
function extractNextObject(text: string, startPos: number): { obj: string; end: number } | null {
  let depth = 0
  let inString = false
  let escape = false
  let start = -1
  for (let i = startPos; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) return { obj: text.slice(start, i + 1), end: i + 1 }
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { age, weight, height, level, gender, notes, guestId, dismissedHorses = [] } = body
    if (!age || !weight || !height || !level) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const weightNum = parseInt(weight)
    const ageNum = parseInt(age)
    const today = getTucsonToday()

    // Parallel Supabase fetches
    const [riderCountResult, assignmentsResult, shoeNeedsResult, horsesResult, statusFlagsResult, lameFlagsResult, guestResult, historyResult, patternResult] = await Promise.all([
      supabase.from('daily_rider_counts').select('rider_count').eq('date', today).single(),
      supabase.from('horse_assignments')
        .select('horse_name, assignment_type, guests(name, room_number, check_out_date)')
        .eq('status', 'active')
        .eq('incompatible', false),
      supabase.from('shoe_needs').select('horse_name, what_needed'),
      supabase.from('horses').select('*').eq('is_active', true),
      supabase.from('horse_status_flags').select('horse_name, flag_type, day_off_date').eq('status', 'active'),
      supabase.from('horse_lame_flags').select('horse_name').eq('status', 'active'),
      guestId ? supabase.from('guests').select('overestimates_level').eq('id', guestId).single() : Promise.resolve({ data: null }),
      guestId ? supabase.from('assignment_history').select('horse_name, match_quality, doesnt_work, loves_horse').eq('guest_id', guestId).gte('assigned_date', '2026-05-11') : Promise.resolve({ data: [] }),
      // Pattern learning: all non-incompatible assignments with guest rider profiles
      supabase.from('horse_assignments')
        .select('horse_name, guests!inner(weight, riding_level, gender, age)')
        .eq('incompatible', false),
    ])

    // Build set of flag-blocked horse names
    const blockingFlagTypes = new Set(['lame', 'injured', 'in_training', 'retired'])
    const flagBlocked = new Set<string>()
    ;(statusFlagsResult.data || []).forEach((f: any) => {
      if (f.flag_type === 'day_off') {
        if (f.day_off_date === today) flagBlocked.add(f.horse_name)
      } else if (blockingFlagTypes.has(f.flag_type)) {
        flagBlocked.add(f.horse_name)
      }
    })
    ;(lameFlagsResult.data || []).forEach((f: any) => flagBlocked.add(f.horse_name))

    const riderCount = riderCountResult.data?.rider_count || 0

    // Build past-ride map from history (for learning cutoff >= 2026-05-11)
    const overestimatesLevel = guestResult.data?.overestimates_level || false
    const pastHorseMap: Record<string, { match_quality: number | null; doesnt_work: boolean; loves_horse: boolean }> = {}
    ;(historyResult.data || []).forEach((h: any) => {
      const existing = pastHorseMap[h.horse_name]
      pastHorseMap[h.horse_name] = {
        match_quality: h.loves_horse ? 2 : (h.match_quality ?? existing?.match_quality ?? null),
        doesnt_work: h.doesnt_work || existing?.doesnt_work || false,
        loves_horse: h.loves_horse || existing?.loves_horse || false,
      }
    })

    const shoeNeedsMap: Record<string, string> = {}
    ;(shoeNeedsResult.data || []).forEach((n: { horse_name: string; what_needed: string }) => {
      shoeNeedsMap[n.horse_name] = n.what_needed
    })

    let incompatibleHorses: string[] = []
    if (guestId) {
      const { data: incompatible } = await supabase
        .from('horse_assignments')
        .select('horse_name')
        .eq('guest_id', guestId)
        .eq('incompatible', true)
      incompatibleHorses = (incompatible || []).map((i: { horse_name: string }) => i.horse_name)
    }

    type GuestInfo = { name: string; room: string; checkOut: string }
    const assignmentMap: Record<string, GuestInfo[]> = {}
    ;(assignmentsResult.data || []).forEach((a: any) => {
      if (!a.guests) return
      const guest = Array.isArray(a.guests) ? a.guests[0] : a.guests
      if (!guest || guest.check_out_date < today) return
      if (!assignmentMap[a.horse_name]) assignmentMap[a.horse_name] = []
      assignmentMap[a.horse_name].push({ name: guest.name, room: guest.room_number, checkOut: guest.check_out_date })
    })

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const LEVEL_ORDER_LOCAL = ['B', 'AB', 'I', 'I/AI', 'AI', 'A']
    const LEVEL_DOWNGRADE: Record<string, string> = { A: 'AI', AI: 'I', I: 'AB', AB: 'B', B: 'B' }
    const effectiveLevel = overestimatesLevel ? (LEVEL_DOWNGRADE[level] || level) : level
    const overestimatesNote = overestimatesLevel && effectiveLevel !== level
      ? `IMPORTANT: Guest's stated level is ${level} but they overestimate their ability. Match as ${effectiveLevel}.`
      : ''

    // Per-horse historical stats from all non-incompatible assignments with guest profiles.
    // patternResult uses horse_assignments (all statuses, not just active) — provides meaningful historical depth.
    type HorseHistStats = { levels: Set<string>; maxWeight: number; count: number }
    const horseHistStats: Record<string, HorseHistStats> = {}
    for (const a of patternResult.data || []) {
      const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
      if (!g) continue
      const hname = a.horse_name as string
      if (!horseHistStats[hname]) horseHistStats[hname] = { levels: new Set(), maxWeight: 0, count: 0 }
      if (g.riding_level) horseHistStats[hname].levels.add(g.riding_level as string)
      if (g.weight) horseHistStats[hname].maxWeight = Math.max(horseHistStats[hname].maxWeight, g.weight as number)
      horseHistStats[hname].count++
    }
    // listed + 15 base buffer, extended by historical max up to listed + 30
    const horseWeightCeiling = (listed: number, hname: string) =>
      Math.min(listed + 30, Math.max(listed + 15, horseHistStats[hname]?.maxWeight ?? 0))
    // < 5 assignments → ±1 default; ≥ 20 and never above base level → ceiling at base; else historical range (floor at base - 1)
    const horseLevelRangeFn = (hname: string, baseLevelIdx: number) => {
      const s = horseHistStats[hname]
      if (!s || s.count < 5) return { min: Math.max(0, baseLevelIdx - 1), max: Math.min(LEVEL_ORDER_LOCAL.length - 1, baseLevelIdx + 1) }
      let lo = baseLevelIdx, hi = baseLevelIdx
      Array.from(s.levels).forEach(lvl => { const i = LEVEL_ORDER_LOCAL.indexOf(lvl); if (i !== -1) { if (i < lo) lo = i; if (i > hi) hi = i } })
      if (s.count >= 20 && hi <= baseLevelIdx) return { min: Math.max(0, lo), max: baseLevelIdx }
      return { min: Math.max(0, Math.min(lo, baseLevelIdx - 1)), max: Math.min(LEVEL_ORDER_LOCAL.length - 1, hi) }
    }

    const allEligible = (horsesResult.data || []).filter((h: any) => {
      if (h.exclude_from_ai) return false
      if (h.is_deceased) return false
      if (h.weight === null) return false
      if (weightNum > horseWeightCeiling(h.weight, h.name)) return false
      if (flagBlocked.has(h.name)) return false
      if (incompatibleHorses.includes(h.name)) return false
      if (dismissedHorses.includes(h.name)) return false
      return true
    })
    // Draft horses are last resort for weight — only include if no standard horse can carry this guest
    const guestHasStandardOption = allEligible.some((h: any) => !h.is_draft)
    const eligible = guestHasStandardOption ? allEligible.filter((h: any) => !h.is_draft) : allEligible

    const availabilityMap: Record<string, string> = {}
    eligible.forEach(h => {
      const assigned = assignmentMap[h.name] || []
      if (assigned.length === 0) availabilityMap[h.name] = 'available'
      else if (assigned.length === 1) availabilityMap[h.name] = 'single_assigned'
      else availabilityMap[h.name] = 'double_assigned'
    })

    // rank_last threshold: only surface rank_last horses when < 3 standard eligible horses exist for this guest's level
    const guestLevelIdx = LEVEL_ORDER_LOCAL.indexOf(effectiveLevel)
    const eligibleAtGuestLevel = eligible.filter((h: any) => {
      if (h.rank_last) return false
      const hIdx = LEVEL_ORDER_LOCAL.indexOf(h.level)
      if (hIdx === -1 || guestLevelIdx === -1) return false
      const r = horseLevelRangeFn(h.name, hIdx)
      return guestLevelIdx >= r.min && guestLevelIdx <= r.max
    })
    const includeRankLast = guestLevelIdx === -1 || eligibleAtGuestLevel.length < 3
    const finalEligible = includeRankLast ? eligible : eligible.filter((h: any) => !h.rank_last)

    const sortedEligible = [
      ...finalEligible.filter((h: any) => !h.rank_last),
      ...finalEligible.filter((h: any) => h.rank_last),
    ]
    const rankLastNames = finalEligible.filter((h: any) => h.rank_last).map((h: any) => h.name)

    const rosterLines = sortedEligible.map((h: any) => {
      const assigned = assignmentMap[h.name] || []
      let availNote = 'Available'
      if (assigned.length === 1) {
        const a = assigned[0]
        availNote = (a.checkOut === today || a.checkOut === tomorrowStr) ? `Single assigned to ${a.name} Room ${a.room} - CHECKING OUT SOON` : `Single assigned to ${a.name} Room ${a.room}`
      } else if (assigned.length === 2) {
        availNote = `DOUBLE ASSIGNED: ${assigned.map(a => a.name + ' Room ' + a.room).join(' & ')}`
      } else if (assigned.length > 2) {
        availNote = 'TRIPLE ASSIGNED - strongly avoid'
      }
      const wCeil = horseWeightCeiling(h.weight, h.name)
      const hBaseLvlIdx = LEVEL_ORDER_LOCAL.indexOf(h.level)
      const lvlRange = hBaseLvlIdx !== -1 ? horseLevelRangeFn(h.name, hBaseLvlIdx) : null
      const defMin = Math.max(0, hBaseLvlIdx - 1), defMax = Math.min(LEVEL_ORDER_LOCAL.length - 1, hBaseLvlIdx + 1)
      const ceilNote = wCeil > h.weight ? `, soft_ceiling: ${wCeil}lbs` : ''
      const rangeNote = lvlRange && (lvlRange.min !== defMin || lvlRange.max !== defMax) ? `, level_range: ${LEVEL_ORDER_LOCAL[lvlRange.min]}–${LEVEL_ORDER_LOCAL[lvlRange.max]}` : ''
      return `- ${h.name} (level: ${h.level}, max: ${h.weight}lbs${ceilNote}${rangeNote}, size: ${h.size}, availability: ${availNote}${h.takes_kids ? ', takes_kids: true' : ''}${h.notes ? ', notes: ' + h.notes : ''})`
    }).join('\n')

    // Pattern learning: group historical assignments into rider profile buckets
    // Weight in 20lb buckets, level exact, gender exact, age in 10-year buckets
    // Excludes incompatible assignments (already filtered at query level)
    // Excludes loves_horse and doesnt_work per spec — only structural profile matters
    type PatternRow = { horse_name: string; weight: number; riding_level: string; gender: string; age: number | null }
    const patternRows: PatternRow[] = (patternResult.data || []).map((a: any) => {
      const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
      if (!g?.weight || !g?.riding_level) return null
      return { horse_name: a.horse_name, weight: g.weight as number, riding_level: g.riding_level as string, gender: (g.gender as string) || '', age: g.age as number | null }
    }).filter((r: PatternRow | null): r is PatternRow => r !== null)

    const bucketMap: Record<string, Record<string, number>> = {}
    for (const r of patternRows) {
      const wBucket = Math.floor(r.weight / 20) * 20
      const aBucket = r.age != null ? Math.floor(r.age / 10) * 10 : null
      const key = `${wBucket}|${r.riding_level}|${r.gender || 'any'}|${aBucket ?? 'unk'}`
      if (!bucketMap[key]) bucketMap[key] = {}
      bucketMap[key][r.horse_name] = (bucketMap[key][r.horse_name] || 0) + 1
    }

    const guestWBucket = Math.floor(weightNum / 20) * 20
    const guestABucket = Math.floor(ageNum / 10) * 10
    const guestKey = `${guestWBucket}|${effectiveLevel}|${gender || 'any'}|${guestABucket}`
    const bucketHorses = bucketMap[guestKey] || {}
    const bucketTotal = Object.values(bucketHorses).reduce((s, c) => s + c, 0)

    const eligibleNames = new Set(finalEligible.map((h: any) => h.name))
    let patternNote = ''
    if (bucketTotal >= 5) {
      const topPairs = Object.entries(bucketHorses)
        .filter(([name]) => eligibleNames.has(name))
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
      if (topPairs.length > 0) {
        patternNote = `PATTERN DATA (${bucketTotal} historical assignments for guests ${guestWBucket}–${guestWBucket + 20}lbs, ${effectiveLevel} level, ${gender || 'unspecified'} gender, age ${guestABucket}–${guestABucket + 10}): Owner has historically paired this profile with: ${topPairs.map(([n, c]) => `${n} (${c}x)`).join(', ')}. Factor as a soft preference alongside other rules — do not override level/weight/safety constraints.`
      }
    }

    // Signal hierarchy: loves_horse > implicit thumbs up (stayed all week) > doesnt_work
    const lovesHorseNames = Object.entries(pastHorseMap).filter(([, v]) => v.loves_horse).map(([n]) => n)
    const goodMatchNames = Object.entries(pastHorseMap).filter(([, v]) => v.match_quality === 1 && !v.loves_horse && !v.doesnt_work).map(([n]) => n)
    const doesntWorkNames = Object.entries(pastHorseMap).filter(([, v]) => v.doesnt_work).map(([n]) => n)
    const lovesNote = lovesHorseNames.length > 0 ? `❤️ LOVES THESE HORSES — guest has a genuine connection, prioritize but always show disclaimer to confirm: ${lovesHorseNames.join(', ')}` : ''
    const goodMatchNote = goodMatchNames.length > 0 ? `POSITIVE HISTORY (rode all week, no issues) — slight preference: ${goodMatchNames.join(', ')}` : ''
    // Doesn't Work is per-guest only — zero effect on other guests' suggestions or global horse scoring
    const doesntWorkNote = doesntWorkNames.length > 0 ? `DO NOT SUGGEST — marked "doesn't work" for this guest: ${doesntWorkNames.join(', ')}` : ''

    const ageWarning = ageNum >= 70 ? 'IMPORTANT: This rider is 70+. Strongly consider horses one to two levels below.' : ageNum >= 60 ? 'NOTE: This rider is 60+. Consider a slightly easier horse.' : ''
    const smallGuestNote = (weightNum < 80 || ageNum < 10)
      ? 'SMALL GUEST: This guest is very small (under 80lbs or under age 10). Strongly prefer horses with a max weight of 150lbs or less. Only suggest larger horses if no appropriate smaller horse is available.'
      : ''
    const doubleAssignInstruction = riderCount >= 95 ? 'DOUBLE ASSIGNING IS NORMAL TODAY (95+ riders).' : riderCount >= 80 ? 'DOUBLE ASSIGNING IS ACCEPTABLE TODAY (80-95 riders).' : 'Prefer fully available horses.'
    const rankLastInstruction = rankLastNames.length > 0 ? `CRITICAL: ${rankLastNames.join(', ')} must appear at the very bottom of your list — use only as an absolute last resort if no other suitable horse exists.` : ''
    const takesKidsInstruction = 'Horses with "takes_kids: true" are primarily suited for children and lighter/younger guests. For adult riders, prefer standard horses — only use a takes_kids horse for an adult if no better option exists or if the pattern data strongly favors it for this profile.'
    const flexNote = 'When a horse shows "soft_ceiling", you may suggest it for guests up to that weight when options are limited — the ranch owner uses this buffer in practice. When a horse shows "level_range", use that range instead of rigid ±1 rules — it reflects actual historical assignment patterns. Always prefer horses whose listed level is closest to the guest\'s level when multiple options exist.'
    const prompt = `You are an experienced head wrangler at a dude ranch. Find the best 10 horse matches for this rider.
Level scale: Beginner (B) -> Advanced Beginner (AB) -> Intermediate (I) -> Advanced Intermediate (AI) -> Advanced (A)
${doubleAssignInstruction}
Rules: 1. Prioritize exact level match. 2. Bleed to adjacent if needed. 3. Match size. 4. Notes are critical. 5. Mark exact or adjacent.
${flexNote}
${ageWarning}
${smallGuestNote}
${overestimatesNote}
${takesKidsInstruction}
${patternNote}
${lovesNote}
${goodMatchNote}
${doesntWorkNote}
${rankLastInstruction}
Rider: Age ${age}, Weight ${weight}lbs, Height ${height}, Level ${effectiveLevel}, Gender ${gender || 'not specified'}, Notes: ${notes || 'none'}
Eligible horses:
${rosterLines}
Respond ONLY with valid JSON array, no markdown:
[{"name":"HorseName","fit":"exact","reason":"1-2 sentences.","warning":"warning text or empty string"}]`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) throw new Error(`Anthropic API error: ${anthropicRes.status}`)

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = anthropicRes.body!.getReader()
          const decoder = new TextDecoder()
          let sseBuffer = ''   // buffers partial SSE lines from Anthropic
          let accumulated = '' // accumulates Claude's text output
          let searchPos = 0    // tracks how far we've parsed in accumulated

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (!raw || raw === '[DONE]') continue
              try {
                const event = JSON.parse(raw)
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  accumulated += event.delta.text
                }
              } catch {}
            }

            // Extract and emit any newly complete match objects
            while (true) {
              const result = extractNextObject(accumulated, searchPos)
              if (!result) break
              try {
                const raw = JSON.parse(result.obj) as { name: string; fit: string; reason: string; warning: string }
                const dbAvailability = availabilityMap[raw.name] || 'available'
                const assigned = assignmentMap[raw.name] || []
                let warning = raw.warning || ''
                if (dbAvailability === 'double_assigned') {
                  warning = `Double assigned: ${assigned.map(a => a.name + ' (Room ' + a.room + ')').join(' & ')}`
                } else if (dbAvailability === 'single_assigned' && !warning) {
                  warning = `Already assigned to ${assigned[0]?.name} (Room ${assigned[0]?.room})`
                } else if (assigned.length > 2) {
                  warning = 'Triple assigned — not recommended'
                }
                const shoeNeed = shoeNeedsMap[raw.name]
                const shoeWarning: 'red' | 'amber' | null = shoeNeed === 'fronts' ? 'red' : shoeNeed ? 'amber' : null
                const pastEntry = pastHorseMap[raw.name]
                const lovesThisHorse = pastEntry?.loves_horse ?? false
                const match = { ...raw, availability: dbAvailability, warning, shoeWarning, rodeThisBefore: !!pastEntry && !pastEntry.doesnt_work, pastMatchQuality: pastEntry?.match_quality ?? null, lovesThisHorse }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'match', match })}\n\n`))
              } catch {}
              searchPos = result.end
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', riderCount })}\n\n`))
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('Match API error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
