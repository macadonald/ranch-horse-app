'use client'
// TODO: add photo upload per issue
// TODO: add body diagram visual picker
// TODO: consider vet contact / call log integration

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'
import {
  HorseHealthIssue, HealthIssueType, HealthLocation, HealthSeverity, HealthFrequency,
  ISSUE_TYPES, LOCATION_GROUPS, SEVERITIES, FREQUENCIES,
  LOCATION_LABELS, TYPE_LABELS, SEVERITY_LABELS, FREQUENCY_LABELS,
  severityBorderColor, severityBadgeStyle,
} from '@/lib/health'
import {
  HorseSupplement, SupplementFrequency,
  SUPPLEMENT_FREQUENCIES, SUPPLEMENT_FREQUENCY_LABELS,
} from '@/lib/supplements'

type LameFlag = {
  id: string
  horse_name: string
  flag_type: 'lame' | 'stiff_sore'
  notes: string | null
  flagged_at: string
  resolved_at: string | null
  status: 'active' | 'resolved'
}

// ─── Horse autocomplete ───────────────────────────────────────────────────────

function HorseAutocomplete({
  value,
  onChange,
  autoFocus: af = true,
  extraNames = [],
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  extraNames?: string[]
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)

  function handleInput(v: string) {
    onChange(v)
    if (v.length >= 1) {
      const q = v.toLowerCase()
      const allNames = Array.from(new Set([...HORSES.map(h => h.name), ...extraNames]))
      const matches = allNames
        .filter(n => n.toLowerCase().includes(q))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(q)
          const bStarts = b.toLowerCase().startsWith(q)
          if (aStarts !== bStarts) return aStarts ? -1 : 1
          return a.length - b.length
        })
      setSuggestions(matches.slice(0, 8))
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
        autoFocus={af}
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

// ─── Issue form modal ─────────────────────────────────────────────────────────

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
  horse_name: '', type: 'wound', location: 'left_front_hoof',
  severity: 'monitoring', frequency: 'once_daily', treatment_notes: '', notes: '',
}

function IssueFormModal({
  issue,
  onClose,
  onSaved,
  extraNames = [],
}: {
  issue: HorseHealthIssue | null
  onClose: () => void
  onSaved: () => void
  extraNames?: string[]
}) {
  const isEdit = issue !== null
  const [form, setForm] = useState<IssueFormState>(
    isEdit
      ? { horse_name: issue.horse_name, type: issue.type, location: issue.location, severity: issue.severity, frequency: issue.frequency, treatment_notes: issue.treatment_notes ?? '', notes: issue.notes ?? '' }
      : BLANK_FORM
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const mouseDownOnBackdrop = useRef(false)

  function set(field: keyof IssueFormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function applyButtePreset() {
    setForm(f => ({ ...f, type: 'meds', location: 'na', treatment_notes: 'Butte — ', frequency: 'once_daily' }))
  }

  async function handleIssueSave() {
    if (!form.horse_name) return
    setSaving(true); setSaveError(null)
    try {
      const payload = { ...form, treatment_notes: form.treatment_notes || null, notes: form.notes || null }
      const res = await fetch('/api/health', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: issue.id, ...payload } : payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || `Save failed (${res.status})`); return
      }
      onSaved()
    } catch { setSaveError('Network error — please try again') }
    finally { setSaving(false) }
  }

  const canSaveIssue = !!form.horse_name && !saving

  return (
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
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
            <HorseAutocomplete value={form.horse_name} onChange={v => set('horse_name', v)} extraNames={extraNames} />
          </div>
        )}

        {!isEdit && (
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={applyButtePreset}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid #a78bfa', background: '#ede9fe', color: '#6d28d9', fontWeight: 600, cursor: 'pointer' }}
            >
              ★ Butte preset
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 8 }}>Sets type → Meds, location → N/A, pre-fills notes</span>
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
                    {group.items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
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
              <textarea value={form.treatment_notes} onChange={e => set('treatment_notes', e.target.value)} placeholder="What treatment is being done..." rows={3} style={{ resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." rows={2} style={{ resize: 'vertical' }} />
            </div>

            {form.severity === 'vet_required' && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                Vet required — this horse will be removed from the assignment pool until the issue is resolved.
              </div>
            )}

            {saveError && (
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-danger)', fontWeight: 500 }}>
                {saveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 9 }}>
              <button onClick={handleIssueSave} disabled={!canSaveIssue} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canSaveIssue ? 'pointer' : 'not-allowed', opacity: canSaveIssue ? 1 : 0.5 }}>
                {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Log issue'}
              </button>
              <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>
                Cancel
              </button>
            </div>
      </div>
    </div>
  )
}

// ─── Supplement edit modal ────────────────────────────────────────────────────

function SupplementEditModal({
  supplement,
  onClose,
  onSaved,
}: {
  supplement: HorseSupplement
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ supplement_name: supplement.supplement_name, frequency: supplement.frequency, notes: supplement.notes ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mouseDownOnBackdrop = useRef(false)

  async function handleSave() {
    if (!form.supplement_name) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/supplements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: supplement.id, supplement_name: form.supplement_name, frequency: form.frequency, notes: form.notes || null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Save failed'); return }
      onSaved()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>Edit supplement — {supplement.horse_name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label>Supplement</label>
          <input value={form.supplement_name} onChange={e => setForm(f => ({ ...f, supplement_name: e.target.value }))} autoFocus />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label>Frequency</label>
          <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as SupplementFrequency }))}>
            {SUPPLEMENT_FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
        </div>
        {error && <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={handleSave} disabled={!form.supplement_name || saving} style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Horse profile modal (read-only) ─────────────────────────────────────────

function HorseProfileModal({
  horseName,
  allIssues,
  allSupplements,
  onClose,
}: {
  horseName: string
  allIssues: HorseHealthIssue[]
  allSupplements: HorseSupplement[]
  onClose: () => void
}) {
  const mouseDownOnBackdrop = useRef(false)
  const activeIssues   = allIssues.filter(i => i.status === 'active')
  const resolvedIssues = allIssues.filter(i => i.status === 'resolved').sort((a, b) => new Date(b.resolved_at ?? 0).getTime() - new Date(a.resolved_at ?? 0).getTime())
  const notesEntries   = allIssues.filter(i => i.notes).map(i => ({ notes: i.notes!, type: i.type, date: i.opened_at }))

  return (
    <div
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>🐴 {horseName}</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>
              {activeIssues.length} active issue{activeIssues.length !== 1 ? 's' : ''} · {allSupplements.length} supplement{allSupplements.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {/* Active issues */}
          {activeIssues.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Active issues</div>
              {activeIssues.map(issue => {
                const badge = severityBadgeStyle(issue.severity)
                return (
                  <div key={issue.id} style={{ padding: '8px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: `3px solid ${severityBorderColor(issue.severity)}`, borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 600, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{SEVERITY_LABELS[issue.severity]}</span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{TYPE_LABELS[issue.type]}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{LOCATION_LABELS[issue.location]}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 'auto' }}>{FREQUENCY_LABELS[issue.frequency]}</span>
                    </div>
                    {issue.treatment_notes && <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.4, margin: 0 }}>{issue.treatment_notes}</p>}
                    {issue.notes && <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '4px 0 0', fontStyle: 'italic' }}>{issue.notes}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Supplements */}
          {allSupplements.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Grain & supplements</div>
              {allSupplements.map(s => (
                <div key={s.id} style={{ padding: '7px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid #0891b2', borderRadius: 'var(--radius-sm)', marginBottom: 5 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{s.supplement_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{SUPPLEMENT_FREQUENCY_LABELS[s.frequency]}</span>
                  </div>
                  {s.notes && <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '3px 0 0' }}>{s.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Notes across issues */}
          {notesEntries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>All notes</div>
              {notesEntries.map((entry, i) => (
                <div key={i} style={{ padding: '7px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 5 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 3 }}>{TYPE_LABELS[entry.type]} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <p style={{ fontSize: 12, color: 'var(--color-text-2)', margin: 0 }}>{entry.notes}</p>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {resolvedIssues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>History</div>
              {resolvedIssues.map(issue => {
                const badge = severityBadgeStyle(issue.severity)
                const resolvedDate = issue.resolved_at ? new Date(issue.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
                return (
                  <div key={issue.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 5, opacity: 0.75, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 999, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{SEVERITY_LABELS[issue.severity]}</span>
                    <span style={{ fontSize: 12 }}>{TYPE_LABELS[issue.type]}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: 'auto' }}>Resolved {resolvedDate}</span>
                  </div>
                )
              })}
            </div>
          )}

          {activeIssues.length === 0 && allSupplements.length === 0 && resolvedIssues.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '24px 0' }}>No health records for this horse</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared icon button ───────────────────────────────────────────────────────

function IconBtn({ onClick, title, disabled, children, danger, success }: {
  onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode; danger?: boolean; success?: boolean
}) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} disabled={disabled} title={title} style={{
      width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid',
      borderColor: danger ? 'var(--color-danger-border)' : success ? 'var(--color-success-border)' : 'var(--color-border)',
      background: danger ? 'var(--color-danger-bg)' : success ? 'var(--color-success-bg)' : 'transparent',
      color: danger ? 'var(--color-danger)' : success ? 'var(--color-success)' : 'var(--color-text-3)',
      fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, opacity: disabled ? 0.5 : 1, padding: 0,
    }}>
      {children}
    </button>
  )
}

// ─── Doctoring card ───────────────────────────────────────────────────────────

function DoctorCard({
  issue, tucsonToday, hideHorseName, onEdit, onResolve, onMarkDone, onDelete, onViewProfile,
}: {
  issue: HorseHealthIssue; tucsonToday: string; hideHorseName?: boolean
  onEdit: () => void; onResolve: () => void; onMarkDone: () => void; onDelete: () => void
  onViewProfile?: (name: string) => void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [resolving, setResolving]         = useState(false)
  const [markingDone, setMarkingDone]     = useState(false)
  const [deleting, setDeleting]           = useState(false)

  const isDoneToday  = issue.done_today_date === tucsonToday
  const badge        = severityBadgeStyle(issue.severity)
  const borderColor  = severityBorderColor(issue.severity)
  const openedDate   = new Date(issue.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const lastDate     = issue.last_treated_at ? new Date(issue.last_treated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  const hasLongNotes = (issue.treatment_notes?.length ?? 0) > 90 || (issue.treatment_notes ?? '').includes('\n')

  async function handleResolve()  { setResolving(true);   await onResolve();  setResolving(false)  }
  async function handleMarkDone() { setMarkingDone(true); await onMarkDone(); setMarkingDone(false) }
  async function handleDelete()   { setDeleting(true);    await onDelete();   setDeleting(false)   }

  return (
    <div
      onClick={() => onViewProfile?.(issue.horse_name)}
      style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', borderLeft: `4px solid ${borderColor}`, background: 'var(--color-surface)', padding: '10px 12px', marginBottom: hideHorseName ? 0 : 7, borderTop: hideHorseName ? '1px dashed var(--color-border)' : undefined, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'nowrap', minWidth: 0 }}>
        {!hideHorseName && (
          <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
            🐴 {issue.horse_name}
          </span>
        )}
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}>
          {SEVERITY_LABELS[issue.severity]}
        </span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 500, whiteSpace: 'nowrap', background: 'var(--color-bg)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', flexShrink: 0 }}>
          {LOCATION_LABELS[issue.location]} · {TYPE_LABELS[issue.type]}
        </span>
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>Delete?</span>
            <button onClick={e => { e.stopPropagation(); handleDelete() }} disabled={deleting} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}>{deleting ? '...' : 'Yes'}</button>
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>No</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <IconBtn onClick={onEdit} title="Edit">✎</IconBtn>
            <IconBtn onClick={handleResolve} disabled={resolving} title="Resolve" success>✓</IconBtn>
            <IconBtn onClick={() => setConfirmDelete(true)} title="Delete" danger>✕</IconBtn>
          </div>
        )}
      </div>

      {issue.treatment_notes ? (
        <div style={{ marginBottom: 5 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45, margin: 0, ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>
            {issue.treatment_notes}
          </p>
          {hasLongNotes && (
            <button onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', fontWeight: 500 }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic', marginBottom: 5 }}>No treatment notes</p>
      )}

      {issue.notes && (
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0 0 5px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {issue.notes}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          {FREQUENCY_LABELS[issue.frequency]} · {openedDate}{lastDate ? ` · Last ${lastDate}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isDoneToday ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>✓ Done today</span>
          ) : (
            <>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626' }}>Not done</span>
              <button onClick={e => { e.stopPropagation(); handleMarkDone() }} disabled={markingDone} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 'var(--radius-sm)', border: `1px solid ${borderColor}`, background: issue.severity === 'vet_required' ? '#fee2e2' : '#fef3c7', color: borderColor, fontWeight: 700, cursor: markingDone ? 'not-allowed' : 'pointer', opacity: markingDone ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {markingDone ? '...' : '✓ Mark done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Doctor group (horse with 1+ doctoring issues) ────────────────────────────

function DoctorGroup({
  horse_name, issues, tucsonToday, onEdit, onResolve, onMarkDone, onDelete, onViewProfile,
}: {
  horse_name: string; issues: HorseHealthIssue[]; tucsonToday: string
  onEdit: (i: HorseHealthIssue) => void; onResolve: (i: HorseHealthIssue) => void
  onMarkDone: (i: HorseHealthIssue) => void; onDelete: (i: HorseHealthIssue) => void
  onViewProfile: (name: string) => void
}) {
  if (issues.length === 1) {
    return (
      <DoctorCard
        issue={issues[0]} tucsonToday={tucsonToday}
        onEdit={() => onEdit(issues[0])} onResolve={() => onResolve(issues[0])}
        onMarkDone={() => onMarkDone(issues[0])} onDelete={() => onDelete(issues[0])}
        onViewProfile={onViewProfile}
      />
    )
  }

  const worstColor = issues.some(i => i.severity === 'vet_required')
    ? severityBorderColor('vet_required')
    : severityBorderColor('needs_treatment')

  return (
    <div
      onClick={() => onViewProfile(horse_name)}
      style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', borderLeft: `4px solid ${worstColor}`, background: 'var(--color-surface)', marginBottom: 7, overflow: 'hidden', cursor: 'pointer' }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.02)' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          🐴 {horse_name}
        </span>
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'var(--color-bg)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', fontWeight: 600 }}>
          {issues.length} issues
        </span>
      </div>
      {/* Issue rows */}
      {issues.map(issue => (
        <DoctorCard
          key={issue.id} issue={issue} tucsonToday={tucsonToday} hideHorseName
          onEdit={() => onEdit(issue)} onResolve={() => onResolve(issue)}
          onMarkDone={() => onMarkDone(issue)} onDelete={() => onDelete(issue)}
        />
      ))}
    </div>
  )
}

// ─── Watching card (monitoring) ───────────────────────────────────────────────

function WatchCard({
  issue, hideHorseName, onEdit, onResolve, onDelete, onViewProfile,
}: {
  issue: HorseHealthIssue; hideHorseName?: boolean
  onEdit: () => void; onResolve: () => void; onDelete: () => void
  onViewProfile?: (name: string) => void
}) {
  const [expanded, setExpanded]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [resolving, setResolving]         = useState(false)
  const [deleting, setDeleting]           = useState(false)

  const openedDate   = new Date(issue.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const hasLongNotes = (issue.treatment_notes?.length ?? 0) > 90 || (issue.treatment_notes ?? '').includes('\n')

  async function handleResolve() { setResolving(true); await onResolve(); setResolving(false) }
  async function handleDelete()  { setDeleting(true);  await onDelete();  setDeleting(false)  }

  return (
    <div
      onClick={() => onViewProfile?.(issue.horse_name)}
      style={{ borderRadius: hideHorseName ? 0 : 'var(--radius-md)', border: hideHorseName ? 'none' : '1px solid var(--color-border)', borderTop: hideHorseName ? '1px dashed var(--color-border)' : undefined, borderLeft: hideHorseName ? 'none' : '3px solid #d1d5db', background: 'var(--color-bg)', padding: '9px 11px', marginBottom: hideHorseName ? 0 : 6, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: issue.treatment_notes ? 6 : 0, flexWrap: 'nowrap', minWidth: 0 }}>
        {!hideHorseName && (
          <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
            🐴 {issue.horse_name}
          </span>
        )}
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 500, whiteSpace: 'nowrap', background: 'var(--color-surface)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', flexShrink: 0 }}>
          {LOCATION_LABELS[issue.location]} · {TYPE_LABELS[issue.type]}
        </span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--color-surface)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', flexShrink: 0 }}>
          {FREQUENCY_LABELS[issue.frequency]}
        </span>
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>Delete?</span>
            <button onClick={e => { e.stopPropagation(); handleDelete() }} disabled={deleting} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}>{deleting ? '...' : 'Yes'}</button>
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>No</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <IconBtn onClick={onEdit} title="Edit">✎</IconBtn>
            <IconBtn onClick={handleResolve} disabled={resolving} title="Resolve" success>✓</IconBtn>
            <IconBtn onClick={() => setConfirmDelete(true)} title="Delete" danger>✕</IconBtn>
          </div>
        )}
      </div>

      {issue.treatment_notes && (
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-3)', lineHeight: 1.4, margin: 0, ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>
            {issue.treatment_notes}
          </p>
          {hasLongNotes && (
            <button onClick={e => { e.stopPropagation(); setExpanded(ex => !ex) }} style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', padding: '2px 0 0', cursor: 'pointer', fontWeight: 500 }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {issue.notes && (
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0 0 4px', lineHeight: 1.4 }}>{issue.notes}</p>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
        Opened {openedDate}
      </div>
    </div>
  )
}

// ─── Supplement card ──────────────────────────────────────────────────────────

function SupplementCard({
  supplement, tucsonToday, hideHorseName, onEdit, onDelete, onMarkDone, onViewProfile,
}: {
  supplement: HorseSupplement; tucsonToday: string; hideHorseName?: boolean
  onEdit: () => void; onDelete: () => void; onMarkDone: () => void
  onViewProfile?: (name: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [markingDone, setMarkingDone]     = useState(false)

  const isDoneToday = supplement.done_today_date === tucsonToday

  async function handleDelete()   { setDeleting(true);    await onDelete();   setDeleting(false)   }
  async function handleMarkDone() { setMarkingDone(true); await onMarkDone(); setMarkingDone(false) }

  return (
    <div
      onClick={() => onViewProfile?.(supplement.horse_name)}
      style={{ borderRadius: hideHorseName ? 0 : 'var(--radius-md)', border: hideHorseName ? 'none' : '1px solid var(--color-border)', borderTop: hideHorseName ? '1px dashed var(--color-border)' : undefined, borderLeft: hideHorseName ? 'none' : '3px solid #0891b2', background: hideHorseName ? '#f0fdfa' : 'var(--color-bg)', padding: '9px 11px', marginBottom: hideHorseName ? 0 : 6, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', minWidth: 0, marginBottom: supplement.notes ? 5 : 0 }}>
        {!hideHorseName && (
          <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
            🐴 {supplement.horse_name}
          </span>
        )}
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', background: '#cffafe', color: '#0e7490', border: '1px solid #a5f3fc', flexShrink: 0 }}>Grain</span>
        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{supplement.supplement_name}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--color-surface)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', flexShrink: 0 }}>
          {SUPPLEMENT_FREQUENCY_LABELS[supplement.frequency]}
        </span>
        <div style={{ flex: '0 0 auto' }} />
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>Remove?</span>
            <button onClick={e => { e.stopPropagation(); handleDelete() }} disabled={deleting} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}>{deleting ? '...' : 'Yes'}</button>
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>No</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <IconBtn onClick={onEdit} title="Edit">✎</IconBtn>
            <IconBtn onClick={() => setConfirmDelete(true)} title="Remove" danger>✕</IconBtn>
          </div>
        )}
      </div>

      {supplement.notes && (
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0 0 5px', lineHeight: 1.4 }}>{supplement.notes}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {isDoneToday ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>✓ Done today</span>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)' }}>Not done</span>
            <button onClick={e => { e.stopPropagation(); handleMarkDone() }} disabled={markingDone} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 'var(--radius-sm)', border: '1px solid #0891b2', background: '#cffafe', color: '#0e7490', fontWeight: 700, cursor: markingDone ? 'not-allowed' : 'pointer', opacity: markingDone ? 0.6 : 1, whiteSpace: 'nowrap' }}>
              {markingDone ? '...' : '✓ Mark done'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Watch group (monitoring issues + supplements per horse) ──────────────────

function WatchGroup({
  horse_name, issues, supplements, tucsonToday,
  onEdit, onResolve, onDelete, onViewProfile,
  onEditSupplement, onDeleteSupplement, onMarkSupplementDone,
}: {
  horse_name: string; issues: HorseHealthIssue[]; supplements: HorseSupplement[]; tucsonToday: string
  onEdit: (i: HorseHealthIssue) => void; onResolve: (i: HorseHealthIssue) => void; onDelete: (i: HorseHealthIssue) => void
  onViewProfile: (name: string) => void
  onEditSupplement: (s: HorseSupplement) => void; onDeleteSupplement: (s: HorseSupplement) => void; onMarkSupplementDone: (s: HorseSupplement) => void
}) {
  const totalItems = issues.length + supplements.length

  if (totalItems === 1 && issues.length === 1) {
    return <WatchCard issue={issues[0]} onEdit={() => onEdit(issues[0])} onResolve={() => onResolve(issues[0])} onDelete={() => onDelete(issues[0])} onViewProfile={onViewProfile} />
  }
  if (totalItems === 1 && supplements.length === 1) {
    return <SupplementCard supplement={supplements[0]} tucsonToday={tucsonToday} onEdit={() => onEditSupplement(supplements[0])} onDelete={() => onDeleteSupplement(supplements[0])} onMarkDone={() => onMarkSupplementDone(supplements[0])} onViewProfile={onViewProfile} />
  }

  return (
    <div
      onClick={() => onViewProfile(horse_name)}
      style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', borderLeft: '3px solid #d1d5db', background: 'var(--color-bg)', marginBottom: 6, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderBottom: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.02)' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          🐴 {horse_name}
        </span>
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'var(--color-surface)', color: 'var(--color-text-3)', border: '1px solid var(--color-border)', fontWeight: 600 }}>
          {totalItems} items
        </span>
      </div>
      {issues.map(issue => (
        <WatchCard key={issue.id} issue={issue} hideHorseName onEdit={() => onEdit(issue)} onResolve={() => onResolve(issue)} onDelete={() => onDelete(issue)} />
      ))}
      {supplements.map(s => (
        <SupplementCard key={s.id} supplement={s} tucsonToday={tucsonToday} hideHorseName onEdit={() => onEditSupplement(s)} onDelete={() => onDeleteSupplement(s)} onMarkDone={() => onMarkSupplementDone(s)} />
      ))}
    </div>
  )
}

// ─── Lame flag card ───────────────────────────────────────────────────────────

function LameFlagCard({ flag, onMarkFit }: { flag: LameFlag; onMarkFit: () => Promise<void> }) {
  const [markingFit, setMarkingFit] = useState(false)
  const isLame     = flag.flag_type === 'lame'
  const borderColor = isLame ? '#dc2626' : '#d97706'
  const flagDate   = new Date(flag.flagged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  async function handleMarkFit() { setMarkingFit(true); await onMarkFit(); setMarkingFit(false) }

  return (
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', borderLeft: `4px solid ${borderColor}`, background: isLame ? '#fef2f2' : '#fffbeb', padding: '10px 12px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>🐴 {flag.horse_name}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, background: isLame ? '#fee2e2' : '#fef3c7', color: isLame ? '#dc2626' : '#92400e', border: `1px solid ${isLame ? '#fca5a5' : '#fcd34d'}` }}>
          {isLame ? 'Lame' : 'Stiff/Sore'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>Flagged {flagDate}</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleMarkFit} disabled={markingFit} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${borderColor}`, background: isLame ? '#fee2e2' : '#fef3c7', color: isLame ? '#dc2626' : '#92400e', fontWeight: 700, cursor: markingFit ? 'not-allowed' : 'pointer', opacity: markingFit ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {markingFit ? '...' : '✓ Mark fit'}
        </button>
      </div>
      {flag.notes && <p style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 6, lineHeight: 1.4, margin: '6px 0 0' }}>{flag.notes}</p>}
    </div>
  )
}

// ─── Quick flag form ──────────────────────────────────────────────────────────

function QuickFlagForm({ onSave, extraNames = [] }: {
  onSave: (horseName: string, flagType: 'lame' | 'stiff_sore', notes: string) => Promise<void>
  extraNames?: string[]
}) {
  const [horseName, setHorseName] = useState('')
  const [flagType, setFlagType]   = useState<'lame' | 'stiff_sore'>('lame')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSave() {
    if (!horseName) return
    setSaving(true); setError(null)
    try {
      await onSave(horseName, flagType, notes)
      setHorseName(''); setNotes(''); setFlagType('lame')
    } catch { setError('Failed to save — please try again') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Quick flag</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4, display: 'block' }}>Horse</label>
          <HorseAutocomplete value={horseName} onChange={setHorseName} autoFocus={false} extraNames={extraNames} />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4, display: 'block' }}>Type</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['lame', 'stiff_sore'] as const).map(type => (
              <button key={type} onClick={() => setFlagType(type)} style={{ padding: '5px 11px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${flagType === type ? (type === 'lame' ? '#dc2626' : '#d97706') : 'var(--color-border)'}`, background: flagType === type ? (type === 'lame' ? '#fee2e2' : '#fef3c7') : 'var(--color-surface)', color: flagType === type ? (type === 'lame' ? '#dc2626' : '#92400e') : 'var(--color-text-2)' }}>
                {type === 'lame' ? 'Lame' : 'Stiff/Sore'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 120 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4, display: 'block' }}>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. favoring left front..." style={{ fontSize: 13, width: '100%' }} />
        </div>
        <button onClick={handleSave} disabled={!horseName || saving} style={{ padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: !horseName || saving ? 'not-allowed' : 'pointer', opacity: !horseName || saving ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {saving ? 'Saving...' : 'Flag horse'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
    </div>
  )
}

// ─── Lame flag view ───────────────────────────────────────────────────────────

function LameFlagView({ activeFlags, vetIssues, onMarkFit, onLameFlag, onViewVetRequired, extraNames = [] }: {
  activeFlags: LameFlag[]; vetIssues: HorseHealthIssue[]
  onMarkFit: (flag: LameFlag) => Promise<void>
  onLameFlag: (horseName: string, flagType: 'lame' | 'stiff_sore', notes: string) => Promise<void>
  onViewVetRequired: () => void; extraNames?: string[]
}) {
  const lameFlags  = activeFlags.filter(f => f.flag_type === 'lame')
  const stiffFlags = activeFlags.filter(f => f.flag_type === 'stiff_sore')

  return (
    <div>
      <QuickFlagForm onSave={onLameFlag} extraNames={extraNames} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lame · {lameFlags.length}</div>
          <div style={{ flex: 1, height: 1, background: '#fca5a5' }} />
          {lameFlags.length > 0 && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>Out of pool</span>}
        </div>
        {lameFlags.length === 0
          ? <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No horses flagged as lame</p>
          : lameFlags.map(flag => <LameFlagCard key={flag.id} flag={flag} onMarkFit={() => onMarkFit(flag)} />)}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Stiff / Sore · {stiffFlags.length}</div>
          <div style={{ flex: 1, height: 1, background: '#fcd34d' }} />
          {stiffFlags.length > 0 && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 500 }}>Stays in pool · flagged on board</span>}
        </div>
        {stiffFlags.length === 0
          ? <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No horses flagged as stiff/sore</p>
          : stiffFlags.map(flag => <LameFlagCard key={flag.id} flag={flag} onMarkFit={() => onMarkFit(flag)} />)}
      </div>

      {vetIssues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vet Required · {vetIssues.length}</div>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            <button onClick={onViewVetRequired} style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, whiteSpace: 'nowrap' }}>View all →</button>
          </div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {vetIssues.map((issue, i) => {
              const openedDate = new Date(issue.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              return (
                <div key={issue.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: i < vetIssues.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>🐴 {issue.horse_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{LOCATION_LABELS[issue.location]} · {TYPE_LABELS[issue.type]}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>Since {openedDate}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── History row (with delete) ────────────────────────────────────────────────

function HistoryRow({ issue, onDelete }: { issue: HorseHealthIssue; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const resolvedDate = issue.resolved_at ? new Date(issue.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const badge = severityBadgeStyle(issue.severity)

  async function handleDelete() { setDeleting(true); await onDelete(); setDeleting(false) }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginBottom: 6, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, fontSize: 13, minWidth: 80 }}>🐴 {issue.horse_name}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>·</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{TYPE_LABELS[issue.type]}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>·</span>
      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 500, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
        {SEVERITY_LABELS[issue.severity]}
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-text-3)', marginLeft: 'auto' }}>Resolved {resolvedDate}</span>
      {confirmDelete ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={handleDelete} disabled={deleting} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}>{deleting ? '...' : 'Yes'}</button>
          <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} title="Delete from history" style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.5 }}>✕</button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActiveFilter = 'all' | 'doctoring' | 'monitoring' | 'sores' | 'lame'

const FILTER_CHIPS: { key: ActiveFilter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'doctoring',  label: 'Doctoring' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'sores',      label: 'Sores' },
  { key: 'lame',       label: 'Lame' },
]

function applyFilter(issues: HorseHealthIssue[], filter: ActiveFilter): HorseHealthIssue[] {
  if (filter === 'all')        return issues
  if (filter === 'doctoring')  return issues.filter(i => i.severity === 'vet_required' || i.severity === 'needs_treatment')
  if (filter === 'monitoring') return issues.filter(i => i.severity === 'monitoring')
  if (filter === 'sores')      return issues.filter(i => i.type === 'sore')
  return issues
}

export default function HealthPage() {
  const [issues, setIssues]                         = useState<HorseHealthIssue[]>([])
  const [supplements, setSupplements]               = useState<HorseSupplement[]>([])
  const [lameFlags, setLameFlags]                   = useState<LameFlag[]>([])
  const [otherAnimalNames, setOtherAnimalNames]     = useState<string[]>([])
  const [loading, setLoading]                       = useState(true)
  const [activeFilter, setActiveFilter]             = useState<ActiveFilter>('all')
  const [historySearch, setHistorySearch]           = useState('')
  const [showLogModal, setShowLogModal]             = useState(false)
  const [editingIssue, setEditingIssue]             = useState<HorseHealthIssue | null>(null)
  const [editingSupplement, setEditingSupplement]   = useState<HorseSupplement | null>(null)
  const [profileHorse, setProfileHorse]             = useState<string | null>(null)

  const tucsonToday = getTucsonToday()

  const fetchData = useCallback(async () => {
    try {
      const [activeRes, resolvedRes, lameRes, otherRes, suppRes] = await Promise.all([
        fetch('/api/health?status=active').then(r => r.json()),
        fetch('/api/health?status=resolved').then(r => r.json()),
        fetch('/api/lame').then(r => r.json()),
        fetch('/api/other-animals').then(r => r.json()),
        fetch('/api/supplements').then(r => r.json()),
      ])
      setIssues([...(activeRes.issues || []), ...(resolvedRes.issues || [])])
      setLameFlags(lameRes.flags || [])
      setOtherAnimalNames((otherRes.animals || []).map((a: any) => a.name as string))
      setSupplements(suppRes.supplements || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived data ──

  const doctorIssues = useMemo(
    () => issues
      .filter(i => i.status === 'active' && (i.severity === 'vet_required' || i.severity === 'needs_treatment'))
      .sort((a, b) => {
        const nc = a.horse_name.localeCompare(b.horse_name)
        if (nc !== 0) return nc
        return (a.severity === 'vet_required' ? 0 : 1) - (b.severity === 'vet_required' ? 0 : 1)
      }),
    [issues]
  )
  const watchIssues = useMemo(
    () => issues
      .filter(i => i.status === 'active' && i.severity === 'monitoring')
      .sort((a, b) => a.horse_name.localeCompare(b.horse_name)),
    [issues]
  )
  const resolvedIssues   = useMemo(() => issues.filter(i => i.status === 'resolved'), [issues])
  const activeIssues     = useMemo(() => [...doctorIssues, ...watchIssues], [doctorIssues, watchIssues])
  const activeLameFlags  = useMemo(() => lameFlags.filter(f => f.status === 'active'), [lameFlags])
  const activeSupplements = useMemo(() => supplements, [supplements])

  const vetIssuesForLameView = useMemo(
    () => doctorIssues.filter(i => i.severity === 'vet_required'),
    [doctorIssues]
  )

  const filteredDoctor = useMemo(() => applyFilter(doctorIssues, activeFilter), [doctorIssues, activeFilter])
  const filteredWatch  = useMemo(() => applyFilter(watchIssues, activeFilter),  [watchIssues, activeFilter])

  // Only show supplements in All and Monitoring views
  const supplementsForWatch = useMemo(
    () => (activeFilter === 'all' || activeFilter === 'monitoring') ? activeSupplements : [],
    [activeFilter, activeSupplements]
  )

  // Group doctoring issues by horse
  const doctorGroups = useMemo(() => {
    const map = new Map<string, HorseHealthIssue[]>()
    for (const issue of filteredDoctor) {
      if (!map.has(issue.horse_name)) map.set(issue.horse_name, [])
      map.get(issue.horse_name)!.push(issue)
    }
    return Array.from(map.entries()).map(([horse_name, iss]) => ({ horse_name, issues: iss }))
  }, [filteredDoctor])

  // Group watching issues + supplements by horse
  const watchGroups = useMemo(() => {
    const map = new Map<string, { issues: HorseHealthIssue[]; supplements: HorseSupplement[] }>()
    for (const issue of filteredWatch) {
      if (!map.has(issue.horse_name)) map.set(issue.horse_name, { issues: [], supplements: [] })
      map.get(issue.horse_name)!.issues.push(issue)
    }
    for (const sup of supplementsForWatch) {
      if (!map.has(sup.horse_name)) map.set(sup.horse_name, { issues: [], supplements: [] })
      map.get(sup.horse_name)!.supplements.push(sup)
    }
    return Array.from(map.entries())
      .map(([horse_name, data]) => ({ horse_name, ...data }))
      .sort((a, b) => a.horse_name.localeCompare(b.horse_name))
  }, [filteredWatch, supplementsForWatch])

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return resolvedIssues
    const q = historySearch.toLowerCase()
    return resolvedIssues.filter(i => i.horse_name.toLowerCase().includes(q))
  }, [resolvedIssues, historySearch])

  const nothingActive = activeFilter !== 'lame' && doctorGroups.length === 0 && watchGroups.length === 0

  // ── Handlers ──

  async function handleResolve(issue: HorseHealthIssue) {
    const resolved_at = new Date().toISOString()
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: 'resolved', resolved_at } : i))
    await fetch('/api/health', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: issue.id, status: 'resolved', resolved_at }) })
    await fetchData()
  }

  async function handleMarkDone(issue: HorseHealthIssue) {
    const last_treated_at = new Date().toISOString()
    const done_today_date = tucsonToday
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, done_today: true, done_today_date, last_treated_at } : i))
    const res = await fetch('/api/health', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: issue.id, done_today: true, done_today_date, last_treated_at }) })
    if (!res.ok) {
      setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, done_today: issue.done_today, done_today_date: issue.done_today_date, last_treated_at: issue.last_treated_at } : i))
    }
  }

  async function handleDelete(issue: HorseHealthIssue) {
    setIssues(prev => prev.filter(i => i.id !== issue.id))
    await fetch(`/api/health?id=${encodeURIComponent(issue.id)}`, { method: 'DELETE' })
    if (issue.severity === 'vet_required') await fetchData()
  }

  async function handleDeleteHistory(issue: HorseHealthIssue) {
    setIssues(prev => prev.filter(i => i.id !== issue.id))
    await fetch(`/api/health?id=${encodeURIComponent(issue.id)}`, { method: 'DELETE' })
  }

  async function handleMarkFit(flag: LameFlag) {
    const resolved_at = new Date().toISOString()
    setLameFlags(prev => prev.map(f => f.id === flag.id ? { ...f, status: 'resolved', resolved_at } : f))
    await fetch('/api/lame', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: flag.id, status: 'resolved', resolved_at }) })
    await fetchData()
  }

  async function handleLameFlag(horseName: string, flagType: 'lame' | 'stiff_sore', notes: string) {
    const res = await fetch('/api/lame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horse_name: horseName, flag_type: flagType, notes: notes || null }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to flag') }
    await fetchData()
  }

  async function handleMarkSupplementDone(supplement: HorseSupplement) {
    const done_today_date = tucsonToday
    setSupplements(prev => prev.map(s => s.id === supplement.id ? { ...s, done_today: true, done_today_date } : s))
    const res = await fetch('/api/supplements', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: supplement.id, done_today: true, done_today_date }) })
    if (!res.ok) {
      setSupplements(prev => prev.map(s => s.id === supplement.id ? { ...s, done_today: supplement.done_today, done_today_date: supplement.done_today_date } : s))
    }
  }

  async function handleDeleteSupplement(supplement: HorseSupplement) {
    setSupplements(prev => prev.filter(s => s.id !== supplement.id))
    await fetch(`/api/supplements?id=${encodeURIComponent(supplement.id)}`, { method: 'DELETE' })
  }

  async function handleSaved() {
    setShowLogModal(false)
    setEditingIssue(null)
    setEditingSupplement(null)
    await fetchData()
  }

  // Profile horse data
  const profileIssues      = useMemo(() => profileHorse ? issues.filter(i => i.horse_name === profileHorse) : [], [profileHorse, issues])
  const profileSupplements = useMemo(() => profileHorse ? supplements.filter(s => s.horse_name === profileHorse) : [], [profileHorse, supplements])

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
                {loading ? 'Loading...' : activeFilter === 'lame'
                  ? `${activeLameFlags.length} active flag${activeLameFlags.length !== 1 ? 's' : ''}`
                  : `${activeIssues.length} issue${activeIssues.length !== 1 ? 's' : ''}${activeSupplements.length > 0 ? ` · ${activeSupplements.length} supplement${activeSupplements.length !== 1 ? 's' : ''}` : ''}`}
              </p>
            </div>
            <button onClick={() => setShowLogModal(true)} style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              + Log issue
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {FILTER_CHIPS.map(chip => {
              const isActive = activeFilter === chip.key
              const isLameChip = chip.key === 'lame'
              return (
                <button key={chip.key} onClick={() => setActiveFilter(chip.key)} style={{ padding: '3px 11px', borderRadius: 999, flexShrink: 0, border: `1px solid ${isActive ? (isLameChip ? '#d97706' : 'var(--color-accent)') : 'var(--color-border)'}`, background: isActive ? (isLameChip ? '#d97706' : 'var(--color-accent)') : 'var(--color-surface)', color: isActive ? '#fff' : 'var(--color-text-2)', fontSize: 12, cursor: 'pointer', fontWeight: isActive ? 600 : 400 }}>
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ padding: 20, maxWidth: 820 }} className="health-content">

          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '24px 0' }}>Loading...</p>
          ) : activeFilter === 'lame' ? (
            <LameFlagView
              activeFlags={activeLameFlags} vetIssues={vetIssuesForLameView}
              onMarkFit={handleMarkFit} onLameFlag={handleLameFlag}
              onViewVetRequired={() => setActiveFilter('doctoring')}
              extraNames={otherAnimalNames}
            />
          ) : nothingActive ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <p style={{ fontSize: 13 }}>
                {activeFilter === 'all' ? 'No active health issues' : `No ${FILTER_CHIPS.find(c => c.key === activeFilter)?.label.toLowerCase()} issues found`}
              </p>
            </div>
          ) : (
            <>
              {/* ── Doctoring ── */}
              {doctorGroups.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Doctoring · {filteredDoctor.length}</div>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                  {doctorGroups.map(group => (
                    <DoctorGroup
                      key={group.horse_name} horse_name={group.horse_name} issues={group.issues} tucsonToday={tucsonToday}
                      onEdit={setEditingIssue} onResolve={handleResolve} onMarkDone={handleMarkDone}
                      onDelete={handleDelete} onViewProfile={setProfileHorse}
                    />
                  ))}
                </div>
              )}

              {/* ── Watching ── */}
              {watchGroups.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Watching · {filteredWatch.length + supplementsForWatch.length}
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>
                  {watchGroups.map(group => (
                    <WatchGroup
                      key={group.horse_name} horse_name={group.horse_name} issues={group.issues}
                      supplements={group.supplements} tucsonToday={tucsonToday}
                      onEdit={setEditingIssue} onResolve={handleResolve} onDelete={handleDelete}
                      onViewProfile={setProfileHorse}
                      onEditSupplement={setEditingSupplement} onDeleteSupplement={handleDeleteSupplement}
                      onMarkSupplementDone={handleMarkSupplementDone}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* History */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                History · {resolvedIssues.length} resolved
              </div>
              <input placeholder="Search by horse name..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} style={{ fontSize: 13, width: 200 }} />
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
            ) : filteredHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-3)' }}>
                <p style={{ fontSize: 13 }}>{historySearch ? 'No results for that horse' : 'No resolved issues yet'}</p>
              </div>
            ) : filteredHistory.map(issue => (
              <HistoryRow key={issue.id} issue={issue} onDelete={() => handleDeleteHistory(issue)} />
            ))}
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
        <IssueFormModal issue={null} onClose={() => setShowLogModal(false)} onSaved={handleSaved} extraNames={otherAnimalNames} />
      )}
      {editingIssue && (
        <IssueFormModal issue={editingIssue} onClose={() => setEditingIssue(null)} onSaved={handleSaved} extraNames={otherAnimalNames} />
      )}
      {editingSupplement && (
        <SupplementEditModal supplement={editingSupplement} onClose={() => setEditingSupplement(null)} onSaved={handleSaved} />
      )}
      {profileHorse && (
        <HorseProfileModal horseName={profileHorse} allIssues={profileIssues} allSupplements={profileSupplements} onClose={() => setProfileHorse(null)} />
      )}
    </div>
  )
}
