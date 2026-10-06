import type { Finding } from './types'

// FNV-1a 32-bit: stable, deterministic, no external deps
export function hashFacts(finding: Pick<Finding, 'id' | 'facts'>): string {
  const sorted = Object.keys(finding.facts).sort()
  const str = finding.id + ':' + sorted.map(k => `${k}=${finding.facts[k]}`).join(',')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
