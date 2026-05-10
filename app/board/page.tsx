'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES, ACTIVE_HORSES, Horse, LEVEL_ORDER } from '@/lib/horses'
import { getTucsonToday, getTucsonTomorrow } from '@/lib/timezone'

const WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', reset: 'Reset', full_set: 'Full set',
}

const UNAVAILABLE_STATUSES = new Set(['lame', 'out', 'donotuse', 'naughty'])

type GuestInfo = {
  guest_id: string
  guest_name: string
  room_number: string
  check_out_date: string
  assignment_type: string
  assignment_id: string
}

type ShoeWarning = { what_needed: string; level: 'red' | 'amber' }

type Guest = {
  id: string
  name: string
  room_number: string
  check_out_date: string
  age: number
  weight: number
  height: string
  riding_level: string
  notes: string
  gender: string
  horse_assignments?: { horse_name: string; status: string; incompatible: boolean; assignment_type: string }[]
}

function checkCompatibility(horse: Horse, guest: Guest): { fit: 'good' | 'adjacent' | 'poor'; reason: string } {
  if (guest.weight && horse.weight && guest.weight > horse.weight) {
    return { fit: 'poor', reason: `Over ${horse.weight} lb limit` }
  }
  const guestIdx = LEVEL_ORDER.indexOf(guest.riding_level)
  const horseIdx = LEVEL_ORDER.indexOf(horse.level)
  if (guestIdx === -1 || horseIdx === -1) return { fit: 'good', reason: '' }
  const diff = Math.abs(guestIdx - horseIdx)
  if (diff === 0) return { fit: 'good', reason: 'Exact match' }
  if (diff === 1) return { fit: 'adjacent', reason: 'Adjacent level' }
  return { fit: 'poor', reason: `${guest.riding_level} vs ${horse.level}` }
}

function AssignRiderModal({ horse, guests, onAssign, onClose, today, tomorrow }: {
  horse: Horse
  guests: Guest[]
  onAssign: (guestId: string, guestName: string, type: string) => Promise<void>
  onClose: () => void
  today: string
  tomorrow: string
}) {
  const [search, setSearch] = useState('')
  const [assignType, setAssignType] = useState('primary')
  const [assigning, setAssigning] = useState<string | null>(null)

  const activeGuests = useMemo(() =>
    guests
      .filter(g => g.check_out_date >= today)
      .sort((a, b) => parseInt(a.room_number || '0') - parseInt(b.room_number || '0')),
    [guests, today]
  )

  const filteredGuests = useMemo(() => {
    if (!search.trim()) return activeGuests
    const q = search.toLowerCase()
    return activeGuests.filter(g =>
      g.name?.toLowerCase().includes(q) || g.room_number?.includes(q)
    )
  }, [activeGuests, search])

  async function handleAssign(guest: Guest) {
    setAssigning(guest.id)
    await onAssign(guest.id, guest.name, assignType)
    setAssigning(null)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} className="assign-modal">
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Assign 🐴 {horse.name}</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
              {horse.level}{horse.weight ? ` · max ${horse.weight} lbs` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-2)', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <input
              placeholder="Search guest name or room..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
              autoFocus
            />
          </div>
          <div>
            <select value={assignType} onChange={e => setAssignType(e.target.value)} style={{ fontSize: 13, width: '100%' }}>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="additional">Additional</option>
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filteredGuests.length === 0 ? (
            <p style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
              {activeGuests.length === 0 ? 'No active guests' : 'No guests match your search'}
            </p>
          ) : filteredGuests.map(guest => {
            const compat = checkCompatibility(horse, guest)
            const checkingOut = guest.check_out_date === today || guest.check_out_date === tomorrow
            const activeAssignment = guest.horse_assignments?.find(a => a.status === 'active' && !a.incompatible)
            return (
              <div key={guest.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{guest.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Rm {guest.room_number}</span>
                    {checkingOut && (
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 600, border: '1px solid var(--color-success-border)' }}>
                        out {guest.check_out_date === today ? 'today' : 'tmrw'}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600,
                      background: compat.fit === 'good' ? 'var(--color-success-bg)' : compat.fit === 'adjacent' ? 'var(--color-warning-bg)' : 'var(--color-danger-bg)',
                      color: compat.fit === 'good' ? 'var(--color-success)' : compat.fit === 'adjacent' ? 'var(--color-warning)' : 'var(--color-danger)',
                    }}>
                      {compat.fit === 'good' ? 'Good fit' : compat.fit === 'adjacent' ? 'Adjacent' : 'Poor fit'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
                    {guest.riding_level || '—'}{guest.weight ? ` · ${guest.weight} lbs` : ''}{guest.height ? ` · ${guest.height}` : ''}{compat.reason ? ` · ${compat.reason}` : ''}
                  </div>
                  {activeAssignment && (
                    <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 2 }}>
                      🐴 {activeAssignment.horse_name} ({activeAssignment.assignment_type})
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAssign(guest)}
                  disabled={assigning === guest.id}
                  style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: compat.fit === 'poor' ? '#d97706' : 'var(--color-accent)',
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    opacity: assigning === guest.id ? 0.6 : 1, flexShrink: 0,
                  }}
                >
                  {assigning === guest.id ? '...' : 'Assign'}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-3)', textAlign: 'center' }}>
            {filteredGuests.length} guest{filteredGuests.length !== 1 ? 's' : ''} · click Assign to confirm
          </p>
        </div>
      </div>
    </div>
  )
}

export default function BoardPage() {
  const [assignmentMap, setAssignmentMap] = useState<Record<string, GuestInfo[]>>({})
  const [shoeMap, setShoeMap] = useState<Record<string, ShoeWarning>>({})
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [assigningHorse, setAssigningHorse] = useState<Horse | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const today = getTucsonToday()
  const tomorrow = getTucsonTomorrow()

  const fetchData = useCallback(async () => {
    try {
      const [assignRes, shoeRes, guestRes] = await Promise.all([
        fetch('/api/assignments').then(r => r.json()),
        fetch('/api/shoe-needs').then(r => r.json()),
        fetch('/api/guests').then(r => r.json()),
      ])

      const newAssignmentMap: Record<string, GuestInfo[]> = {}
      ;(assignRes.assignments || []).forEach((a: any) => {
        if (!a.guests) return
        const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
        if (!g) return
        if (!newAssignmentMap[a.horse_name]) newAssignmentMap[a.horse_name] = []
        newAssignmentMap[a.horse_name].push({
          guest_id: g.id,
          guest_name: g.name,
          room_number: g.room_number,
          check_out_date: g.check_out_date,
          assignment_type: a.assignment_type,
          assignment_id: a.id,
        })
      })
      setAssignmentMap(newAssignmentMap)

      const newShoeMap: Record<string, ShoeWarning> = {}
      ;(shoeRes.needs || []).forEach((n: any) => {
        newShoeMap[n.horse_name] = {
          what_needed: n.what_needed,
          level: n.what_needed === 'fronts' ? 'red' : 'amber',
        }
      })
      setShoeMap(newShoeMap)
      setGuests(guestRes.guests || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const unavailableHorses = HORSES.filter(h => UNAVAILABLE_STATUSES.has(h.status))
  const assignedHorses = ACTIVE_HORSES.filter(h => (assignmentMap[h.name]?.length ?? 0) > 0)
  const freeHorses = ACTIVE_HORSES.filter(h => !(assignmentMap[h.name]?.length ?? 0))

  const statFree = freeHorses.length
  const statAssigned = assignedHorses.filter(h => (assignmentMap[h.name]?.length ?? 0) === 1).length
  const statDouble = assignedHorses.filter(h => (assignmentMap[h.name]?.length ?? 0) >= 2).length
  const statUnavailable = unavailableHorses.length

  function toggleFilter(key: string) {
    if (key === 'all') { setActiveFilters(new Set()); return }
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function horseMatchesFilters(horse: Horse, section: 'free' | 'assigned' | 'unavailable'): boolean {
    if (activeFilters.size === 0) return true
    const assignments = assignmentMap[horse.name] || []
    const isDouble = assignments.length >= 2
    const shoe = shoeMap[horse.name]
    const outToday = assignments.some(a => a.check_out_date === today)
    const outTomorrow = assignments.some(a => a.check_out_date === tomorrow)
    for (const f of Array.from(activeFilters)) {
      if (f === 'free' && section !== 'free') return false
      if (f === 'assigned' && section !== 'assigned') return false
      if (f === 'double' && !isDouble) return false
      if (f === 'unavailable' && section !== 'unavailable') return false
      if (f === 'shoes' && !shoe) return false
      if (f === 'today' && !outToday) return false
      if (f === 'tomorrow' && !outTomorrow) return false
      if (f === 'lame' && horse.status !== 'lame') return false
      if (f === 'injured' && horse.status !== 'out') return false
      if (f === 'B' && horse.level !== 'B') return false
      if (f === 'AB' && horse.level !== 'AB') return false
      if (f === 'I' && horse.level !== 'I' && horse.level !== 'I/AI') return false
      if (f === 'AI' && horse.level !== 'AI' && horse.level !== 'I/AI') return false
      if (f === 'A' && horse.level !== 'A') return false
      if (f === 'light' && horse.size !== 'small') return false
      if (f === 'medium' && horse.size !== 'medium') return false
      if (f === 'heavy' && horse.size !== 'large' && horse.size !== 'draft') return false
    }
    return true
  }

  const q = search.toLowerCase()

  const filteredAssigned = assignedHorses.filter(h => {
    const matchesName = !q || h.name.toLowerCase().includes(q)
    const matchesGuest = !q || (assignmentMap[h.name] || []).some(a =>
      a.guest_name.toLowerCase().includes(q) || a.room_number.includes(q)
    )
    return (matchesName || matchesGuest) && horseMatchesFilters(h, 'assigned')
  })

  const filteredFree = freeHorses.filter(h =>
    (!q || h.name.toLowerCase().includes(q)) && horseMatchesFilters(h, 'free')
  )

  const filteredUnavailable = unavailableHorses.filter(h =>
    (!q || h.name.toLowerCase().includes(q)) && horseMatchesFilters(h, 'unavailable')
  )

  async function handleAssign(guestId: string, guestName: string, type: string) {
    if (!assigningHorse) return
    try {
      await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: guestId, horse_name: assigningHorse.name, assignment_type: type, status: 'active', incompatible: false, requested_by_guest: false }),
      })
      setConfirmation(`✓ ${assigningHorse.name} assigned to ${guestName}`)
      setTimeout(() => setConfirmation(null), 4000)
      setAssigningHorse(null)
      await fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  const filterPills = [
    { key: 'all', label: 'All' },
    { key: 'free', label: 'Free' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'double', label: 'Double' },
    { key: 'unavailable', label: 'Unavailable' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'today', label: 'Out today' },
    { key: 'tomorrow', label: 'Out tmrw' },
    { key: 'B', label: 'Beginner' },
    { key: 'AB', label: 'Adv Beg' },
    { key: 'I', label: 'Intermediate' },
    { key: 'AI', label: 'Adv Int' },
    { key: 'A', label: 'Advanced' },
    { key: 'light', label: 'Small' },
    { key: 'medium', label: 'Medium' },
    { key: 'heavy', label: 'Large' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {confirmation && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#065f46', color: '#fff', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 300, whiteSpace: 'nowrap' }}>
            {confirmation}
          </div>
        )}

        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '14px 20px 10px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Assignment Board</h1>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
                {loading ? 'Loading...' : `${ACTIVE_HORSES.length} active horses · ${Object.keys(assignmentMap).length} assigned`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input placeholder="Search horses or guests..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, width: 200 }} />
              <button onClick={fetchData} style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                Refresh
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }} className="board-stats">
            {[
              { label: 'Free', value: statFree, color: 'var(--color-success)', bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', filter: 'free' },
              { label: 'Assigned', value: statAssigned, color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', filter: 'assigned' },
              { label: 'Double', value: statDouble, color: '#92400e', bg: '#fef3c7', border: '#fcd34d', filter: 'double' },
              { label: 'Unavailable', value: statUnavailable, color: 'var(--color-text-3)', bg: 'var(--color-bg)', border: 'var(--color-border)', filter: 'unavailable' },
            ].map(s => (
              <div
                key={s.label}
                onClick={() => toggleFilter(s.filter)}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-md)',
                  background: activeFilters.has(s.filter) ? s.bg : 'var(--color-surface)',
                  border: `1px solid ${activeFilters.has(s.filter) ? s.border : 'var(--color-border)'}`,
                  textAlign: 'center', cursor: 'pointer',
                  opacity: activeFilters.size > 0 && !activeFilters.has(s.filter) ? 0.55 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{loading ? '—' : s.value}</div>
                <div style={{ fontSize: 10, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }} className="board-filters">
            {filterPills.map(pill => {
              const isActive = pill.key === 'all' ? activeFilters.size === 0 : activeFilters.has(pill.key)
              return (
                <button
                  key={pill.key}
                  onClick={() => toggleFilter(pill.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 999, flexShrink: 0,
                    border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: isActive ? '#fff' : 'var(--color-text-2)',
                    fontSize: 12, cursor: 'pointer', fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)' }}>
            <p style={{ fontSize: 13 }}>Loading board...</p>
          </div>
        ) : (
          <div style={{ padding: 20 }} className="board-content">

            {filteredAssigned.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Assigned — {filteredAssigned.length} horse{filteredAssigned.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }} className="board-grid-lg">
                  {filteredAssigned.map(horse => {
                    const assignments = assignmentMap[horse.name] || []
                    const shoe = shoeMap[horse.name]
                    const isDouble = assignments.length >= 2
                    return (
                      <div
                        key={horse.name}
                        style={{
                          background: isDouble ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                          border: `1px solid ${isDouble ? 'var(--color-warning-border)' : 'var(--color-border)'}`,
                          borderLeft: `3px solid var(--color-warning)`,
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>🐴 {horse.name}</span>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                            {shoe && (
                              <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap',
                                background: shoe.level === 'red' ? '#fee2e2' : '#fef3c7',
                                color: shoe.level === 'red' ? '#dc2626' : '#92400e',
                                border: `1px solid ${shoe.level === 'red' ? '#fca5a5' : '#fcd34d'}`,
                              }}>
                                {shoe.level === 'red' ? '🔴' : '🟠'} {WORK_LABELS[shoe.what_needed] || shoe.what_needed}
                              </span>
                            )}
                            {isDouble && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                ×{assignments.length}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 8 }}>{horse.level} · {horse.size}</div>
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          {assignments.map((a, i) => {
                            const outToday = a.check_out_date === today
                            const outTomorrow = a.check_out_date === tomorrow
                            return (
                              <div
                                key={i}
                                style={{ fontSize: 12, color: 'var(--color-text-2)', paddingTop: i > 0 ? 6 : 0, marginTop: i > 0 ? 6 : 0, borderTop: i > 0 ? '1px dashed var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}
                              >
                                <span style={{ fontWeight: 600 }}>{a.guest_name}</span>
                                <span style={{ color: 'var(--color-text-3)' }}>Rm {a.room_number}</span>
                                {(outToday || outTomorrow) && (
                                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 600, border: '1px solid var(--color-success-border)' }}>
                                    out {outToday ? 'today' : 'tmrw'}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {filteredFree.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Free — {filteredFree.length} horse{filteredFree.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }} className="board-grid-sm">
                  {filteredFree.map(horse => {
                    const shoe = shoeMap[horse.name]
                    return (
                      <div
                        key={horse.name}
                        onClick={() => setAssigningHorse(horse)}
                        className="free-card"
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 12px',
                          opacity: horse.status === 'backup' ? 0.65 : 1,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>🐴 {horse.name}</span>
                          {shoe && (
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, flexShrink: 0,
                              background: shoe.level === 'red' ? '#fee2e2' : '#fef3c7',
                              color: shoe.level === 'red' ? '#dc2626' : '#92400e',
                              border: `1px solid ${shoe.level === 'red' ? '#fca5a5' : '#fcd34d'}`,
                            }}>
                              {shoe.level === 'red' ? '🔴' : '🟠'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>
                          {horse.level}{horse.status === 'backup' ? ' · backup' : ''}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-accent)', marginTop: 5, fontWeight: 500 }}>tap to assign →</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {filteredUnavailable.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Unavailable — {filteredUnavailable.length} horse{filteredUnavailable.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }} className="board-grid-sm">
                  {filteredUnavailable.map(horse => (
                    <div
                      key={horse.name}
                      style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', opacity: 0.4 }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>🐴 {horse.name}</span>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>{horse.level} · {horse.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredAssigned.length === 0 && filteredFree.length === 0 && filteredUnavailable.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>▦</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
                  {activeFilters.size > 0 || search ? 'No horses match your filters' : 'No horses found'}
                </p>
                {(activeFilters.size > 0 || search) && (
                  <button
                    onClick={() => { setActiveFilters(new Set()); setSearch('') }}
                    style={{ marginTop: 10, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {assigningHorse && (
          <AssignRiderModal
            horse={assigningHorse}
            guests={guests}
            onAssign={handleAssign}
            onClose={() => setAssigningHorse(null)}
            today={today}
            tomorrow={tomorrow}
          />
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .board-content { padding: 12px !important; }
            .board-filters { flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
            .board-stats { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }
            .board-grid-lg { grid-template-columns: 1fr !important; }
            .board-grid-sm { grid-template-columns: repeat(2, 1fr) !important; }
            .assign-modal { max-width: 100% !important; max-height: 100vh !important; border-radius: 0 !important; }
          }
          .free-card:hover { border-color: var(--color-accent) !important; }
        ` }} />
      </main>
    </div>
  )
}
