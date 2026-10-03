// Not shown in UI yet — reserved for the Insights pattern layer (Wave 8): correlate workload / rider weight with touch-ups (fronts, rears, partial).

import { isFullSet } from '@/lib/shoeWork'

export type WorkloadHorse = {
  name: string
  is_active: boolean
  is_deceased: boolean
}

export type WorkloadVisitHorse = {
  horse_name: string
  work_done: string
}

export type WorkloadVisit = {
  visit_date: string
  farrier_visit_horses: WorkloadVisitHorse[]
}

export type WorkloadAssignment = {
  horse_name: string
  incompatible: boolean
  removed_at: string | null
}

export type WorkloadGuest = {
  check_in_date: string | null
  check_out_date: string | null
  checked_out_at: string | null
  horse_assignments: WorkloadAssignment[] | null
}

export type WorkloadHorseResult = {
  name: string
  completedCycles: number
  avgDays: number | null
  avgGD: number | null
  avgTU: number | null
  lastFS: string | null
  curDays: number | null
  curGD: number | null
  pace: number | null
  estDaysLeft: number | null
  estBasis: 'own' | 'herd' | null
  wearsFaster: boolean
}

export type WorkloadOtherAnimal = {
  name: string
  lastFS: string | null
  daysSince: number | null
  avgDays: number | null
}

export type ShoeWorkloadResult = {
  horseWorkload: WorkloadHorseResult[]
  herdMedDays: number | null
  herdMedGD: number | null
  qualifiedCount: number
  otherAnimals: WorkloadOtherAnimal[]
}

export function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function computeShoeWorkload(
  horses: WorkloadHorse[],
  visits: WorkloadVisit[],
  guests: WorkloadGuest[],
  today: string
): ShoeWorkloadResult {
  const MS = 24 * 60 * 60 * 1000

  // full-set dates per horse key (ascending, deduplicated by date)
  const fullSetsByHorse: Record<string, string[]> = {}
  const sortedVisitsAsc = [...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
  sortedVisitsAsc.forEach(v => {
    v.farrier_visit_horses.forEach(h => {
      if (isFullSet(h.work_done)) {
        const key = h.horse_name.trim().toLowerCase()
        if (!fullSetsByHorse[key]) fullSetsByHorse[key] = []
        if (fullSetsByHorse[key][fullSetsByHorse[key].length - 1] !== v.visit_date) {
          fullSetsByHorse[key].push(v.visit_date)
        }
      }
    })
  })

  // compatible assignment windows per horse key
  const assignsByHorse: Record<string, Array<{ s: string; e: string }>> = {}
  guests.forEach(g => {
    if (!g.check_in_date) return
    let stayEnd = today
    if (g.check_out_date && g.check_out_date < stayEnd) stayEnd = g.check_out_date
    if (g.checked_out_at) {
      const d = g.checked_out_at.slice(0, 10)
      if (d < stayEnd) stayEnd = d
    }
    g.horse_assignments?.forEach(a => {
      if (a.incompatible) return
      let end = stayEnd
      if (a.removed_at) {
        const d = a.removed_at.slice(0, 10)
        if (d < end) end = d
      }
      const key = a.horse_name.trim().toLowerCase()
      if (!assignsByHorse[key]) assignsByHorse[key] = []
      assignsByHorse[key].push({ s: g.check_in_date!, e: end })
    })
  })

  function countGD(horseName: string, cycleStart: string, cycleEnd: string): number {
    const key = horseName.trim().toLowerCase()
    let total = 0
    for (const a of assignsByHorse[key] || []) {
      const start = a.s > cycleStart ? a.s : cycleStart
      const end = a.e < cycleEnd ? a.e : cycleEnd
      if (end >= start) {
        total += Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / MS) + 1
      }
    }
    return total
  }

  const activeHorseKeys = new Set(
    horses.filter(h => h.is_active && !h.is_deceased).map(h => h.name.trim().toLowerCase())
  )

  const horseWorkload = horses
    .filter(h => h.is_active && !h.is_deceased)
    .map(horse => {
      const key = horse.name.trim().toLowerCase()
      const dates = fullSetsByHorse[key] || []

      const cycles: Array<{ gd: number; days: number; touchUps: number }> = []
      for (let i = 0; i < dates.length - 1; i++) {
        const cs = dates[i], ce = dates[i + 1]
        let touchUps = 0
        sortedVisitsAsc.forEach(v => {
          if (v.visit_date > cs && v.visit_date < ce) {
            v.farrier_visit_horses.forEach(h => {
              if (h.horse_name.trim().toLowerCase() === key && !isFullSet(h.work_done)) touchUps++
            })
          }
        })
        cycles.push({
          gd: countGD(horse.name, cs, ce),
          days: Math.round((new Date(ce + 'T12:00:00').getTime() - new Date(cs + 'T12:00:00').getTime()) / MS),
          touchUps,
        })
      }

      const n = cycles.length
      const avgDays = n > 0 ? cycles.reduce((s, c) => s + c.days, 0) / n : null
      const avgGD = n > 0 ? cycles.reduce((s, c) => s + c.gd, 0) / n : null
      const avgTU = n > 0 ? cycles.reduce((s, c) => s + c.touchUps, 0) / n : null

      const lastFS = dates.length > 0 ? dates[dates.length - 1] : null
      const curDays = lastFS
        ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastFS + 'T12:00:00').getTime()) / MS)
        : null
      const curGD = lastFS ? countGD(horse.name, lastFS, today) : null

      let pace: number | null = null
      if (lastFS && curDays !== null) {
        const todayMs = new Date(today + 'T12:00:00').getTime()
        const raw14 = new Date(todayMs - 13 * MS).toISOString().slice(0, 10)
        const winStart = raw14 > lastFS ? raw14 : lastFS
        const winDays = Math.round((todayMs - new Date(winStart + 'T12:00:00').getTime()) / MS) + 1
        if (winDays > 0) pace = countGD(horse.name, winStart, today) / winDays
      }

      return { name: horse.name, completedCycles: n, avgDays, avgGD, avgTU, lastFS, curDays, curGD, pace }
    })

  const qualified = horseWorkload.filter(h => h.completedCycles >= 2)
  const herdMedDays = median(qualified.map(h => h.avgDays).filter((d): d is number => d !== null))
  const herdMedGD = median(qualified.map(h => h.avgGD).filter((d): d is number => d !== null))

  const withEst: WorkloadHorseResult[] = horseWorkload.map(h => {
    const targetGD = h.completedCycles >= 2 ? h.avgGD : herdMedGD
    const fallDays = h.completedCycles >= 2 ? h.avgDays : herdMedDays
    let estDaysLeft: number | null = null
    let estBasis: 'own' | 'herd' | null = null

    if (targetGD !== null && h.curGD !== null && h.pace !== null && h.pace > 0) {
      estDaysLeft = (targetGD - h.curGD) / h.pace
      estBasis = h.completedCycles >= 2 ? 'own' : 'herd'
    } else if (fallDays !== null && h.curDays !== null) {
      estDaysLeft = fallDays - h.curDays
      estBasis = h.completedCycles >= 2 ? 'own' : 'herd'
    }

    const wearsFaster = h.completedCycles >= 2 && herdMedGD !== null && h.avgGD !== null && h.avgGD < 0.7 * herdMedGD
    return { ...h, estDaysLeft, estBasis, wearsFaster }
  })

  // Other animals: names from visits not found in horses table
  const allVisitNames = Array.from(new Set(visits.flatMap(v => v.farrier_visit_horses.map(h => h.horse_name))))
  const otherAnimals: WorkloadOtherAnimal[] = allVisitNames
    .filter(name => !activeHorseKeys.has(name.trim().toLowerCase()))
    .sort()
    .map(name => {
      const key = name.trim().toLowerCase()
      const dates = fullSetsByHorse[key] || []
      const lastFS = dates.length > 0 ? dates[dates.length - 1] : null
      const daysSince = lastFS
        ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastFS + 'T12:00:00').getTime()) / MS)
        : null
      let avgDays: number | null = null
      if (dates.length >= 2) {
        let tot = 0
        for (let i = 1; i < dates.length; i++) {
          tot += Math.round((new Date(dates[i] + 'T12:00:00').getTime() - new Date(dates[i - 1] + 'T12:00:00').getTime()) / MS)
        }
        avgDays = tot / (dates.length - 1)
      }
      return { name, lastFS, daysSince, avgDays }
    })

  return { horseWorkload: withEst, herdMedDays, herdMedGD, qualifiedCount: qualified.length, otherAnimals }
}
