'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useRole } from '@/lib/auth-context'
import Sidebar from '@/components/Sidebar'

type Person = { id: string; email: string; name: string; role: string }

type WsSyncChange = { field: string; old: unknown; new: unknown }
type WsSyncGuest =
  | { action: 'add';    external_guest_id: string; name: string; data: Record<string, unknown> }
  | { action: 'update'; external_guest_id: string; name: string; changes: WsSyncChange[] }
  | { action: 'link';   external_guest_id: string; name: string; herd_id: string; changes: WsSyncChange[] }
  | { action: 'skip';   external_guest_id: string; name: string; reason: string }
type WsSyncCounts = { add: number; update: number; link: number; skip: number; skippedNonRiders: number }
type WsSyncResult = { error?: string; counts?: WsSyncCounts; guests?: WsSyncGuest[] }

type LogRow = {
  id: string
  created_at: string
  user_email: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  details: Record<string, unknown>
}

const ACTION_GROUP_LABELS: Record<string, string> = {
  guests:      'Guests',
  assignments: 'Assignments',
  horses:      'Horses',
  health:      'Health',
  shoes:       'Shoes',
  farriers:    'Farriers',
  other:       'Other',
}

const DATE_RANGES = [
  { label: 'Today',        value: 'today' },
  { label: 'Last 7 days',  value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'All time',     value: 'all' },
]

function getTucsonDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' })
}

function formatTucsonTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function personName(email: string): string {
  return email.split('@')[0] || email
}

export default function AdminPage() {
  const router = useRouter()
  const { role, loading: roleLoading } = useRole()

  // Redirect non-admins
  useEffect(() => {
    if (!roleLoading && role !== 'admin') router.replace('/guests')
  }, [role, roleLoading, router])

  const [activeTab, setActiveTab] = useState<'activity' | 'ws-sync'>('activity')

  const [logs,     setLogs]     = useState<LogRow[]>([])
  const [total,    setTotal]    = useState(0)
  const [fetching, setFetching] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [wsSyncLoading, setWsSyncLoading] = useState(false)
  const [wsSyncResult,  setWsSyncResult]  = useState<WsSyncResult | null>(null)

  async function runWsSync() {
    setWsSyncLoading(true)
    setWsSyncResult(null)
    try {
      const res = await fetch('/api/ws-sync')
      const json: WsSyncResult = await res.json()
      setWsSyncResult(json)
    } catch {
      setWsSyncResult({ error: 'Request failed' })
    }
    setWsSyncLoading(false)
  }

  // People type-ahead
  const [allPeople,      setAllPeople]      = useState<Person[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personSearch,   setPersonSearch]   = useState('')
  const [showPersonDrop, setShowPersonDrop] = useState(false)
  const personInputRef = useRef<HTMLInputElement>(null)
  const personDropRef  = useRef<HTMLDivElement>(null)

  // Filters
  const [page,      setPage]      = useState(1)
  const [userId,    setUserId]    = useState('')
  const [group,     setGroup]     = useState('')
  const [dateRange, setDateRange] = useState('all')

  const pageSize = 50

  // Fetch people list once admin role is confirmed
  useEffect(() => {
    if (role !== 'admin') return
    fetch('/api/people')
      .then(r => r.json())
      .then(j => setAllPeople(j.people || []))
      .catch(() => {})
  }, [role])

  // Close person dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        personInputRef.current && !personInputRef.current.contains(target) &&
        personDropRef.current  && !personDropRef.current.contains(target)
      ) {
        setShowPersonDrop(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const filteredPeople = personSearch.trim()
    ? allPeople.filter(p =>
        p.name.toLowerCase().includes(personSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(personSearch.toLowerCase())
      )
    : allPeople

  function selectPerson(p: Person) {
    setSelectedPerson(p)
    setUserId(p.id)
    setPersonSearch(p.name)
    setShowPersonDrop(false)
  }

  function clearPerson() {
    setSelectedPerson(null)
    setUserId('')
    setPersonSearch('')
  }

  const buildDateParams = () => {
    if (dateRange === 'today') return { since: getTucsonDateStr(0),  until: getTucsonDateStr(0) }
    if (dateRange === '7d')    return { since: getTucsonDateStr(-6), until: '' }
    if (dateRange === '30d')   return { since: getTucsonDateStr(-29), until: '' }
    return { since: '', until: '' }
  }

  const fetchLogs = useCallback(async (p: number) => {
    if (role !== 'admin') return
    setFetching(true)
    try {
      const { since, until } = buildDateParams()
      const params = new URLSearchParams({ page: String(p) })
      if (userId) params.set('user_id', userId)
      if (group)  params.set('group', group)
      if (since)  params.set('since', since)
      if (until)  params.set('until', until)

      const res = await fetch('/api/activity?' + params.toString())
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setLogs(json.logs || [])
      setTotal(json.total || 0)
    } catch {}
    setFetching(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId, group, dateRange])

  useEffect(() => {
    setPage(1)
    fetchLogs(1)
  }, [fetchLogs])

  if (roleLoading || role !== 'admin') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--color-text-3)', fontSize: 14 }}>Loading…</span>
        </main>
      </div>
    )
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />

      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

          {/* Back link */}
          <Link
            href='/guests'
            style={{ display: 'inline-block', fontSize: 12, color: 'var(--color-text-3)', textDecoration: 'none', marginBottom: 16 }}
          >
            ← Back to app
          </Link>

          {/* Page title */}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', marginBottom: 20 }}>Admin</h1>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
            {(['activity', 'ws-sync'] as const).map(tab => {
              const label = tab === 'activity' ? 'Activity' : 'WS Sync Preview'
              const active = activeTab === tab
              return (
                <div
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
                    borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {label}
                </div>
              )
            })}
          </div>

          {/* ── WS Sync Preview tab ───────────────────────────────────────── */}
          {activeTab === 'ws-sync' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button
                  onClick={runWsSync}
                  disabled={wsSyncLoading}
                  style={{
                    padding: '7px 16px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: wsSyncLoading ? 'var(--color-surface)' : 'var(--color-accent)',
                    color: wsSyncLoading ? 'var(--color-text-3)' : '#fff',
                    fontSize: 13, fontWeight: 600, cursor: wsSyncLoading ? 'default' : 'pointer',
                  }}
                >
                  {wsSyncLoading ? 'Running…' : 'Run Preview'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  Read-only — no data will be written.
                </span>
              </div>

              {wsSyncResult?.error && (
                <div style={{ padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--color-text-2)', marginBottom: 16 }}>
                  {wsSyncResult.error}
                </div>
              )}

              {wsSyncResult?.counts && (
                <>
                  {/* Counts summary */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                    {(
                      [
                        { label: 'Add',               value: wsSyncResult.counts.add,              color: '#16a34a' },
                        { label: 'Update',             value: wsSyncResult.counts.update,           color: 'var(--color-accent)' },
                        { label: 'Link',               value: wsSyncResult.counts.link,             color: '#9333ea' },
                        { label: 'Skip',               value: wsSyncResult.counts.skip,             color: 'var(--color-text-3)' },
                        { label: 'Non-riders skipped', value: wsSyncResult.counts.skippedNonRiders, color: 'var(--color-text-3)' },
                      ] as const
                    ).map(({ label, value, color }) => (
                      <div
                        key={label}
                        style={{ padding: '8px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)' }}
                      >
                        <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per-guest table */}
                  {wsSyncResult.guests && wsSyncResult.guests.length > 0 && (
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                            {['Action', 'WS ID', 'Name', 'Check-in', 'Details'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wsSyncResult.guests.map((g, i) => {
                            const actionColor =
                              g.action === 'add'    ? '#16a34a' :
                              g.action === 'update' ? 'var(--color-accent)' :
                              g.action === 'link'   ? '#9333ea' :
                              'var(--color-text-3)'

                            const checkIn =
                              g.action === 'add' ? (g.data.check_in_date as string | null) ?? '—' :
                              g.action === 'update' || g.action === 'link'
                                ? (g.changes.find(c => c.field === 'check_in_date')?.new as string | null) ?? '—'
                                : '—'

                            const detail =
                              g.action === 'skip'
                                ? g.reason
                                : g.action === 'add'
                                ? `${Object.keys(g.data).length} fields`
                                : g.changes.length === 0
                                ? 'no changes'
                                : g.changes.map(c => `${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`).join(' · ')

                            return (
                              <tr
                                key={g.external_guest_id}
                                style={{ borderBottom: i < (wsSyncResult.guests?.length ?? 0) - 1 ? '1px solid var(--color-border)' : 'none' }}
                              >
                                <td style={{ padding: '7px 12px', fontWeight: 600, color: actionColor, textTransform: 'uppercase', fontSize: 11 }}>
                                  {g.action}
                                </td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-text-3)', fontFamily: 'monospace' }}>
                                  {g.external_guest_id}
                                </td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-text)' }}>
                                  {g.name}
                                </td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                                  {checkIn}
                                </td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-text-3)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>
                                  {detail}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Activity log tab ──────────────────────────────────────────── */}
          {activeTab === 'activity' && <>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>

            {/* Person type-ahead */}
            <div style={{ position: 'relative', minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', paddingRight: selectedPerson ? 4 : 0, overflow: 'hidden' }}>
                <input
                  ref={personInputRef}
                  type='text'
                  value={personSearch}
                  placeholder='All people'
                  onFocus={() => setShowPersonDrop(true)}
                  onChange={e => {
                    setPersonSearch(e.target.value)
                    if (selectedPerson && e.target.value !== selectedPerson.name) {
                      setSelectedPerson(null)
                      setUserId('')
                    }
                    setShowPersonDrop(true)
                  }}
                  style={{ padding: '5px 8px', border: 'none', background: 'transparent', fontSize: 12, color: 'var(--color-text-2)', outline: 'none', width: '100%', minWidth: 0 }}
                />
                {selectedPerson && (
                  <button
                    onClick={clearPerson}
                    style={{ padding: '0 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-3)', lineHeight: 1, flexShrink: 0 }}
                    title='Clear person filter'
                  >
                    ✕
                  </button>
                )}
              </div>

              {showPersonDrop && (
                <div
                  ref={personDropRef}
                  style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 2,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    minWidth: 240, maxHeight: 260, overflowY: 'auto',
                  }}
                >
                  {filteredPeople.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--color-text-3)' }}>No matches</div>
                  ) : filteredPeople.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={() => selectPerson(p)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        background: selectedPerson?.id === p.id ? 'var(--color-accent-bg)' : 'transparent',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selectedPerson?.id === p.id ? 'var(--color-accent-bg)' : 'transparent' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                        background: p.role === 'admin' ? 'var(--color-accent)' : 'var(--color-border)',
                        color: p.role === 'admin' ? '#fff' : 'var(--color-text-3)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {p.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action group filter */}
            <select
              value={group}
              onChange={e => setGroup(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, color: 'var(--color-text-2)' }}
            >
              <option value=''>All actions</option>
              {Object.entries(ACTION_GROUP_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>

            {/* Date range */}
            <div style={{ display: 'flex', gap: 4 }}>
              {DATE_RANGES.map(dr => (
                <button
                  key={dr.value}
                  onClick={() => setDateRange(dr.value)}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: dateRange === dr.value ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: dateRange === dr.value ? '#fff' : 'var(--color-text-2)',
                    fontSize: 12, cursor: 'pointer', fontWeight: dateRange === dr.value ? 600 : 400,
                  }}
                >
                  {dr.label}
                </button>
              ))}
            </div>

            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-3)' }}>
              {fetching ? 'Loading…' : `${total} entries`}
            </span>
          </div>

          {/* Log list */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {logs.length === 0 && !fetching ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
                No activity found.
              </div>
            ) : logs.map((log, i) => {
              const expanded = expandedId === log.id
              const hasDetails = log.details && Object.keys(log.details).length > 0
              return (
                <div
                  key={log.id}
                  style={{
                    borderBottom: i < logs.length - 1 ? '1px solid var(--color-border)' : 'none',
                    background: expanded ? 'var(--color-surface)' : 'transparent',
                  }}
                >
                  <div
                    onClick={() => hasDetails ? setExpandedId(expanded ? null : log.id) : undefined}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 80px 1fr',
                      gap: 12,
                      padding: '10px 16px',
                      alignItems: 'center',
                      cursor: hasDetails ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
                      {formatTucsonTime(log.created_at)}
                    </span>
                    <span
                      style={{ fontSize: 12, color: 'var(--color-text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={log.user_email}
                    >
                      {personName(log.user_email || '')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{log.summary}</span>
                      {hasDetails && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-3)', marginLeft: 'auto', flexShrink: 0 }}>
                          {expanded ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  {expanded && hasDetails && (
                    <div style={{ padding: '0 16px 12px 16px' }}>
                      <pre style={{
                        margin: 0, padding: '10px 12px',
                        background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        fontSize: 11, color: 'var(--color-text-2)', overflowX: 'auto',
                        lineHeight: 1.6,
                      }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
              <button
                onClick={() => { const p = page - 1; setPage(p); fetchLogs(p) }}
                disabled={page <= 1}
                style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, cursor: page <= 1 ? 'default' : 'pointer', color: page <= 1 ? 'var(--color-text-3)' : 'var(--color-text-2)' }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => { const p = page + 1; setPage(p); fetchLogs(p) }}
                disabled={page >= totalPages}
                style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, cursor: page >= totalPages ? 'default' : 'pointer', color: page >= totalPages ? 'var(--color-text-3)' : 'var(--color-text-2)' }}
              >
                Next →
              </button>
            </div>
          )}

          </> /* end activity tab */}

        </div>
      </main>
    </div>
  )
}
