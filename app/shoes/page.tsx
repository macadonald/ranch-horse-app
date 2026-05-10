'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES } from '@/lib/horses'

const WORK_OPTIONS = [
  { key: 'fronts',   label: 'Fronts' },
  { key: 'rears',    label: 'Rears' },
  { key: 'all_4s',   label: 'All 4s' },
  { key: 'reset',    label: 'Reset' },
  { key: 'full_set', label: 'Full set' },
]

const WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', reset: 'Reset', full_set: 'Full set',
}

type ShoeNeed = {
  id: string
  horse_name: string
  what_needed: string
  notes: string | null
  created_at: string
}

type FarrierVisitHorse = {
  id: string
  visit_id: string
  horse_name: string
  work_done: string
  notes: string | null
}

type FarrierVisit = {
  id: string
  visit_date: string
  farrier_name: string
  created_at: string
  farrier_visit_horses: FarrierVisitHorse[]
}

type DoneForm = { visit_date: string; farrier_name: string; notes: string }

function weeksSince(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00')
  return Math.floor((Date.now() - date.getTime()) / (7 * 24 * 60 * 60 * 1000))
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
  need, onUpdate, onRemove, markingDone, setMarkingDone, doneForm, setDoneForm, onMarkDone, saving,
}: {
  need: ShoeNeed
  onUpdate: (id: string, field: string, value: string) => void
  onRemove: (id: string) => void
  markingDone: string | null
  setMarkingDone: (id: string | null) => void
  doneForm: DoneForm
  setDoneForm: (f: DoneForm) => void
  onMarkDone: (need: ShoeNeed) => void
  saving: boolean
}) {
  const [notes, setNotes] = useState(need.notes || '')
  useEffect(() => { setNotes(need.notes || '') }, [need.notes])

  const isExpanded = markingDone === need.id

  function toggleExpand() {
    if (isExpanded) {
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', notes: '' })
    } else {
      setMarkingDone(need.id)
      setDoneForm({ visit_date: '', farrier_name: '', notes: '' })
    }
  }

  const badgeColor = need.what_needed === 'fronts'
    ? { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
    : { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }

  return (
    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
          <span style={{ fontSize: 14 }}>🐴</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{need.horse_name}</span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, background: badgeColor.bg, color: badgeColor.color, border: `1px solid ${badgeColor.border}` }}>
            {need.what_needed === 'fronts' ? '🔴' : '🟠'} {WORK_LABELS[need.what_needed]}
          </span>
        </div>
        <select
          value={need.what_needed}
          onChange={e => onUpdate(need.id, 'what_needed', e.target.value)}
          style={{ fontSize: 12 }}
        >
          {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          onClick={toggleExpand}
          style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${isExpanded ? 'var(--color-border)' : 'var(--color-success-border)'}`, background: isExpanded ? 'var(--color-bg)' : 'var(--color-success-bg)', color: isExpanded ? 'var(--color-text-3)' : 'var(--color-success)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {isExpanded ? 'Cancel' : '✓ Mark done'}
        </button>
        <button
          onClick={() => onRemove(need.id)}
          style={{ padding: '5px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 12, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (need.notes || '')) onUpdate(need.id, 'notes', notes) }}
        placeholder="Notes (optional)..."
        style={{ marginTop: 8, width: '100%', fontSize: 12, boxSizing: 'border-box' }}
      />

      {isExpanded && (
        <div style={{ marginTop: 12, padding: 14, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Record this visit</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }} className="done-form-grid">
            <div>
              <label>Visit Date</label>
              <input
                type="date"
                value={doneForm.visit_date}
                onChange={e => setDoneForm({ ...doneForm, visit_date: e.target.value })}
              />
            </div>
            <div>
              <label>Farrier Name</label>
              <input
                value={doneForm.farrier_name}
                onChange={e => setDoneForm({ ...doneForm, farrier_name: e.target.value })}
                placeholder="e.g. John Smith"
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Notes for this visit</label>
            <input
              value={doneForm.notes}
              onChange={e => setDoneForm({ ...doneForm, notes: e.target.value })}
              placeholder="Optional..."
            />
          </div>
          <button
            onClick={() => onMarkDone(need)}
            disabled={saving || !doneForm.visit_date || !doneForm.farrier_name}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--color-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
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
  const [addForm, setAddForm] = useState<{ horse_name: string; what_needed: string; notes: string } | null>(null)
  const [addingSaving, setAddingSaving] = useState(false)
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [doneForm, setDoneForm] = useState<DoneForm>({ visit_date: '', farrier_name: '', notes: '' })
  const [savingDone, setSavingDone] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [showLogVisit, setShowLogVisit] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)

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
        body: JSON.stringify({ horse_name: addForm.horse_name, what_needed: addForm.what_needed, notes: addForm.notes || null }),
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
    await fetch(`/api/shoe-needs?id=${id}`, { method: 'DELETE' })
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
          horses: [{ horse_name: need.horse_name, work_done: need.what_needed, notes: doneForm.notes || null }],
        }),
      })
      if (!visitRes.ok) throw new Error('Failed to save visit')
      await fetch(`/api/shoe-needs?id=${need.id}`, { method: 'DELETE' })
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', notes: '' })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingDone(false)
    }
  }

  async function addSuggestionToNeeds(horseName: string) {
    await fetch('/api/shoe-needs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horse_name: horseName, what_needed: 'all_4s' }),
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Current Shoe Needs</h2>
              <button
                onClick={() => setAddForm(f => f ? null : { horse_name: '', what_needed: 'all_4s', notes: '' })}
                style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Horse
              </button>
            </div>

            {addForm && (
              <div style={{ padding: 14, background: 'var(--color-accent-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <HorseAutocomplete value={addForm.horse_name} onChange={v => setAddForm(f => f ? { ...f, horse_name: v } : f)} />
                  <select
                    value={addForm.what_needed}
                    onChange={e => setAddForm(f => f ? { ...f, what_needed: e.target.value } : f)}
                    style={{ fontSize: 12 }}
                  >
                    {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <input
                  value={addForm.notes}
                  onChange={e => setAddForm(f => f ? { ...f, notes: e.target.value } : f)}
                  placeholder="Notes (optional)..."
                  style={{ width: '100%', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={addNeed}
                    disabled={addingSaving || !addForm.horse_name}
                    style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !addForm.horse_name ? 0.5 : 1 }}
                  >
                    {addingSaving ? 'Saving...' : 'Add to list'}
                  </button>
                  <button
                    onClick={() => setAddForm(null)}
                    style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
            ) : needs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>∩</div>
                <p style={{ fontSize: 13 }}>No horses currently need shoeing</p>
              </div>
            ) : needs.map(need => (
              <NeedRow
                key={need.id}
                need={need}
                onUpdate={updateNeed}
                onRemove={removeNeed}
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    🔴 Overdue — 10+ weeks
                  </div>
                  {overdue.map(s => (
                    <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />
                  ))}
                </div>
              )}

              {gettingClose.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8 }}>
                    🟠 Getting close — 8-9 weeks
                  </div>
                  {gettingClose.map(s => (
                    <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />
                  ))}
                </div>
              )}

              {dueSoon.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ca8a04', marginBottom: 8 }}>
                    🟡 Due soon — 6-7 weeks
                  </div>
                  {dueSoon.map(s => (
                    <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />
                  ))}
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
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', marginBottom: 5, border: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>🐴</span>
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 80 }}>{h.horse_name}</span>
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                      {WORK_LABELS[h.work_done] || h.work_done}
                    </span>
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
          }
        ` }} />
      </main>

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
  const [horses, setHorses] = useState<{ horse_name: string; work_done: string; notes: string }[]>([])
  const [currentHorse, setCurrentHorse] = useState({ horse_name: '', work_done: 'all_4s', notes: '' })
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function addAnother() {
    if (!currentHorse.horse_name) return
    setHorses(prev => [...prev, { ...currentHorse }])
    setLastAdded(currentHorse.horse_name)
    setCurrentHorse({ horse_name: '', work_done: 'all_4s', notes: '' })
    setTimeout(() => setLastAdded(null), 2000)
  }

  function removeHorse(index: number) {
    setHorses(prev => prev.filter((_, i) => i !== index))
  }

  async function saveVisit() {
    const allHorses = [
      ...horses,
      ...(currentHorse.horse_name ? [currentHorse] : []),
    ]
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
            notes: h.notes || null,
          })),
        }),
      })
      if (!res.ok) throw new Error('Failed to save visit')

      // Auto-remove horses from shoe_needs if they're on it
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

        {/* Header */}
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

        {/* Visit date + farrier name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 20 }} className="log-visit-grid">
          <div>
            <label>Visit Date</label>
            <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
          </div>
          <div>
            <label>Farrier Name</label>
            <input
              value={farrierName}
              onChange={e => setFarrierName(e.target.value)}
              placeholder="e.g. John Smith"
              autoFocus
            />
          </div>
        </div>

        {/* Accumulated horses */}
        {horses.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Horses in this visit
            </div>
            {horses.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 5 }}>
                <span style={{ fontSize: 14 }}>🐴</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{h.horse_name}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>
                  {WORK_LABELS[h.work_done]}
                </span>
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

        {/* "Horse added" flash */}
        {lastAdded && (
          <div style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>
            ✓ {lastAdded} added — enter next horse
          </div>
        )}

        {/* Current horse entry form */}
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
          <div style={{ marginBottom: 10 }}>
            <label>What was done</label>
            <select
              value={currentHorse.work_done}
              onChange={e => setCurrentHorse(h => ({ ...h, work_done: e.target.value }))}
              style={{ fontSize: 13 }}
            >
              {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label>Notes</label>
            <input
              value={currentHorse.notes}
              onChange={e => setCurrentHorse(h => ({ ...h, notes: e.target.value }))}
              placeholder="Optional..."
              style={{ fontSize: 13 }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={saveVisit}
            disabled={saving || !canSave}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving || !canSave ? 'not-allowed' : 'pointer',
              opacity: !canSave ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Visit'}
          </button>
          <button
            onClick={addAnother}
            disabled={!currentHorse.horse_name}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              fontSize: 13,
              fontWeight: 500,
              cursor: !currentHorse.horse_name ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-2)',
              opacity: !currentHorse.horse_name ? 0.5 : 1,
            }}
          >
            Save + Add Another horse
          </button>
        </div>

      </div>
    </div>
  )
}
