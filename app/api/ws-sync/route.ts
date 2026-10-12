import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { WS_SOURCE, kgToLbs, metersToHeight, rideAbilityToLevel, formatGuestName } from '@/lib/ws-sync'

export const dynamic = 'force-dynamic'

// ── WS API shapes ─────────────────────────────────────────────────────────────

interface WsGuest {
  id: number
  firstName: string
  lastName: string
  age: number | null
  weight: number | null       // kg
  height: number | null       // meters
  rideAbility: number | null
  reservation: number
  rezovationConfirmation: string | null
  deleted: number
  horseRequest: string | null
}

interface WsReservation {
  id: number
  startDate: string
  endDate: string
  noRide: boolean
}

// ── Sync field list (WS values win for these when non-null) ───────────────────

const SYNC_FIELDS = [
  'name', 'age', 'weight', 'height',
  'riding_level', 'horse_request',
  'check_in_date', 'check_out_date',
] as const
type SyncField = typeof SYNC_FIELDS[number]

interface ConvertedGuest {
  name: string
  age: number | null
  weight: number | null
  height: string | null
  riding_level: string | null
  horse_request: string | null
  check_in_date: string | null
  check_out_date: string | null
  external_source: string
  external_guest_id: string
  external_reservation_id: string
  external_confirmation: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function wsPost(base: string, token: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`WS ${path} returned HTTP ${res.status}`)
  return res.json()
}

function valuesMatch(wsVal: unknown, herdVal: unknown): boolean {
  if (wsVal == null) return true
  if (herdVal == null) return false
  return String(wsVal).trim() === String(herdVal).trim()
}

function buildChanges(
  converted: ConvertedGuest,
  existing: Record<string, unknown>,
): Array<{ field: SyncField; old: unknown; new: unknown }> {
  const changes: Array<{ field: SyncField; old: unknown; new: unknown }> = []
  for (const field of SYNC_FIELDS) {
    const wsVal = converted[field as keyof ConvertedGuest]
    const herdVal = existing[field]
    if (!valuesMatch(wsVal, herdVal)) {
      changes.push({ field, old: herdVal ?? null, new: wsVal })
    }
  }
  return changes
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const base = process.env.WS_API_BASE_URL
  const token = process.env.WS_API_TOKEN
  if (!base || !token) {
    return NextResponse.json({ error: 'WS sync not configured' })
  }

  // 1. Fetch all current guests from WS
  let wsGuests: WsGuest[]
  try {
    const data = await wsPost(base, token, '/v1/guest/search', { rowPerPage: 5000 })
    wsGuests = data.results ?? []
  } catch (err) {
    return NextResponse.json(
      { error: `WS guest/search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // 2. Separate non-riders before any further processing
  let skippedNonRiders = 0
  const ridingGuests: WsGuest[] = []
  for (const g of wsGuests) {
    if (g.deleted === 1 || g.rideAbility === 6) {
      skippedNonRiders++
    } else {
      ridingGuests.push(g)
    }
  }

  // 3. Fetch each unique reservation (startDate / endDate / noRide)
  const uniqueResIds = Array.from(new Set(ridingGuests.map(g => g.reservation)))
  const reservationMap = new Map<number, WsReservation>()

  await Promise.all(
    uniqueResIds.map(async rid => {
      try {
        const data = await wsPost(base, token, '/v1/reservation/load', { id: rid })
        reservationMap.set(rid, {
          id: data.id,
          startDate: data.startDate ?? '',
          endDate: data.endDate ?? '',
          noRide: data.noRide === true,
        })
      } catch {
        // If reservation/load fails the guests in it will be counted below
      }
    }),
  )

  // 4. Build converted candidates, filtering noRide reservations
  const candidates: Array<{ wsGuest: WsGuest; converted: ConvertedGuest }> = []

  for (const g of ridingGuests) {
    const res = reservationMap.get(g.reservation)
    if (!res || res.noRide) {
      skippedNonRiders++
      continue
    }
    candidates.push({
      wsGuest: g,
      converted: {
        name:                    formatGuestName(g.firstName, g.lastName),
        age:                     g.age ?? null,
        weight:                  g.weight != null ? kgToLbs(g.weight) : null,
        height:                  g.height != null ? metersToHeight(g.height) : null,
        riding_level:            rideAbilityToLevel(g.rideAbility),
        horse_request:           g.horseRequest ?? null,
        check_in_date:           res.startDate ? res.startDate.slice(0, 10) : null,
        check_out_date:          res.endDate   ? res.endDate.slice(0, 10)   : null,
        external_source:         WS_SOURCE,
        external_guest_id:       String(g.id),
        external_reservation_id: String(res.id),
        external_confirmation:   g.rezovationConfirmation ?? null,
      },
    })
  }

  // 5. Load existing HerdAI guests for comparison (no medical / emergency fields)
  const { data: herdRows } = await supabase
    .from('guests')
    .select('id, name, age, weight, height, riding_level, horse_request, check_in_date, check_out_date, external_source, external_guest_id')
  const herd: Array<Record<string, unknown>> = herdRows ?? []

  // update match: same external_source AND external_guest_id
  const byExternalId = new Map(
    herd
      .filter(g => g.external_source === WS_SOURCE && g.external_guest_id != null)
      .map(g => [g.external_guest_id as string, g]),
  )

  // 6. Decide action for each candidate
  type GuestPreview =
    | { action: 'add';    external_guest_id: string; name: string; data: ConvertedGuest }
    | { action: 'update'; external_guest_id: string; name: string; changes: Array<{ field: SyncField; old: unknown; new: unknown }> }
    | { action: 'link';   external_guest_id: string; name: string; herd_id: string; changes: Array<{ field: SyncField; old: unknown; new: unknown }> }
    | { action: 'skip';   external_guest_id: string; name: string; reason: string }

  const guests: GuestPreview[] = candidates.map(({ wsGuest, converted }) => {
    if (!converted.name) {
      return { action: 'skip', external_guest_id: String(wsGuest.id), name: '(no name)', reason: 'empty name' }
    }

    const existing = byExternalId.get(String(wsGuest.id))
    if (existing) {
      return {
        action: 'update',
        external_guest_id: String(wsGuest.id),
        name: converted.name,
        changes: buildChanges(converted, existing),
      }
    }

    // link: no external_guest_id set, same name + check-in date
    const linkMatch = herd.find(
      g =>
        g.external_guest_id == null &&
        typeof g.name === 'string' &&
        g.name.trim().toLowerCase() === converted.name.toLowerCase() &&
        typeof g.check_in_date === 'string' &&
        g.check_in_date.slice(0, 10) === converted.check_in_date,
    )
    if (linkMatch) {
      return {
        action: 'link',
        external_guest_id: String(wsGuest.id),
        name: converted.name,
        herd_id: linkMatch.id as string,
        changes: buildChanges(converted, linkMatch),
      }
    }

    return { action: 'add', external_guest_id: String(wsGuest.id), name: converted.name, data: converted }
  })

  const counts = {
    add:              guests.filter(p => p.action === 'add').length,
    update:           guests.filter(p => p.action === 'update').length,
    link:             guests.filter(p => p.action === 'link').length,
    skip:             guests.filter(p => p.action === 'skip').length,
    skippedNonRiders,
  }

  return NextResponse.json({ counts, guests })
}
