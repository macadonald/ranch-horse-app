'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { ACTIVE_HORSES } from '@/lib/horses'

const WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', reset: 'Reset', full_set: 'Full set',
}

type GuestInfo = { guest_name: string; room_number: string; check_out_date: string; assignment_type: string }
type ShoeWarning = { what_needed: string; level: 'red' | 'amber' }

export default function BoardPage() {
  const [assignmentMap, setAssignmentMap] = useState<Record<string, GuestInfo[]>>({})
  const [shoeMap, setShoeMap] = useState<Record<string, ShoeWarning>>({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    try {
      const [assignmentsResult, shoeRes] = await Promise.all([
        supabase
          .from('horse_assignments')
          .select('horse_name, assignment_type, guests(name, room_number, check_out_date)')
          .eq('status', 'active')
          .eq('incompatible', false),
        fetch('/api/shoe-needs').then(r => r.json()),
      ])

      const newAssignmentMap: Record<string, GuestInfo[]> = {}
      ;(assignmentsResult.data || []).forEach((a: any) => {
        if (!a.guests) return
        const guest = Array.isArray(a.guests) ? a.guests[0] : a.guests
        if (!guest || guest.check_out_date < today) return
        if (!newAssignmentMap[a.horse_name]) newAssignmentMap[a.horse_name] = []
        newAssignmentMap[a.horse_name].push({
          guest_name: guest.name,
          room_number: guest.room_number,
          check_out_date: guest.check_out_date,
          assignment_type: a.assignment_type,
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
      setLastRefresh(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 864e5).toISOString().split('T')[0]

  const assignedHorses = ACTIVE_HORSES.filter(h => (assignmentMap[h.name]?.length ?? 0) > 0)
  const availableHorses = ACTIVE_HORSES.filter(h => !(assignmentMap[h.name]?.length ?? 0))

  const totalAssigned = assignedHorses.length
  const totalDouble = assignedHorses.filter(h => (assignmentMap[h.name]?.length ?? 0) >= 2).length
  const shoeWarningCount = Object.keys(shoeMap).length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Assignment Board</h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
              {loading ? 'Loading...' : `${totalAssigned} assigned · ${availableHorses.length} available${totalDouble > 0 ? ` · ${totalDouble} double` : ''}${shoeWarningCount > 0 ? ` · ${shoeWarningCount} shoe warning${shoeWarningCount !== 1 ? 's' : ''}` : ''}`}
            </p>
          </div>
          <button
            onClick={fetchData}
            style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-3)' }}>
            <p style={{ fontSize: 13 }}>Loading board...</p>
          </div>
        ) : (
          <div style={{ padding: 20 }} className="board-content">

            {/* Assigned horses */}
            {assignedHorses.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Assigned — {assignedHorses.length} horse{assignedHorses.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }} className="board-grid">
                  {assignedHorses.map(horse => {
                    const assignments = assignmentMap[horse.name] || []
                    const shoe = shoeMap[horse.name]
                    const isDouble = assignments.length >= 2

                    return (
                      <div
                        key={horse.name}
                        style={{
                          background: isDouble ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                          border: `1px solid ${isDouble ? 'var(--color-warning-border)' : 'var(--color-border)'}`,
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
                            🐴 {horse.name}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                            {shoe && (
                              <span style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 999,
                                fontWeight: 600,
                                background: shoe.level === 'red' ? '#fee2e2' : '#fef3c7',
                                color: shoe.level === 'red' ? '#dc2626' : '#92400e',
                                border: `1px solid ${shoe.level === 'red' ? '#fca5a5' : '#fcd34d'}`,
                                whiteSpace: 'nowrap',
                              }}>
                                {shoe.level === 'red' ? '🔴' : '🟠'} {WORK_LABELS[shoe.what_needed] || shoe.what_needed}
                              </span>
                            )}
                            {isDouble && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                Double
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          {assignments.map((a, i) => {
                            const checkingOutSoon = a.check_out_date === today || a.check_out_date === tomorrow
                            return (
                              <div
                                key={i}
                                style={{ fontSize: 12, color: 'var(--color-text-2)', paddingTop: i > 0 ? 6 : 0, marginTop: i > 0 ? 6 : 0, borderTop: i > 0 ? '1px dashed var(--color-border)' : 'none', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}
                              >
                                <span style={{ fontWeight: 600 }}>{a.guest_name}</span>
                                <span style={{ color: 'var(--color-text-3)' }}>Rm {a.room_number}</span>
                                {checkingOutSoon && (
                                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 600, border: '1px solid var(--color-success-border)' }}>
                                    out {a.check_out_date === today ? 'today' : 'tmrw'}
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

            {/* Available horses */}
            {availableHorses.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Available — {availableHorses.length} horse{availableHorses.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }} className="board-grid-sm">
                  {availableHorses.map(horse => {
                    const shoe = shoeMap[horse.name]
                    return (
                      <div
                        key={horse.name}
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 12px',
                          opacity: horse.status === 'backup' ? 0.65 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>🐴 {horse.name}</span>
                          {shoe && (
                            <span style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 999,
                              fontWeight: 600,
                              background: shoe.level === 'red' ? '#fee2e2' : '#fef3c7',
                              color: shoe.level === 'red' ? '#dc2626' : '#92400e',
                              border: `1px solid ${shoe.level === 'red' ? '#fca5a5' : '#fcd34d'}`,
                              flexShrink: 0,
                            }}>
                              {shoe.level === 'red' ? '🔴' : '🟠'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>
                          {horse.level}{horse.status === 'backup' ? ' · backup' : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {assignedHorses.length === 0 && availableHorses.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>▦</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>No active assignments</p>
                <p style={{ fontSize: 12, marginTop: 6 }}>Assign horses to guests on the Guests page</p>
              </div>
            )}

          </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .board-content { padding: 12px !important; }
            .board-grid { grid-template-columns: 1fr !important; }
            .board-grid-sm { grid-template-columns: repeat(2, 1fr) !important; }
          }
        ` }} />
      </main>
    </div>
  )
}
