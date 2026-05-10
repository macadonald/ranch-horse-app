import { NextRequest, NextResponse } from 'next/server'
import { ACTIVE_HORSES } from '@/lib/horses'
import { supabase } from '@/lib/supabase'

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
    const today = new Date().toISOString().split('T')[0]

    // Parallel Supabase fetches
    const [riderCountResult, assignmentsResult, shoeNeedsResult] = await Promise.all([
      supabase.from('daily_rider_counts').select('rider_count').eq('date', today).single(),
      supabase.from('horse_assignments')
        .select('horse_name, assignment_type, guests(name, room_number, check_out_date)')
        .eq('status', 'active')
        .eq('incompatible', false),
      supabase.from('shoe_needs').select('horse_name, what_needed'),
    ])

    const riderCount = riderCountResult.data?.rider_count || 0

    const shoeNeedsMap: Record<string, string> = {}
    ;(shoeNeedsResult.data || []).forEach((n: { horse_name: string; what_needed: string }) => {
      shoeNeedsMap[n.horse_name] = n.what_needed
    })

    let incompatibleHorses: string[] = []
    if (guestId) {
      const { data: incompatible } = await supabase
        .from('horse_incompatibilities')
        .select('horse_name')
        .eq('guest_id', guestId)
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

    const eligible = ACTIVE_HORSES.filter(h => {
      if (h.weight === null) return false
      if (weightNum > h.weight) return false
      if (incompatibleHorses.includes(h.name)) return false
      if (dismissedHorses.includes(h.name)) return false
      return true
    })

    const availabilityMap: Record<string, string> = {}
    eligible.forEach(h => {
      const assigned = assignmentMap[h.name] || []
      if (assigned.length === 0) availabilityMap[h.name] = 'available'
      else if (assigned.length === 1) availabilityMap[h.name] = 'single_assigned'
      else availabilityMap[h.name] = 'double_assigned'
    })

    const rosterLines = eligible.map(h => {
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
      return `- ${h.name} (level: ${h.level}, max: ${h.weight}lbs, size: ${h.size}, availability: ${availNote}${h.notes ? ', notes: ' + h.notes : ''})`
    }).join('\n')

    const ageWarning = ageNum >= 70 ? 'IMPORTANT: This rider is 70+. Strongly consider horses one to two levels below.' : ageNum >= 60 ? 'NOTE: This rider is 60+. Consider a slightly easier horse.' : ''
    const doubleAssignInstruction = riderCount >= 95 ? 'DOUBLE ASSIGNING IS NORMAL TODAY (95+ riders).' : riderCount >= 80 ? 'DOUBLE ASSIGNING IS ACCEPTABLE TODAY (80-95 riders).' : 'Prefer fully available horses.'
    const prompt = `You are an experienced head wrangler at a dude ranch. Find the best 10 horse matches for this rider.
Level scale: Beginner (B) -> Advanced Beginner (AB) -> Intermediate (I) -> Advanced Intermediate (AI) -> Advanced (A)
${doubleAssignInstruction}
Rules: 1. Prioritize exact level match. 2. Bleed to adjacent if needed. 3. Match size. 4. Notes are critical. 5. Mark exact or adjacent.
${ageWarning}
Rider: Age ${age}, Weight ${weight}lbs, Height ${height}, Level ${level}, Gender ${gender || 'not specified'}, Notes: ${notes || 'none'}
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
                const match = { ...raw, availability: dbAvailability, warning, shoeWarning }
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
