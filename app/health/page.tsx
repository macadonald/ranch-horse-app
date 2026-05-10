'use client'
// TODO: add photo upload per issue
// TODO: add body diagram visual picker
// TODO: consider vet contact / call log integration

import { useState, useEffect, useCallback, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'
import {
  HorseHealthIssue, HealthIssueType, HealthLocation, HealthSeverity, HealthFrequency,
  ISSUE_TYPES, LOCATION_GROUPS, SEVERITIES, FREQUENCIES,
  LOCATION_LABELS, TYPE_LABELS, SEVERITY_LABELS, FREQUENCY_LABELS,
  severityBorderColor, severityBadgeStyle, showDoneWarning,
} from '@/lib/health'

// ─── Horse autocomplete ──────────────────────────────────────────────────────

function HorseAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)

  function handleInput(v: string) {
    onChange(v)
    if (v.length >= 1) {
      const matches = HORSES
        .filter(h => h.name.toLowerCase().includes(v.toLowerCase()))
        .map(h => h.name)
        .slice(0, 7)
      setSuggestions(matches)
      setShow(matches.length > 0)
    } else {
      setShow(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder="Horse name..."
        autoFocus
      />
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2 }}>
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

// ─── Issue form modal (shared for Log + Edit) ────────────────────────────────

type IssueFormState = {
  horse_name: string
  type: HealthIssueType
  location: HealthLocation
  severity: HealthSeverity
  frequency: HealthFrequency
  treatment_notes: string
  notes: string
}

const BLANK_FORM: IssueFormState = {
  horse_name:      '',
  type:            'wound',
  location:        'left_front_hoof',
  severity:        'monitoring',
  frequency:       'once_daily',
  treatment_notes: '',
  notes:           '',
}

function IssueFormModal({
  issue,
  onClose,
  onSaved,
}: {
  issue: HorseHealthIssue | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = issue !== null
  const [form, setForm] = useState<IssueFormState>(
    isEdit
      ? {
          horse_name:      issue.horse_name,
          type:            issue.type,
          location:        issue.location,
          severity:        issue.severity,
          frequency:       issue.frequency,
          treatment_notes: issue.treatment_notes ?? '',
          notes:           issue.notes ?? '',
        }
      : BLANK_FORM
  )
  const [saving, setSaving] = useState(false)

  function set(field: keyof IssueFormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.horse_name) return
    setSaving(true)
    try {
      if (isEdit) {
        await fetch('/api/health', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: issue.id, ...form, treatment_notes: form.treatment_notes || null, notes: form.notes || null }),
        })
      } else {
        await fetch('/api/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, treatment_notes: form.treatment_notes || null, notes: form.notes || null }),
        })
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!form.horse_name && !saving

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>
            {isEdit ? `Edit — ${issue.horse_name}` : 'Log issue'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)', lineHeight: 1 }}>✕</button>
        </div>

        {!isEdit && (
          <div style={{ marginBottom: 14 }}>
            <label>Horse name</label>
            <HorseAutocomplete value={form.horse_name} onChange={v => set('horse_name', v)} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }} className="health-form-grid">
          <div>
            <label>Issue type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}>
              {ISSUE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>Severity</label>
            <select value={form.severity} onChange={e => set('severity', e.target.value)}>
              {SEVERITIES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Location</label>
          <select value={form.location} onChange={e => set('location', e.target.value)}>
            {LOCATION_GROUPS.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map(item => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Treatment frequency</label>
          <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Treatment notes</label>
          <textarea
            value={form.treatment_notes}
            onChange={e => set('treatment_notes', e.target.value)}
            placeholder="What treatment is being done..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any additional notes..."
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>

        {form.severity === 'vet_required' && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
            Vet required — this horse will be removed from the assignment pool until the issue is resolved.
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5 }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Log issue'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Issue card ──────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  tucsonToday,
  onEdit,
  onResolve,
  onMarkDone,
  onUpdateField,
}: {
  issue: HorseHealthIssue
  tucsonToday: string
  onEdit: () => void
  onResolve: () => void
  onMarkDone: () => void
  onUpdateField: (id: string, field: string, value: string | null) => void
}) {
  const [treatmentNotes, setTreatmentNotes] = useState(issue.treatment_notes ?? '')
  const [notes, setNotes] = useState(issue.notes ?? '')
  const [resolving, setResolving] = useState(false)
  const [markingDone, setMarkingDone] = useState(false)

  useEffect(() => { setTreatmentNotes(issue.treatment_notes ?? '') }, [issue.treatment_notes])
  useEffect(() => { setNotes(issue.notes ?? '') }, [issue.notes])

  const isDoneToday = issue.done_today_date === tucsonToday
  const severeBadge = severityBadgeStyle(issue.severity)
  const borderColor = severityBorderColor(issue.severity)
  const warnDone = showDoneWarning(issue)

  const openedDate = new Date(issue.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  async function handleResolve() {
    setResolving(true)
    await onResolve()
    setResolving(false)
  }

  async function handleMarkDone() {
    setMarkingDone(true)
    await onMarkDone()
    setMarkingDone(false)
  }

  return (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', borderLeft: `4px solid ${borderColor}`, background: 'var(--color-surface)', padding: '14px 16px', marginBottom: 10 }}>

      {/* Top row: name + badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🐴 {issue.horse_name}</span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: severeBadge.bg, color: severeBadge.color, border: `1px solid ${severeBadge.border}` }}>
          {SEVERITY_LABELS[issue.severity]}
        </span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 500, background: 'var(--color-bg)', color: 'var(--color-text-2)', border: '1px solid var(--color-border)' }}>
          {LOCATION_LABELS[issue.location]} · {TYPE_LABELS[issue.type]}
        </span>
      </div>

      {/* Treatment notes — inline editable */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ marginBottom: 4 }}>Treatment notes</label>
        <textarea
          value={treatmentNotes}
          onChange={e => setTreatmentNotes(e.target.value)}
          onBlur={() => {
            if (treatmentNotes !== (issue.treatment_notes ?? ''))
              onUpdateField(issue.id, 'treatment_notes', treatmentNotes || null)
          }}
          placeholder="Add treatment notes..."
          rows={2}
          style={{ resize: 'vertical', fontSize: 13 }}
        />
      </div>

      {/* General notes — inline editable */}
      {(notes || issue.notes !== null) && (
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (issue.notes ?? ''))
                onUpdateField(issue.id, 'notes', notes || null)
            }}
            placeholder="Notes..."
            rows={1}
            style={{ resize: 'vertical', fontSize: 12, color: 'var(--color-text-3)' }}
          />
        </div>
      )}

      {/* Meta row: frequency + opened date + done status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)', fontWeight: 500 }}>
          {FREQUENCY_LABELS[issue.frequency]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          Opened {openedDate}
        </span>
        {isDoneToday ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)' }}>✓ Done today</span>
        ) : warnDone ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>Not done today</span>
        ) : null}
        {issue.last_treated_at && (
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
            Last: {new Date(issue.last_treated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button
          onClick={onEdit}
          style={{ padding: '5px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 500 }}
        >
          Edit
        </button>
        <button
          onClick={handleResolve}
          disabled={resolving}
          style={{ padding: '5px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success-border)', background: 'var(--color-success-bg)', fontSize: 12, cursor: resolving ? 'not-allowed' : 'pointer', color: 'var(--color-success)', fontWeight: 500, opacity: resolving ? 0.6 : 1 }}
        >
          {resolving ? 'Resolving...' : 'Resolve'}
        </button>
        {!isDoneToday && (
          <button
            onClick={handleMarkDone}
            disabled={markingDone}
            style={{ padding: '5px 11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-accent-border)', background: 'var(--color-accent-bg)', fontSize: 12, cursor: markingDone ? 'not-allowed' : 'pointer', color: 'var(--color-accent)', fontWeight: 600, opacity: markingDone ? 0.6 : 1 }}
          >
            {markingDone ? '...' : '✓ Mark done today'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

type ActiveFilter = 'all' | 'vet_required' | 'needs_treatment' | 'monitoring' | 'sore'

export default function HealthPage() {
  const [issues, setIssues] = useState<HorseHealthIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [showLogModal, setShowLogModal] = useState(false)
  const [editingIssue, setEditingIssue] = useState<HorseHealthIssue | null>(null)

  const tucsonToday = getTucsonToday()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setIssues(data.issues || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeIssues = useMemo(() => issues.filter(i => i.status === 'active'), [issues])
  const resolvedIssues = useMemo(() => issues.filter(i => i.status === 'resolved'), [issues])

  const filteredActive = useMemo(() => {
    if (activeFilter === 'all')             return activeIssues
    if (activeFilter === 'vet_required')    return activeIssues.filter(i => i.severity === 'vet_required')
    if (activeFilter === 'needs_treatment') return activeIssues.filter(i => i.severity === 'needs_treatment')
    if (activeFilter === 'monitoring')      return activeIssues.filter(i => i.severity === 'monitoring')
    if (activeFilter === 'sore')            return activeIssues.filter(i => i.type === 'sore')
    return activeIssues
  }, [activeIssues, activeFilter])

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return resolvedIssues
    const q = historySearch.toLowerCase()
    return resolvedIssues.filter(i => i.horse_name.toLowerCase().includes(q))
  }, [resolvedIssues, historySearch])

  async function handleUpdateField(id: string, field: string, value: string | null) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
    await fetch('/api/health', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    })
  }

  async function handleResolve(issue: HorseHealthIssue) {
    const resolved_at = new Date().toISOString()
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: 'resolved', resolved_at } : i))
    await fetch('/api/health', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: issue.id, status: 'resolved', resolved_at }),
    })
    // Re-fetch so vet_flagged_horses recalculates (clearing the board flag if no other vet issues remain)
    await fetchData()
  }

  async function handleMarkDone(issue: HorseHealthIssue) {
    const last_treated_at = new Date().toISOString()
    const done_today_date = tucsonToday
    setIssues(prev =>
      prev.map(i =>
        i.id === issue.id ? { ...i, done_today: true, done_today_date, last_treated_at } : i
      )
    )
    await fetch('/api/health', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: issue.id, done_today: true, done_today_date, last_treated_at }),
    })
  }

  async function handleSaved() {
    setShowLogModal(false)
    setEditingIssue(null)
    await fetchData()
  }

  const FILTER_CHIPS: { key: ActiveFilter; label: string }[] = [
    { key: 'all',             label: 'All' },
    { key: 'vet_required',    label: 'Vet required' },
    { key: 'needs_treatment', label: 'Needs treatment' },
    { key: 'monitoring',      label: 'Monitoring' },
    { key: 'sore',            label: 'Sore' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />

      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>

        {/* Sticky header */}
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '14px 20px 10px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Horse health</h1>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
                {loading ? 'Loading...' : `${activeIssues.length} active issue${activeIssues.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              + Log issue
            </button>
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {FILTER_CHIPS.map(chip => {
              const isActive = activeFilter === chip.key
              return (
                <button
                  key={chip.key}
                  onClick={() => setActiveFilter(chip.key)}
                  style={{
                    padding: '3px 11px', borderRadius: 999, flexShrink: 0,
                    border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: isActive ? '#fff' : 'var(--color-text-2)',
                    fontSize: 12, cursor: 'pointer', fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: 20, maxWidth: 820 }} className="health-content">

          {/* Active issues */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Active · {filteredActive.length}
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '16px 0' }}>Loading...</p>
            ) : filteredActive.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <p style={{ fontSize: 13 }}>
                  {activeFilter === 'all'
                    ? 'No active health issues'
                    : `No ${activeFilter.replace('_', ' ')} issues`}
                </p>
              </div>
            ) : (
              // Sort: vet_required first, then needs_treatment, then monitoring
              [...filteredActive]
                .sort((a, b) => {
                  const order = { vet_required: 0, needs_treatment: 1, monitoring: 2 }
                  return (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
                })
                .map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    tucsonToday={tucsonToday}
                    onEdit={() => setEditingIssue(issue)}
                    onResolve={() => handleResolve(issue)}
                    onMarkDone={() => handleMarkDone(issue)}
                    onUpdateField={handleUpdateField}
                  />
                ))
            )}
          </div>

          {/* History */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                History · {resolvedIssues.length} resolved
              </div>
              <input
                placeholder="Search by horse name..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{ fontSize: 13, width: 200 }}
              />
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
            ) : filteredHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-3)' }}>
                <p style={{ fontSize: 13 }}>
                  {historySearch ? 'No results for that horse' : 'No resolved issues yet'}
                </p>
              </div>
            ) : filteredHistory.map(issue => {
              const resolvedDate = issue.resolved_at
                ? new Date(issue.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'
              const badge = severityBadgeStyle(issue.severity)
              return (
                <div key={issue.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 80 }}>🐴 {issue.horse_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{TYPE_LABELS[issue.type]}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>·</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 500, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                    {SEVERITY_LABELS[issue.severity]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)', marginLeft: 'auto' }}>
                    Resolved {resolvedDate}
                  </span>
                </div>
              )
            })}
          </div>

        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .health-content { padding: 12px !important; }
            .health-form-grid { grid-template-columns: 1fr !important; }
          }
        ` }} />
      </main>

      {showLogModal && (
        <IssueFormModal issue={null} onClose={() => setShowLogModal(false)} onSaved={handleSaved} />
      )}
      {editingIssue && (
        <IssueFormModal issue={editingIssue} onClose={() => setEditingIssue(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
