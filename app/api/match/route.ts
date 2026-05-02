import { NextRequest, NextResponse } from 'next/server'
import { ACTIVE_HORSES } from '@/lib/horses'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { age, weight, height, level, notes, guestId, dismissedHorses = [] } = body

    if (!age || !weight || !height || !level) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const weightNum = parseInt(weight)
    const ageNum = parseInt(age)
    const today = new Date().toISOString().split('T')[0]

    const { data: riderCountData } = await supabase
      .from('daily_rider_counts')
      .select('rider_count')
      .eq('date', today)
      .single()
    const riderCount = riderCountData?.rider_count || 0

    const { data: assignments } = await supabase
      .from('horse_assignments')
      .select('horse_name, assignment_type, guests(name, room_number, check_out_date)')
      .eq('status', 'active')
      .eq('incompatible', false)

    let incompatibleHorses: string[] = []
    if (guestId) {
      const { data: incompatible } = await supabase
        .from('horse_incompatibilities')
        .select('horse_name')
        .eq('guest_id', guestId)
      incompatibleHorses = (incompatible || []).map((i: { horse_name: string }) => i.horse_name)
    }

    const assignmentMap: Record<string, { guests: { name: string; room_number: string; check_out_date: string }; assignment_type: string }[]> = {}
    ;(assignments || []).forEach((a: { horse_name: string; assignment_type: string; guests: { name: string; room_number: string; check_out_date: string } }) => {
      if (!a.guests) return
      if (a.guests.check_out_date < today) return
      if (!assignmentMap[a.horse_name]) assignmentMap[a.horse_name] = []
      assignmentMap[a.horse_name].push(a)
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

    const doubleAssignNormal = riderCount >= 95
    const doubleAssignMix = riderCount >= 80

    const rosterLines = eligible.map(h => {
      const assigned = assignmentMap[h.name] || []
      const assignedCount = assigned.length
      let availabilityNote = ''

      if (assignedCount === 0) {
        availabilityNote = 'Available'
      } else if (assignedCount === 1) {
        const a = assigned[0]
        const checkingOutTomorrow = a.guests.check_out_date === tomorrowStr
        const checkingOutToday = a.guests.check_out_date === today
        if (checkingOutToday || checkingOutTomorrow) {
          availabilityNote = `Single assigned to ${a.guests.name} Room ${a.guests.room_number} - CHECKING OUT ${checkingOutToday ? 'TODAY' : 'TOMORROW'}`
        } else {
          availabilityNote = `Single assigned to ${a.guests.name} Room ${a.guests.room_number} until ${a.guests.check_out_date}`
        }
      } else if (assignedCount === 2) {
        availabilityNote = `Double assigned: ${assigned.map(a => a.guests.name + ' Room ' + a.guests.room_number).join(' & ')}`
      } else {
        availabilityNote = `Triple assigned - strongly avoid`
      }

      return `- ${h.name} (level: ${h.level}, max: ${h.weight}lbs, size: ${h.size}, availability: ${availabilityNote}${h.notes ? ', notes: ' + h.notes : ''})`
    }).join('\n')

    const ageWarning = ageNum >= 70
      ? 'IMPORTANT: This rider is 70+. Older riders frequently overstate their level. Strongly consider horses one to two levels below.'
      : ageNum >= 60
      ? 'NOTE: This rider is 60+. Some older riders overstate their level. Consider a slightly easier horse.'
      : ''

    const doubleAssignInstruction = doubleAssignNormal
      ? 'DOUBLE ASSIGNING IS NORMAL TODAY (95+ riders): Freely suggest already single-assigned horses. Always note the double assignment.'
      : doubleAssignMix
      ? 'DOUBLE ASSIGNING IS ACCEPTABLE TODAY (80-95 riders): Single-assigned horses can appear in the mix but prefer available horses first.'
      : 'Prefer fully available horses. Only suggest single-assigned horses if options are very limited.'

    const prompt = `You are an experienced head wrangler at a dude ranch. Find the best 10 horse matches for this rider.

Level scale: Beginner (B) -> Advanced Beginner (AB) -> Intermediate (I) -> Advanced Intermediate (AI) -> Advanced (A)

${doubleAssignInstruction}

Rules:
1. Prioritize horses whose level matches the rider exactly.
2. Bleed to adjacent levels if needed.
3. Match horse size to rider size.
4. Notes field is critical - injuries, nervous, smooth horse, recent wreck all matter.
5. ALWAYS show a warning for double or triple assigned horses.
6. Flag horses checking out soon as available soon.
7. Mark each as exact or adjacent fit.

${ageWarning}

Rider:
- Age: ${age}
- Weight: ${weight} lbs
- Height: ${height}
- Riding level: ${level}
- Notes: ${notes || 'none'}

Eligible horses:
${rosterLines}

Respond ONLY with valid JSON array, no markdown:
[{"name":"HorseName","fit":"exact","reason":"1-2 sentences.","warning":"double assign notice or other warning, empty string if none","availability":"available|single_assigned|double_assigned|checking_out_soon"}]`

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

    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)

    const data = await response.json()
    const text = data.content.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const matches = JSON.parse(jsonMatch[0])
    return NextResponse.json({ matches, riderCount })

  } catch (err) {
    console.error('Match API error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
