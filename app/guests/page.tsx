'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'

const LEVELS = [
  { key: 'B',  label: 'Beginner' },
  { key: 'AB', label: 'Adv Beginner' },
  { key: 'I',  label: 'Intermediate' },
  { key: 'AI', label: 'Adv Intermediate' },
  { key: 'A',  label: 'Advanced' },
]

const LEVEL_LABELS: Record<string, string> = {
  'B': 'Beginner', 'AB': 'Adv Beginner', 'I': 'Intermediate',
  'AI': 'Adv Intermediate', 'A': 'Advanced',
}

type Assignment = {
  id: string
  horse_name: string
  assignment_type: string
  status: string
  incompatible: boolean
  requested_by_guest: boolean
  reason: string
}

type Guest = {
  id: string
  name: string
  room_number: string
  check_in_date: string
  check_out_date: string
  age: number
  weight: number
  height: string
  riding_level: string
  notes: string
  horse_request: string
  horse_assignments?: Assignment[]
}

type Match = {
  name: string
  fit: string
  reason: string
  warning: string
  availability: string
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [matchLoading, setMatchLoading] = useState(false)
  const [dismissedHorses, setDismissedHorses] = useState<string[]>([])
  const [assigningHorse, setAssigningHorse] = useState<string | null>(null)
  const [assignmentConfirmation, setAssignmentConfirmation] = useState<string | null>(null)
  const [manualHorse, setManualHorse] = useState('')
  const [manualType, setManualType] = useState('primary')
  const [savingManual, setSavingManual] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch('/api/guests')
      const data = await res.json()
      // Auto-filter: only show guests who haven't checked out
      setGuests((data.guests || []))
    } catch (err) {
      console.error('Failed to fetch guests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGuests() }, [fetchGuests])

  // Auto-checkout: filter out guests past their checkout date
  const activeGuests = guests.filter(g => !g.check_out_date || g.check_out_date >= today)
  
  const filteredGuests = activeGuests.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.room_number?.toLowerCase().includes(search.toLowerCase())
  )

  const checkoutSoon = (g: Guest) => g.check_out_date === today || g.check_out_date === tomorrowStr

  async function openGuest(guest: Guest) {
    setSelectedGuest(guest)
    setMatches([])
    setDismissedHorses([])
    setManualHorse('')
    setAssignmentConfirmation(null)
    await runMatch(guest, [])
  }

  async function runMatch(guest: Guest, dismissed: string[]) {
    if (!guest.age || !guest.weight || !guest.height || !guest.riding_level) return
    setMatchLoading(true)
    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: guest.age,
          weight: guest.weight,
          height: guest.height,
          level: guest.riding_level,
          notes: `${guest.notes || ''}${guest.horse_request ? ' Horse request: ' + guest.horse_request : ''}`,
          guestId: guest.id,
          dismissedHorses: dismissed,
        }),
      })
      const data = await res.json()
      if (data.matches) setMatches(data.matches)
    } catch (err) {
      console.error('Match error:', err)
    } finally {
      setMatchLoading(false)
    }
  }

  function dismissHorse(name: string) {
    const newDismissed = [...dismissedHorses, name]
    setDismissedHorses(newDismissed)
    setMatches(prev => prev.filter(m => m.name !== name))
    if (selectedGuest) runMatch(selectedGuest, newDismissed)
  }

  async function assignHorse(horseName: string, type: string, requestedByGuest = false) {
    if (!selectedGuest) return
    setAssigningHorse(horseName)
    setAssignmentConfirmation(null)
    try {
      await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_id: selectedGuest.id,
          horse_name: horseName,
          assignment_type: type,
          status: 'active',
          incompatible: false,
          requested_by_guest: requestedByGuest,
        }),
      })
      // Show confirmation banner
      setAssignmentConfirmation(`✓ ${horseName} assigned to ${selectedGuest.name} as ${type} horse`)
      // Clear after 4 seconds
      setTimeout(() => setAssignmentConfirmation(null), 4000)
      await fetchGuests()
    } catch (err) {
      console.error('Assign error:', err)
    } finally {
      setAssigningHorse(null)
    }
  }

  async function removeAssignment(assignmentId: string) {
    try {
      await fetch(`/api/assignments?id=${assignmentId}`, { method: 'DELETE' })
      await fetchGuests()
    } catch (err) {
      console.error('Remove error:', err)
    }
  }

  async function markIncompatible(horseName: string, assignmentId: string) {
    if (!selectedGuest) return
    try {
      await fetch('/api/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignmentId, incompatible: true, status: 'removed' }),
      })
      await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: selectedGuest.id, horse_name: horseName, incompatible: true, status: 'removed' }),
      })
      await fetchGuests()
    } catch (err) {
      console.error('Incompatible error:', err)
    }
  }

  async function deleteGuest(id: string) {
    if (!confirm('Remove this guest? Their horse assignments will be freed.')) return
    await fetch(`/api/guests?id=${id}`, { method: 'DELETE' })
    if (selectedGuest?.id === id) setSelectedGuest(null)
    await fetchGuests()
  }

  async function saveManualHorse() {
    if (!manualHorse.trim()) return
    setSavingManual(true)
    await assignHorse(manualHorse.trim(), manualType)
    setManualHorse('')
    setSavingManual(false)
  }

  const activeAssignments = selectedGuest?.horse_assignments?.filter(a => a.status === 'active' && !a.incompatible) || []
  const incompatibleHorses = selectedGuest?.horse_assignments?.filter(a => a.incompatible) || []

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

        {/* Assignment confirmation banner */}
        {assignmentConfirmation && (
          <div style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#065f46', color: '#fff', padding: '12px 24px',
            borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'fadeInUp 0.2s ease',
          }}>
            {assignmentConfirmation}
          </div>
        )}

        <div style={{
          background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
          padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Guests</h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{activeGuests.length} active</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input placeholder="Search name or room..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, width: 200 }} />
            <button onClick={() => setShowAdd(true)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + Add Guest
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', height: 'calc(100vh - 73px)' }}>
          {/* Guest list */}
          <div style={{ width: selectedGuest ? 280 : '100%', borderRight: selectedGuest ? '1px solid var(--color-border)' : 'none', overflowY: 'auto', padding: 12, flexShrink: 0 }}>
            {loading ? (
              <p style={{ padding: 20, color: 'var(--color-text-3)', textAlign: 'center', fontSize: 13 }}>Loading...</p>
            ) : filteredGuests.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>◎</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>No guests yet</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Click + Add Guest to start</p>
              </div>
            ) : filteredGuests.map(guest => {
              const primary = guest.horse_assignments?.find(a => a.assignment_type === 'primary' && a.status === 'active' && !a.incompatible)
              return (
                <div key={guest.id} onClick={() => openGuest(guest)} style={{ padding: '11px 13px', borderRadius: 'var(--radius-md)', border: `1px solid ${selectedGuest?.id === guest.id ? 'var(--color-accent)' : 'var(--color-border)'}`, background: selectedGuest?.id === guest.id ? 'var(--color-accent-bg)' : 'var(--color-surface)', marginBottom: 7, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{guest.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 1 }}>Room {guest.room_number} · {LEVEL_LABELS[guest.riding_level] || guest.riding_level}</div>
                      {primary && <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 2, fontWeight: 500 }}>🐴 {primary.horse_name}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      {checkoutSoon(guest) && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, whiteSpace: 'nowrap' }}>Checkout {guest.check_out_date === today ? 'today' : 'tomorrow'}</span>}
                      {guest.horse_request && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>Request</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Guest profile */}
          {selectedGuest && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, minWidth: 0 }}>
              <div style={{ maxWidth: 680 }}>
                {/* Profile header */}
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>{selectedGuest.name}</h2>
                      <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Room {selectedGuest.room_number} · In: {selectedGuest.check_in_date} · Out: {selectedGuest.check_out_date}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {checkoutSoon(selectedGuest) && (
                        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                          ⚠ Checkout {selectedGuest.check_out_date === today ? 'today' : 'tomorrow'} — horses free up soon
                        </span>
                      )}
                      <button onClick={() => deleteGuest(selectedGuest.id)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer' }}>Remove guest</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                    {[
                      { label: 'Age', value: selectedGuest.age },
                      { label: 'Weight', value: `${selectedGuest.weight} lbs` },
                      { label: 'Height', value: selectedGuest.height },
                      { label: 'Level', value: LEVEL_LABELS[selectedGuest.riding_level] || selectedGuest.riding_level },
                    ].map(item => (
                      <div key={item.label} style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', border: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {selectedGuest.notes && (
                    <div style={{ padding: '9px 11px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-2)', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-3)', fontSize: 10, textTransform: 'uppercase' }}>Notes: </span>{selectedGuest.notes}
                    </div>
                  )}
                  {selectedGuest.horse_request && (
                    <div style={{ padding: '9px 11px', background: 'var(--color-info-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info-border)', fontSize: 12, color: 'var(--color-info)' }}>
                      <span style={{ fontWeight: 600 }}>🎯 Request: </span>{selectedGuest.horse_request}
                    </div>
                  )}
                </div>

                {/* Assigned horses */}
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 14 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Horses</h3>

                  {activeAssignments.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>None assigned yet</p>
                  ) : activeAssignments.map((a, i) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 7, background: 'var(--color-bg)' }}>
                      <span style={{ fontSize: 16 }}>🐴</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{a.horse_name}</span>
                        <span style={{ fontSize: 10, marginLeft: 7, padding: '1px 6px', borderRadius: 999, background: i === 0 ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', color: i === 0 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>{a.assignment_type}</span>
                        {a.requested_by_guest && <span style={{ fontSize: 10, marginLeft: 5, padding: '1px 6px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>Requested</span>}
                      </div>
                      <button onClick={() => markIncompatible(a.horse_name, a.id)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-warning-border)', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', cursor: 'pointer' }}>Doesn&apos;t work</button>
                      <button onClick={() => removeAssignment(a.id)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer' }}>Remove</button>
                    </div>
                  ))}

                  {incompatibleHorses.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Doesn&apos;t work with:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {incompatibleHorses.map(a => (
                          <span key={a.id} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)' }}>{a.horse_name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual assignment */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 7, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Manual assignment</p>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <input placeholder="Horse name..." value={manualHorse} onChange={e => setManualHorse(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
                      <select value={manualType} onChange={e => setManualType(e.target.value)} style={{ fontSize: 13, width: 120 }}>
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="additional">Additional</option>
                      </select>
                      <button onClick={saveManualHorse} disabled={savingManual || !manualHorse.trim()} style={{ padding: '8px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {savingManual ? 'Saving...' : 'Assign'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Match results */}
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horse Matches</h3>
                    <button onClick={() => runMatch(selectedGuest, dismissedHorses)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-2)', cursor: 'pointer' }}>Refresh</button>
                  </div>

                  {matchLoading ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '12px 0' }}>Scanning the herd...</p>
                  ) : matches.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No matches found</p>
                  ) : matches.map((m, i) => {
                    const isDouble = m.availability === 'double_assigned'
                    const isSingle = m.availability === 'single_assigned'
                    const isCheckout = m.availability === 'checking_out_soon'
                    return (
                      <div key={m.name} style={{ border: `1px solid ${isDouble ? 'var(--color-warning-border)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '11px 13px', marginBottom: 9, background: isDouble ? 'var(--color-warning-bg)' : 'var(--color-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 7 }}>
                          <span style={{ fontSize: 16 }}>🐴</span>
                          <div style={{ flex: 1 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span></div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>#{i + 1}</span>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, background: m.fit === 'exact' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', color: m.fit === 'exact' ? 'var(--color-success)' : 'var(--color-warning)' }}>{m.fit === 'exact' ? 'Exact' : 'Adjacent'}</span>
                            {isDouble && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>Double</span>}
                            {isSingle && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>Assigned</span>}
                            {isCheckout && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 600 }}>Avail soon</span>}
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, marginBottom: m.warning ? 7 : 0 }}>{m.reason}</p>
                        {m.warning && <p style={{ fontSize: 11, color: 'var(--color-warning)', padding: '4px 7px', background: 'rgba(255,255,255,0.5)', borderRadius: 'var(--radius-sm)', marginBottom: 7 }}>⚠ {m.warning}</p>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            onClick={() => assignHorse(m.name, activeAssignments.length === 0 ? 'primary' : activeAssignments.length === 1 ? 'secondary' : 'additional')}
                            disabled={assigningHorse === m.name}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {assigningHorse === m.name ? 'Assigning...' : 'Assign'}
                          </button>
                          <button onClick={() => dismissHorse(m.name)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, color: 'var(--color-text-3)', cursor: 'pointer' }}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {showAdd && <AddGuestModal onClose={() => setShowAdd(false)} onSaved={() => { fetchGuests(); setShowAdd(false) }} />}
    </div>
  )
}

function AddGuestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', room_number: '', check_in_date: '', check_out_date: '', age: '', weight: '', height: '', riding_level: '', notes: '', horse_request: '' })
  const [saving, setSaving] = useState(false)
  const [count, setCount] = useState(0)

  async function save(addAnother: boolean) {
    if (!form.name || !form.riding_level) return
    setSaving(true)
    try {
      await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, age: form.age ? parseInt(form.age) : null, weight: form.weight ? parseInt(form.weight) : null }),
      })
      onSaved()
      if (addAnother) {
        setCount(c => c + 1)
        setForm(prev => ({ name: '', room_number: '', check_in_date: prev.check_in_date, check_out_date: prev.check_out_date, age: '', weight: '', height: '', riding_level: '', notes: '', horse_request: '' }))
      }
    } finally {
      setSaving(false)
    }
  }

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>
            Add Guest {count > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>({count} added)</span>}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          <div style={{ gridColumn: '1/-1' }}><label>Full Name *</label><input placeholder="e.g. Sharon Bryant" value={form.name} onChange={f('name')} /></div>
          <div><label>Room Number</label><input placeholder="e.g. 25" value={form.room_number} onChange={f('room_number')} /></div>
          <div><label>Riding Level *</label><select value={form.riding_level} onChange={f('riding_level')}><option value="">Select...</option>{LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select></div>
          <div><label>Check-in Date</label><input type="date" value={form.check_in_date} onChange={f('check_in_date')} /></div>
          <div><label>Check-out Date</label><input type="date" value={form.check_out_date} onChange={f('check_out_date')} /></div>
          <div><label>Age</label><input type="number" placeholder="e.g. 42" value={form.age} onChange={f('age')} /></div>
          <div><label>Weight (lbs)</label><input type="number" placeholder="e.g. 175" value={form.weight} onChange={f('weight')} /></div>
          <div style={{ gridColumn: '1/-1' }}><label>Height</label><input placeholder="e.g. 5'9&quot;" value={form.height} onChange={f('height')} /></div>
          <div style={{ gridColumn: '1/-1' }}><label>Notes</label><textarea rows={2} placeholder="Injuries, nervous rider, wants smooth horse..." value={form.notes} onChange={f('notes')} style={{ resize: 'vertical' }} /></div>
          <div style={{ gridColumn: '1/-1' }}><label>Horse Request</label><input placeholder="e.g. Ringo, or 'rode Jellybean last summer'" value={form.horse_request} onChange={f('horse_request')} /></div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 9 }}>
          <button onClick={() => save(false)} disabled={saving || !form.name || !form.riding_level} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save Guest'}
          </button>
          <button onClick={() => save(true)} disabled={saving || !form.name || !form.riding_level} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--color-text-2)' }}>
            Save + Add Another
          </button>
        </div>
      </div>
    </div>
  )
}
