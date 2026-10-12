// Conversion helpers for White Stallion → HerdAI guest sync.

export const WS_SOURCE = 'white_stallion'

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462)
}

// Produces the same X'Y" format that lib/format.ts formatHeight() outputs.
export function metersToHeight(meters: number): string {
  const totalInches = meters * 39.3701
  let feet = Math.floor(totalInches / 12)
  let inches = Math.round(totalInches % 12)
  if (inches === 12) { feet++; inches = 0 }
  return `${feet}'${inches}"`
}

// WS rideAbility → HerdAI riding_level
// 1 → 'B'   2 → 'AB'   3 → 'I'   4 → 'AI'   5 → 'A'   6 → null (not riding — skip)
// HerdAI's 'I/AI' (Intermediate / Adv Intermediate) has no WS equivalent; it can only
// be set manually within HerdAI.
export function rideAbilityToLevel(ability: number | null | undefined): string | null {
  switch (ability) {
    case 1: return 'B'
    case 2: return 'AB'
    case 3: return 'I'
    case 4: return 'AI'
    case 5: return 'A'
    default: return null
  }
}

export function formatGuestName(firstName: string, lastName: string): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim()
}
