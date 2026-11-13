'use client'
import { Caveat } from 'next/font/google'
import { useState, useEffect, useCallback, useMemo } from 'react'
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
  const labels: Record<string, string> = { lame: 'Lame', injured: 'Injured', day_off: 'Day off', in_training: 'In training', retired: 'Retired' }
  const f = (horse.flags || []).find(f => {
    if (f.flag_type === 'day_off') return f.day_off_date === today
    return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
  })
  return f ? (labels[f.flag_type] ?? f.flag_type) : null
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

  // Warn on navigation if unsaved draft
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (hasDraft) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDraft])

  // Auto-save draft to localStorage whenever it changes
  useEffect(() => { saveDraft(today, draft) }, [draft, today])

  // Load/save practice mode setting (device preference, not date-keyed)
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

      // Run assign-all for suggestions
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

  const selectedGuest = useMemo(() =>
    stayingGuests.find(g => g.id === selectedGuestId) ?? null,
    [stayingGuests, selectedGuestId]
  )

  // incompatibleMap: guestId → Set of lowercase horse names
  const incompatibleMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const g of guests) {
      m[g.id] = new Set(
        (g.horse_assignments || []).filter(a => a.incompatible).map(a => a.horse_name.trim().toLowerCase())
      )
    }
    return m
  }, [guests])

  // incompatibleDisplayMap: guestId → horse name strings for display
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

  // draftByHorse: horseName → list of draft-placed guests
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

  // suggByHorse: horseName → list of suggestion-only guests (no draft placement yet)
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

  // Top pick for selected guest (skip blocked and not-a-fit)
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

  // ── Actions ─────────────────────────────────────────────────────────────────

  function placeDraft(guestId: string, horseName: string) {
    const sugg = suggestions[guestId]?.topCandidates ?? []
    setUndoStack(prev => [...prev.slice(-19), { guestId, prev: draft[guestId] ?? null }])
    setDraft(prev => ({ ...prev, [guestId]: { horseName, suggested: sugg } }))
    setTapError(null)
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
      // Keep only failed entries in draft
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
      setTapError('Select a guest from the left first')
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

  const placedCount = Object.keys(draft).length
  const totalCount = stayingGuests.length

  // ── Auth gate ────────────────────────────────────────────────────────────────

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

  // ── Main layout ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--color-bg)' }}>

      {/* Top bar */}
      <div style={{ background: '#1a1a2e', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 56, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}>Russell Mode</span>

        <span style={{
          fontSize: 12, padding: '3px 10px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap',
          background: placedCount === totalCount && totalCount > 0 ? '#065f46' : '#374151', color: '#fff',
        }}>
          {placedCount} / {totalCount} placed
        </span>

        <div style={{ flex: 1 }} />

        {msg && (
          <span style={{ fontSize: 11, color: '#6ee7b7', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {msg}
          </span>
        )}

        <button
          onClick={fillInSuggestions}
          disabled={suggLoading || Object.keys(suggestions).length === 0}
          style={{ padding: '7px 11px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (suggLoading || Object.keys(suggestions).length === 0) ? 0.45 : 1 }}
        >
          {suggLoading ? 'Loading...' : '✦ Fill in suggestions'}
        </button>

        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: undoStack.length === 0 ? '#6b7280' : '#d1d5db', fontSize: 12, cursor: undoStack.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
        >
          ↩ Undo
        </button>

        <button
          onClick={togglePractice}
          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${practiceMode ? '#fbbf24' : '#374151'}`, background: practiceMode ? 'rgba(251,191,36,0.15)' : 'transparent', color: practiceMode ? '#fbbf24' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}
        >
          {practiceMode ? '⚠ Practice ON' : 'Practice OFF'}
        </button>

        <button
          onClick={keepAll}
          disabled={savingAll || Object.keys(draft).length === 0}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: practiceMode ? '#d97706' : '#059669', color: '#fff', fontSize: 12, fontWeight: 600, cursor: (savingAll || Object.keys(draft).length === 0) ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: (savingAll || Object.keys(draft).length === 0) ? 0.45 : 1 }}
        >
          {savingAll ? 'Saving...' : `Keep All (${Object.keys(draft).length})`}
        </button>

        <Link
          href="/board"
          onClick={(e) => { if (hasDraft && !confirm('You have unsaved horses — leave anyway?')) e.preventDefault() }}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          ← Board
        </Link>
      </div>

      {/* Practice mode banner */}
      {practiceMode && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#92400e', textAlign: 'center', flexShrink: 0, letterSpacing: '0.03em' }}>
          PRACTICE MODE — nothing will be saved
        </div>
      )}

      {/* Error banner */}
      {saveErrors.length > 0 && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fca5a5', padding: '7px 14px', fontSize: 12, color: '#991b1b', flexShrink: 0 }}>
          <strong>Some saves failed:</strong> {saveErrors.join(' · ')}
          <button onClick={() => setSaveErrors([])} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#991b1b', lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Tap error flash */}
      {tapError && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 50, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', pointerEvents: 'none' }}>
          {tapError}
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left column */}
        <div style={{ width: 272, flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Guest list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '7px 10px 3px', fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Unassigned tonight ({stayingGuests.length})
            </div>
            {stayingGuests.length === 0 ? (
              <div style={{ padding: '24px 12px', fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center' }}>All guests placed</div>
            ) : stayingGuests.map(g => {
              const isSelected = g.id === selectedGuestId
              const placement = draft[g.id]
              const sugg = suggestions[g.id]
              return (
                <div
                  key={g.id}
                  onClick={() => setSelectedGuestId(isSelected ? null : g.id)}
                  style={{
                    padding: '9px 10px',
                    borderBottom: '1px solid var(--color-border)',
                    borderLeft: `3px solid ${isSelected ? '#2563eb' : placement ? '#059669' : 'transparent'}`,
                    background: isSelected ? '#eff6ff' : 'var(--color-surface)',
                    cursor: 'pointer', minHeight: 44,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 5px', color: 'var(--color-text-3)' }}>
                      {roomLabel(g.room_number)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                    {g.repeat_guest && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>Repeat</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>
                    {[g.riding_level, g.weight ? `${g.weight} lb` : null, g.age ? `age ${g.age}` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2, fontWeight: placement ? 600 : 400, color: placement ? '#059669' : sugg?.suggestedHorse ? '#9ca3af' : 'var(--color-text-3)', fontStyle: !placement && sugg?.suggestedHorse ? 'italic' : 'normal' }}>
                    {placement ? `🐴 ${placement.horseName}` : sugg?.suggestedHorse ? `? ${sugg.suggestedHorse}` : '—'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected guest detail card */}
          {selectedGuest && (
            <div style={{ borderTop: '2px solid #2563eb', background: '#eff6ff', padding: 11, flexShrink: 0, maxHeight: '48%', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedGuest.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Room {roomLabel(selectedGuest.room_number)} · Out {selectedGuest.check_out_date}</div>
                </div>
                <button onClick={() => setSelectedGuestId(null)} style={{ background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: 'var(--color-text-3)', lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {selectedGuest.riding_level && <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 999, padding: '1px 6px', fontWeight: 600 }}>{selectedGuest.riding_level}</span>}
                {selectedGuest.repeat_guest && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 999, padding: '1px 6px', fontWeight: 600 }}>Repeat</span>}
                {selectedGuest.group_name && <span style={{ fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '1px 6px' }}>{selectedGuest.group_name}</span>}
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-text-2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', marginBottom: 6 }}>
                {selectedGuest.height ? <span>Height: {selectedGuest.height}</span> : null}
                {selectedGuest.weight ? <span>Weight: {selectedGuest.weight} lb</span> : null}
                {selectedGuest.age ? <span>Age: {selectedGuest.age}</span> : null}
              </div>

              {(incompatibleDisplayMap[selectedGuest.id]?.length ?? 0) > 0 && (
                <div style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '3px 7px', marginBottom: 6 }}>
                  <strong>Never again:</strong> {incompatibleDisplayMap[selectedGuest.id].join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                {!draft[selectedGuest.id] && validTopPick && (
                  <button
                    onClick={() => placeDraft(selectedGuest.id, validTopPick)}
                    style={{ padding: '9px 10px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', minHeight: 44 }}
                  >
                    ★ Put on {validTopPick}
                  </button>
                )}
                {draft[selectedGuest.id] && (
                  <>
                    <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, textAlign: 'center' }}>🐴 {draft[selectedGuest.id].horseName}</div>
                    <button
                      onClick={() => removeDraft(selectedGuest.id)}
                      style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}
                    >
                      Take off {draft[selectedGuest.id].horseName}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: master sheet */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Legend */}
          <div style={{ padding: '5px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, background: 'var(--color-surface)' }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Legend:</span>
            <span style={{ fontSize: 11, color: '#111827' }}>■ Existing rider</span>
            <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>■ Placed tonight</span>
            <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>■ ? AI suggestion</span>
            <span style={{ fontSize: 11 }}>🟩 Top pick for selected guest (★ = #1)</span>
            <span style={{ fontSize: 11, color: '#d97706' }}>⚠ Shoes due</span>
          </div>

          {/* Horse rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedHorses.map(horse => {
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

              let rowBg = 'var(--color-surface)'
              if (isBlocked) rowBg = '#f9fafb'
              else if (isTopCandidate) rowBg = '#f0fdf4'
              else if (isDouble) rowBg = '#fffbeb'

              const allRoomNums = [...existingRiders, ...draftRiders].map(r => roomLabel(r.roomNumber))
              const uniqueRooms = Array.from(new Set(allRoomNums))

              return (
                <div
                  key={horse.name}
                  onClick={() => handleHorseTap(horse)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 14px',
                    borderBottom: '1px solid var(--color-border)',
                    minHeight: 48,
                    background: rowBg,
                    borderLeft: `3px solid ${isTopCandidate ? '#22c55e' : 'transparent'}`,
                    cursor: isBlocked ? 'not-allowed' : 'pointer',
                    opacity: isBlocked ? 0.55 : 1,
                  }}
                >
                  {/* Room numbers */}
                  <div style={{ width: 42, flexShrink: 0, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'right', fontWeight: 600 }}>
                    {uniqueRooms.join(', ')}
                  </div>

                  {/* Horse name */}
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {isTopCandidate && candidateRank === 0 && (
                        <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 13 }}>★</span>
                      )}
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: isBlocked ? 'var(--color-text-3)' : 'var(--color-text)',
                        textDecoration: isBlocked ? 'line-through' : 'none',
                      }}>
                        {horse.name}
                      </span>
                      {isBlocked && (
                        <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>{blockReason}</span>
                      )}
                      {shoe && !isBlocked && (
                        <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', border: '1px solid #fcd34d', borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>⚠ Shoes</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{horse.level}{horse.weight ? ` · ${horse.weight} lb` : ''}</div>
                  </div>

                  {/* Rider names */}
                  <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {existingRiders.map((r, i) => (
                      <span key={`e-${i}`} className={caveat.className} style={{ fontSize: 16, color: '#111827' }}>
                        {firstName(r.guestName)}
                      </span>
                    ))}
                    {draftRiders.map((r, i) => (
                      <span key={`d-${i}`} className={caveat.className} style={{ fontSize: 16, color: '#2563eb', fontWeight: 700 }}>
                        {firstName(r.guestName)}
                      </span>
                    ))}
                    {suggRiders.map((r, i) => (
                      <span key={`s-${i}`} className={caveat.className} style={{ fontSize: 15, color: '#9ca3af', fontStyle: 'italic' }}>
                        ? {firstName(r.guestName)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Practice result modal */}
      {practiceResult && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Practice — nothing was saved</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 14 }}>
              These {practiceResult.count} placement{practiceResult.count !== 1 ? 's' : ''} would have been saved:
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
              {practiceResult.placements.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 5px', color: 'var(--color-text-3)', flexShrink: 0 }}>{roomLabel(p.roomNumber)}</span>
                  <span style={{ color: 'var(--color-text-2)', flex: 1 }}>{p.guestName}</span>
                  <span style={{ color: 'var(--color-text-3)' }}>→</span>
                  <span style={{ fontWeight: 600 }}>🐴 {p.horseName}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPracticeResult(null)}
              style={{ padding: '10px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
