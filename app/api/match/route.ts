import { NextRequest, NextResponse } from 'next/server'
import { ACTIVE_HORSES } from '@/lib/horses'
import { supabase } from '@/lib/supabase'

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
    const { data: riderCountData } = await supabase.from('daily_rider_counts').select('rider_count').eq('date', today).single()
    const riderCount = riderCountData?.rider_count || 0
    const { data: assignments } = await supabase.from('horse_assignments').select('horse_name, assignment_type, guests(name, room_number, check_out_date)').eq('status', 'active').eq('incompatible', false)
    let incompatibleHorses: string[] = []
    if (guestId) {
      const { data: incompatible } = await supabase.from('horse_incompatibilities').select('horse_name').eq('guest_id', guestId)
      incompatibleHorses = (incompatible || []).map((i: { horse_name: string }) => i.horse_name)
    }
    type GuestInfo = { name: string; room: string; checkOut: string }
    const assignmentMap: Record<string, GuestInfo[]> = {}
    ;(assignments || []).forEach((a: any) => {
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
    const data = await response.json()
    const text = data.content.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('')
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const aiMatches = JSON.parse(jsonMatch[0])
    const matches = aiMatches.map((m: { name: string; fit: string; reason: string; warning: string }) => {
      const dbAvailability = availabilityMap[m.name] || 'available'
      const assigned = assignmentMap[m.name] || []
      let warning = m.warning || ''
      if (dbAvailability === 'double_assigned') warning = `Double assigned: ${assigned.map(a => a.name + ' (Room ' + a.room + ')').join(' & ')}`
      else if (dbAvailability === 'single_assigned' && !warning) warning = `Already assigned to ${assigned[0]?.name} (Room ${assigned[0]?.room})`
      else if (assigned.length > 2) warning = 'Triple assigned — not recommended'
      return { ...m, availability: dbAvailability, warning }
    })
    return NextResponse.json({ matches, riderCount })
  } catch (err) {
    console.error('Match API error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
