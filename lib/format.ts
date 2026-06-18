export function formatHeight(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  if (/^\d+'\d+"$/.test(s)) return s                       // already X'Y"
  const withSep = s.match(/^(\d+)['\-\s]+(\d{1,2})"?$/)
  if (withSep) return `${withSep[1]}'${withSep[2]}"`       // 6'5  6-5  6 5  6'10
  const pure = s.match(/^(\d{2,3})$/)
  if (pure) {
    const n = pure[1]
    if (n.length === 2) return `${n[0]}'${n[1]}"`          // 65 → 6'5"
    if (n.length === 3) return `${n[0]}'${n.slice(1)}"`    // 510 → 5'10"
  }
  return s
}
