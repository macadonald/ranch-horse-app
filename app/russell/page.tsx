'use client'
import { Caveat } from 'next/font/google'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRole } from '@/lib/auth-context'
import { DbHorse } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'

const caveat = Caveat({ subsets: ['latin'] })

// ── Types ─────────────────────────────────────────────────────────────────────

type RGuest = {
  id: string
  name: string
  room_number: string
  check_in_date: string
  check_out_date: string
  age: number | null
  weight: number | null
  height: string | null
  riding_level: string | null
  notes: string | null
  gender: string | null
  repeat_guest: boolean
  group_name: string | null
  checked_out: boolean
  horse_assignments: { id: string; horse_name: string; status: string; incompatible: boolean; assignment_type: string }[]
}

type DraftPlacement = { horseName: string; suggested: string[] }
type SuggestionData = { suggestedHorse: string | null; topCandidates: string[]; fromRequest: boolean }
type UndoEntry = { guestId: string; prev: DraftPlacement | null }

// ── localStorage helpers ──────────────────────────────────────────────────────

const DRAFT_KEY = (today: string) => `russell-draft-${today}`

function saveDraft(today: string, draft: Record<string, DraftPlacement>) {
  try { localStorage.setItem(DRAFT_KEY(today), JSON.stringify(draft)) } catch {}
}
function loadDraft(today: string): Record<string, DraftPlacement> {
  try { const raw = localStorage.getItem(DRAFT_KEY(today)); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function clearDraft(today: string) {
  try { localStorage.removeItem(DRAFT_KEY(today)) } catch {}
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function roomLabel(room: string) { return room === '45' ? 'H' : room }
function firstName(name: string) { return name.split(' ')[0] }

function getBlockReason(horse: DbHorse, today: string): string | null {
  const labels: Record<string, string> = { lame: 'Lame', injured: 'Injured', day_off: 'Day off', in_training: 'Training', retired: 'Retired' }
  const f = (horse.flags || []).find(f => {
    if (f.flag_type === 'day_off') return f.day_off_date === today
    return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
  })
  return f ? (labels[f.flag_type] ?? f.flag_type) : null
}

function into4Cols<T>(arr: T[]): [T[], T[], T[], T[]] {
  const c = Math.ceil(arr.length / 4)
  return [arr.slice(0, c), arr.slice(c, c * 2), arr.slice(c * 2, c * 3), arr.slice(c * 3)] as [T[], T[], T[], T[]]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RussellPage() {
  const { isViewer } = useRole()
  const today = getTucsonToday()

  const [guests, setGuests] = useState<RGuest[]>([])
  const [horses, setHorses] = useState<DbHorse[]>([])
  const [existingMap, setExistingMap] = useState<Record<string, { guestId: string; guestName: string; roomNumber: string }[]>>({})
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionData>>({})
  const [draft, setDraft] = useState<Record<string, DraftPlacement>>({})
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [suggLoading, setSuggLoading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [tapError, setTapError] = useState<string | null>(null)
  const [practiceMode, setPracticeMode] = useState(true)
  const [practiceResult, setPracticeResult] = useState<{ count: number; placements: { guestName: string; roomNumber: string; horseName: string }[] } | null>(null)

  const hasDraft = Object.keys(draft).length > 0
  const didAutoSelect = useRef(false)

  // Warn on navigation if unsaved draft
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (hasDraft && !practiceMode) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDraft, practiceMode])

  // Auto-save draft to localStorage whenever it changes
  useEffect(() => { saveDraft(today, draft) }, [draft, today])

  // Load/save practice mode setting
  useEffect(() => {
    try {
      const stored = localStorage.getItem('russell-practice-mode')
      if (stored !== null) setPracticeMode(stored !== 'false')
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('russell-practice-mode', practiceMode ? 'true' : 'false') } catch {}
  }, [practiceMode])

  // Fetch data on mount
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [guestData, horsesData, assignData] = await Promise.all([
        fetch('/api/guests').then(r => r.json()),
        fetch('/api/horses').then(r => r.json()),
        fetch('/api/assignments').then(r => r.json()),
      ])

      const allGuests: RGuest[] = (guestData.guests || []).map((g: any) => ({
        ...g,
        repeat_guest: g.repeat_guest ?? false,
        checked_out: g.checked_out ?? false,
        group_name: g.group_name ?? null,
      }))
      setGuests(allGuests)

      const allHorses: DbHorse[] = (horsesData.horses || []).filter((h: DbHorse) => !h.is_deceased)
      setHorses(allHorses)

      const eMap: Record<string, { guestId: string; guestName: string; roomNumber: string }[]> = {}
      for (const a of assignData.assignments || []) {
        const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
        if (!g) continue
        if (!eMap[a.horse_name]) eMap[a.horse_name] = []
        eMap[a.horse_name].push({ guestId: g.id, guestName: g.name, roomNumber: g.room_number })
      }
      setExistingMap(eMap)

      const savedDraft = loadDraft(today)
      setDraft(savedDraft)

      const stayingUnassigned = allGuests.filter(g =>
        !g.checked_out &&
        g.check_in_date <= today &&
        g.check_out_date >= today &&
        !g.horse_assignments?.some(a => a.status === 'active' && !a.incompatible)
      )
      const activeHorses = allHorses.filter(h => h.is_active && !h.is_deceased)

      if (stayingUnassigned.length > 0) {
        setSuggLoading(true)
        try {
          const aaRes = await fetch('/api/assign-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guests: stayingUnassigned, horses: activeHorses, today }),
          })
          const aaData = await aaRes.json()
          const suggMap: Record<string, SuggestionData> = {}
          for (const row of aaData.draft || []) {
            suggMap[row.guest.id] = {
              suggestedHorse: row.suggestedHorse ?? null,
              topCandidates: row.top_candidates ?? [],
              fromRequest: row.from_request ?? false,
            }
          }
          setSuggestions(suggMap)
        } catch (e) {
          console.error('[russell] assign-all failed:', e)
        } finally {
          setSuggLoading(false)
        }
      }
    } catch (err) {
      console.error('[russell] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived data ────────────────────────────────────────────────────────────

  const stayingGuests = useMemo(() =>
    guests
      .filter(g =>
        !g.checked_out &&
        g.check_in_date <= today &&
        g.check_out_date >= today &&
        !g.horse_assignments?.some(a => a.status === 'active' && !a.incompatible)
      )
      .sort((a, b) => (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0)),
    [guests, today]
  )

  // Auto-select first unplaced guest after load
  useEffect(() => {
    if (loading || didAutoSelect.current || stayingGuests.length === 0 || selectedGuestId) return
    didAutoSelect.current = true
    const first = stayingGuests.find(g => !draft[g.id]) ?? stayingGuests[0]
    setSelectedGuestId(first.id)
  // draft intentionally omitted — we only want to run once after initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stayingGuests, selectedGuestId])

  const selectedGuest = useMemo(() =>
    stayingGuests.find(g => g.id === selectedGuestId) ?? null,
    [stayingGuests, selectedGuestId]
  )

  const incompatibleMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const g of guests) {
      m[g.id] = new Set(
        (g.horse_assignments || []).filter(a => a.incompatible).map(a => a.horse_name.trim().toLowerCase())
      )
    }
    return m
  }, [guests])

  const incompatibleDisplayMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const g of guests) {
      m[g.id] = (g.horse_assignments || []).filter(a => a.incompatible).map(a => a.horse_name)
    }
    return m
  }, [guests])

  const notAFitForSelected = useMemo(() =>
    selectedGuestId ? (incompatibleMap[selectedGuestId] ?? new Set<string>()) : new Set<string>(),
    [incompatibleMap, selectedGuestId]
  )

  const topCandidatesForSelected = useMemo(() =>
    selectedGuestId ? (suggestions[selectedGuestId]?.topCandidates ?? []) : [],
    [suggestions, selectedGuestId]
  )

  const shoeMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of horses) {
      const shoe = (h.shoe_flags || [])[0]
      if (shoe) m[h.name] = shoe.what_needed
    }
    return m
  }, [horses])

  const draftByHorse = useMemo(() => {
    const m: Record<string, { guestId: string; guestName: string; roomNumber: string }[]> = {}
    for (const [guestId, placement] of Object.entries(draft)) {
      const g = stayingGuests.find(x => x.id === guestId)
      if (!g) continue
      if (!m[placement.horseName]) m[placement.horseName] = []
      m[placement.horseName].push({ guestId: g.id, guestName: g.name, roomNumber: g.room_number })
    }
    return m
  }, [draft, stayingGuests])

  const suggByHorse = useMemo(() => {
    const m: Record<string, { guestId: string; guestName: string; roomNumber: string }[]> = {}
    for (const [guestId, sugg] of Object.entries(suggestions)) {
      if (!sugg.suggestedHorse || draft[guestId]) continue
      const g = stayingGuests.find(x => x.id === guestId)
      if (!g) continue
      if (!m[sugg.suggestedHorse]) m[sugg.suggestedHorse] = []
      m[sugg.suggestedHorse].push({ guestId: g.id, guestName: g.name, roomNumber: g.room_number })
    }
    return m
  }, [suggestions, draft, stayingGuests])

  const sortedHorses = useMemo(() =>
    horses.filter(h => h.is_active && !h.is_deceased).sort((a, b) => a.name.localeCompare(b.name)),
    [horses]
  )

  const validTopPick = useMemo(() => {
    if (!selectedGuestId) return null
    const candidates = suggestions[selectedGuestId]?.topCandidates ?? []
    return candidates.find(hn => {
      const h = horses.find(x => x.name === hn)
      if (!h) return false
      if (getBlockReason(h, today)) return false
      if (notAFitForSelected.has(hn.trim().toLowerCase())) return false
      return true
    }) ?? null
  }, [selectedGuestId, suggestions, horses, today, notAFitForSelected])

  const sheetStatus = tapError
    ? { text: tapError, color: '#dc2626' }
    : msg
    ? { text: msg, color: '#059669' }
    : { text: selectedGuestId ? 'Tap a horse to assign.' : 'Tap a guest, then tap a horse.', color: '#9ca3af' }

  const placedCount = Object.keys(draft).length
  const totalCount = stayingGuests.length

  // ── Actions ─────────────────────────────────────────────────────────────────

  function placeDraft(guestId: string, horseName: string) {
    const sugg = suggestions[guestId]?.topCandidates ?? []
    setUndoStack(prev => [...prev.slice(-19), { guestId, prev: draft[guestId] ?? null }])
    setDraft(prev => ({ ...prev, [guestId]: { horseName, suggested: sugg } }))
    setTapError(null)
    setMsg(null)
  }

  function removeDraft(guestId: string) {
    setUndoStack(prev => [...prev.slice(-19), { guestId, prev: draft[guestId] ?? null }])
    setDraft(prev => { const next = { ...prev }; delete next[guestId]; return next })
  }

  function undo() {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    setDraft(prev => {
      const next = { ...prev }
      if (last.prev) next[last.guestId] = last.prev
      else delete next[last.guestId]
      return next
    })
  }

  function fillInSuggestions() {
    const toFill = stayingGuests.filter(g => !draft[g.id] && suggestions[g.id]?.suggestedHorse)
    if (toFill.length === 0) return
    setUndoStack(prev => [...prev.slice(-(20 - toFill.length)), ...toFill.map(g => ({ guestId: g.id, prev: null as DraftPlacement | null }))])
    setDraft(prev => {
      const next = { ...prev }
      for (const g of toFill) {
        const sugg = suggestions[g.id]
        if (sugg?.suggestedHorse) next[g.id] = { horseName: sugg.suggestedHorse, suggested: sugg.topCandidates }
      }
      return next
    })
  }

  function togglePractice() {
    if (practiceMode) {
      if (!confirm('Turn off practice? Keep All will save real assignments.')) return
      setPracticeMode(false)
    } else {
      setPracticeMode(true)
    }
  }

  async function keepAll() {
    if (practiceMode) {
      const placements = Object.entries(draft)
        .map(([guestId, placement]) => {
          const g = stayingGuests.find(x => x.id === guestId)
          return g ? { guestName: g.name, roomNumber: g.room_number, horseName: placement.horseName } : null
        })
        .filter(Boolean) as { guestName: string; roomNumber: string; horseName: string }[]
      placements.sort((a, b) => (parseInt(a.roomNumber) || 0) - (parseInt(b.roomNumber) || 0))
      clearDraft(today)
      setDraft({})
      setUndoStack([])
      setPracticeResult({ count: placements.length, placements })
      return
    }

    setSavingAll(true)
    setSaveErrors([])
    setMsg(null)
    const errors: string[] = []
    let saved = 0

    for (const [guestId, placement] of Object.entries(draft)) {
      const g = stayingGuests.find(x => x.id === guestId)
      if (!g) continue
      try {
        const res = await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guest_id: guestId,
            horse_name: placement.horseName,
            assignment_type: 'primary',
            status: 'active',
            incompatible: false,
            requested_by_guest: false,
            source: 'russell',
            suggested: placement.suggested,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          errors.push(`${firstName(g.name)}: ${err.error || 'save failed'}`)
        } else {
          saved++
        }
      } catch {
        errors.push(`${firstName(g.name)}: network error`)
      }
    }

    setSavingAll(false)

    if (errors.length === 0) {
      clearDraft(today)
      setDraft({})
      setUndoStack([])
      setMsg(`Saved ${saved} horse${saved !== 1 ? 's' : ''} — done!`)
      await fetchData()
    } else {
      setSaveErrors(errors)
      const savedGuestNames = new Set(
        Object.entries(draft)
          .map(([gid]) => stayingGuests.find(x => x.id === gid))
          .filter(Boolean)
          .map(g => firstName(g!.name))
          .filter(n => !errors.some(e => e.startsWith(n + ':')))
      )
      setDraft(prev => {
        const next = { ...prev }
        for (const [gid] of Object.entries(draft)) {
          const g = stayingGuests.find(x => x.id === gid)
          if (g && savedGuestNames.has(firstName(g.name))) delete next[gid]
        }
        return next
      })
      setMsg(`Saved ${saved}, ${errors.length} failed — fix and retry`)
    }
  }

  function handleHorseTap(horse: DbHorse) {
    if (!selectedGuestId) {
      setTapError('Select a guest first')
      setTimeout(() => setTapError(null), 3000)
      return
    }
    const blockReason = getBlockReason(horse, today)
    if (blockReason) {
      setTapError(`${horse.name} is ${blockReason.toLowerCase()} — pick another`)
      setTimeout(() => setTapError(null), 3000)
      return
    }
    if (notAFitForSelected.has(horse.name.trim().toLowerCase())) {
      setTapError(`${horse.name} is not a fit for ${firstName(selectedGuest?.name ?? 'this guest')}`)
      setTimeout(() => setTapError(null), 3000)
      return
    }
    const draftRiders = draftByHorse[horse.name] ?? []
    const ridersOnHorse = (existingMap[horse.name]?.length ?? 0) + draftRiders.filter(r => r.guestId !== selectedGuestId).length
    if (ridersOnHorse >= 2) {
      setTapError(`${horse.name} already has 2 riders`)
      setTimeout(() => setTapError(null), 3000)
      return
    }
    placeDraft(selectedGuestId, horse.name)
  }

  // ── Auth gates ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', color: '#fff', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 32 }}>🐴</div>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Loading Russell Mode...</p>
      </div>
    )
  }

  if (isViewer) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', color: '#fff', flexDirection: 'column', gap: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Russell Mode requires an admin login</h1>
        <p style={{ color: '#94a3b8', maxWidth: 320 }}>Please sign in with the ranch admin account.</p>
        <Link href="/" style={{ color: '#60a5fa', fontSize: 14, textDecoration: 'none' }}>← Back to sign in</Link>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const horseColumns = into4Cols(sortedHorses)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: '#f1f5f9' }}>

      {/* ── Top bar ── */}
      <div style={{ background: '#1a1a2e', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 60, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}>Russell Mode</span>

        <span style={{
          fontSize: 12, padding: '4px 12px', borderRadius: 999, fontWeight: 700, whiteSpace: 'nowrap',
          background: placedCount === totalCount && totalCount > 0 ? '#065f46' : '#374151', color: '#fff',
        }}>
          {placedCount} / {totalCount} placed
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={fillInSuggestions}
          disabled={suggLoading || Object.keys(suggestions).length === 0}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (suggLoading || Object.keys(suggestions).length === 0) ? 0.4 : 1 }}
        >
          {suggLoading ? 'Loading…' : '✦ Fill in suggestions'}
        </button>

        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #374151', background: 'transparent', color: undoStack.length === 0 ? '#4b5563' : '#d1d5db', fontSize: 13, cursor: undoStack.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
        >
          ↩ Undo
        </button>

        <button
          onClick={togglePractice}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${practiceMode ? '#fbbf24' : '#374151'}`, background: practiceMode ? 'rgba(251,191,36,0.12)' : 'transparent', color: practiceMode ? '#fbbf24' : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}
        >
          {practiceMode ? '⚠ Practice ON' : 'Practice OFF'}
        </button>

        <button
          onClick={keepAll}
          disabled={savingAll || Object.keys(draft).length === 0}
          style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: practiceMode ? '#d97706' : '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (savingAll || Object.keys(draft).length === 0) ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: (savingAll || Object.keys(draft).length === 0) ? 0.4 : 1 }}
        >
          {savingAll ? 'Saving…' : `Keep All (${Object.keys(draft).length})`}
        </button>

        <Link
          href="/board"
          onClick={(e) => { if (hasDraft && !practiceMode && !confirm('You have unsaved horses — leave anyway?')) e.preventDefault() }}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}
        >
          ← Board
        </Link>
      </div>

      {/* Practice banner */}
      {practiceMode && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '5px 16px', fontSize: 12, fontWeight: 700, color: '#92400e', textAlign: 'center', flexShrink: 0, letterSpacing: '0.04em' }}>
          PRACTICE MODE — nothing will be saved
        </div>
      )}

      {/* Save error banner */}
      {saveErrors.length > 0 && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fca5a5', padding: '6px 16px', fontSize: 12, color: '#991b1b', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>Some saves failed:</strong> {saveErrors.join(' · ')}
          <button onClick={() => setSaveErrors([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#991b1b', lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>

        {/* ── Left column ── */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>

          {/* Selected guest card — always at top */}
          {selectedGuest ? (
            <div style={{ background: '#f0fdf4', border: '0 0 1px 0', borderBottom: '2px solid #16a34a', padding: '12px 12px 10px', flexShrink: 0 }}>
              {/* Name row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{selectedGuest.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#fff', border: '1.5px solid #16a34a', borderRadius: 5, padding: '1px 6px', color: '#166534' }}>
                      Rm {roomLabel(selectedGuest.room_number)}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedGuestId(null)} style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: '#6b7280', lineHeight: 1, padding: '2px 0 0 6px', flexShrink: 0 }}>✕</button>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 6px', marginBottom: 8 }}>
                {[
                  { label: 'HEIGHT', value: selectedGuest.height || '—' },
                  { label: 'WEIGHT', value: selectedGuest.weight ? `${selectedGuest.weight} lb` : '—' },
                  { label: 'AGE', value: selectedGuest.age != null ? String(selectedGuest.age) : '—' },
                  { label: 'LEVEL', value: selectedGuest.riding_level || '—' },
                  { label: 'LEAVES', value: selectedGuest.check_out_date || '—' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.75)', borderRadius: 5, padding: '3px 6px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 1 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {selectedGuest.repeat_guest && (
                  <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>⭐ Repeat</span>
                )}
                {selectedGuest.group_name && (
                  <span style={{ fontSize: 11, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px' }}>{selectedGuest.group_name}</span>
                )}
                {(incompatibleDisplayMap[selectedGuest.id]?.length ?? 0) > 0 && (
                  <span style={{ fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
                    🚫 {incompatibleDisplayMap[selectedGuest.id].join(', ')}
                  </span>
                )}
              </div>

              {/* CTA button */}
              {!draft[selectedGuest.id] ? (
                validTopPick ? (
                  <button
                    onClick={() => placeDraft(selectedGuest.id, validTopPick)}
                    style={{ width: '100%', minHeight: 52, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', textAlign: 'center' }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>★ Put on {validTopPick}</div>
                    <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>suggested</div>
                  </button>
                ) : (
                  <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>
                    {suggLoading ? 'Loading suggestions…' : 'No suggestion available'}
                  </div>
                )
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#059669', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>🐴 On {draft[selectedGuest.id].horseName}</div>
                  <button
                    onClick={() => removeDraft(selectedGuest.id)}
                    style={{ width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Take off {draft[selectedGuest.id].horseName}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', borderBottom: '2px solid #bbf7d0', padding: '14px 12px', flexShrink: 0, textAlign: 'center', color: '#6b7280', fontSize: 12, fontStyle: 'italic' }}>
              Tap a guest to see details
            </div>
          )}

          {/* Guest list */}
          <div style={{ padding: '7px 10px 3px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
            Tonight&apos;s arrivals ({stayingGuests.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {stayingGuests.length === 0 ? (
              <div style={{ padding: '20px 12px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>All guests placed</div>
            ) : stayingGuests.map(g => {
              const isSelected = g.id === selectedGuestId
              const placement = draft[g.id]
              const sugg = suggestions[g.id]
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGuestId(isSelected ? null : g.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                    padding: '8px 10px',
                    borderBottom: '1px solid #f1f5f9',
                    borderLeft: `3px solid ${isSelected ? '#2563eb' : placement ? '#16a34a' : 'transparent'}`,
                    background: isSelected ? '#eff6ff' : '#fff',
                    cursor: 'pointer', minHeight: 44,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 4px', flexShrink: 0, marginTop: 2 }}>
                    {roomLabel(g.room_number)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      {placement ? (
                        <span className={caveat.className} style={{ fontSize: 15, color: '#2563eb', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>{placement.horseName}</span>
                      ) : sugg?.suggestedHorse ? (
                        <span className={caveat.className} style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic', flexShrink: 0, whiteSpace: 'nowrap' }}>? {sugg.suggestedHorse}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {[g.riding_level, g.weight ? `${g.weight} lb` : null, g.age ? `age ${g.age}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: master sheet ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Sheet panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Master sheet</span>
            <span style={{ fontSize: 12, color: sheetStatus.color, fontWeight: sheetStatus.color !== '#9ca3af' ? 600 : 400 }}>
              {sheetStatus.text}
            </span>
          </div>

          {/* 4-column horse grid + legend */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 6px' }}>

            {/* White rounded panel */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                {horseColumns.map((col, ci) => (
                  <div key={ci} style={{ borderRight: ci < 3 ? '1px solid #e9ecef' : 'none' }}>
                    {col.map(horse => {
                      const blockReason = getBlockReason(horse, today)
                      const isBlocked = !!blockReason
                      const existingRiders = existingMap[horse.name] ?? []
                      const draftRiders = draftByHorse[horse.name] ?? []
                      const suggRiders = suggByHorse[horse.name] ?? []
                      const shoe = shoeMap[horse.name]
                      const totalRiders = existingRiders.length + draftRiders.length
                      const isDouble = totalRiders >= 2

                      const candidateRank = topCandidatesForSelected.indexOf(horse.name)
                      const isTopCandidate = candidateRank !== -1

                      let rowBg = 'transparent'
                      if (isBlocked) rowBg = '#f9fafb'
                      else if (isTopCandidate) rowBg = '#f0fdf4'
                      else if (isDouble) rowBg = '#fffbeb'

                      const allRoomNums = [...existingRiders, ...draftRiders].map(r => roomLabel(r.roomNumber))
                      const uniqueRooms = Array.from(new Set(allRoomNums))

                      return (
                        <div
                          key={horse.name}
                          onClick={() => handleHorseTap(horse)}
                          title={`${horse.name} — ${horse.level}${horse.weight ? ` · ${horse.weight} lb` : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            height: 28,
                            borderBottom: '1px solid #f1f5f9',
                            borderLeft: `4px solid ${isTopCandidate ? '#22c55e' : 'transparent'}`,
                            background: rowBg,
                            cursor: isBlocked ? 'not-allowed' : 'pointer',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Room number */}
                          <div style={{ width: 28, flexShrink: 0, fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'right', paddingRight: 3, overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap' }}>
                            {uniqueRooms.join(',')}
                          </div>

                          {/* Star slot */}
                          <div style={{ width: 10, flexShrink: 0, fontSize: 10, color: '#16a34a', fontWeight: 700, textAlign: 'center' }}>
                            {isTopCandidate && candidateRank === 0 ? '★' : ''}
                          </div>

                          {/* Horse name + tags */}
                          <div style={{ flex: '0 0 82px', overflow: 'hidden', paddingRight: 2 }}>
                            <span style={{
                              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                              color: isBlocked ? '#9ca3af' : '#111827',
                              textDecoration: isBlocked ? 'line-through' : 'none',
                            }}>
                              {horse.name}
                            </span>
                            {isBlocked && (
                              <span style={{ fontSize: 8, background: '#fef3c7', color: '#92400e', borderRadius: 2, padding: '0 2px', marginLeft: 2, whiteSpace: 'nowrap' }}>{blockReason}</span>
                            )}
                            {shoe && !isBlocked && (
                              <span style={{ fontSize: 8, background: '#fff7ed', color: '#d97706', borderRadius: 2, padding: '0 2px', marginLeft: 2, whiteSpace: 'nowrap' }}>Shoes</span>
                            )}
                          </div>

                          {/* Rider names (Caveat only) */}
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', gap: 3, alignItems: 'center', paddingRight: 4 }}>
                            {existingRiders.map((r, i) => (
                              <span key={`e${i}`} className={caveat.className} style={{ fontSize: 13, color: '#111827' }}>{firstName(r.guestName)}</span>
                            ))}
                            {draftRiders.map((r, i) => (
                              <span key={`d${i}`} className={caveat.className} style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>{firstName(r.guestName)}</span>
                            ))}
                            {suggRiders.map((r, i) => (
                              <span key={`s${i}`} className={caveat.className} style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>?{firstName(r.guestName)}</span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend — below the sheet */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '0 2px' }}>
              <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Legend:</span>
              <span style={{ fontSize: 11, color: '#374151' }}>■ Existing rider</span>
              <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>■ Placed tonight</span>
              <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>■ ? AI suggestion</span>
              <span style={{ fontSize: 11, color: '#16a34a' }}>■ Top pick for selected guest (★ = #1)</span>
              <span style={{ fontSize: 11, color: '#d97706' }}>⚠ Shoes due</span>
            </div>
          </div>
        </div>
      </div>

      {/* Practice result modal */}
      {practiceResult && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Practice — nothing was saved</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              These {practiceResult.count} placement{practiceResult.count !== 1 ? 's' : ''} would have been saved:
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              {practiceResult.placements.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 5px', color: '#6b7280', flexShrink: 0 }}>{roomLabel(p.roomNumber)}</span>
                  <span style={{ color: '#374151', flex: 1 }}>{p.guestName}</span>
                  <span style={{ color: '#6b7280' }}>→</span>
                  <span style={{ fontWeight: 600 }}>🐴 {p.horseName}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPracticeResult(null)}
              style={{ padding: '12px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
