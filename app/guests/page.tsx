'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import { getTucsonToday, getTucsonTomorrow } from '@/lib/timezone'
import { DbHorse, LEVEL_ORDER } from '@/lib/horses'

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
  id: string; horse_name: string; assignment_type: string; status: string
  incompatible: boolean; requested_by_guest: boolean; reason: string
  loves_horse?: boolean
}

type Guest = {
  id: string; name: string; room_number: string; check_in_date: string
  check_out_date: string; age: number; weight: number; height: string
  riding_level: string; notes: string; horse_request: string; gender: string
  checked_out?: boolean
  checked_out_at?: string
  horse_assignments?: Assignment[]
}

type Match = {
  name: string; fit: string; reason: string; warning: string; availability: string
  rodeThisBefore?: boolean; pastMatchQuality?: number | null
  lovesThisHorse?: boolean
  shoeWarning?: 'red' | 'amber' | null
}

type HistoryRecord = {
  id: string
  guest_name: string
  guest_id: string | null
  horse_name: string
  assignment_type: string
  assigned_date: string
  match_quality: number | null
  doesnt_work: boolean
  doesnt_work_reason: string | null
  loves_horse: boolean
  archived_at: string | null
  source: string
}

type ArchivedGuestSummary = {
  guest_name: string
  checkout_date: string
  records: HistoryRecord[]
}

type PastRideDetail = { date: string; loves: boolean; doesntWork: boolean }

type DraftRow = {
  guest: Guest
  suggestedHorse: string | null
  isDouble: boolean
  needsReview: boolean
  flagged: boolean
}

function HorseAutocomplete({ value, onChange, placeholder, horses = [] }: { value: string; onChange: (v: string) => void; placeholder?: string; horses?: string[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)
  function handleInput(v: string) {
    onChange(v)
    if (v.length >= 2) {
      const matches = horses
        .filter(n => n.toLowerCase().includes(v.toLowerCase()))
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .slice(0, 6)
      setSuggestions(matches); setShow(matches.length > 0)
    } else { setShow(false) }
  }
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input placeholder={placeholder || 'Horse name...'} value={value} onChange={e => handleInput(e.target.value)} onBlur={() => setTimeout(() => setShow(false), 150)} style={{ width: '100%', fontSize: 13 }} />
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2 }}>
          {suggestions.map(name => <div key={name} onMouseDown={e => { e.preventDefault(); onChange(name); setShow(false) }} onTouchEnd={e => { e.preventDefault(); onChange(name); setShow(false) }} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>🐴 {name}</div>)}
        </div>
      )}
    </div>
  )
}

function EditableField({ label, value, onSave, type = 'text', options }: { label: string; value: string | number; onSave: (v: string) => void; type?: string; options?: { key: string; label: string }[] }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => { setDraft(String(value ?? '')) }, [value])
  function handleSave() { setEditing(false); if (String(draft) !== String(value)) onSave(draft) }
  return (
    <div style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', border: `1px solid ${editing ? 'var(--color-accent)' : 'var(--color-border)'}`, cursor: editing ? 'default' : 'pointer' }} onClick={() => !editing && setEditing(true)}>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      {editing ? (
        options ? (
          <select value={draft} onChange={e => setDraft(e.target.value)} onBlur={handleSave} autoFocus style={{ fontSize: 13, width: '100%', border: 'none', background: 'transparent', padding: 0, fontWeight: 600 }}>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : (
          <input value={draft} type={type} onChange={e => setDraft(e.target.value)} onBlur={handleSave} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus style={{ fontSize: 13, width: '100%', border: 'none', background: 'transparent', padding: 0, fontWeight: 600 }} />
        )
      ) : (
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {value || <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 12 }}>tap to edit</span>}
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>✎</span>
        </div>
      )}
    </div>
  )
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

function AnalyticsBarRow({ label, count, max, labelWidth = 90 }: { label: string; count: number; max: number; labelWidth?: number }) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 2 : 0) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <div style={{ width: labelWidth, fontSize: 12, color: 'var(--color-text-2)', flexShrink: 0, textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1, height: 14, background: 'var(--color-bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3 }} />
      </div>
      <div style={{ width: 28, fontSize: 12, color: 'var(--color-text-3)', textAlign: 'right', flexShrink: 0 }}>{count}</div>
    </div>
  )
}

function GuestAnalytics({ guests, today, onBack }: { guests: Guest[]; today: string; onBack: () => void }) {
  // Only guests with at least one horse assignment
  const gwa = guests.filter(g => g.horse_assignments && g.horse_assignments.length > 0)
  const n = gwa.length

  // 1. Overview
  const activeCount = gwa.filter(g => !g.checked_out && (!g.check_out_date || g.check_out_date >= today)).length
  const assignedHorseNames = new Set(
    gwa.flatMap(g => (g.horse_assignments || []).filter(a => !a.incompatible).map(a => a.horse_name))
  )
  const inDates = gwa.filter(g => g.check_in_date).map(g => g.check_in_date)
  const earliest = inDates.length ? inDates.reduce((a, b) => a < b ? a : b) : null
  const latest   = inDates.length ? inDates.reduce((a, b) => a > b ? a : b) : null
  const weeksSpan = earliest && latest
    ? Math.max(1, Math.ceil((new Date(latest + 'T12:00:00').getTime() - new Date(earliest + 'T12:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)))
    : 1
  const avgPerWeek = n > 0 ? (n / weeksSpan).toFixed(1) : '—'

  // 2. Rider breakdown
  let maleCount = 0, femaleCount = 0
  const ageRanges  = [{ label: 'Under 18', count: 0 }, { label: '18–30', count: 0 }, { label: '31–45', count: 0 }, { label: '46–60', count: 0 }, { label: '60+', count: 0 }]
  const wtRanges   = [{ label: 'Under 150', count: 0 }, { label: '150–180', count: 0 }, { label: '181–210', count: 0 }, { label: '211–250', count: 0 }, { label: '250+', count: 0 }]
  const lvlCounts: Record<string, number> = {}

  gwa.forEach(g => {
    const gender = (g.gender || '').toLowerCase()
    if (gender === 'male') maleCount++; else if (gender === 'female') femaleCount++
    if (g.age) {
      if (g.age < 18) ageRanges[0].count++
      else if (g.age <= 30) ageRanges[1].count++
      else if (g.age <= 45) ageRanges[2].count++
      else if (g.age <= 60) ageRanges[3].count++
      else ageRanges[4].count++
    }
    if (g.weight) {
      if (g.weight < 150) wtRanges[0].count++
      else if (g.weight <= 180) wtRanges[1].count++
      else if (g.weight <= 210) wtRanges[2].count++
      else if (g.weight <= 250) wtRanges[3].count++
      else wtRanges[4].count++
    }
    if (g.riding_level) lvlCounts[g.riding_level] = (lvlCounts[g.riding_level] || 0) + 1
  })

  const genderTotal = maleCount + femaleCount
  const malePct    = genderTotal > 0 ? Math.round((maleCount   / genderTotal) * 100) : 0
  const femalePct  = genderTotal > 0 ? Math.round((femaleCount / genderTotal) * 100) : 0
  const maxAge = Math.max(...ageRanges.map(r => r.count), 1)
  const maxWt  = Math.max(...wtRanges.map(r => r.count), 1)
  const lvlRows = LEVELS.map(l => ({ label: l.label, key: l.key, count: lvlCounts[l.key] || 0 }))
  const maxLvl  = Math.max(...lvlRows.map(r => r.count), 1)

  // 3. Doesn't-work patterns
  const dwByHorse: Record<string, { ids: Set<string>; reasons: string[] }> = {}
  gwa.forEach(g => {
    ;(g.horse_assignments || []).filter(a => a.incompatible).forEach(a => {
      if (!dwByHorse[a.horse_name]) dwByHorse[a.horse_name] = { ids: new Set(), reasons: [] }
      dwByHorse[a.horse_name].ids.add(g.id)
      if (a.reason) dwByHorse[a.horse_name].reasons.push(a.reason)
    })
  })
  const flaggedHorses = Object.entries(dwByHorse)
    .filter(([, v]) => v.ids.size >= 3)
    .map(([horse, v]) => {
      const rc: Record<string, number> = {}
      v.reasons.forEach(r => { rc[r] = (rc[r] || 0) + 1 })
      const topReason = Object.entries(rc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
      return { horse, count: v.ids.size, topReason }
    })
    .sort((a, b) => b.count - a.count)

  // 4. Busiest checkout days
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dowCounts: Record<number, number> = {}
  const womCounts: Record<number, number> = {}
  gwa.forEach(g => {
    if (!g.check_out_date) return
    const d = new Date(g.check_out_date + 'T12:00:00')
    const dow = d.getDay(); dowCounts[dow] = (dowCounts[dow] || 0) + 1
    const wom = Math.ceil(d.getDate() / 7); womCounts[wom] = (womCounts[wom] || 0) + 1
  })
  const sortedDays  = Object.entries(dowCounts).sort(([, a], [, b]) => b - a).map(([d, c]) => ({ label: DOW[+d], count: c }))
  const sortedWeeks = Object.entries(womCounts).sort(([, a], [, b]) => b - a).map(([w, c]) => ({ label: `Week ${w}`, count: c }))
  const maxDay = Math.max(...sortedDays.map(d => d.count), 1)
  const maxWom = Math.max(...sortedWeeks.map(w => w.count), 1)

  // 5. Length of stay
  const stays: number[] = []
  gwa.forEach(g => {
    if (!g.check_in_date || !g.check_out_date) return
    const nights = Math.round((new Date(g.check_out_date + 'T12:00:00').getTime() - new Date(g.check_in_date + 'T12:00:00').getTime()) / 86400000)
    if (nights > 0 && nights < 60) stays.push(nights)
  })
  const avgStay = stays.length ? (stays.reduce((a, b) => a + b, 0) / stays.length).toFixed(1) : null
  const stayCounts: Record<number, number> = {}
  stays.forEach(s => { stayCounts[s] = (stayCounts[s] || 0) + 1 })
  const mostCommonStay = stays.length ? Object.entries(stayCounts).sort(([, a], [, b]) => b - a)[0] : null

  const backBtn = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)' as const, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '999px', padding: '6px 14px', cursor: 'pointer' as const, marginBottom: 14, display: 'inline-block' }
  const sec = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 14 }

  if (n === 0) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      <button onClick={onBack} style={backBtn}>← Back to Guests</button>
      <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>No guests with horse assignments found.</p>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 48px' }}>
      <button onClick={onBack} style={backBtn}>← Back to Guests</button>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Guest Analytics</h2>

      {/* 1. Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
        {([
          { label: 'Guests in history', value: n },
          { label: 'Active right now',  value: activeCount },
          { label: 'Horses assigned',   value: assignedHorseNames.size },
          { label: 'Avg guests / week', value: avgPerWeek },
        ] as { label: string; value: string | number }[]).map(c => (
          <div key={c.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 2. Rider breakdown */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Rider Breakdown</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Gender</div>
          {genderTotal > 0 ? (
            <>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 7, background: 'var(--color-border)' }}>
                <div style={{ width: `${malePct}%`, background: '#60a5fa' }} />
                <div style={{ width: `${femalePct}%`, background: '#f472b6' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--color-text-2)' }}>
                <span>Male: <strong>{maleCount}</strong> ({malePct}%)</span>
                <span>Female: <strong>{femaleCount}</strong> ({femalePct}%)</span>
              </div>
            </>
          ) : <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>No gender data recorded</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Age</div>
          {ageRanges.map(r => <AnalyticsBarRow key={r.label} label={r.label} count={r.count} max={maxAge} />)}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Weight (lbs)</div>
          {wtRanges.map(r => <AnalyticsBarRow key={r.label} label={r.label} count={r.count} max={maxWt} />)}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Riding Level</div>
          {lvlRows.map(r => <AnalyticsBarRow key={r.key} label={r.label} count={r.count} max={maxLvl} labelWidth={130} />)}
        </div>
      </div>

      {/* 3. Flags to watch */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Flags to Watch</div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 12 }}>Horses with 3+ doesn&apos;t-work flags from different guests</p>
        {flaggedHorses.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No horses have reached that threshold yet.</p>
        ) : flaggedHorses.map(h => (
          <div key={h.horse} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🐴</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{h.horse}</div>
              {h.topReason && <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>Most common reason: {h.topReason}</div>}
            </div>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)', fontWeight: 600, flexShrink: 0 }}>
              {h.count} flag{h.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* 4. Busiest checkout days */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Busiest Checkout Days</div>
        {sortedDays.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>Day of week</div>
            {sortedDays.map(d => <AnalyticsBarRow key={d.label} label={d.label} count={d.count} max={maxDay} labelWidth={80} />)}
            {sortedWeeks.length > 0 && <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6, marginTop: 14 }}>Week of month</div>
              {sortedWeeks.map(w => <AnalyticsBarRow key={w.label} label={w.label} count={w.count} max={maxWom} />)}
            </>}
          </>
        )}
      </div>

      {/* 5. Length of stay */}
      <div style={sec}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Length of Stay</div>
        {!avgStay ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Not enough data yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{avgStay}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>avg nights · {stays.length} guests</span>
            </div>
            {mostCommonStay && (
              <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>
                Most common stay: <strong>{mostCommonStay[0]} night{+mostCommonStay[0] !== 1 ? 's' : ''}</strong>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 6 }}>({mostCommonStay[1]} guests)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
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
  const [assignAllPhase, setAssignAllPhase] = useState<'idle' | 'running' | 'draft'>('idle')
  const [assignAllProgress, setAssignAllProgress] = useState('')
  const [assignAllPct, setAssignAllPct] = useState(0)
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const [dbHorses, setDbHorses] = useState<DbHorse[]>([])
  const [guestHistory, setGuestHistory] = useState<HistoryRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [returningGuestNames, setReturningGuestNames] = useState<Set<string>>(new Set())
  const [lovesMap, setLovesMap] = useState<Record<string, string>>({})
  const [doesntWorkTarget, setDoesntWorkTarget] = useState<{ horseName: string; assignmentId: string } | null>(null)
  const [doesntWorkReason, setDoesntWorkReason] = useState('')
  const [assignAllPastRideMap, setAssignAllPastRideMap] = useState<Record<string, Record<string, PastRideDetail>>>({})
  // Active / History view toggle
  const [guestViewMode, setGuestViewMode] = useState<'active' | 'history'>('active')
  const [historySearch, setHistorySearch] = useState('')
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1)
  const [archivedGuests, setArchivedGuests] = useState<ArchivedGuestSummary[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [selectedArchived, setSelectedArchived] = useState<ArchivedGuestSummary | null>(null)
  const [selectedHistoryGuest, setSelectedHistoryGuest] = useState<Guest | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [guestGridView, setGuestGridView] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('guestGridView') === 'grid' : false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const detailPanelRef = useRef<HTMLDivElement>(null)
  const matchAbortRef = useRef<AbortController | null>(null)

  const today = getTucsonToday()
  const tomorrowStr = getTucsonTomorrow()

  const fetchGuests = useCallback(async () => {
    try {
      const [guestRes, horsesRes, returningRes] = await Promise.all([
        fetch('/api/guests').then(r => r.json()),
        fetch('/api/horses').then(r => r.json()),
        fetch('/api/assignment-history?all_returning=true').then(r => r.json()),
      ])
      const allGuests: Guest[] = guestRes.guests || []
      setGuests(allGuests)
      setDbHorses(horsesRes.horses || [])
      setReturningGuestNames(new Set((returningRes.names || []).map((n: string) => n.toLowerCase())))
      const newLovesMap: Record<string, string> = {}
      for (const item of returningRes.lovesItems || []) {
        newLovesMap[(item.guest_name as string).toLowerCase()] = item.horse_name
      }
      setLovesMap(newLovesMap)

      // Auto-checkout guests whose check_out_date is in the past
      const tucsonToday = getTucsonToday()
      const overdue = allGuests.filter(g => g.check_out_date && g.check_out_date < tucsonToday && !g.checked_out)
      if (overdue.length > 0) {
        await Promise.all(overdue.map(g =>
          fetch('/api/guests', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: g.id, checked_out: true, checked_out_at: new Date().toISOString() }),
          })
        ))
        const refreshed = await fetch('/api/guests').then(r => r.json())
        setGuests(refreshed.guests || [])
      }
    }
    catch (err) { console.error(err) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchGuests() }, [fetchGuests])
  useEffect(() => { if (selectedGuest) { const u = guests.find(g => g.id === selectedGuest.id); if (u) setSelectedGuest(u) } }, [guests])
  useEffect(() => { if (!isMobile) detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [selectedGuest?.id, isMobile])
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function fetchGuestHistory(guestId: string) {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/assignment-history?guest_id=${guestId}`).then(r => r.json())
      setGuestHistory(res.history || [])
    } catch {} finally { setHistoryLoading(false) }
  }

  async function fetchArchivedGuests() {
    setArchivedLoading(true)
    try {
      const res = await fetch('/api/assignment-history?archived=true').then(r => r.json())
      setArchivedGuests(res.guests || [])
    } catch {} finally { setArchivedLoading(false) }
  }

  async function logHistory(guestName: string, guestId: string, horseName: string, assignmentType: string, source: string) {
    try {
      await fetch('/api/assignment-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_name: guestName, guest_id: guestId, horse_name: horseName, assignment_type: assignmentType, assigned_date: today, source })
      })
    } catch {}
  }

  async function setLovesHorse(assignmentId: string, horseName: string, currentLoves: boolean) {
    if (!selectedGuest) return
    const newLoves = !currentLoves
    // Optimistic update — toggle immediately so the button responds without waiting for the DB round-trip
    setGuests(prev => prev.map(g => g.id === selectedGuest.id ? {
      ...g,
      horse_assignments: g.horse_assignments?.map(ha => ha.id === assignmentId ? { ...ha, loves_horse: newLoves } : ha)
    } : g))
    // Write to horse_assignments so the value comes back with the guest on next load
    await fetch('/api/assignments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assignmentId, loves_horse: newLoves })
    })
    // Also write to assignment_history for long-term memory across stays
    let histRec = guestHistory.find(h => h.horse_name === horseName && !h.doesnt_work)
    if (!histRec) {
      try {
        const res = await fetch('/api/assignment-history', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_name: selectedGuest.name, guest_id: selectedGuest.id, horse_name: horseName, assignment_type: 'primary', assigned_date: today, source: 'loves_toggle' })
        })
        const data = await res.json()
        histRec = data.record
      } catch {}
    }
    if (histRec) {
      await fetch('/api/assignment-history', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: histRec.id, loves_horse: newLoves })
      })
    }
    await fetchGuestHistory(selectedGuest.id)
  }

  async function clearDoesntWork(horseName: string, assignmentId: string) {
    if (!selectedGuest) return
    if (!confirm(`Clear "doesn't work" for ${horseName}? This removes the signal so this horse can be suggested again.`)) return
    const histRec = guestHistory.find(h => h.horse_name === horseName && h.doesnt_work)
    if (histRec) {
      await fetch('/api/assignment-history', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: histRec.id, doesnt_work: false, doesnt_work_reason: null, match_quality: null })
      })
    }
    await fetch(`/api/assignments?id=${assignmentId}`, { method: 'DELETE' })
    await fetchGuests()
    await fetchGuestHistory(selectedGuest.id)
  }

  const cutoffDate = (() => {
    const d = new Date(today + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - 14)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  })()
  const activeGuests = guests.filter(g =>
    !g.checked_out &&
    (!g.check_out_date || g.check_out_date >= today)
  )
  const checkedOutGuests = guests
    .filter(g => g.checked_out === true)
    .sort((a, b) => (b.checked_out_at || '').localeCompare(a.checked_out_at || ''))
  const filteredCheckedOut = checkedOutGuests.filter(g =>
    !historySearch || g.name?.toLowerCase().includes(historySearch.toLowerCase())
  )
  const HISTORY_PAGE_SIZE = 50
  const historyTotalPages = Math.ceil(filteredCheckedOut.length / HISTORY_PAGE_SIZE)
  const pagedCheckedOut = filteredCheckedOut.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE)
  const filteredGuests = activeGuests.filter(g => {
    const q = search.toLowerCase()
    if (g.name?.toLowerCase().includes(q) || g.room_number?.toLowerCase().includes(q)) return true
    const activeHorse = g.horse_assignments?.find(a => a.status === 'active' && !a.incompatible)
    return !!activeHorse?.horse_name?.toLowerCase().includes(q)
  })
  const checkoutSoon = (g: Guest) => g.check_out_date === today || g.check_out_date === tomorrowStr

  async function updateGuestField(field: string, value: string) {
    if (!selectedGuest) return
    try {
      await fetch('/api/guests', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedGuest.id, [field]: value }) })
      await fetchGuests()
      if (['age', 'weight', 'height', 'riding_level', 'notes', 'horse_request', 'gender'].includes(field)) {
        const updated = { ...selectedGuest, [field]: field === 'age' || field === 'weight' ? parseInt(value) : value }
        await runMatch(updated as Guest, dismissedHorses)
      }
    } catch (err) { console.error(err) }
  }

  async function openGuest(guest: Guest) {
    setSelectedGuest(guest); setMatches([]); setDismissedHorses([]); setManualHorse(''); setManualType('primary'); setAssignmentConfirmation(null)
    await Promise.all([runMatch(guest, []), fetchGuestHistory(guest.id)])
  }

  async function runMatch(guest: Guest, dismissed: string[]) {
    if (!guest.age || !guest.weight || !guest.height || !guest.riding_level) return
    matchAbortRef.current?.abort()
    const abort = new AbortController()
    matchAbortRef.current = abort
    setMatchLoading(true); setMatches([])
    try {
      const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ age: guest.age, weight: guest.weight, height: guest.height, level: guest.riding_level, gender: guest.gender, notes: `${guest.notes || ''}${guest.horse_request ? ' Horse request: ' + guest.horse_request : ''}`, guestId: guest.id, dismissedHorses: dismissed }), signal: abort.signal })
      if (!res.body) { const data = await res.json(); if (data.matches) setMatches(data.matches); return }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { const parsed = JSON.parse(line.slice(6)); if (parsed.type === 'match') setMatches(prev => [...prev, parsed.match]) } catch {}
        }
      }
    } catch (err) { if ((err as Error).name !== 'AbortError') console.error(err) } finally { if (!abort.signal.aborted) setMatchLoading(false) }
  }

  async function dismissHorse(name: string) {
    const newDismissed = [...dismissedHorses, name]; setDismissedHorses(newDismissed); setMatches(prev => prev.filter(m => m.name !== name))
    if (!selectedGuest) return
    try {
      const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ age: selectedGuest.age, weight: selectedGuest.weight, height: selectedGuest.height, level: selectedGuest.riding_level, gender: selectedGuest.gender, notes: selectedGuest.notes, guestId: selectedGuest.id, dismissedHorses: newDismissed }) })
      if (!res.body) return
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; const newMatches: Match[] = []
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try { const parsed = JSON.parse(line.slice(6)); if (parsed.type === 'match') newMatches.push(parsed.match) } catch {}
        }
      }
      setMatches(prev => {
        const existing = new Set(prev.map(m => m.name))
        const novel = newMatches.find(m => !existing.has(m.name) && !newDismissed.includes(m.name))
        return novel ? [...prev, novel] : prev
      })
    } catch (err) { console.error(err) }
  }

  async function assignHorse(horseName: string, type: string) {
    if (!selectedGuest) return
    setAssigningHorse(horseName); setAssignmentConfirmation(null)
    try {
      await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guest_id: selectedGuest.id, horse_name: horseName, assignment_type: type, status: 'active', incompatible: false, requested_by_guest: false }) })
      await logHistory(selectedGuest.name, selectedGuest.id, horseName, type, 'manual')
      setAssignmentConfirmation(`✓ ${horseName} assigned to ${selectedGuest.name} as ${type} horse`)
      setTimeout(() => setAssignmentConfirmation(null), 4000)
      await Promise.all([fetchGuests(), fetchGuestHistory(selectedGuest.id)])
    } catch (err) { console.error(err) } finally { setAssigningHorse(null) }
  }

  async function removeAssignment(id: string) { try { await fetch(`/api/assignments?id=${id}`, { method: 'DELETE' }); await fetchGuests() } catch (err) { console.error(err) } }

  async function updateAssignmentType(assignmentId: string, currentType: string) {
    const cycle = ['primary', 'secondary', 'additional']
    const nextType = cycle[(cycle.indexOf(currentType) + 1) % cycle.length]
    await fetch('/api/assignments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: assignmentId, assignment_type: nextType }) })
    await fetchGuests()
  }

  async function markIncompatible(horseName: string, assignmentId: string, reason?: string) {
    if (!selectedGuest) return
    try {
      await fetch('/api/assignments', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignmentId, incompatible: true, status: 'removed', reason: reason || null })
      })
      const histRec = guestHistory.find(h => h.horse_name === horseName && !h.doesnt_work)
      if (histRec) {
        await fetch('/api/assignment-history', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: histRec.id, doesnt_work: true, doesnt_work_reason: reason || null })
        })
      }
      await fetchGuests(); await fetchGuestHistory(selectedGuest.id)
      setDoesntWorkTarget(null); setDoesntWorkReason('')
    } catch (err) { console.error(err) }
  }

  async function deleteGuest(id: string) {
    if (!confirm('Remove this guest? Their history will NOT be archived. Use Check Out to preserve history.')) return
    await fetch(`/api/guests?id=${id}`, { method: 'DELETE' })
    if (selectedGuest?.id === id) setSelectedGuest(null)
    await fetchGuests()
  }

  async function checkOutGuest(guest: Guest) {
    if (!confirm(`Check out ${guest.name}? History will be archived permanently and they'll be removed.`)) return

    // Fetch current history to determine auto thumbs-up eligibility
    let histRecords = (selectedGuest?.id === guest.id) ? guestHistory : []
    if (histRecords.length === 0) {
      const hr = await fetch(`/api/assignment-history?guest_id=${guest.id}`).then(r => r.json())
      histRecords = hr.history || []
    }
    const activeRecords = histRecords.filter((r: HistoryRecord) => !r.doesnt_work && !r.archived_at)
    const uniqueHorses = new Set(activeRecords.map((r: HistoryRecord) => r.horse_name))
    const hasDoesntWork = histRecords.some((r: HistoryRecord) => r.doesnt_work)

    // Auto thumbs-up: same horse all week, no issues
    if (!hasDoesntWork && uniqueHorses.size === 1) {
      for (const rec of activeRecords) {
        if (rec.match_quality === null && !rec.loves_horse) {
          await fetch('/api/assignment-history', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: rec.id, match_quality: 1 })
          })
        }
      }
    }

    // Ensure guest appears in history even if no rides were logged
    if (histRecords.length === 0) {
      await fetch('/api/assignment-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_name: guest.name, guest_id: guest.id, horse_name: '—', assignment_type: 'none', assigned_date: today, source: 'checkout_only' })
      })
    }

    await fetch('/api/assignment-history', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive_guest_name: guest.name })
    })
    await fetch('/api/guests', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guest.id, checked_out: true, checked_out_at: new Date().toISOString() })
    })
    if (selectedGuest?.id === guest.id) { setSelectedGuest(null); setGuestHistory([]) }
    await fetchGuests()
  }

  async function saveManualHorse() {
    if (!manualHorse.trim()) return
    setSavingManual(true); await assignHorse(manualHorse.trim(), manualType); setManualHorse(''); setSavingManual(false)
  }

  async function runAssignAll() {
    const now = getTucsonToday()
    setAssignAllPhase('running'); setAssignAllProgress('Fetching current assignments...'); setAssignAllPct(10)

    const [assignRes, histRes] = await Promise.all([
      fetch('/api/assignments').then(r => r.json()),
      fetch('/api/assignment-history?since=2026-05-11').then(r => r.json()),
    ])

    // Build enriched past-ride map for draft disclaimers (guest_name_lower → horse_name → PastRideDetail)
    // doesntWork and loves are ORed across all records so a single flag is never lost by a newer neutral record.
    const pastRideMapLocal: Record<string, Record<string, PastRideDetail>> = {}
    for (const rec of histRes.history || []) {
      const key = (rec.guest_name as string).toLowerCase()
      if (!pastRideMapLocal[key]) pastRideMapLocal[key] = {}
      const existing = pastRideMapLocal[key][rec.horse_name]
      pastRideMapLocal[key][rec.horse_name] = {
        date: !existing || rec.assigned_date > existing.date ? rec.assigned_date : existing.date,
        loves: (rec.loves_horse || false) || (existing?.loves || false),
        doesntWork: (rec.doesnt_work || false) || (existing?.doesntWork || false),
      }
    }
    setAssignAllPastRideMap(pastRideMapLocal)

    const dbAssignedMap: Record<string, { checkOut: string }[]> = {}
    for (const a of assignRes.assignments || []) {
      const g = Array.isArray(a.guests) ? a.guests[0] : a.guests
      if (!g) continue
      if (!dbAssignedMap[a.horse_name]) dbAssignedMap[a.horse_name] = []
      dbAssignedMap[a.horse_name].push({ checkOut: g.check_out_date })
    }

    const hasBlockingFlag = (h: DbHorse) => (h.flags || []).some(f => {
      if (f.flag_type === 'day_off') return f.day_off_date === now
      return ['lame', 'injured', 'in_training', 'retired'].includes(f.flag_type)
    })
    const eligibleHorses = dbHorses.filter(h => h.is_active && !h.exclude_from_ai && !hasBlockingFlag(h))
    const unassigned = activeGuests.filter(g => !g.horse_assignments?.some(a => a.status === 'active' && !a.incompatible))
    if (unassigned.length === 0) { setAssignAllPhase('idle'); return }

    const sorted = [...unassigned].sort((a, b) => {
      const ai = LEVEL_ORDER.indexOf(a.riding_level); const bi = LEVEL_ORDER.indexOf(b.riding_level)
      return (bi < 0 ? -1 : bi) - (ai < 0 ? -1 : ai)
    })

    const draft: DraftRow[] = []; const usedInPass1 = new Set<string>(); const pass2Queue: Guest[] = []

    setAssignAllProgress('Pass 1: Finding best matches...'); setAssignAllPct(35)
    await new Promise(r => setTimeout(r, 350))

    for (const guest of sorted) {
      const gIdx = LEVEL_ORDER.indexOf(guest.riding_level)
      if (gIdx === -1) { pass2Queue.push(guest); continue }
      const guestPastRides = pastRideMapLocal[guest.name.toLowerCase()] || {}

      const candidates = eligibleHorses
        .filter(h => !dbAssignedMap[h.name] && !usedInPass1.has(h.name))
        .filter(h => !h.weight || !guest.weight || guest.weight <= h.weight)
        .filter(h => !guestPastRides[h.name]?.doesntWork)
        .map(h => ({ horse: h, diff: Math.abs(gIdx - LEVEL_ORDER.indexOf(h.level)), margin: (h.weight ?? 999) - (guest.weight ?? 0) }))
        .filter(c => c.diff <= 1 && LEVEL_ORDER.indexOf(c.horse.level) !== -1)
        .sort((a, b) => (Number(a.horse.rank_last) - Number(b.horse.rank_last)) || a.diff - b.diff || b.margin - a.margin)

      if (candidates.length > 0) {
        usedInPass1.add(candidates[0].horse.name)
        draft.push({ guest, suggestedHorse: candidates[0].horse.name, isDouble: false, needsReview: false, flagged: false })
      } else { pass2Queue.push(guest) }
    }

    setAssignAllProgress('Pass 2: Filling gaps with shared horses...'); setAssignAllPct(65)
    await new Promise(r => setTimeout(r, 350))

    const runtimeDoubleMap: Record<string, { checkOut: string }[]> = { ...dbAssignedMap }
    const pass3Queue: Guest[] = []

    for (const guest of pass2Queue) {
      const gIdx = LEVEL_ORDER.indexOf(guest.riding_level)
      if (gIdx === -1) { pass3Queue.push(guest); continue }
      const guestPastRides = pastRideMapLocal[guest.name.toLowerCase()] || {}

      const candidates = eligibleHorses
        .filter(h => runtimeDoubleMap[h.name] || usedInPass1.has(h.name))
        .filter(h => !h.weight || !guest.weight || guest.weight <= h.weight)
        .filter(h => !guestPastRides[h.name]?.doesntWork)
        .map(h => {
          const riders = runtimeDoubleMap[h.name] || []
          const soonest = riders.length > 0 ? riders.reduce((min, r) => r.checkOut < min ? r.checkOut : min, riders[0].checkOut) : '9999-99-99'
          return { horse: h, diff: Math.abs(gIdx - LEVEL_ORDER.indexOf(h.level)), soonest }
        })
        .filter(c => c.diff <= 1 && LEVEL_ORDER.indexOf(c.horse.level) !== -1)
        .sort((a, b) => (Number(a.horse.rank_last) - Number(b.horse.rank_last)) || a.diff - b.diff || a.soonest.localeCompare(b.soonest))

      if (candidates.length > 0) {
        const best = candidates[0]
        if (!runtimeDoubleMap[best.horse.name]) runtimeDoubleMap[best.horse.name] = []
        runtimeDoubleMap[best.horse.name].push({ checkOut: guest.check_out_date || '' })
        draft.push({ guest, suggestedHorse: best.horse.name, isDouble: true, needsReview: false, flagged: false })
      } else { pass3Queue.push(guest) }
    }

    setAssignAllProgress('Pass 3: Flagging guests needing manual review...'); setAssignAllPct(90)
    await new Promise(r => setTimeout(r, 350))
    for (const guest of pass3Queue) draft.push({ guest, suggestedHorse: null, isDouble: false, needsReview: true, flagged: false })

    setDraftRows(draft); setAssignAllPct(100)
    await new Promise(r => setTimeout(r, 200))
    setAssignAllPhase('draft')
  }

  async function confirmAssignAll(rows: DraftRow[]) {
    const toSave = rows.filter(r => r.suggestedHorse && !r.flagged)
    await Promise.all(
      toSave.map(async r => {
        await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guest_id: r.guest.id, horse_name: r.suggestedHorse, assignment_type: 'primary', status: 'active', incompatible: false, requested_by_guest: false }) })
        await logHistory(r.guest.name, r.guest.id, r.suggestedHorse!, 'primary', 'assign_all')
      })
    )
    await fetchGuests(); setAssignAllPhase('idle'); setDraftRows([])
  }

  const activeAssignments = selectedGuest?.horse_assignments?.filter(a => a.status === 'active' && !a.incompatible) || []
  // Deduplicate incompatible horse pills by horse_name (prevents double-pill bug from legacy duplicate records)
  const incompatibleHorsesRaw = selectedGuest?.horse_assignments?.filter(a => a.incompatible) || []
  const incompatibleHorsesMap = new Map(incompatibleHorsesRaw.map(a => [a.horse_name, a]))
  const incompatibleHorses: typeof incompatibleHorsesRaw = []
  incompatibleHorsesMap.forEach(v => incompatibleHorses.push(v))

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }} className='guest-main'>
        {assignmentConfirmation && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#065f46', color: '#fff', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 1000 }}>{assignmentConfirmation}</div>}

        {/* Header */}
        <div className="guest-header" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 16, paddingLeft: 24, paddingRight: 24, position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Guests</h1>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{activeGuests.length} active · Tucson: {today}</p>
            </div>
            {/* Active / History toggle */}
            <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', overflow: 'hidden', flexShrink: 0 }}>
              <button onClick={() => { setGuestViewMode('active'); setSelectedArchived(null); setCurrentHistoryPage(1) }} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none', background: guestViewMode === 'active' ? 'var(--color-accent)' : 'var(--color-surface)', color: guestViewMode === 'active' ? '#fff' : 'var(--color-text-2)', cursor: 'pointer' }}>Active</button>
              <button onClick={() => { setGuestViewMode('history'); setSelectedGuest(null); fetchArchivedGuests(); setCurrentHistoryPage(1) }} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderLeft: '1px solid var(--color-border)', background: guestViewMode === 'history' ? 'var(--color-accent)' : 'var(--color-surface)', color: guestViewMode === 'history' ? '#fff' : 'var(--color-text-2)', cursor: 'pointer' }}>History</button>
            </div>
          </div>
          <div className="guest-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              placeholder={guestViewMode === 'history' ? 'Search past guests...' : 'Search name or room...'}
              value={guestViewMode === 'history' ? historySearch : search}
              onChange={e => guestViewMode === 'history' ? (setHistorySearch(e.target.value), setCurrentHistoryPage(1)) : setSearch(e.target.value)}
              style={{ fontSize: 13, width: 200 }}
            />
            {guestViewMode === 'active' && <>
              <button onClick={() => { const next = !guestGridView; setGuestGridView(next); localStorage.setItem('guestGridView', next ? 'grid' : 'list') }} style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {guestGridView ? '≡ List' : '⊞ Grid'}
              </button>
              <button onClick={runAssignAll} style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Assign All</button>
              <button onClick={() => { setShowAnalytics(v => !v); setSelectedGuest(null) }} style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: showAnalytics ? 'var(--color-accent-bg)' : 'var(--color-surface)', color: showAnalytics ? 'var(--color-accent)' : 'var(--color-text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Analytics</button>
              <button onClick={() => setShowAdd(true)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Guest</button>
            </>}
          </div>
        </div>

        {/* ── ACTIVE VIEW ── */}
        {guestViewMode === 'active' && (
          showAnalytics
            ? <GuestAnalytics guests={guests} today={today} onBack={() => setShowAnalytics(false)} />
            : <div style={{ display: 'flex', flex: 1, minHeight: 0 }} className='guest-split'>
            {/* Guest list */}
            <div style={{ width: selectedGuest ? 280 : '100%', borderRight: selectedGuest ? '1px solid var(--color-border)' : 'none', overflowY: 'auto', padding: 12, flexShrink: 0 }}>
              {loading ? <p style={{ padding: 20, color: 'var(--color-text-3)', textAlign: 'center', fontSize: 13 }}>Loading...</p>
                : filteredGuests.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)' }}><div style={{ fontSize: 32, marginBottom: 8 }}>◎</div><p style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>No guests yet</p><p style={{ fontSize: 12, marginTop: 4 }}>Click + Add Guest to start</p></div>
                : (
                  <div style={{ display: guestGridView ? 'grid' : 'block', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: guestGridView ? 8 : undefined }}>
                    {filteredGuests.map(guest => {
                      const _activeAssigns = guest.horse_assignments?.filter(a => a.status === 'active' && !a.incompatible) ?? []
                      const primary = _activeAssigns.find(a => a.assignment_type === 'primary') ?? _activeAssigns.find(a => a.assignment_type === 'secondary') ?? _activeAssigns[0]
                      const isReturning = returningGuestNames.has(guest.name.toLowerCase())
                      const lovesHorse = lovesMap[guest.name.toLowerCase()]
                      if (guestGridView) {
                        return (
                          <div key={guest.id} onClick={() => openGuest(guest)} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: `1px solid ${selectedGuest?.id === guest.id ? 'var(--color-accent)' : 'var(--color-border)'}`, background: 'var(--color-surface)', cursor: 'pointer' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{guest.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>Rm {guest.room_number}</div>
                            {primary && <div style={{ fontSize: 10, color: 'var(--color-accent)', marginTop: 2 }}>🐴 {primary.horse_name}{lovesHorse === primary.horse_name ? ' ❤️' : ''}</div>}
                            {!primary && <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>Unassigned</div>}
                            <div style={{ marginTop: 3, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', fontWeight: 600 }}>{guest.riding_level}</span>
                              {checkoutSoon(guest) && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600 }}>Out</span>}
                              {isReturning && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>↩</span>}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={guest.id} onClick={() => openGuest(guest)} style={{ padding: '11px 13px', borderRadius: 'var(--radius-md)', border: `1px solid ${selectedGuest?.id === guest.id ? 'var(--color-accent)' : 'var(--color-border)'}`, background: selectedGuest?.id === guest.id ? 'var(--color-accent-bg)' : 'var(--color-surface)', marginBottom: 7, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{guest.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 1 }}>Room {guest.room_number} · {LEVEL_LABELS[guest.riding_level] || guest.riding_level}{guest.gender ? ' · ' + guest.gender : ''}</div>
                              {primary && <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 2, fontWeight: 500 }}>🐴 {primary.horse_name}{lovesHorse === primary.horse_name ? ' ❤️' : ''}</div>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0, marginLeft: 6 }}>
                              {checkoutSoon(guest) && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, whiteSpace: 'nowrap' }}>Checkout {guest.check_out_date === today ? 'today' : 'tomorrow'}</span>}
                              {isReturning && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontWeight: 600, border: '1px solid #c4b5fd', whiteSpace: 'nowrap' }}>Returning</span>}

                              {guest.horse_request && !primary && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>Request</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>

            {/* Guest detail panel */}
            {selectedGuest && (
              <div
                ref={detailPanelRef}
                className={isMobile ? undefined : 'guest-profile-panel'}
                style={isMobile ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 200,
                  background: 'var(--color-bg)',
                  overflowY: 'auto',
                } : {
                  flex: 1,
                  overflowY: 'auto',
                  padding: 20,
                  minWidth: 0,
                }}
              >
                {/* Mobile: sticky header */}
                {isMobile && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 56,
                    paddingBottom: 12,
                    paddingLeft: 16,
                    paddingRight: 16,
                    background: 'var(--color-bg)',
                    borderBottom: '1px solid var(--color-border)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                  }}>
                    <button
                      onClick={() => { setSelectedGuest(null); setGuestHistory([]) }}
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer' }}
                    >← Guests</button>
                    <button
                      onClick={() => { setSelectedGuest(null); setGuestHistory([]) }}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</button>
                  </div>
                )}
                <div style={{ maxWidth: isMobile ? undefined : 680, padding: isMobile ? '12px 16px 32px 16px' : undefined }}>
                  {/* Profile card */}
                  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {returningGuestNames.has(selectedGuest.name.toLowerCase()) && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontWeight: 600, border: '1px solid #c4b5fd' }}>🔄 Returning</span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, fontStyle: 'italic' }}>Tap any field to edit</p>
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                        {checkoutSoon(selectedGuest) && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>⚠ Checkout {selectedGuest.check_out_date === today ? 'today' : 'tomorrow'}</span>}
                        <button onClick={() => checkOutGuest(selectedGuest)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success-border)', background: 'var(--color-success-bg)', color: 'var(--color-success)', cursor: 'pointer', fontWeight: 600 }}>Check Out</button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteGuest(selectedGuest.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); deleteGuest(selectedGuest.id); }} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer' }}>Remove guest</button>
                        {!isMobile && <button onClick={() => { setSelectedGuest(null); setGuestHistory([]) }} title="Close" style={{ fontSize: 14, lineHeight: 1, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}>✕</button>}
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <EditableField label="Name" value={selectedGuest.name} onSave={v => updateGuestField('name', v)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                      <EditableField label="Age" value={selectedGuest.age} onSave={v => updateGuestField('age', v)} type="number" />
                      <EditableField label="Weight (lbs)" value={selectedGuest.weight} onSave={v => updateGuestField('weight', v)} type="number" />
                      <EditableField label="Height" value={selectedGuest.height} onSave={v => updateGuestField('height', v)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                      <EditableField label="Level" value={selectedGuest.riding_level} onSave={v => updateGuestField('riding_level', v)} options={LEVELS} />
                      <EditableField label="Gender" value={selectedGuest.gender || ''} onSave={v => updateGuestField('gender', v)} options={[{ key: '', label: 'Not set' }, { key: 'Male', label: 'Male' }, { key: 'Female', label: 'Female' }]} />
                      <EditableField label="Room" value={selectedGuest.room_number} onSave={v => updateGuestField('room_number', v)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <EditableField label="Check-in Date" value={selectedGuest.check_in_date} onSave={v => updateGuestField('check_in_date', v)} type="date" />
                      <EditableField label="Check-out Date" value={selectedGuest.check_out_date} onSave={v => updateGuestField('check_out_date', v)} type="date" />
                    </div>
                    <div style={{ marginBottom: 8 }}><EditableField label="Notes" value={selectedGuest.notes || ''} onSave={v => updateGuestField('notes', v)} /></div>
                    <div style={{ position: 'relative' }}>
                      <EditableField label="Horse Request" value={selectedGuest.horse_request || ''} onSave={v => updateGuestField('horse_request', v)} />
                      {selectedGuest.horse_request && (
                        <button
                          onClick={() => assignHorse(selectedGuest.horse_request, activeAssignments.length === 0 ? 'primary' : 'secondary')}
                          disabled={assigningHorse === selectedGuest.horse_request}
                          style={{ position: 'absolute', right: 8, bottom: 8, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {assigningHorse === selectedGuest.horse_request ? '...' : 'Assign'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assigned horses */}
                  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 14 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Horses</h3>
                    {activeAssignments.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>None assigned yet</p>
                      : activeAssignments.map((a, i) => {
                        const histRec = guestHistory.find(h => h.horse_name === a.horse_name && !h.doesnt_work)
                        const isLoved = a.loves_horse ?? histRec?.loves_horse ?? false
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 7, background: 'var(--color-bg)' }}>
                            <span style={{ fontSize: 16 }}>🐴</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{a.horse_name}</span>
                              <button onClick={() => updateAssignmentType(a.id, a.assignment_type)} title="Tap to cycle: primary → secondary → additional" style={{ fontSize: 10, marginLeft: 7, padding: '1px 6px', borderRadius: 999, background: a.assignment_type === 'primary' ? 'var(--color-success-bg)' : a.assignment_type === 'secondary' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)', color: a.assignment_type === 'primary' ? 'var(--color-success)' : a.assignment_type === 'secondary' ? 'var(--color-warning)' : 'var(--color-info)', fontWeight: 600, cursor: 'pointer', border: 'none' }}>{a.assignment_type} ↻</button>
                            </div>
                            {/* Loves this horse toggle — always shown for any active assignment */}
                            <button onClick={() => setLovesHorse(a.id, a.horse_name, isLoved)} title={isLoved ? 'Remove loves signal' : 'Mark as loves this horse'} style={{ fontSize: 15, background: isLoved ? '#fda4af' : 'var(--color-bg)', border: '1px solid', borderColor: isLoved ? '#fb7185' : 'var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px 7px', lineHeight: 1.3 }}>❤️</button>
                            <button onClick={() => setDoesntWorkTarget({ horseName: a.horse_name, assignmentId: a.id })} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-warning-border)', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', cursor: 'pointer' }}>Doesn&apos;t work</button>
                            <button onClick={() => removeAssignment(a.id)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer' }}>Remove</button>
                          </div>
                        )
                      })}

                    {/* Doesn't work pills with clear option */}
                    {incompatibleHorses.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Doesn&apos;t work with:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {incompatibleHorses.map(a => (
                            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)' }}>
                              {a.horse_name}{a.reason ? ` — ${a.reason}` : ''}
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearDoesntWork(a.horse_name, a.id); }} onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); clearDoesntWork(a.horse_name, a.id); }} title="Clear this signal" style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-danger)', padding: 0, lineHeight: 1, opacity: 0.7, minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                      <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 7, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Manual assignment</p>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <HorseAutocomplete value={manualHorse} onChange={setManualHorse} placeholder="Type horse name..." horses={dbHorses.filter(h => h.is_active).map(h => h.name)} />
                        <select value={manualType} onChange={e => setManualType(e.target.value)} style={{ fontSize: 13, width: 120 }}>
                          <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="additional">Additional</option>
                        </select>
                        <button onClick={saveManualHorse} disabled={savingManual || !manualHorse.trim()} style={{ padding: '8px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{savingManual ? 'Saving...' : 'Assign'}</button>
                      </div>
                    </div>
                  </div>

                  {/* Horse matches */}
                  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horse Matches</h3>
                      </div>
                      <button onClick={() => runMatch(selectedGuest, dismissedHorses)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-2)', cursor: 'pointer' }}>Refresh all</button>
                    </div>
                    {matchLoading && matches.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '12px 0' }}>Scanning the herd...</p>
                      : matches.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No matches found</p>
                      : <>{matches.map((m, i) => {
                        const isDouble = m.availability === 'double_assigned'; const isSingle = m.availability === 'single_assigned'
                        return (
                          <div key={m.name} style={{ border: `1px solid ${m.lovesThisHorse ? '#fda4af' : isDouble ? 'var(--color-warning-border)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', padding: '11px 13px', marginBottom: 9, background: m.lovesThisHorse ? '#fff1f2' : isDouble ? 'var(--color-warning-bg)' : 'var(--color-bg)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 7 }}>
                              <span style={{ fontSize: 16 }}>🐴</span>
                              <div style={{ flex: 1 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span></div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>#{i + 1}</span>
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, background: m.fit === 'exact' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', color: m.fit === 'exact' ? 'var(--color-success)' : 'var(--color-warning)' }}>{m.fit === 'exact' ? 'Exact' : 'Adjacent'}</span>
                                {isDouble && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>Double</span>}
                                {isSingle && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600 }}>Assigned</span>}
                                {m.lovesThisHorse && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fda4af', color: '#9f1239', fontWeight: 600, border: '1px solid #fb7185' }}>❤️ Loves</span>}
                                {m.rodeThisBefore && !m.lovesThisHorse && (
                                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontWeight: 600, border: '1px solid #c4b5fd' }}>
                                    {m.pastMatchQuality === 1 ? '✓ Good match' : '🔄 Rode before'}
                                  </span>
                                )}
                                {m.shoeWarning === 'red' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', fontWeight: 600, border: '1px solid #fca5a5' }}>🔴 Shoes</span>}
                                {m.shoeWarning === 'amber' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 600, border: '1px solid #fcd34d' }}>🟠 Shoes</span>}
                              </div>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, marginBottom: m.warning ? 7 : 0 }}>{m.reason}</p>
                            {m.warning && <p style={{ fontSize: 11, color: 'var(--color-warning)', padding: '4px 7px', background: 'rgba(255,255,255,0.5)', borderRadius: 'var(--radius-sm)', marginBottom: 7 }}>⚠ {m.warning}</p>}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button onClick={() => assignHorse(m.name, activeAssignments.length === 0 ? 'primary' : activeAssignments.length === 1 ? 'secondary' : 'additional')} disabled={assigningHorse === m.name} style={{ flex: 1, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{assigningHorse === m.name ? 'Assigning...' : 'Assign'}</button>
                              <button onClick={() => dismissHorse(m.name)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, color: 'var(--color-text-3)', cursor: 'pointer' }}>✕</button>
                            </div>
                          </div>
                        )
                      })}{matchLoading && <p style={{ fontSize: 12, color: 'var(--color-text-3)', textAlign: 'center', padding: '6px 0', fontStyle: 'italic' }}>Finding more matches...</p>}</>}
                  </div>

                  {/* Ride history for this visit */}
                  {(guestHistory.length > 0 || historyLoading) && (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ride History</h3>
                      {historyLoading ? <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Loading...</p>
                        : guestHistory.map(rec => (
                          <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--color-border)' }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>🐴 {rec.horse_name}</span>
                            {rec.loves_horse && <span style={{ fontSize: 13 }}>❤️</span>}
                            {rec.match_quality === 1 && !rec.loves_horse && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)', fontWeight: 600 }}>Good match</span>}
                            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{rec.assigned_date}</span>
                            {rec.doesnt_work && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>{rec.doesnt_work_reason ? `✗ ${rec.doesnt_work_reason}` : "Didn't work"}</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY VIEW ── */}
        {guestViewMode === 'history' && (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }} className='guest-split'>
            {/* Archived guest list — document/table style */}
            <div style={{ width: (selectedArchived || selectedHistoryGuest) ? 320 : '100%', maxWidth: (selectedArchived || selectedHistoryGuest) ? 320 : 'none', borderRight: (selectedArchived || selectedHistoryGuest) ? '1px solid var(--color-border)' : 'none', overflowY: 'auto', flexShrink: 0, background: 'var(--color-surface)' }}>
              {archivedLoading ? (
                <p style={{ padding: 20, color: 'var(--color-text-3)', textAlign: 'center', fontSize: 13 }}>Loading history...</p>
              ) : filteredCheckedOut.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{historySearch ? 'No matches' : 'No checked-out guests yet'}</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>Past guests appear here after Check Out</p>
                </div>
              ) : (
                <>
                  {/* Count + column header row */}
                  <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-3)' }}>{filteredCheckedOut.length} total guests</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 44px', gap: 8, padding: '7px 14px', borderBottom: '2px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Guest</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last visit</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Signals</span>
                  </div>
                  {pagedCheckedOut.map(g => {
                    const ag = archivedGuests.find(a => a.guest_name === g.name)
                    const lovesRecs = ag?.records.filter(r => r.loves_horse) || []
                    const doesntWorkRecs = ag?.records.filter(r => r.doesnt_work) || []
                    const goodRecs = ag?.records.filter(r => !r.doesnt_work && r.match_quality === 1 && !r.loves_horse) || []
                    const uniqueHorses = ag?.records.map(r => r.horse_name).filter((n, i, a) => a.indexOf(n) === i) || []
                    const isSelected = selectedHistoryGuest?.id === g.id
                    return (
                      <div key={g.id} onClick={() => {
                        if (isSelected) { setSelectedArchived(null); setSelectedHistoryGuest(null) }
                        else { setSelectedArchived(ag || null); setSelectedHistoryGuest(g) }
                      }}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 90px 44px', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--color-border)', background: isSelected ? 'var(--color-accent-bg)' : 'transparent', borderLeft: `3px solid ${isSelected ? 'var(--color-accent)' : 'transparent'}`, cursor: 'pointer' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {uniqueHorses.slice(0, 3).join(', ')}{uniqueHorses.length > 3 ? ` +${uniqueHorses.length - 3}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', paddingTop: 2 }}>{(g.checked_out_at || '').slice(0, 10)}</div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start', paddingTop: 2, justifyContent: 'flex-end' }}>
                          {lovesRecs.length > 0 && <span title={`Loves: ${lovesRecs.map(r => r.horse_name).join(', ')}`} style={{ fontSize: 12 }}>❤️</span>}
                          {goodRecs.length > 0 && <span title={`Good match: ${goodRecs.map(r => r.horse_name).join(', ')}`} style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 700 }}>✓</span>}
                          {doesntWorkRecs.length > 0 && <span title={`Didn't work: ${doesntWorkRecs.map(r => r.horse_name).join(', ')}`} style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>✗</span>}
                        </div>
                      </div>
                    )
                  })}
                  {filteredCheckedOut.length > HISTORY_PAGE_SIZE && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '2px solid var(--color-border)' }}>
                      <button onClick={() => setCurrentHistoryPage(p => Math.max(1, p - 1))} disabled={currentHistoryPage === 1} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: currentHistoryPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: currentHistoryPage === 1 ? 'default' : 'pointer' }}>← Previous</button>
                      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Page {currentHistoryPage} of {historyTotalPages}</span>
                      <button onClick={() => setCurrentHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={currentHistoryPage === historyTotalPages} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: currentHistoryPage === historyTotalPages ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: currentHistoryPage === historyTotalPages ? 'default' : 'pointer' }}>Next →</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Archived guest detail — document style */}
            {(selectedArchived || selectedHistoryGuest) && (
              <div style={isMobile ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'var(--color-bg)', overflowY: 'auto' } : { flex: 1, overflowY: 'auto', padding: '24px 28px', minWidth: 0, background: 'var(--color-bg)' }}>
                {isMobile && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingLeft: 16, paddingRight: 16, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <button onClick={() => { setSelectedArchived(null); setSelectedHistoryGuest(null) }} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer' }}>← History</button>
                    <button onClick={() => { setSelectedArchived(null); setSelectedHistoryGuest(null) }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                )}
                <div style={isMobile ? { padding: '12px 16px 32px 16px' } : {}}>
                {!isMobile && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={() => { setSelectedArchived(null); setSelectedHistoryGuest(null) }} title="Close" style={{ fontSize: 14, lineHeight: 1, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}>✕</button>
                  </div>
                )}
                {selectedArchived ? (
                <div style={{ maxWidth: 580 }}>
                  {/* Document header */}
                  <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--color-border)' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{selectedArchived.guest_name}</h2>
                    <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 4 }}>
                      Last visit archived {selectedArchived.checkout_date.slice(0, 10)} · {selectedArchived.records.length} ride record{selectedArchived.records.length !== 1 ? 's' : ''}
                    </p>
                    {/* Signal summary line */}
                    {(() => {
                      const lv = selectedArchived.records.filter(r => r.loves_horse).map(r => r.horse_name)
                      const dw = selectedArchived.records.filter(r => r.doesnt_work).map(r => r.horse_name)
                      const gm = selectedArchived.records.filter(r => !r.doesnt_work && r.match_quality === 1 && !r.loves_horse).map(r => r.horse_name)
                      return (lv.length > 0 || dw.length > 0 || gm.length > 0) ? (
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                          {lv.length > 0 && <span style={{ fontSize: 12, color: '#9f1239', fontWeight: 600 }}>❤️ Loves: {lv.filter((n, i, a) => a.indexOf(n) === i).join(', ')}</span>}
                          {gm.length > 0 && <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>✓ Good match: {gm.filter((n, i, a) => a.indexOf(n) === i).join(', ')}</span>}
                          {dw.length > 0 && <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>✗ Didn't work: {dw.filter((n, i, a) => a.indexOf(n) === i).join(', ')}</span>}
                        </div>
                      ) : null
                    })()}
                  </div>

                  {/* Ride history table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horse</th>
                        <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signal</th>
                        <th style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rides = selectedArchived.records.filter(r => r.source !== 'checkout_only')
                        if (rides.length === 0) return (
                          <tr>
                            <td colSpan={4} style={{ padding: '12px 8px', color: 'var(--color-text-3)', fontSize: 12 }}>No rides recorded during this visit</td>
                          </tr>
                        )
                        return rides.map(rec => (
                          <tr key={rec.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '9px 8px', fontSize: 12, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{rec.assigned_date}</td>
                            <td style={{ padding: '9px 8px', fontSize: 13, fontWeight: 500 }}>{rec.horse_name}</td>
                            <td style={{ padding: '9px 8px', fontSize: 12 }}>
                              {rec.loves_horse && <span style={{ color: '#e11d48', fontWeight: 600 }}>❤️ Loves</span>}
                              {rec.match_quality === 1 && !rec.loves_horse && <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Good match</span>}
                              {rec.doesnt_work && <span style={{ color: '#dc2626', fontWeight: 600 }}>{rec.doesnt_work_reason ? `✗ ${rec.doesnt_work_reason}` : "✗ Didn't work"}</span>}
                            </td>
                            <td style={{ padding: '9px 8px', fontSize: 11, color: 'var(--color-text-3)', textTransform: 'capitalize' }}>{rec.assignment_type}</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
                ) : (
                <div style={{ maxWidth: 580 }}>
                  {/* Header */}
                  <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--color-border)' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{selectedHistoryGuest!.name}</h2>
                    <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 4 }}>
                      Checked out {(selectedHistoryGuest!.checked_out_at || '').slice(0, 10)}
                    </p>
                  </div>
                  {/* Guest details grid — read-only */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Weight', value: selectedHistoryGuest!.weight ? `${selectedHistoryGuest!.weight} lbs` : '—' },
                      { label: 'Height', value: selectedHistoryGuest!.height || '—' },
                      { label: 'Level', value: LEVEL_LABELS[selectedHistoryGuest!.riding_level] || selectedHistoryGuest!.riding_level || '—' },
                      { label: 'Gender', value: selectedHistoryGuest!.gender || '—' },
                      { label: 'Room', value: selectedHistoryGuest!.room_number || '—' },
                      { label: 'Check-in', value: selectedHistoryGuest!.check_in_date || '—' },
                    ].map(field => (
                      <div key={field.label} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{field.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{field.value}</div>
                      </div>
                    ))}
                  </div>
                  {selectedHistoryGuest!.notes && (
                    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)', marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notes</div>
                      <div style={{ fontSize: 13 }}>{selectedHistoryGuest!.notes}</div>
                    </div>
                  )}
                  {/* Horse assignments from horse_assignments table */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Horse Assignments</div>
                  {(() => {
                    const assignments = (selectedHistoryGuest!.horse_assignments || []).filter(a => a.horse_name && a.horse_name !== '—')
                    if (assignments.length === 0) return (
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No ride records found</p>
                    )
                    return assignments.map((a, i) => (
                      <div key={a.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>🐴</span>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{a.horse_name}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontWeight: 600, border: '1px solid var(--color-success-border)', textTransform: 'capitalize' }}>{a.assignment_type}</span>
                        {a.incompatible && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', fontWeight: 600, border: '1px solid #fca5a5' }}>Didn't work</span>}
                      </div>
                    ))
                  })()}
                </div>
                )}
                </div>
              </div>
            )}
          </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .guest-main { overflow-y: auto !important; display: block !important; -webkit-overflow-scrolling: touch !important; touch-action: pan-y !important; }
            .guest-split { flex-direction: column !important; height: auto !important; flex: initial !important; min-height: initial !important; }
            .guest-split > div:first-child { width: 100% !important; border-right: none !important; border-bottom: 1px solid #e8e0d5; overflow-y: visible !important; }
            .guest-profile-panel { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; z-index: 200 !important; background: var(--color-bg) !important; overflow-y: auto !important; padding: 0 !important; -webkit-overflow-scrolling: touch !important; }
            .guest-header { padding-left: 12px !important; padding-right: 12px !important; padding-top: max(12px, env(safe-area-inset-top)) !important; flex-wrap: wrap !important; }
            .guest-actions { width: 100% !important; flex-wrap: wrap !important; justify-content: flex-end !important; padding-right: 0 !important; }
            .guest-actions > input[type=text], .guest-actions > input:not([type]) { flex: 1 !important; min-width: 80px !important; width: auto !important; }
          }
        ` }} />
      </main>

      {showAdd && <AddGuestModal onClose={() => setShowAdd(false)} onSaved={fetchGuests} horseNames={dbHorses.filter(h => h.is_active).map(h => h.name)} />}

      {/* Doesn't work reason modal */}
      {doesntWorkTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 360 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Why doesn&apos;t {doesntWorkTarget.horseName} work?</h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 12 }}>Optional — leave blank if no specific reason</p>
            <input placeholder="e.g. Too spirited, scared of them, fell off..." value={doesntWorkReason} onChange={e => setDoesntWorkReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && markIncompatible(doesntWorkTarget.horseName, doesntWorkTarget.assignmentId, doesntWorkReason)} autoFocus style={{ width: '100%', fontSize: 13, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={() => { setDoesntWorkTarget(null); setDoesntWorkReason('') }} style={{ flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>Cancel</button>
              <button onClick={() => markIncompatible(doesntWorkTarget.horseName, doesntWorkTarget.assignmentId, doesntWorkReason)} style={{ flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark — Doesn&apos;t Work</button>
            </div>
          </div>
        </div>
      )}

      {assignAllPhase === 'running' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: '32px 40px', minWidth: 320, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Building Assignments</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 20, minHeight: 20 }}>{assignAllProgress}</div>
            <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--color-accent)', borderRadius: 999, width: `${assignAllPct}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>
      )}
      {assignAllPhase === 'draft' && (
        <AssignAllDraft
          initialRows={draftRows}
          onConfirm={confirmAssignAll}
          onCancel={() => { setAssignAllPhase('idle'); setDraftRows([]) }}
          horseMap={Object.fromEntries(dbHorses.filter(h => h.is_active).map(h => [h.name, { level: h.level, weight: h.weight }]))}
          pastRideMap={assignAllPastRideMap}
        />
      )}
    </div>
  )
}

type RepeatHistoryRecord = { horse_name: string; assigned_date: string; doesnt_work: boolean; loves_horse: boolean; riding_level?: string; assignment_type: string }

function AddGuestModal({ onClose, onSaved, horseNames = [] }: { onClose: () => void; onSaved: () => void; horseNames?: string[] }) {
  const [form, setForm] = useState({ name: '', room_number: '', check_in_date: '', check_out_date: '', age: '', weight: '', height: '', riding_level: '', gender: '', notes: '', horse_request: '', repeat_guest: 'no' as 'yes' | 'no' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [returningInfo, setReturningInfo] = useState<{ lastHorse: string; lastDate: string; loves: boolean } | null>(null)
  const [repeatHistory, setRepeatHistory] = useState<RepeatHistoryRecord[] | null>(null)
  const [repeatHistoryLoading, setRepeatHistoryLoading] = useState(false)

  async function checkReturning(name: string) {
    if (!name || name.length < 3) { setReturningInfo(null); return }
    try {
      const res = await fetch(`/api/assignment-history?check_returning=${encodeURIComponent(name)}`).then(r => r.json())
      if (res.isReturning && res.records?.[0]) {
        const rec = res.records[0]
        const lovesRec = res.records.find((r: { loves_horse: boolean }) => r.loves_horse)
        setReturningInfo({ lastHorse: lovesRec?.horse_name || rec.horse_name, lastDate: rec.assigned_date, loves: !!lovesRec })
      } else { setReturningInfo(null) }
    } catch { setReturningInfo(null) }
  }

  async function loadRepeatHistory(name: string) {
    if (!name || name.length < 3) { setRepeatHistory(null); return }
    setRepeatHistoryLoading(true)
    try {
      const res = await fetch(`/api/assignment-history?check_returning=${encodeURIComponent(name)}`).then(r => r.json())
      if (res.records?.length > 0) {
        setRepeatHistory(res.records)
      } else {
        setRepeatHistory([])
      }
    } catch { setRepeatHistory([]) } finally { setRepeatHistoryLoading(false) }
  }

  function handleRepeatGuestToggle(val: 'yes' | 'no') {
    setForm(prev => ({ ...prev, repeat_guest: val }))
    if (val === 'yes' && form.name.length >= 3) {
      loadRepeatHistory(form.name)
    } else if (val === 'no') {
      setRepeatHistory(null)
    }
  }

  async function save(addAnother: boolean) {
    if (!form.name || !form.riding_level) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/guests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, age: form.age ? parseInt(form.age) : null, weight: form.weight ? parseInt(form.weight) : null, repeat_guest: form.repeat_guest === 'yes' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved()
      if (addAnother) { setCount(c => c + 1); setLastSaved(form.name); setReturningInfo(null); setRepeatHistory(null); setForm(prev => ({ name: '', room_number: '', check_in_date: prev.check_in_date, check_out_date: prev.check_out_date, age: '', weight: '', height: '', riding_level: '', gender: '', notes: '', horse_request: '', repeat_guest: 'no' })); setTimeout(() => setLastSaved(null), 2000) }
      else { onClose() }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save guest — check your connection and try again')
    } finally { setSaving(false) }
  }

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Add Guest {count > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>({count} added)</span>}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>
        {lastSaved && <div style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>✓ {lastSaved} saved — enter next guest</div>}
        {saveError && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#dc2626', fontWeight: 500 }}>⚠ {saveError}</div>}
        {returningInfo && (
          <div style={{ background: returningInfo.loves ? '#fff1f2' : '#ede9fe', border: `1px solid ${returningInfo.loves ? '#fda4af' : '#c4b5fd'}`, borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13, color: returningInfo.loves ? '#9f1239' : '#6d28d9', fontWeight: 500 }}>
            {returningInfo.loves ? '❤️' : '🔄'} Returning guest! {returningInfo.loves ? `Loves ${returningInfo.lastHorse}` : `Last rode ${returningInfo.lastHorse}`} on {returningInfo.lastDate}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, paddingBottom: 80 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Full Name *</label>
            <input placeholder="e.g. Sharon Bryant" value={form.name} onChange={f('name')} onBlur={() => { checkReturning(form.name); if (form.repeat_guest === 'yes') loadRepeatHistory(form.name) }} autoFocus />
          </div>
          <div><label>Room Number</label><input placeholder="e.g. 25" value={form.room_number} onChange={f('room_number')} /></div>
          <div><label>Gender</label><select value={form.gender} onChange={f('gender')}><option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
          <div><label>Riding Level *</label><select value={form.riding_level} onChange={f('riding_level')}><option value="">Select...</option>{LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select></div>
          <div><label>Age</label><input type="number" placeholder="e.g. 42" value={form.age} onChange={f('age')} /></div>
          <div><label>Check-in Date</label><input type="date" value={form.check_in_date} onChange={f('check_in_date')} /></div>
          <div><label>Check-out Date</label><input type="date" value={form.check_out_date} onChange={f('check_out_date')} /></div>
          <div><label>Height</label><input placeholder="e.g. 5'9&quot;" value={form.height} onChange={f('height')} /></div>
          <div><label>Weight (lbs)</label><input type="number" placeholder="e.g. 175" value={form.weight} onChange={f('weight')} /></div>
          <div style={{ gridColumn: '1/-1' }}><label>Notes</label><textarea rows={2} placeholder="Injuries, nervous rider, wants smooth horse..." value={form.notes} onChange={f('notes')} style={{ resize: 'vertical' }} /></div>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Repeat guest?</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {(['no', 'yes'] as const).map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleRepeatGuestToggle(val)}
                  style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontWeight: form.repeat_guest === val ? 600 : 400, border: `1px solid ${form.repeat_guest === val ? 'var(--color-accent)' : 'var(--color-border)'}`, background: form.repeat_guest === val ? 'var(--color-accent)' : 'var(--color-surface)', color: form.repeat_guest === val ? '#fff' : 'var(--color-text-2)' }}
                >
                  {val === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            {form.repeat_guest === 'yes' && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Previous visit records</p>
                {repeatHistoryLoading && <p style={{ fontSize: 12, color: 'var(--color-text-3)', fontStyle: 'italic' }}>Looking up history...</p>}
                {!repeatHistoryLoading && repeatHistory === null && <p style={{ fontSize: 12, color: 'var(--color-text-3)', fontStyle: 'italic' }}>Enter the guest&apos;s name above to look up history</p>}
                {!repeatHistoryLoading && repeatHistory !== null && repeatHistory.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-3)', fontStyle: 'italic' }}>No previous visit records found</p>}
                {!repeatHistoryLoading && repeatHistory && repeatHistory.length > 0 && (
                  <div>
                    {repeatHistory.map((rec, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < repeatHistory.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>🐴 {rec.horse_name}</span>
                        {rec.loves_horse && <span style={{ fontSize: 11, color: '#e11d48', fontWeight: 600 }}>❤️</span>}
                        {rec.doesnt_work && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>✗ Didn&apos;t work</span>}
                        <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 'auto' }}>{rec.assigned_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Horse Request</label>
            <HorseAutocomplete value={form.horse_request} onChange={v => setForm(prev => ({ ...prev, horse_request: v }))} placeholder="e.g. Ringo" horses={horseNames} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, position: 'sticky', bottom: 0, background: 'var(--color-surface)', padding: '12px 16px', borderTop: '1px solid var(--color-border)', zIndex: 10, marginLeft: -22, marginRight: -22, marginBottom: -22 }}>
          <button onClick={() => save(false)} disabled={saving || !form.name || !form.riding_level} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Guest'}</button>
          <button onClick={() => save(true)} disabled={saving || !form.name || !form.riding_level} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--color-text-2)' }}>Save + Add Another</button>
        </div>
      </div>
    </div>
  )
}

// Autocomplete uses position:fixed for its dropdown (escapes overflow:hidden scroll containers).
// Never conditionally unmount this component — that loses input focus.
function DraftHorseAutocomplete({ value, onChange, horses }: { value: string; onChange: (v: string) => void; horses: string[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  function handleInput(v: string) {
    onChange(v)
    const hits = v.length >= 1 ? horses.filter(n => n.toLowerCase().includes(v.toLowerCase())).slice(0, 8) : []
    if (hits.length > 0 && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 2, left: r.left, width: r.width })
    }
    setSuggestions(hits); setShow(hits.length > 0)
  }

  return (
    <>
      <input ref={inputRef} value={value} onChange={e => handleInput(e.target.value)} onBlur={() => setTimeout(() => setShow(false), 150)} placeholder="Type horse name..." style={{ width: '100%', fontSize: 13 }} />
      {show && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 400, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto' }}>
          {suggestions.map(name => <div key={name} onMouseDown={() => { onChange(name); setShow(false) }} style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>🐴 {name}</div>)}
        </div>
      )}
    </>
  )
}

function AssignAllDraft({ initialRows, onConfirm, onCancel, horseMap, pastRideMap }: {
  initialRows: DraftRow[]
  onConfirm: (rows: DraftRow[]) => Promise<void>
  onCancel: () => void
  horseMap: Record<string, { level: string; weight: number | null }>
  pastRideMap: Record<string, Record<string, PastRideDetail>>
}) {
  const [rows, setRows] = useState<DraftRow[]>(initialRows)
  const [saving, setSaving] = useState(false)
  const today = getTucsonToday()
  const tomorrow = getTucsonTomorrow()

  function updateHorse(guestId: string, horseName: string) {
    setRows(prev => prev.map(r => r.guest.id === guestId ? { ...r, suggestedHorse: horseName || null, needsReview: !horseName, isDouble: false } : r))
  }
  function toggleFlag(guestId: string) {
    setRows(prev => prev.map(r => r.guest.id === guestId ? { ...r, flagged: !r.flagged } : r))
  }
  async function handleConfirm() { setSaving(true); await onConfirm(rows); setSaving(false) }

  const toSave = rows.filter(r => r.suggestedHorse && !r.flagged)
  const toSkip = rows.filter(r => !r.suggestedHorse || r.flagged)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Draft Assignments</h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{toSave.length} will be assigned{toSkip.length > 0 ? ` · ${toSkip.length} skipped` : ''} · Review each row, then confirm</p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-2)' }}>Cancel</button>
          <button onClick={handleConfirm} disabled={saving || toSave.length === 0} style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: toSave.length === 0 ? '#c4a47a' : 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving || toSave.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {saving ? 'Saving...' : `Confirm ${toSave.length} Assignment${toSave.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }} className="draft-list">
        {rows.map(row => {
          const { guest, suggestedHorse, isDouble, needsReview, flagged } = row
          const horse = suggestedHorse ? horseMap[suggestedHorse] : null
          const guestLevelIdx = LEVEL_ORDER.indexOf(guest.riding_level)
          const horseLevelIdx = horse ? LEVEL_ORDER.indexOf(horse.level) : -1
          const levelDiff = horse && guestLevelIdx >= 0 && horseLevelIdx >= 0 ? Math.abs(guestLevelIdx - horseLevelIdx) : null
          const matchQuality = levelDiff === null ? null : levelDiff === 0 ? 'exact' : levelDiff === 1 ? 'adjacent' : 'mismatch'
          const nearWeight = !!(horse && horse.weight !== null && guest.weight && (horse.weight - guest.weight) <= 20)
          const checkingOutToday = guest.check_out_date === today
          const checkingOutTomorrow = !checkingOutToday && guest.check_out_date === tomorrow
          // Past ride info for this guest + suggested horse
          const pastRide = suggestedHorse ? pastRideMap[guest.name.toLowerCase()]?.[suggestedHorse] : null

          const bg = flagged ? 'var(--color-bg)' : needsReview ? 'var(--color-danger-bg)' : isDouble ? '#fef3c7' : 'var(--color-surface)'
          const border = flagged ? 'var(--color-border)' : needsReview ? 'var(--color-danger-border)' : isDouble ? '#fcd34d' : 'var(--color-border)'

          return (
            <div key={guest.id} style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr 36px', gap: 10, alignItems: 'start', padding: '10px 14px', marginBottom: 7, background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-md)', opacity: flagged ? 0.5 : 1 }} className="draft-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{guest.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>
                  Rm {guest.room_number}{guest.riding_level ? ` · ${guest.riding_level}` : ''}{guest.weight ? ` · ${guest.weight} lbs` : ''}{guest.height ? ` · ${guest.height}` : ''}{guest.age ? ` · Age ${guest.age}` : ''}
                </div>
                {(checkingOutToday || checkingOutTomorrow) && (
                  <div style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Checkout {checkingOutToday ? 'today' : 'tomorrow'}</span>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14, paddingTop: 3 }}>→</div>

              <div>
                <DraftHorseAutocomplete value={suggestedHorse || ''} onChange={v => updateHorse(guest.id, v)} horses={Object.keys(horseMap)} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                  {matchQuality === 'exact' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>🟢 Good match</span>}
                  {matchQuality === 'adjacent' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>🟡 Adjacent</span>}
                  {matchQuality === 'mismatch' && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>🔴 Mismatch</span>}
                  {isDouble && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 600, whiteSpace: 'nowrap' }}>×2 Double</span>}
                  {needsReview && !suggestedHorse && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>Needs review</span>}
                  {nearWeight && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>⚖️ Near weight limit</span>}
                  {/* Past ride note — informational only, not a block */}
                  {pastRide && !pastRide.doesntWork && (
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: pastRide.loves ? '#fff1f2' : 'var(--color-bg)', color: pastRide.loves ? '#9f1239' : 'var(--color-text-3)', border: `1px solid ${pastRide.loves ? '#fda4af' : 'var(--color-border)'}`, fontWeight: pastRide.loves ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {pastRide.loves ? '❤️ Loves this horse' : 'Rode this horse before'}
                    </span>
                  )}
                  {flagged && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>🚩 Flagged — skip on save</span>}
                </div>
              </div>

              <button onClick={() => toggleFlag(guest.id)} title={flagged ? 'Unflag' : 'Flag — skip on save'} style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: `1px solid ${flagged ? 'var(--color-warning-border)' : 'var(--color-border)'}`, background: flagged ? 'var(--color-warning-bg)' : 'var(--color-surface)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🚩</button>
            </div>
          )
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .draft-list { padding: 8px 12px !important; }
          .draft-row { grid-template-columns: 1fr 20px 1fr 32px !important; gap: 6px !important; }
        }
      ` }} />
    </div>
  )
}
