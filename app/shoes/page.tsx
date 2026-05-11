'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES } from '@/lib/horses'

// TODO: track size history per horse, surface last known size,
// run analytics on shoe types and sizes across the herd

const WORK_OPTIONS = [
  { key: 'fronts',   label: 'Fronts' },
  { key: 'rears',    label: 'Rears' },
  { key: 'all_4s',   label: 'All 4s' },
  { key: 'reset',    label: 'Reset' },
  { key: 'full_set', label: 'Full set' },
]

// Add Horse prompt uses a narrower set — Reset and Full set belong in visit history
const NEEDS_WORK_OPTIONS = [
  { key: 'fronts',  label: 'Fronts' },
  { key: 'rears',   label: 'Rears' },
  { key: 'all_4s',  label: 'All 4s' },
]

const WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', reset: 'Reset', full_set: 'Full set',
}

const SHOE_TYPES = [
  { key: 'regular',  label: 'Regular' },
  { key: 'nb',       label: 'NB' },
  { key: 'nb_pad',   label: 'NB+Pad' },
  { key: 'plastics', label: 'Plastics' },
]

const SHOE_SIZES = ['', '000', '00', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const PLACEMENT_OPTIONS = [
  { key: '',        label: '— placement —' },
  { key: 'x4',      label: 'x4' },
  { key: 'fronts',  label: 'Fronts' },
  { key: 'rears',   label: 'Rears' },
  { key: '1_front', label: '1 Front' },
  { key: '1_rear',  label: '1 Rear' },
  { key: 'other',   label: 'Other' },
]

const TYPE_FILTER_CHIPS = [
  { key: 'all',      label: 'All' },
  { key: 'regular',  label: 'Regular' },
  { key: 'nb',       label: 'NB' },
  { key: 'nb_pad',   label: 'NB+Pad' },
  { key: 'plastics', label: 'Plastics' },
]

type ShoeNeed = {
  id: string
  horse_name: string
  what_needed: string
  shoe_type: string
  is_drugger: boolean
  notes: string | null
  created_at: string
}

type FarrierVisitHorse = {
  id: string
  visit_id: string
  horse_name: string
  work_done: string
  shoe_type: string | null
  shoe_size: string | null
  placement: string | null
  notes: string | null
}

type FarrierVisit = {
  id: string
  visit_date: string
  farrier_name: string
  created_at: string
  farrier_visit_horses: FarrierVisitHorse[]
}

type DoneForm = { visit_date: string; farrier_name: string; shoe_type: string; notes: string }

type LogHorse = {
  horse_name: string
  work_done: string
  shoe_type: string
  shoe_size: string
  placement: string | null
  notes: string
}

function weeksSince(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00')
  return Math.floor((Date.now() - date.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00')
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
}

function lastKnownShoeType(horseName: string, visits: FarrierVisit[]): string {
  for (const v of visits) {
    const h = v.farrier_visit_horses.find(fh => fh.horse_name === horseName && fh.shoe_type)
    if (h?.shoe_type) return h.shoe_type
  }
  return 'regular'
}

function ShoeTypeBadge({ shoeType }: { shoeType: string }) {
  if (shoeType === 'regular') {
    return <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>Reg</span>
  }
  const label = SHOE_TYPES.find(t => t.key === shoeType)?.label ?? shoeType
  const isPlastics = shoeType === 'plastics'
  return (
    <span style={{
      fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 700, flexShrink: 0,
      background: isPlastics ? '#ede9fe' : '#fef3c7',
      color: isPlastics ? '#7c3aed' : '#92400e',
      border: `1px solid ${isPlastics ? '#c4b5fd' : '#fcd34d'}`,
    }}>
      {label}
    </span>
  )
}

function HorseAutocomplete({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)

  function handleInput(v: string) {
    onChange(v)
    if (v.length >= 2) {
      const matches = HORSES
        .filter(h => h.name.toLowerCase().includes(v.toLowerCase()) && h.status === 'active')
        .map(h => h.name)
        .slice(0, 6)
      setSuggestions(matches)
      setShow(matches.length > 0)
    } else {
      setShow(false)
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder={placeholder || 'Horse name...'}
        style={{ width: '100%', fontSize: 13 }}
      />
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2 }}>
          {suggestions.map(name => (
            <div
              key={name}
              onMouseDown={() => { onChange(name); setShow(false) }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
            >
              🐴 {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NeedRow({
  need, onUpdate, onRemove, onToggleDrugger, onViewProfile,
  markingDone, setMarkingDone, doneForm, setDoneForm, onMarkDone, saving,
}: {
  need: ShoeNeed
  onUpdate: (id: string, field: string, value: string) => void
  onRemove: (id: string) => void
  onToggleDrugger: (id: string, currentValue: boolean) => void
  onViewProfile: (need: ShoeNeed) => void
  markingDone: string | null
  setMarkingDone: (id: string | null) => void
  doneForm: DoneForm
  setDoneForm: (f: DoneForm) => void
  onMarkDone: (need: ShoeNeed) => void
  saving: boolean
}) {
  const [horseName, setHorseName] = useState(need.horse_name)
  const [notes, setNotes] = useState(need.notes || '')
  useEffect(() => { setHorseName(need.horse_name) }, [need.horse_name])
  useEffect(() => { setNotes(need.notes || '') }, [need.notes])

  const isExpanded = markingDone === need.id

  function toggleExpand() {
    if (isExpanded) {
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '' })
    } else {
      setMarkingDone(need.id)
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: need.shoe_type || 'regular', notes: '' })
    }
  }

  function saveHorseName() {
    const trimmed = horseName.trim()
    if (trimmed && trimmed !== need.horse_name) {
      onUpdate(need.id, 'horse_name', trimmed)
    } else {
      setHorseName(need.horse_name)
    }
  }

  const isRedWork = need.what_needed === 'fronts'
  const created = new Date(need.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div
      onClick={() => onViewProfile(need)}
      style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', marginBottom: 5, cursor: 'pointer' }}
    >
      {/* Row 1: emoji + editable name + drugger + done + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>🐴</span>
        <input
          value={horseName}
          onChange={e => setHorseName(e.target.value)}
          onBlur={saveHorseName}
          onClick={e => e.stopPropagation()}
          onFocus={e => e.stopPropagation()}
          style={{
            fontWeight: 700, fontSize: 13, flex: 1, minWidth: 60,
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'inherit', cursor: 'text', color: 'inherit', padding: 0,
          }}
        />
        <button
          onClick={e => { e.stopPropagation(); onToggleDrugger(need.id, need.is_drugger) }}
          title={need.is_drugger ? 'Remove drugger flag' : 'Mark as drugger'}
          style={{
            fontSize: 11, padding: '1px 5px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
            lineHeight: 1.5,
            border: need.is_drugger ? '1px solid #fca5a5' : '1px solid var(--color-border)',
            background: need.is_drugger ? '#fee2e2' : 'transparent',
            color: need.is_drugger ? '#dc2626' : 'var(--color-text-muted)',
            fontWeight: need.is_drugger ? 700 : 400,
          }}
        >
          💊
        </button>
        <button
          onClick={e => { e.stopPropagation(); toggleExpand() }}
          style={{
            padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            border: `1px solid ${isExpanded ? 'var(--color-border)' : 'var(--color-success-border)'}`,
            background: isExpanded ? 'var(--color-bg)' : 'var(--color-success-bg)',
            color: isExpanded ? 'var(--color-text-3)' : 'var(--color-success)',
          }}
        >
          {isExpanded ? 'Cancel' : '✓ Done'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(need.id) }}
          style={{
            width: 22, height: 22, padding: 0, borderRadius: 'var(--radius-sm)', flexShrink: 0,
            border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Row 2: shoe type badge + work select + date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <ShoeTypeBadge shoeType={need.shoe_type || 'regular'} />
        <select
          value={need.what_needed}
          onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onUpdate(need.id, 'what_needed', e.target.value) }}
          style={{
            fontSize: 11, borderRadius: 999, padding: '1px 5px', fontWeight: 600,
            cursor: 'pointer', flexShrink: 0, appearance: 'none', WebkitAppearance: 'none',
            border: `1px solid ${isRedWork ? '#fca5a5' : '#fcd34d'}`,
            background: isRedWork ? '#fee2e2' : '#fef3c7',
            color: isRedWork ? '#dc2626' : '#92400e',
          }}
        >
          {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Added {created}</span>
      </div>

      {/* Row 3: notes */}
      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (need.notes || '')) onUpdate(need.id, 'notes', notes) }}
        onClick={e => e.stopPropagation()}
        onFocus={e => e.stopPropagation()}
        placeholder="add a note..."
        style={{
          display: 'block', width: '100%', marginTop: 3, fontSize: 11, color: 'var(--color-text-3)',
          background: 'transparent', border: 'none', outline: 'none',
          padding: '0 2px', fontFamily: 'inherit', cursor: 'text', boxSizing: 'border-box',
        }}
      />

      {/* Expanded: record visit */}
      {isExpanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ marginTop: 10, padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Record this visit</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }} className="done-form-grid">
            <div>
              <label>Visit Date</label>
              <input type="date" value={doneForm.visit_date} onChange={e => setDoneForm({ ...doneForm, visit_date: e.target.value })} />
            </div>
            <div>
              <label>Farrier Name</label>
              <input value={doneForm.farrier_name} onChange={e => setDoneForm({ ...doneForm, farrier_name: e.target.value })} placeholder="e.g. John Smith" />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Shoe Type</label>
            <select value={doneForm.shoe_type} onChange={e => setDoneForm({ ...doneForm, shoe_type: e.target.value })} style={{ fontSize: 13 }}>
              {SHOE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Notes for this visit</label>
            <input value={doneForm.notes} onChange={e => setDoneForm({ ...doneForm, notes: e.target.value })} placeholder="Optional..." />
          </div>
          <button
            onClick={() => onMarkDone(need)}
            disabled={saving || !doneForm.visit_date || !doneForm.farrier_name}
            style={{
              padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: saving || !doneForm.visit_date || !doneForm.farrier_name ? 'not-allowed' : 'pointer',
              opacity: saving || !doneForm.visit_date || !doneForm.farrier_name ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save & Remove from list'}
          </button>
        </div>
      )}
    </div>
  )
}

function HorseProfileModal({ need, visits, onClose }: {
  need: ShoeNeed
  visits: FarrierVisit[]
  onClose: () => void
}) {
  const backdropRef = useRef(false)

  const horseVisits = useMemo(() => {
    const result: Array<{
      visit_date: string
      farrier_name: string
      work_done: string
      shoe_type: string | null
      shoe_size: string | null
      placement: string | null
      notes: string | null
    }> = []
    visits.forEach(v => {
      v.farrier_visit_horses.forEach(h => {
        if (h.horse_name === need.horse_name) {
          result.push({
            visit_date: v.visit_date,
            farrier_name: v.farrier_name,
            work_done: h.work_done,
            shoe_type: h.shoe_type,
            shoe_size: h.shoe_size,
            placement: h.placement,
            notes: h.notes,
          })
        }
      })
    })
    return result.sort((a, b) => b.visit_date.localeCompare(a.visit_date))
  }, [need.horse_name, visits])

  const lastVisit = horseVisits[0]
  const lastShodDays = lastVisit ? daysSince(lastVisit.visit_date) : null

  return (
    <div
      onMouseDown={() => { backdropRef.current = true }}
      onMouseUp={() => { if (backdropRef.current) { backdropRef.current = false; onClose() } }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
        style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 2 }}>
              🐴 {need.horse_name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <ShoeTypeBadge shoeType={need.shoe_type || 'regular'} />
              {need.is_drugger && (
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }}>
                  💊 Drugger
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)', flexShrink: 0 }}>✕</button>
        </div>

        {/* Last shod summary */}
        {lastVisit ? (
          <div style={{ padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Last shod</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {new Date(lastVisit.visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
              {lastShodDays} day{lastShodDays !== 1 ? 's' : ''} ago · {weeksSince(lastVisit.visit_date)} weeks · {lastVisit.farrier_name}
            </div>
          </div>
        ) : (
          <div style={{ padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)' }}>No recorded visits yet</div>
          </div>
        )}

        {/* Visit history */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Visit History ({horseVisits.length})
        </div>
        {horseVisits.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '20px 0' }}>No history recorded</p>
        ) : horseVisits.map((v, i) => (
          <div key={i} style={{ padding: '10px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: v.notes ? 4 : 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {new Date(v.visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                {WORK_LABELS[v.work_done] || v.work_done}
              </span>
              {v.shoe_type && v.shoe_type !== 'regular' && <ShoeTypeBadge shoeType={v.shoe_type} />}
              {v.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>sz {v.shoe_size}</span>}
              {v.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{v.placement}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Farrier: {v.farrier_name}</div>
            {v.notes && <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 3 }}>{v.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SuggestionRow({ suggestion, onAdd }: {
  suggestion: { horse_name: string; weeks: number }
  onAdd: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)

  async function handle() {
    setAdding(true)
    try { await onAdd() } finally { setAdding(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 6 }}>
      <span style={{ fontSize: 14 }}>🐴</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{suggestion.horse_name}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{suggestion.weeks} weeks ago</span>
      <button
        onClick={handle}
        disabled={adding}
        style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 500 }}
      >
        {adding ? '...' : 'Add to list'}
      </button>
    </div>
  )
}

export default function ShoesPage() {
  const [needs, setNeeds] = useState<ShoeNeed[]>([])
  const [visits, setVisits] = useState<FarrierVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState<{ horse_name: string; what_needed: string; shoe_type: string; notes: string } | null>(null)
  const [addingSaving, setAddingSaving] = useState(false)
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [doneForm, setDoneForm] = useState<DoneForm>({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '' })
  const [savingDone, setSavingDone] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [showLogVisit, setShowLogVisit] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [profileNeed, setProfileNeed] = useState<ShoeNeed | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [needsRes, visitsRes] = await Promise.all([
        fetch('/api/shoe-needs'),
        fetch('/api/farrier-visits'),
      ])
      const needsData = await needsRes.json()
      const visitsData = await visitsRes.json()
      setNeeds(needsData.needs || [])
      setVisits(visitsData.visits || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const needsHorseNames = useMemo(() => new Set(needs.map(n => n.horse_name)), [needs])

  const filteredNeeds = useMemo(() => {
    if (typeFilter === 'all') return needs
    return needs.filter(n => (n.shoe_type || 'regular') === typeFilter)
  }, [needs, typeFilter])

  const suggestions = useMemo(() => {
    const lastShodMap: Record<string, { date: string; weeks: number }> = {}
    visits.forEach(v => {
      const weeks = weeksSince(v.visit_date)
      v.farrier_visit_horses.forEach(h => {
        if (!lastShodMap[h.horse_name] || v.visit_date > lastShodMap[h.horse_name].date) {
          lastShodMap[h.horse_name] = { date: v.visit_date, weeks }
        }
      })
    })
    return Object.entries(lastShodMap)
      .map(([horse_name, { date, weeks }]) => ({ horse_name, date, weeks }))
      .filter(s => s.weeks >= 6 && !needsHorseNames.has(s.horse_name))
      .sort((a, b) => b.weeks - a.weeks)
  }, [visits, needsHorseNames])

  const filteredVisits = useMemo(() => {
    if (!historySearch) return visits
    const q = historySearch.toLowerCase()
    return visits.filter(v =>
      v.farrier_name.toLowerCase().includes(q) ||
      v.farrier_visit_horses.some(h => h.horse_name.toLowerCase().includes(q))
    )
  }, [visits, historySearch])

  const overdue = suggestions.filter(s => s.weeks >= 10)
  const gettingClose = suggestions.filter(s => s.weeks >= 8 && s.weeks < 10)
  const dueSoon = suggestions.filter(s => s.weeks >= 6 && s.weeks < 8)

  async function addNeed() {
    if (!addForm?.horse_name || !addForm.what_needed) return
    setAddingSaving(true)
    try {
      await fetch('/api/shoe-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horse_name: addForm.horse_name,
          what_needed: addForm.what_needed,
          shoe_type: addForm.shoe_type || 'regular',
          notes: addForm.notes || null,
        }),
      })
      setAddForm(null)
      await fetchData()
    } finally {
      setAddingSaving(false)
    }
  }

  async function updateNeed(id: string, field: string, value: string) {
    setNeeds(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n))
    await fetch('/api/shoe-needs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    })
  }

  async function removeNeed(id: string) {
    setNeeds(prev => prev.filter(n => n.id !== id))
    if (markingDone === id) setMarkingDone(null)
    if (profileNeed?.id === id) setProfileNeed(null)
    await fetch(`/api/shoe-needs?id=${id}`, { method: 'DELETE' })
  }

  async function toggleDrugger(id: string, currentValue: boolean) {
    const is_drugger = !currentValue
    setNeeds(prev => prev.map(n => n.id === id ? { ...n, is_drugger } : n))
    if (profileNeed?.id === id) setProfileNeed(p => p ? { ...p, is_drugger } : p)
    await fetch('/api/shoe-needs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_drugger }),
    })
  }

  async function markDone(need: ShoeNeed) {
    if (!doneForm.visit_date || !doneForm.farrier_name) return
    setSavingDone(true)
    try {
      const visitRes = await fetch('/api/farrier-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: doneForm.visit_date,
          farrier_name: doneForm.farrier_name,
          horses: [{
            horse_name: need.horse_name,
            work_done: need.what_needed,
            shoe_type: doneForm.shoe_type || need.shoe_type || 'regular',
            notes: doneForm.notes || null,
          }],
        }),
      })
      if (!visitRes.ok) throw new Error('Failed to save visit')
      await fetch(`/api/shoe-needs?id=${need.id}`, { method: 'DELETE' })
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '' })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingDone(false)
    }
  }

  async function addSuggestionToNeeds(horseName: string) {
    const shoeType = lastKnownShoeType(horseName, visits)
    await fetch('/api/shoe-needs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horse_name: horseName, what_needed: 'all_4s', shoe_type: shoeType }),
    })
    await fetchData()
  }

  async function handleVisitSaved(msg: string) {
    setShowLogVisit(false)
    setConfirmation(msg)
    setTimeout(() => setConfirmation(null), 4000)
    await fetchData()
  }

  const hasSuggestions = overdue.length > 0 || gettingClose.length > 0 || dueSoon.length > 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />

      {confirmation && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#065f46', color: '#fff', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 1000, whiteSpace: 'nowrap' }}>
          {confirmation}
        </div>
      )}

      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Shoes</h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Farrier scheduling and shoe history</p>
        </div>

        <div style={{ padding: 20, maxWidth: 820 }} className="shoes-content">

          {/* Section 1 — Current Shoe Needs */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Current Shoe Needs</h2>
              <button
                onClick={() => setAddForm(f => f ? null : { horse_name: '', what_needed: 'all_4s', shoe_type: 'regular', notes: '' })}
                style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Horse
              </button>
            </div>

            {/* Add Horse prompt */}
            {addForm && (
              <div style={{ padding: 14, background: 'var(--color-accent-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>Add horse to list</span>
                  <button
                    onClick={() => setAddForm(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 16, padding: 0, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <HorseAutocomplete
                    value={addForm.horse_name}
                    onChange={v => {
                      const shoeType = lastKnownShoeType(v, visits)
                      setAddForm(f => f ? { ...f, horse_name: v, shoe_type: shoeType } : f)
                    }}
                  />
                  <select
                    value={addForm.what_needed}
                    onChange={e => setAddForm(f => f ? { ...f, what_needed: e.target.value } : f)}
                    style={{ fontSize: 12 }}
                  >
                    {NEEDS_WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>Shoe type</label>
                  <select
                    value={addForm.shoe_type}
                    onChange={e => setAddForm(f => f ? { ...f, shoe_type: e.target.value } : f)}
                    style={{ fontSize: 12 }}
                  >
                    {SHOE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <input
                  value={addForm.notes}
                  onChange={e => setAddForm(f => f ? { ...f, notes: e.target.value } : f)}
                  placeholder="Notes (optional)..."
                  style={{ width: '100%', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }}
                />
                <button
                  onClick={addNeed}
                  disabled={addingSaving || !addForm.horse_name}
                  style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !addForm.horse_name ? 0.5 : 1 }}
                >
                  {addingSaving ? 'Saving...' : 'Add to list'}
                </button>
              </div>
            )}

            {/* Filter chips */}
            {!loading && needs.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                {TYPE_FILTER_CHIPS.map(chip => {
                  const isActive = typeFilter === chip.key
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setTypeFilter(chip.key)}
                      style={{
                        padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                        border: isActive ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: isActive ? 'var(--color-accent-bg)' : 'var(--color-bg)',
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
                      }}
                    >
                      {chip.label}
                    </button>
                  )
                })}
              </div>
            )}

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
            ) : filteredNeeds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>∩</div>
                <p style={{ fontSize: 13 }}>
                  {needs.length > 0 ? 'No horses match this filter' : 'No horses currently need shoeing'}
                </p>
              </div>
            ) : filteredNeeds.map(need => (
              <NeedRow
                key={need.id}
                need={need}
                onUpdate={updateNeed}
                onRemove={removeNeed}
                onToggleDrugger={toggleDrugger}
                onViewProfile={setProfileNeed}
                markingDone={markingDone}
                setMarkingDone={setMarkingDone}
                doneForm={doneForm}
                setDoneForm={setDoneForm}
                onMarkDone={markDone}
                saving={savingDone}
              />
            ))}
          </div>

          {/* Section 2 — Suggestions */}
          {!loading && hasSuggestions && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 18 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Suggestions</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14 }}>Based on last recorded farrier visit — horses already on the needs list are excluded</p>

              {overdue.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>🔴 Overdue — 10+ weeks</div>
                  {overdue.map(s => <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />)}
                </div>
              )}

              {gettingClose.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8 }}>🟠 Getting close — 8-9 weeks</div>
                  {gettingClose.map(s => <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />)}
                </div>
              )}

              {dueSoon.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ca8a04', marginBottom: 8 }}>🟡 Due soon — 6-7 weeks</div>
                  {dueSoon.map(s => <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />)}
                </div>
              )}
            </div>
          )}

          {/* Section 3 — Shoe History */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Shoe History</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder="Search horse or farrier..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{ fontSize: 13, width: 200 }}
                />
                <button
                  onClick={() => setShowLogVisit(true)}
                  style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Log a visit
                </button>
              </div>
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
            ) : filteredVisits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-3)' }}>
                <p style={{ fontSize: 13 }}>
                  {historySearch ? 'No results matching your search' : 'No shoe history yet — mark horses done or log a visit to start building a record'}
                </p>
              </div>
            ) : filteredVisits.map(visit => (
              <div key={visit.id} style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {new Date(visit.visit_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Farrier: {visit.farrier_name}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--color-info-bg)', color: 'var(--color-info)', fontWeight: 600, border: '1px solid var(--color-info-border)' }}>
                    {visit.farrier_visit_horses.length} horse{visit.farrier_visit_horses.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {visit.farrier_visit_horses.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', marginBottom: 5, border: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>🐴</span>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 80 }}>{h.horse_name}</span>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                      {WORK_LABELS[h.work_done] || h.work_done}
                    </span>
                    {h.shoe_type && h.shoe_type !== 'regular' && <ShoeTypeBadge shoeType={h.shoe_type} />}
                    {h.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>sz {h.shoe_size}</span>}
                    {h.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{h.placement}</span>}
                    {h.notes && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{h.notes}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .shoes-content { padding: 12px !important; }
            .done-form-grid { grid-template-columns: 1fr !important; }
            .log-visit-grid { grid-template-columns: 1fr !important; }
            .log-horse-grid { grid-template-columns: 1fr !important; }
          }
        ` }} />
      </main>

      {profileNeed && (
        <HorseProfileModal
          need={profileNeed}
          visits={visits}
          onClose={() => setProfileNeed(null)}
        />
      )}

      {showLogVisit && (
        <LogVisitModal
          onClose={() => setShowLogVisit(false)}
          onSaved={handleVisitSaved}
          needs={needs}
        />
      )}
    </div>
  )
}

function LogVisitModal({ onClose, onSaved, needs }: {
  onClose: () => void
  onSaved: (msg: string) => void
  needs: ShoeNeed[]
}) {
  const today = new Date().toISOString().split('T')[0]
  const [visitDate, setVisitDate] = useState(today)
  const [farrierName, setFarrierName] = useState('')
  const [horses, setHorses] = useState<LogHorse[]>([])
  const [currentHorse, setCurrentHorse] = useState({
    horse_name: '', work_done: 'all_4s', shoe_type: 'regular',
    shoe_size: '', placement: '', placement_other: '', notes: '',
  })
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resolveCurrentHorse(): LogHorse | null {
    if (!currentHorse.horse_name) return null
    return {
      horse_name: currentHorse.horse_name,
      work_done: currentHorse.work_done,
      shoe_type: currentHorse.shoe_type,
      shoe_size: currentHorse.shoe_size,
      placement: currentHorse.placement === 'other'
        ? (currentHorse.placement_other.trim() || 'Other')
        : currentHorse.placement || null,
      notes: currentHorse.notes,
    }
  }

  function addAnother() {
    const resolved = resolveCurrentHorse()
    if (!resolved) return
    setHorses(prev => [...prev, resolved])
    setLastAdded(currentHorse.horse_name)
    setCurrentHorse({ horse_name: '', work_done: 'all_4s', shoe_type: 'regular', shoe_size: '', placement: '', placement_other: '', notes: '' })
    setTimeout(() => setLastAdded(null), 2000)
  }

  function removeHorse(index: number) {
    setHorses(prev => prev.filter((_, i) => i !== index))
  }

  async function saveVisit() {
    const resolved = resolveCurrentHorse()
    const allHorses: LogHorse[] = [...horses, ...(resolved ? [resolved] : [])]
    if (!visitDate || !farrierName || allHorses.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/farrier-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: visitDate,
          farrier_name: farrierName,
          horses: allHorses.map(h => ({
            horse_name: h.horse_name,
            work_done: h.work_done,
            shoe_type: h.shoe_type || null,
            shoe_size: h.shoe_size || null,
            placement: h.placement || null,
            notes: h.notes || null,
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed to save visit')

      const savedNames = new Set(allHorses.map(h => h.horse_name))
      const toRemove = needs.filter(n => savedNames.has(n.horse_name))
      await Promise.all(toRemove.map(n => fetch(`/api/shoe-needs?id=${n.id}`, { method: 'DELETE' })))

      const horseCount = allHorses.length
      const removedCount = toRemove.length
      let msg = `✓ Visit saved — ${horseCount} horse${horseCount !== 1 ? 's' : ''} logged`
      if (removedCount > 0) msg += `, ${removedCount} removed from needs list`
      onSaved(msg)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const totalHorses = horses.length + (currentHorse.horse_name ? 1 : 0)
  const canSave = !!visitDate && !!farrierName && totalHorses > 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>
            Log a Farrier Visit
            {horses.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--color-text-3)', marginLeft: 8, fontWeight: 400 }}>
                ({horses.length} horse{horses.length !== 1 ? 's' : ''} added)
              </span>
            )}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 20 }} className="log-visit-grid">
          <div>
            <label>Visit Date</label>
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
          </div>
          <div>
            <label>Farrier Name</label>
            <input value={farrierName} onChange={e => setFarrierName(e.target.value)} placeholder="e.g. John Smith" autoFocus />
          </div>
        </div>

        {horses.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Horses in this visit
            </div>
            {horses.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 5 }}>
                <span style={{ fontSize: 14 }}>🐴</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{h.horse_name}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                  {WORK_LABELS[h.work_done]}
                </span>
                {h.shoe_type && h.shoe_type !== 'regular' && <ShoeTypeBadge shoeType={h.shoe_type} />}
                {h.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>sz {h.shoe_size}</span>}
                {h.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{h.placement}</span>}
                {h.notes && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{h.notes}</span>}
                <button
                  onClick={() => removeHorse(i)}
                  style={{ fontSize: 12, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {lastAdded && (
          <div style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>
            ✓ {lastAdded} added — enter next horse
          </div>
        )}

        <div style={{ borderTop: horses.length > 0 ? '1px solid var(--color-border)' : 'none', paddingTop: horses.length > 0 ? 16 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            {horses.length > 0 ? 'Add another horse' : 'Horse done'}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Horse name</label>
            <HorseAutocomplete
              value={currentHorse.horse_name}
              onChange={v => setCurrentHorse(h => ({ ...h, horse_name: v }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }} className="log-horse-grid">
            <div>
              <label>What was done</label>
              <select value={currentHorse.work_done} onChange={e => setCurrentHorse(h => ({ ...h, work_done: e.target.value }))} style={{ fontSize: 13 }}>
                {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label>Shoe type</label>
              <select value={currentHorse.shoe_type} onChange={e => setCurrentHorse(h => ({ ...h, shoe_type: e.target.value }))} style={{ fontSize: 13 }}>
                {SHOE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }} className="log-horse-grid">
            <div>
              {/* TODO: use size history for analytics and pre-fill */}
              <label>Size <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
              <select value={currentHorse.shoe_size} onChange={e => setCurrentHorse(h => ({ ...h, shoe_size: e.target.value }))} style={{ fontSize: 13 }}>
                {SHOE_SIZES.map(s => <option key={s} value={s}>{s || '— not recorded —'}</option>)}
              </select>
            </div>
            <div>
              <label>Placement <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
              <select value={currentHorse.placement} onChange={e => setCurrentHorse(h => ({ ...h, placement: e.target.value, placement_other: '' }))} style={{ fontSize: 13 }}>
                {PLACEMENT_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {currentHorse.placement === 'other' && (
            <div style={{ marginBottom: 10 }}>
              <label>Placement detail</label>
              <input value={currentHorse.placement_other} onChange={e => setCurrentHorse(h => ({ ...h, placement_other: e.target.value }))} placeholder="Describe placement..." style={{ fontSize: 13 }} />
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label>Notes</label>
            <input value={currentHorse.notes} onChange={e => setCurrentHorse(h => ({ ...h, notes: e.target.value }))} placeholder="Optional..." style={{ fontSize: 13 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={saveVisit}
            disabled={saving || !canSave}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving || !canSave ? 'not-allowed' : 'pointer', opacity: !canSave ? 0.5 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Visit'}
          </button>
          <button
            onClick={addAnother}
            disabled={!currentHorse.horse_name}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, fontWeight: 500, cursor: !currentHorse.horse_name ? 'not-allowed' : 'pointer', color: 'var(--color-text-2)', opacity: !currentHorse.horse_name ? 0.5 : 1 }}
          >
            Save + Add Another horse
          </button>
        </div>

      </div>
    </div>
  )
}
