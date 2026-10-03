'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES } from '@/lib/horses'
import { useRole } from '@/lib/auth-context'
import { categorizeWork, WORK_LABELS as WORK_CAT_LABELS, type WorkCategory } from '@/lib/shoeWork'

// TODO: track size history per horse, surface last known size,
// run analytics on shoe types and sizes across the herd

// Used in Add Horse prompt and Log a Visit modal
const WORK_OPTIONS = [
  { key: 'fronts',  label: 'Fronts' },
  { key: 'rears',   label: 'Rears' },
  { key: 'all_4s',  label: 'All 4s' },
  { key: 'trim',    label: 'Trim' },
]

// Card edit select — includes legacy values for backward compat, shorter labels
const CARD_WORK_OPTIONS = [
  { key: 'fronts',   label: 'Fronts' },
  { key: 'rears',    label: 'Rears' },
  { key: 'all_4s',   label: '4s' },
  { key: 'trim',     label: 'Trim' },
  { key: 'reset',    label: 'Reset' },
  { key: 'full_set', label: 'Full' },
]

const WORK_LABELS: Record<string, string> = {
  fronts: 'Fronts', rears: 'Rears', all_4s: 'All 4s', trim: 'Trim', reset: 'Reset', full_set: 'Full set',
}

const SHOE_TYPES = [
  { key: 'regular',  label: 'Regular' },
  { key: 'nb',       label: 'NB' },
  { key: 'nb_pad',   label: 'NB+Pad' },
  { key: 'pad',      label: 'Pad' },
  { key: 'trim',     label: 'Trim' },
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

const SHOE_TYPE_COLORS: Record<string, { bg: string; border: string; color: string; label: string }> = {
  regular:  { bg: '#f3f4f6', border: '#d1d5db', color: '#374151', label: 'Regular' },
  nb:       { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', label: 'NB' },
  nb_pad:   { bg: '#fed7aa', border: '#fb923c', color: '#7c2d12', label: 'NB+Pad' },
  pad:      { bg: '#dcfce7', border: '#86efac', color: '#166534', label: 'Pad' },
  trim:     { bg: '#f0f9ff', border: '#7dd3fc', color: '#0369a1', label: 'Trim' },
  plastics: { bg: '#ede9fe', border: '#c4b5fd', color: '#7c3aed', label: 'Plastics' },
}

const FILTER_CHIPS = [
  { key: 'all',         label: 'All' },
  { key: 'drugger',     label: 'Drugger' },
  { key: 'non_drugger', label: 'Non-drugger' },
  { key: 'priority',    label: '★ Priority' },
]

type HorseDbEntry = { id?: string; name: string; is_active: boolean; is_deceased: boolean; flags: { flag_type: string }[]; farrier?: string | null }
type Farrier = { id: string; name: string; active: boolean; created_at: string }
type OtherAnimalEntry = { id: string; name: string; farrier: string | null }

type ShoeNeed = {
  id: string
  horse_name: string
  what_needed: string
  shoe_type: string
  is_drugger: boolean
  priority: boolean
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

type HealthIssue = {
  id: string
  horse_name: string
  type: string
  status: string
  opened_at: string
}

type DoneForm = { visit_date: string; farrier_name: string; shoe_type: string; notes: string; work_done: string }

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

function horseLastVisitInfo(horseName: string, visits: FarrierVisit[]): { date: string; farrier: string } | null {
  let best: { date: string; farrier: string } | null = null
  visits.forEach(v => {
    if (v.farrier_visit_horses.some(h => h.horse_name === horseName)) {
      if (!best || v.visit_date > best.date) best = { date: v.visit_date, farrier: v.farrier_name }
    }
  })
  return best
}

function normalizeFarrier(s: string): string {
  return s.trim().toLowerCase()
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--color-accent)' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}
    >
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
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

function HorseAutocomplete({ value, onChange, placeholder, extraNames = [] }: { value: string; onChange: (v: string) => void; placeholder?: string; extraNames?: string[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [show, setShow] = useState(false)

  function handleInput(v: string) {
    onChange(v)
    if (v.length >= 1) {
      const q = v.toLowerCase()
      const allNames = Array.from(new Set([
        ...HORSES.filter(h => h.status === 'active').map(h => h.name),
        ...extraNames,
      ]))
      const matches = allNames
        .filter(n => n.toLowerCase().includes(q))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(q)
          const bStarts = b.toLowerCase().startsWith(q)
          if (aStarts !== bStarts) return aStarts ? -1 : 1
          return a.length - b.length
        })
        .slice(0, 8)
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
  need, onUpdate, onRemove, onToggleDrugger, onTogglePriority, onViewProfile,
  markingDone, setMarkingDone, doneForm, setDoneForm, onMarkDone, saving, markDoneError,
  activeFarriers, isViewer, horseFarrier, onSetFarrier,
}: {
  need: ShoeNeed
  onUpdate: (id: string, field: string, value: string) => void
  onRemove: (id: string) => void
  onToggleDrugger: (id: string, currentValue: boolean) => void
  onTogglePriority: (id: string, currentValue: boolean) => void
  onViewProfile: (need: ShoeNeed) => void
  markingDone: string | null
  setMarkingDone: (id: string | null) => void
  doneForm: DoneForm
  setDoneForm: (f: DoneForm) => void
  onMarkDone: (need: ShoeNeed) => void
  saving: boolean
  markDoneError: string | null
  activeFarriers: Farrier[]
  isViewer?: boolean
  horseFarrier?: string | null
  onSetFarrier?: (horseName: string, farrier: string | null) => Promise<string | null>
}) {
  const [horseName, setHorseName] = useState(need.horse_name)
  const [farrierOther, setFarrierOther] = useState(false)
  const [showFarrierCtrl, setShowFarrierCtrl] = useState(false)
  const [farrierCtrlEnabled, setFarrierCtrlEnabled] = useState(false)
  const [farrierCtrlValue, setFarrierCtrlValue] = useState<string | null>(null)
  const [farrierCtrlSaving, setFarrierCtrlSaving] = useState(false)
  const [farrierCtrlError, setFarrierCtrlError] = useState<string | null>(null)
  useEffect(() => { setHorseName(need.horse_name) }, [need.horse_name])

  const isExpanded = markingDone === need.id

  function toggleExpand() {
    if (isExpanded) {
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '', work_done: '' })
    } else {
      setMarkingDone(need.id)
      const cat = categorizeWork(need.what_needed)
      const defaultWork = cat !== 'other' ? WORK_CAT_LABELS[cat] : 'Full set'
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: need.shoe_type || 'regular', notes: '', work_done: defaultWork })
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

  const isFronts = need.what_needed === 'fronts'
  const created = new Date(need.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div
      onClick={() => onViewProfile(need)}
      className="need-row"
      style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', marginBottom: 5, cursor: 'pointer' }}
    >
      {/* Row 1: star + emoji + editable name + drugger + done + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {!isViewer && <button
          onClick={e => { e.stopPropagation(); onTogglePriority(need.id, need.priority) }}
          title={need.priority ? 'Remove priority' : 'Mark as priority'}
          style={{
            background: 'none', border: 'none', fontSize: 16, cursor: 'pointer',
            flexShrink: 0, padding: '0 1px', lineHeight: 1,
            color: need.priority ? '#f59e0b' : 'var(--color-text-muted)',
          }}
        >
          {need.priority ? '★' : '☆'}
        </button>}
        {isViewer && need.priority && <span style={{ fontSize: 16, flexShrink: 0, color: '#f59e0b' }}>★</span>}
        <span style={{ fontSize: 14, flexShrink: 0 }}>🐴</span>
        {isViewer
          ? <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 60 }}>{horseName}</span>
          : !onSetFarrier
            ? <input
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
            : <button
                onClick={e => { e.stopPropagation(); setFarrierCtrlEnabled(!!horseFarrier); setFarrierCtrlValue(horseFarrier ?? activeFarriers[0]?.name ?? null); setFarrierCtrlError(null); setShowFarrierCtrl(v => !v) }}
                style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 60, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', textAlign: 'left' }}
              >
                {horseName}
              </button>
        }
        {horseFarrier && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {horseFarrier.split(' ')[0]} only
          </span>
        )}
        {!isViewer && <button
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
        </button>}
        {isViewer && need.is_drugger && <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 999, flexShrink: 0, lineHeight: 1.5, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>💊</span>}
        {!isViewer && <button
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
        </button>}
        {!isViewer && <button
          onClick={e => { e.stopPropagation(); onRemove(need.id) }}
          style={{
            width: 22, height: 22, padding: 0, borderRadius: 'var(--radius-sm)', flexShrink: 0,
            border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>}
      </div>

      {/* Row 2: shoe type badge + work select + date — all inline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <ShoeTypeBadge shoeType={need.shoe_type || 'regular'} />
        {isViewer
          ? <span style={{ fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600, flexShrink: 0, border: isFronts ? '1px solid #fca5a5' : '1px solid var(--color-border)', background: isFronts ? '#fee2e2' : 'var(--color-surface)', color: isFronts ? '#dc2626' : 'var(--color-text-3)' }}>{CARD_WORK_OPTIONS.find(o => o.key === need.what_needed)?.label ?? need.what_needed}</span>
          : <select
              value={need.what_needed}
              onClick={e => e.stopPropagation()}
              onChange={e => { e.stopPropagation(); onUpdate(need.id, 'what_needed', e.target.value) }}
              style={{
                fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600,
                cursor: 'pointer', flexShrink: 0, flexGrow: 0, width: 'auto',
                appearance: 'none', WebkitAppearance: 'none',
                border: isFronts ? '1px solid #fca5a5' : '1px solid var(--color-border)',
                background: isFronts ? '#fee2e2' : 'var(--color-surface)',
                color: isFronts ? '#dc2626' : 'var(--color-text-3)',
              }}
            >
              {CARD_WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        }
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Added {created}</span>
      </div>

      {/* Inline farrier control */}
      {showFarrierCtrl && !isViewer && onSetFarrier && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ marginTop: 8, padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToggleSwitch
              on={farrierCtrlEnabled}
              onToggle={() => {
                const next = !farrierCtrlEnabled
                setFarrierCtrlEnabled(next)
                if (next && !farrierCtrlValue && activeFarriers.length > 0) {
                  setFarrierCtrlValue(activeFarriers[0].name)
                }
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
              {farrierCtrlEnabled && farrierCtrlValue ? `On · ${farrierCtrlValue}` : 'Specific farrier only'}
            </span>
          </div>
          {farrierCtrlEnabled && activeFarriers.length > 0 && (
            <select
              value={farrierCtrlValue ?? ''}
              onChange={e => setFarrierCtrlValue(e.target.value || null)}
              style={{ fontSize: 12, marginTop: 6, display: 'block' }}
            >
              {activeFarriers.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
          )}
          {farrierCtrlError && (
            <div style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 6 }}>⚠ {farrierCtrlError}</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={async () => {
                if (!onSetFarrier) return
                setFarrierCtrlSaving(true)
                setFarrierCtrlError(null)
                const newFarrier = farrierCtrlEnabled ? (farrierCtrlValue ?? null) : null
                const err = await onSetFarrier(need.horse_name, newFarrier)
                setFarrierCtrlSaving(false)
                if (err) { setFarrierCtrlError(err); return }
                setShowFarrierCtrl(false)
              }}
              disabled={farrierCtrlSaving}
              style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: farrierCtrlSaving ? 'not-allowed' : 'pointer' }}
            >
              {farrierCtrlSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowFarrierCtrl(false)}
              style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded: record visit */}
      {isExpanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ marginTop: 10, padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Record this visit</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 5 }}>What was done?</div>
            <select
              value={doneForm.work_done}
              onChange={e => setDoneForm({ ...doneForm, work_done: e.target.value })}
              style={{ fontSize: 12 }}
            >
              {['Full set', 'Fronts', 'Rears', 'Partial', 'Trim'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }} className="done-form-grid">
            <div>
              <label>Visit Date</label>
              <input type="date" value={doneForm.visit_date} onChange={e => setDoneForm({ ...doneForm, visit_date: e.target.value })} />
            </div>
            <div>
              <label>Farrier</label>
              <select
                value={farrierOther ? '__other__' : doneForm.farrier_name}
                onChange={e => {
                  if (e.target.value === '__other__') { setFarrierOther(true); setDoneForm({ ...doneForm, farrier_name: '' }) }
                  else { setFarrierOther(false); setDoneForm({ ...doneForm, farrier_name: e.target.value }) }
                }}
                style={{ fontSize: 13 }}
              >
                <option value="">— select farrier —</option>
                {activeFarriers.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                <option value="__other__">Other…</option>
              </select>
              {farrierOther && (
                <input
                  value={doneForm.farrier_name}
                  onChange={e => setDoneForm({ ...doneForm, farrier_name: e.target.value })}
                  placeholder="Farrier name…"
                  style={{ fontSize: 13, marginTop: 6 }}
                />
              )}
              {horseFarrier && doneForm.farrier_name && normalizeFarrier(doneForm.farrier_name) !== normalizeFarrier(horseFarrier) && (
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 5, fontStyle: 'italic' }}>
                  Note: {need.horse_name} is a {horseFarrier.split(' ')[0]}-only horse
                </div>
              )}
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
          {markDoneError && (
            <div style={{ fontSize: 12, color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', marginBottom: 10 }}>
              ⚠ {markDoneError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setMarkingDone(null); setDoneForm({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '', work_done: '' }) }}
              style={{
                padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                color: 'var(--color-text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
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

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Visit History ({horseVisits.length})
        </div>
        {horseVisits.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '20px 0' }}>No history recorded</p>
        ) : horseVisits.map((v, i) => (
          <div key={i} style={{ padding: '10px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
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
  suggestion: { horse_name: string; days: number | null; neverDone: boolean }
  onAdd: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)

  async function handle() {
    setAdding(true)
    try { await onAdd() } finally { setAdding(false) }
  }

  const ageLabel = suggestion.neverDone
    ? 'Never done'
    : `${Math.floor((suggestion.days ?? 0) / 7)} weeks ago`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: 6 }}>
      <span style={{ fontSize: 14 }}>🐴</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{suggestion.horse_name}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{ageLabel}</span>
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

// ─── FarriersTab ──────────────────────────────────────────────────────────────

function FarriersTab({
  farriers,
  horseDbData,
  otherAnimals,
  visits,
  isAdmin,
  onOpenProfile,
  onAdd,
  onRename,
  onToggleActive,
}: {
  farriers: Farrier[]
  horseDbData: HorseDbEntry[]
  otherAnimals: OtherAnimalEntry[]
  visits: FarrierVisit[]
  isAdmin: boolean
  onOpenProfile: (name: string) => void
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, oldName: string, newName: string) => Promise<string | null>
  onToggleActive: (id: string, active: boolean) => Promise<string | null>
}) {
  const [addName, setAddName] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  async function handleAdd() {
    if (!addName.trim()) return
    setAddSaving(true); setAddError(null)
    try { await onAdd(addName.trim()); setAddName('') }
    catch (e: unknown) { setAddError(e instanceof Error ? e.message : 'Failed to add farrier') }
    finally { setAddSaving(false) }
  }

  async function handleRename(f: Farrier) {
    if (!renameVal.trim() || renameVal.trim() === f.name) { setRenamingId(null); return }
    setRenameError(null)
    const err = await onRename(f.id, f.name, renameVal.trim())
    if (err) { setRenameError(err); return }
    setRenamingId(null)
  }

  function assignedCount(farrierName: string) {
    const norm = normalizeFarrier(farrierName)
    const horses = horseDbData.filter(h => h.farrier && normalizeFarrier(h.farrier) === norm && h.is_active && !h.is_deceased).length
    const others = otherAnimals.filter(a => a.farrier && normalizeFarrier(a.farrier) === norm).length
    return horses + others
  }

  function visitStats(farrierName: string) {
    const norm = normalizeFarrier(farrierName)
    const fv = visits.filter(v => normalizeFarrier(v.farrier_name) === norm)
    const lastDate = fv.length ? fv.reduce((best, v) => v.visit_date > best ? v.visit_date : best, '') : null
    return { count: fv.length, lastDate: lastDate || null }
  }

  const activeFarriers = farriers.filter(f => f.active)
  const inactiveFarriers = farriers.filter(f => !f.active)

  function renderCard(f: Farrier) {
    const ac = assignedCount(f.name)
    const vs = visitStats(f.name)
    const lastDateStr = vs.lastDate
      ? new Date(vs.lastDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—'
    const isRenaming = renamingId === f.id
    return (
      <div key={f.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: 10, opacity: f.active ? 1 : 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            {isRenaming ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(f); if (e.key === 'Escape') setRenamingId(null) }}
                  autoFocus
                  style={{ flex: 1, fontSize: 14, fontWeight: 700 }}
                />
                <button onClick={() => handleRename(f)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                <button onClick={() => { setRenamingId(null); setRenameError(null) }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-3)', cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenProfile(f.name)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{f.name}</span>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, fontWeight: 600, background: f.active ? '#dcfce7' : 'var(--color-border)', color: f.active ? '#166534' : 'var(--color-text-muted)', border: `1px solid ${f.active ? '#86efac' : 'transparent'}` }}>
                    {f.active ? 'Active' : 'Inactive'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>↗</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{ac} animal{ac !== 1 ? 's' : ''} assigned</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{vs.count} visit{vs.count !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Last: {lastDateStr}</span>
                </div>
              </div>
            )}
            {renameError && isRenaming && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 5 }}>⚠ {renameError}</div>
            )}
          </div>
          {isAdmin && !isRenaming && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                onClick={() => { setRenamingId(f.id); setRenameVal(f.name); setRenameError(null) }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}
              >
                Rename
              </button>
              <button
                onClick={async () => {
                  setTogglingId(f.id); setToggleError(null)
                  const err = await onToggleActive(f.id, !f.active)
                  setTogglingId(null)
                  if (err) setToggleError(err)
                }}
                disabled={togglingId === f.id}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: `1px solid ${f.active ? 'var(--color-danger-border)' : 'var(--color-success-border)'}`, background: f.active ? 'var(--color-danger-bg)' : 'var(--color-success-bg)', color: f.active ? 'var(--color-danger)' : 'var(--color-success)', cursor: 'pointer', fontWeight: 600 }}
              >
                {togglingId === f.id ? '…' : f.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {activeFarriers.length === 0 && inactiveFarriers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-3)' }}>
          <p style={{ fontSize: 13 }}>No farriers yet.{isAdmin ? ' Add one below.' : ''}</p>
        </div>
      )}
      {activeFarriers.map(f => renderCard(f))}
      {inactiveFarriers.length > 0 && activeFarriers.length > 0 && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 10px' }}>Inactive</div>
      )}
      {inactiveFarriers.map(f => renderCard(f))}
      {toggleError && (
        <div style={{ fontSize: 12, color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', margin: '8px 0' }}>⚠ {toggleError}</div>
      )}
      {isAdmin && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>Add farrier</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Farrier name…"
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              onClick={handleAdd}
              disabled={addSaving || !addName.trim()}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: addSaving || !addName.trim() ? 'not-allowed' : 'pointer', opacity: !addName.trim() ? 0.5 : 1 }}
            >
              {addSaving ? '…' : 'Add'}
            </button>
          </div>
          {addError && <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 6 }}>⚠ {addError}</p>}
        </div>
      )}
    </div>
  )
}

// ─── FarrierProfileModal ──────────────────────────────────────────────────────

function FarrierProfileModal({ name, farriers, horseDbData, otherAnimals, visits, onClose }: {
  name: string
  farriers: Farrier[]
  horseDbData: HorseDbEntry[]
  otherAnimals: OtherAnimalEntry[]
  visits: FarrierVisit[]
  onClose: () => void
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [visitPage, setVisitPage] = useState(1)
  const [showAllTopHorses, setShowAllTopHorses] = useState(false)
  const [showAllAssigned, setShowAllAssigned] = useState(false)
  const VISIT_PAGE_SIZE = 10
  const farrierObj = farriers.find(f => f.name === name)
  const normName = normalizeFarrier(name)
  const farrierVisits = useMemo(() =>
    [...visits.filter(v => normalizeFarrier(v.farrier_name) === normName)].sort((a, b) => b.visit_date.localeCompare(a.visit_date))
  , [visits, normName])
  const assignedHorses = useMemo(() =>
    horseDbData.filter(h => h.farrier && normalizeFarrier(h.farrier) === normName && h.is_active && !h.is_deceased)
  , [horseDbData, normName])
  const assignedOthers = useMemo(() =>
    otherAnimals.filter(a => a.farrier && normalizeFarrier(a.farrier) === normName)
  , [otherAnimals, normName])
  const allAssigned = useMemo(() => [
    ...assignedHorses.map(h => ({ name: h.name, isOther: false })),
    ...assignedOthers.map(a => ({ name: a.name, isOther: true })),
  ], [assignedHorses, assignedOthers])
  const visitCount = farrierVisits.length
  const horsesShod = useMemo(() => {
    const s = new Set<string>()
    farrierVisits.forEach(v => v.farrier_visit_horses.forEach(h => s.add(h.horse_name)))
    return s.size
  }, [farrierVisits])
  const totalServices = useMemo(() =>
    farrierVisits.reduce((sum, v) => sum + v.farrier_visit_horses.length, 0)
  , [farrierVisits])
  const firstVisit = farrierVisits.length ? farrierVisits[farrierVisits.length - 1].visit_date : null
  const lastVisit  = farrierVisits.length ? farrierVisits[0].visit_date : null
  const avgPerMonth = useMemo(() => {
    if (!firstVisit || !lastVisit || visitCount < 2) return visitCount > 0 ? visitCount.toFixed(1) : '—'
    const months = Math.max((new Date(lastVisit + 'T12:00:00').getTime() - new Date(firstVisit + 'T12:00:00').getTime()) / (30.5 * 86400000), 1)
    return (visitCount / months).toFixed(1)
  }, [firstVisit, lastVisit, visitCount])
  const topHorses = useMemo(() => {
    const c: Record<string, number> = {}
    farrierVisits.forEach(v => v.farrier_visit_horses.forEach(h => { c[h.horse_name] = (c[h.horse_name] || 0) + 1 }))
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [farrierVisits])
  function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) }

  const visitTotalPages = Math.max(1, Math.ceil(farrierVisits.length / VISIT_PAGE_SIZE))
  const pagedVisits = farrierVisits.slice((visitPage - 1) * VISIT_PAGE_SIZE, visitPage * VISIT_PAGE_SIZE)
  const displayedTopHorses = showAllTopHorses ? topHorses : topHorses.slice(0, 5)
  const displayedAssigned = showAllAssigned ? allAssigned : allAssigned.slice(0, 8)
  const workBreakdown = useMemo(() => {
    const counts: Partial<Record<WorkCategory, number>> = {}
    farrierVisits.forEach(v => v.farrier_visit_horses.forEach(h => {
      const cat = categorizeWork(h.work_done)
      counts[cat] = (counts[cat] || 0) + 1
    }))
    return counts
  }, [farrierVisits])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 5 }}>{name}</h2>
            {farrierObj ? (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: farrierObj.active ? '#dcfce7' : 'var(--color-border)', color: farrierObj.active ? '#166534' : 'var(--color-text-muted)', border: `1px solid ${farrierObj.active ? '#86efac' : 'transparent'}` }}>
                {farrierObj.active ? 'Active' : 'Inactive'}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Historical</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)', flexShrink: 0 }}>✕</button>
        </div>

        {allAssigned.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Currently Assigned</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {displayedAssigned.map(a => (
                <span key={a.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 10px', borderRadius: 999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}>
                  🐴 {a.name}
                  {a.isOther && <span style={{ fontSize: 10, padding: '0px 4px', borderRadius: 999, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontWeight: 600 }}>Other</span>}
                </span>
              ))}
            </div>
            {allAssigned.length > 8 && (
              <button onClick={() => setShowAllAssigned(v => !v)} style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}>
                {showAllAssigned ? 'Show fewer' : `Show all ${allAssigned.length}`}
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {([
            { label: 'Visits', value: visitCount },
            { label: 'Unique horses shod', value: horsesShod },
            { label: 'Total services', value: totalServices },
            { label: 'First visit', value: firstVisit ? fmtDate(firstVisit) : '—' },
            { label: 'Last visit', value: lastVisit ? fmtDate(lastVisit) : '—' },
            { label: 'Avg visits/mo', value: avgPerMonth },
          ] as { label: string; value: string | number }[]).map(c => (
            <div key={c.label} style={{ padding: '10px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{c.value}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {topHorses.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Most-Done Horses</div>
            {displayedTopHorses.map(([horse, count]) => (
              <div key={horse} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 13 }}>🐴</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{horse}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{count}×</span>
              </div>
            ))}
            {topHorses.length > 5 && (
              <button onClick={() => setShowAllTopHorses(v => !v)} style={{ fontSize: 11, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}>
                {showAllTopHorses ? 'Show fewer' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {totalServices > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Work Done</div>
            <div style={{ padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              {(Object.keys(WORK_CAT_LABELS) as WorkCategory[]).map(cat => {
                const count = workBreakdown[cat] || 0
                if (count === 0) return null
                const pct = Math.round((count / totalServices) * 100)
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 52, fontSize: 11, color: 'var(--color-text-2)', textAlign: 'right', flexShrink: 0 }}>{WORK_CAT_LABELS[cat]}</div>
                    <div style={{ flex: 1, height: 10, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 3, minWidth: 2 }} />
                    </div>
                    <div style={{ width: 24, fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>{count}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Visit History ({farrierVisits.length})
          </div>
          {farrierVisits.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center', padding: '16px 0' }}>No visits recorded</p>
            : <>
                {pagedVisits.map(v => {
                  const isExp = expandedIds.has(v.id)
                  const dateStr = new Date(v.visit_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  return (
                    <div key={v.id} style={{ marginBottom: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }} onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n })}>
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{dateStr}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{v.farrier_visit_horses.length} horse{v.farrier_visit_horses.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 14, color: 'var(--color-text-3)', display: 'inline-block', transform: isExp ? 'rotate(90deg)' : 'none' }}>›</span>
                      </div>
                      {isExp && (
                        <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px', background: 'var(--color-surface)' }}>
                          {v.farrier_visit_horses.map(h => (
                            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13 }}>🐴</span>
                              <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 80 }}>{h.horse_name}</span>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>{WORK_LABELS[h.work_done] || h.work_done}</span>
                              {h.shoe_type && h.shoe_type !== 'regular' && <ShoeTypeBadge shoeType={h.shoe_type} />}
                              {h.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>sz {h.shoe_size}</span>}
                              {h.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{h.placement}</span>}
                              {h.notes && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{h.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {visitTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                    <button onClick={() => setVisitPage(p => Math.max(1, p - 1))} disabled={visitPage === 1} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: visitPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: visitPage === 1 ? 'default' : 'pointer' }}>← Newer</button>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Page {visitPage} of {visitTotalPages}</span>
                    <button onClick={() => setVisitPage(p => Math.min(visitTotalPages, p + 1))} disabled={visitPage === visitTotalPages} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: visitPage === visitTotalPages ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: visitPage === visitTotalPages ? 'default' : 'pointer' }}>Older →</button>
                  </div>
                )}
              </>
          }
        </div>
      </div>
    </div>
  )
}


export default function ShoesPage() {
  const { isViewer } = useRole()
  const [needs, setNeeds] = useState<ShoeNeed[]>([])
  const [visits, setVisits] = useState<FarrierVisit[]>([])
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([])
  const [otherAnimals, setOtherAnimals] = useState<OtherAnimalEntry[]>([])
  const [horseDbData, setHorseDbData] = useState<HorseDbEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState<{ horse_name: string; what_needed: string; shoe_type: string; notes: string; farrier: string | null; farrier_enabled: boolean } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addingSaving, setAddingSaving] = useState(false)
  const [markingDone, setMarkingDone] = useState<string | null>(null)
  const [doneForm, setDoneForm] = useState<DoneForm>({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '', work_done: '' })
  const [savingDone, setSavingDone] = useState(false)
  const savingDoneRef = useRef<boolean>(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [expandedVisitIds, setExpandedVisitIds] = useState<Set<string>>(new Set())
  const [showLogVisit, setShowLogVisit] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [farrierFilter, setFarrierFilter] = useState('all')
  const [profileNeed, setProfileNeed] = useState<ShoeNeed | null>(null)
  const [markDoneError, setMarkDoneError] = useState<string | null>(null)
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null)
  const [shoesTab, setShoesTabState] = useState<'horses' | 'farriers'>(() => {
    if (typeof window === 'undefined') return 'horses'
    return (sessionStorage.getItem('shoesTab') ?? 'horses') as 'horses' | 'farriers'
  })
  const [farriers, setFarriers] = useState<Farrier[]>([])
  const [farrierProfileName, setFarrierProfileName] = useState<string | null>(null)

  function setShoesTab(t: 'horses' | 'farriers') {
    setShoesTabState(t)
    if (typeof window !== 'undefined') sessionStorage.setItem('shoesTab', t)
  }

  const fetchData = useCallback(async () => {
    const [needsR, visitsR, healthR, otherR, horsesR, farriersR] = await Promise.allSettled([
      fetch('/api/shoe-needs').then(r => r.json()),
      fetch('/api/farrier-visits').then(r => r.json()),
      fetch('/api/health').then(r => r.json()),
      fetch('/api/other-animals').then(r => r.json()),
      fetch('/api/horses').then(r => r.json()),
      fetch('/api/farriers').then(r => r.json()),
    ])
    if (needsR.status === 'fulfilled') setNeeds(needsR.value.needs || [])
    if (visitsR.status === 'fulfilled') setVisits(visitsR.value.visits || [])
    if (healthR.status === 'fulfilled') setHealthIssues(healthR.value.issues || [])
    if (otherR.status === 'fulfilled') setOtherAnimals((otherR.value.animals || []).map((a: { id: string; name: string; farrier?: string | null }) => ({ id: a.id, name: a.name, farrier: a.farrier ?? null })))
    if (horsesR.status === 'fulfilled') setHorseDbData((horsesR.value.horses || []).map((h: { id: string; name: string; is_active: boolean; is_deceased: boolean; flags: { flag_type: string }[]; farrier?: string | null }) => ({ id: h.id, name: h.name, is_active: h.is_active, is_deceased: h.is_deceased, flags: h.flags || [], farrier: h.farrier ?? null })))
    if (farriersR.status === 'fulfilled') setFarriers(farriersR.value.farriers || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const needsHorseNames = useMemo(() => new Set(needs.map(n => n.horse_name)), [needs])
  const activeFarriersList = useMemo(() => farriers.filter(f => f.active), [farriers])

  const otherAnimalNames = useMemo(() => otherAnimals.map(a => a.name), [otherAnimals])

  const horseFarrierMap = useMemo(() => {
    const m: Record<string, string | null> = {}
    horseDbData.forEach(h => { m[h.name] = h.farrier ?? null })
    otherAnimals.forEach(a => { m[a.name] = a.farrier })
    return m
  }, [horseDbData, otherAnimals])

  const assignedFarrierNames = useMemo(() => {
    const assigned = new Set<string>()
    horseDbData.forEach(h => { if (h.farrier && h.is_active && !h.is_deceased) assigned.add(h.farrier) })
    otherAnimals.forEach(a => { if (a.farrier) assigned.add(a.farrier) })
    return Array.from(assigned).sort()
  }, [horseDbData, otherAnimals])

  const filteredNeeds = useMemo(() => {
    let base = needs
    if (typeFilter === 'drugger') base = base.filter(n => !!n.is_drugger)
    else if (typeFilter === 'non_drugger') base = base.filter(n => !n.is_drugger)
    else if (typeFilter === 'priority') base = base.filter(n => !!n.priority)
    if (farrierFilter === 'all') return base
    return base.filter(n => horseFarrierMap[n.horse_name] === farrierFilter)
  }, [needs, typeFilter, farrierFilter, horseFarrierMap])

  const suggestions = useMemo(() => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    const now = Date.now()

    // Build exclusion set: needs list + inactive + deceased
    const excludedNames = new Set(needsHorseNames)
    const BLOCKING = new Set(['lame', 'injured', 'in_training', 'retired'])
    horseDbData.forEach(h => {
      if (!h.is_active || h.is_deceased || (h.flags || []).some(f => BLOCKING.has(f.flag_type))) {
        excludedNames.add(h.name)
      }
    })

    // Find the true most-recent visit date per horse, then compute days from that date
    const lastShodMap: Record<string, string> = {}
    visits.forEach(v => {
      v.farrier_visit_horses.forEach(h => {
        if (!lastShodMap[h.horse_name] || v.visit_date > lastShodMap[h.horse_name]) {
          lastShodMap[h.horse_name] = v.visit_date
        }
      })
    })

    // Horses with a visit in the 6–8 week window (42–56 days inclusive)
    const withVisits = Object.entries(lastShodMap)
      .filter(([horse_name, date]) => {
        const days = Math.floor((now - new Date(date + 'T12:00:00').getTime()) / MS_PER_DAY)
        return days >= 42 && days <= 56 && !excludedNames.has(horse_name)
      })
      .map(([horse_name, date]) => ({
        horse_name,
        date,
        days: Math.floor((now - new Date(date + 'T12:00:00').getTime()) / MS_PER_DAY),
        neverDone: false,
      }))

    // Active, non-deceased horses with no farrier history at all
    const neverDone = horseDbData
      .filter(h => !excludedNames.has(h.name) && !lastShodMap[h.name])
      .map(h => ({ horse_name: h.name, date: null as string | null, days: null as number | null, neverDone: true }))

    // Sort: by week bucket desc (more weeks = first), then name asc; never-done at end
    return [...withVisits, ...neverDone].sort((a, b) => {
      if (a.neverDone && b.neverDone) return a.horse_name.localeCompare(b.horse_name)
      if (a.neverDone) return 1
      if (b.neverDone) return -1
      const weekA = Math.floor((a.days ?? 0) / 7)
      const weekB = Math.floor((b.days ?? 0) / 7)
      if (weekA !== weekB) return weekB - weekA
      return a.horse_name.localeCompare(b.horse_name)
    })
  }, [visits, needsHorseNames, horseDbData])

  const farrierFilteredSuggestions = useMemo(() => {
    if (farrierFilter === 'all') return suggestions
    return suggestions.filter(s => horseFarrierMap[s.horse_name] === farrierFilter)
  }, [suggestions, farrierFilter, horseFarrierMap])

  const filteredVisits = useMemo(() => {
    if (!historySearch) return visits
    const q = historySearch.toLowerCase()
    return visits.filter(v =>
      v.farrier_name.toLowerCase().includes(q) ||
      v.farrier_visit_horses.some(h => h.horse_name.toLowerCase().includes(q))
    )
  }, [visits, historySearch])

  const HISTORY_PAGE_SIZE = 20
  const historyTotalPages = Math.max(1, Math.ceil(filteredVisits.length / HISTORY_PAGE_SIZE))
  const pagedVisits = filteredVisits.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)


  async function addNeed() {
    if (!addForm?.horse_name || !addForm.what_needed) return
    setAddingSaving(true)
    setAddError(null)
    try {
      const res = await fetch('/api/shoe-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horse_name: addForm.horse_name,
          what_needed: addForm.what_needed,
          shoe_type: addForm.shoe_type || 'regular',
          notes: addForm.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to save — check Supabase migration has been run')
        return
      }
      const inDb = horseDbData.some(h => h.name === addForm.horse_name) || otherAnimals.some(a => a.name === addForm.horse_name)
      if (inDb) {
        const desiredFarrier = addForm.farrier_enabled ? (addForm.farrier ?? null) : null
        const currentFarrier = horseFarrierMap[addForm.horse_name] ?? null
        if (desiredFarrier !== currentFarrier) {
          await moveHorseToFarrier(addForm.horse_name, desiredFarrier)
        }
      }
      setAddForm(null)
      await fetchData()
    } catch {
      setAddError('Network error — could not reach server')
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

  async function togglePriority(id: string, currentValue: boolean) {
    const priority = !currentValue
    setNeeds(prev => prev.map(n => n.id === id ? { ...n, priority } : n))
    await fetch('/api/shoe-needs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, priority }),
    })
  }

  async function markDone(need: ShoeNeed) {
    if (!doneForm.visit_date || !doneForm.farrier_name) return
    if (savingDoneRef.current) return
    savingDoneRef.current = true
    setMarkDoneError(null)
    setSavingDone(true)
    try {
      const visitRes = await fetch('/api/farrier-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: doneForm.visit_date,
          farrier_name: doneForm.farrier_name.trim(),
          horses: [{
            horse_name: need.horse_name,
            work_done: doneForm.work_done || need.what_needed,
            shoe_type: doneForm.shoe_type || need.shoe_type || 'regular',
            notes: doneForm.notes || null,
          }],
        }),
      })
      if (!visitRes.ok) throw new Error('Failed to save visit')
      await fetch(`/api/shoe-needs?id=${need.id}`, { method: 'DELETE' })
      setMarkingDone(null)
      setDoneForm({ visit_date: '', farrier_name: '', shoe_type: 'regular', notes: '', work_done: '' })
      await fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save — check your connection'
      setMarkDoneError(msg)
      console.error(err)
    } finally {
      savingDoneRef.current = false
      setSavingDone(false)
    }
  }

  async function deleteVisit(id: string) {
    const res = await fetch(`/api/farrier-visits?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setVisits(prev => prev.filter(v => v.id !== id))
      setDeletingVisitId(null)
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

  async function moveHorseToFarrier(horseName: string, newFarrier: string | null): Promise<string | null> {
    const horse = horseDbData.find(h => h.name === horseName)
    if (horse?.id) {
      const prevFarrier = horse.farrier
      setHorseDbData(prev => prev.map(h => h.name === horseName ? { ...h, farrier: newFarrier } : h))
      const res = await fetch('/api/horses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: horse.id, farrier: newFarrier }),
      })
      if (!res.ok) {
        setHorseDbData(prev => prev.map(h => h.name === horseName ? { ...h, farrier: prevFarrier } : h))
        const d = await res.json().catch(() => ({}))
        return (d.error as string) || 'Failed to save farrier assignment'
      }
      return null
    }
    const other = otherAnimals.find(a => a.name === horseName)
    if (other?.id) {
      const prevFarrier = other.farrier
      setOtherAnimals(prev => prev.map(a => a.name === horseName ? { ...a, farrier: newFarrier } : a))
      const res = await fetch('/api/other-animals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: other.id, farrier: newFarrier }),
      })
      if (!res.ok) {
        setOtherAnimals(prev => prev.map(a => a.name === horseName ? { ...a, farrier: prevFarrier } : a))
        const d = await res.json().catch(() => ({}))
        return (d.error as string) || 'Failed to save farrier assignment'
      }
      return null
    }
    return null
  }

  async function addFarrier(name: string) {
    const res = await fetch('/api/farriers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d.error as string) || 'Failed to add farrier')
    }
    const data = await res.json()
    setFarriers(prev => [...prev, data.farrier].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function renameFarrier(id: string, oldName: string, newName: string): Promise<string | null> {
    const res = await fetch('/api/farriers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: newName, oldName }) })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return (d.error as string) || 'Failed to rename farrier'
    }
    setFarriers(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f))
    setHorseDbData(prev => prev.map(h => h.farrier === oldName ? { ...h, farrier: newName } : h))
    return null
  }

  async function toggleFarrierActive(id: string, active: boolean): Promise<string | null> {
    const res = await fetch('/api/farriers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active }) })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return (d.error as string) || 'Failed to update farrier'
    }
    setFarriers(prev => prev.map(f => f.id === id ? { ...f, active } : f))
    return null
  }

  async function handleVisitSaved(msg: string) {
    setShowLogVisit(false)
    setConfirmation(msg)
    setTimeout(() => setConfirmation(null), 4000)
    await fetchData()
  }

  const hasSuggestions = farrierFilteredSuggestions.length > 0

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

          {/* Tab toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 18, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', width: 'fit-content' }}>
            {(['horses', 'farriers'] as const).map((t, i) => (
              <button
                key={t}
                onClick={() => setShoesTab(t)}
                style={{ padding: '7px 18px', fontSize: 12, fontWeight: shoesTab === t ? 700 : 400, cursor: 'pointer', border: 'none', borderRight: i === 0 ? '1px solid var(--color-border)' : 'none', background: shoesTab === t ? 'var(--color-accent)' : 'var(--color-surface)', color: shoesTab === t ? '#fff' : 'var(--color-text-2)' }}
              >
                {t === 'horses' ? 'Horses' : 'Farriers'}
              </button>
            ))}
          </div>

          {shoesTab === 'farriers' && !loading && (
            <FarriersTab
              farriers={farriers}
              horseDbData={horseDbData}
              otherAnimals={otherAnimals}
              visits={visits}
              isAdmin={!isViewer}
              onOpenProfile={setFarrierProfileName}
              onAdd={addFarrier}
              onRename={renameFarrier}
              onToggleActive={toggleFarrierActive}
            />
          )}

          {shoesTab === 'horses' && <>

          {/* Section 1 — Current Shoe Needs */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Current Shoe Needs</h2>
              {!isViewer && <button
                onClick={() => { setAddForm(f => f ? null : { horse_name: '', what_needed: 'all_4s', shoe_type: 'regular', notes: '', farrier: null, farrier_enabled: false }); setAddError(null) }}
                style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Horse
              </button>}
            </div>

            {/* Add Horse prompt */}
            {addForm && (
              <div style={{ padding: 14, background: 'var(--color-accent-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>Add horse to list</span>
                  <button
                    onClick={() => { setAddForm(null); setAddError(null) }}
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
                      const inDb = horseDbData.some(h => h.name === v) || otherAnimals.some(a => a.name === v)
                      const currentFarrier = horseFarrierMap[v] ?? null
                      setAddForm(f => f ? {
                        ...f,
                        horse_name: v,
                        shoe_type: shoeType,
                        farrier_enabled: inDb && !!currentFarrier,
                        farrier: inDb ? (currentFarrier ?? activeFarriersList[0]?.name ?? null) : null,
                      } : f)
                      setAddError(null)
                    }}
                    extraNames={[...horseDbData.map(h => h.name), ...otherAnimalNames]}
                  />
                  <select
                    value={addForm.what_needed}
                    onChange={e => setAddForm(f => f ? { ...f, what_needed: e.target.value } : f)}
                    style={{ fontSize: 12 }}
                  >
                    {WORK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
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
                {addForm.horse_name && (horseDbData.some(h => h.name === addForm.horse_name) || otherAnimals.some(a => a.name === addForm.horse_name)) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: addForm.farrier_enabled ? 6 : 0 }}>
                      <ToggleSwitch
                        on={!!addForm.farrier_enabled}
                        onToggle={() => setAddForm(f => f ? { ...f, farrier_enabled: !f.farrier_enabled, farrier: !f.farrier_enabled ? (f.farrier ?? activeFarriersList[0]?.name ?? null) : f.farrier } : f)}
                      />
                      <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
                        {addForm.farrier_enabled && addForm.farrier ? `On · ${addForm.farrier}` : 'Specific farrier only'}
                      </span>
                    </div>
                    {addForm.farrier_enabled && activeFarriersList.length > 0 && (
                      <select
                        value={addForm.farrier ?? ''}
                        onChange={e => setAddForm(f => f ? { ...f, farrier: e.target.value || null } : f)}
                        style={{ fontSize: 12 }}
                      >
                        {activeFarriersList.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                      </select>
                    )}
                  </div>
                )}
                {addError && (
                  <div style={{ fontSize: 12, color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', marginBottom: 10 }}>
                    {addError}
                  </div>
                )}
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
                {FILTER_CHIPS.map(chip => {
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
                {assignedFarrierNames.length > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center', padding: '0 2px' }}>·</span>}
                {assignedFarrierNames.map(n => {
                  const isActive = farrierFilter === n
                  return (
                    <button
                      key={n}
                      onClick={() => setFarrierFilter(isActive ? 'all' : n)}
                      style={{
                        padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                        border: isActive ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: isActive ? 'var(--color-accent-bg)' : 'var(--color-bg)',
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
                      }}
                    >
                      {n.split(' ')[0]} only
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
            ) : (() => {
              const priorityNeeds = filteredNeeds.filter(n => n.priority)
              const normalNeeds = filteredNeeds.filter(n => !n.priority)
              const rowProps = (need: ShoeNeed) => ({
                key: need.id,
                need,
                onUpdate: updateNeed,
                onRemove: removeNeed,
                onToggleDrugger: toggleDrugger,
                onTogglePriority: togglePriority,
                onViewProfile: setProfileNeed,
                markingDone,
                setMarkingDone,
                doneForm,
                setDoneForm,
                onMarkDone: markDone,
                saving: savingDone,
                markDoneError,
                activeFarriers: activeFarriersList,
                isViewer,
                horseFarrier: horseFarrierMap[need.horse_name] ?? null,
                onSetFarrier: (horseDbData.some(h => h.name === need.horse_name) || otherAnimals.some(a => a.name === need.horse_name)) ? moveHorseToFarrier : undefined,
              })
              return (
                <>
                  {priorityNeeds.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>★ Priority ({priorityNeeds.length})</div>
                      {priorityNeeds.map(need => <NeedRow {...rowProps(need)} />)}
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, marginTop: 10 }}>All Horses ({normalNeeds.length})</div>
                    </>
                  )}
                  {priorityNeeds.length === 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>All Horses ({normalNeeds.length})</div>
                  )}
                  {normalNeeds.map(need => <NeedRow {...rowProps(need)} />)}
                </>
              )
            })()}
          </div>

          {/* Section 3 — Shoe History */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
            <div id="shoe-history-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Shoe History</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder="Search horse or farrier..."
                  value={historySearch}
                  onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1) }}
                  style={{ fontSize: 13, width: 200 }}
                />
                {!isViewer && <button
                  onClick={() => setShowLogVisit(true)}
                  style={{ padding: '6px 13px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Log a visit
                </button>}
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
            ) : (
              <>
                <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 10 }}>{filteredVisits.length} total visit{filteredVisits.length !== 1 ? 's' : ''}</p>
                {pagedVisits.map(visit => {
                  const isExpanded = expandedVisitIds.has(visit.id)
                  const dateStr = new Date(visit.visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const horses = visit.farrier_visit_horses
                  const horseToken = (h: typeof horses[0]) => {
                    const work = WORK_LABELS[h.work_done] || h.work_done
                    return work ? `${h.horse_name} — ${work}` : h.horse_name
                  }
                  const horseLabel = horses.length <= 2
                    ? horses.map(horseToken).join(' · ')
                    : horses.slice(0, 2).map(horseToken).join(' · ') + ` +${horses.length - 2} more`
                  const toggleExpand = () => setExpandedVisitIds(prev => { const next = new Set(prev); isExpanded ? next.delete(visit.id) : next.add(visit.id); return next })
                  return (
                    <div key={visit.id} style={{ marginBottom: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                      {/* Collapsed row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }} onClick={toggleExpand}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 52, flexShrink: 0 }}>{dateStr}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{horseLabel}</div>
                          <button onClick={e => { e.stopPropagation(); setFarrierProfileName(visit.farrier_name) }} style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.2)', textUnderlineOffset: 2 }}>{visit.farrier_name}</button>
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--color-text-3)', flexShrink: 0, display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                        {deletingVisitId === visit.id ? (
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Delete?</span>
                            <button type="button" onClick={() => deleteVisit(visit.id)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                            <button type="button" onClick={() => setDeletingVisitId(null)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-3)', cursor: 'pointer' }}>No</button>
                          </div>
                        ) : (
                          <button type="button" onClick={e => { e.stopPropagation(); setDeletingVisitId(visit.id) }} title="Delete this visit" style={{ fontSize: 11, padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--color-border)', padding: '10px 12px', background: 'var(--color-surface)' }}>
                          {visit.farrier_visit_horses.map(h => (
                            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13 }}>🐴</span>
                              <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 80 }}>{h.horse_name}</span>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontWeight: 600, border: '1px solid var(--color-warning-border)' }}>{WORK_LABELS[h.work_done] || h.work_done}</span>
                              {h.shoe_type && h.shoe_type !== 'regular' && <ShoeTypeBadge shoeType={h.shoe_type} />}
                              {h.shoe_size && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>sz {h.shoe_size}</span>}
                              {h.placement && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{h.placement}</span>}
                              {h.notes && <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{h.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredVisits.length > HISTORY_PAGE_SIZE && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                    <button type="button" onClick={() => { setHistoryPage(p => Math.max(1, p - 1)); document.getElementById('shoe-history-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={historyPage === 1} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: historyPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: historyPage === 1 ? 'default' : 'pointer' }}>← Previous</button>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Page {historyPage} of {historyTotalPages}</span>
                    <button type="button" onClick={() => { setHistoryPage(p => Math.min(historyTotalPages, p + 1)); document.getElementById('shoe-history-top')?.scrollIntoView({ behavior: 'smooth' }) }} disabled={historyPage === historyTotalPages} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: historyPage === historyTotalPages ? 'var(--color-text-muted)' : 'var(--color-text-2)', cursor: historyPage === historyTotalPages ? 'default' : 'pointer' }}>Next →</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Section 2 — Suggestions */}
          {!loading && hasSuggestions && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 18, marginBottom: 18 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Suggestions</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14 }}>Horses last shod 6–8 weeks ago, plus horses with no recorded farrier history. Longest overdue shown first.</p>

              {farrierFilteredSuggestions.map(s => <SuggestionRow key={s.horse_name} suggestion={s} onAdd={() => addSuggestionToNeeds(s.horse_name)} />)}
            </div>
          )}

          {/* Section 4 — Shoe stats link */}
          {!loading && (
            <div style={{ textAlign: 'center', padding: '18px 0 4px', fontSize: 13 }}>
              <a href="/insights?tab=shoes" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500 }}>
                See shoe stats in Insights →
              </a>
            </div>
          )}

          </>}

        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .shoes-content { padding: 12px !important; }
            .done-form-grid { grid-template-columns: 1fr !important; }
            .log-visit-grid { grid-template-columns: 1fr !important; }
            .log-horse-grid { grid-template-columns: 1fr !important; }
            .analytics-summary-grid { grid-template-columns: 1fr 1fr !important; }
            .analytics-trends-grid { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 640px) {
            .need-row { padding: 8px 10px !important; margin-bottom: 5px !important; }
            .need-row > div:first-child { gap: 6px !important; }
            .need-row > div:first-child > input { font-size: 13px !important; font-weight: 500 !important; }
            .need-row > div:nth-child(2) { gap: 6px !important; margin-top: 4px !important; }
            .need-row > div:nth-child(2) > span { font-size: 11px !important; padding: 2px 8px !important; border-radius: 999px !important; font-weight: 600 !important; }
            .need-row > div:nth-child(2) > select { font-size: 11px !important; padding: 2px 8px !important; border-radius: 999px !important; font-weight: 600 !important; width: auto !important; }
            .need-row > input { font-size: 11px !important; margin-top: 3px !important; }
          }
        ` }} />
      </main>

      {farrierProfileName && (
        <FarrierProfileModal
          name={farrierProfileName}
          farriers={farriers}
          horseDbData={horseDbData}
          otherAnimals={otherAnimals}
          visits={visits}
          onClose={() => setFarrierProfileName(null)}
        />
      )}

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
          extraNames={[...horseDbData.map(h => h.name), ...otherAnimalNames]}
          activeFarriers={activeFarriersList}
          horseFarrierMap={horseFarrierMap}
        />
      )}
    </div>
  )
}

function LogVisitModal({ onClose, onSaved, needs, extraNames = [], activeFarriers = [], horseFarrierMap = {} }: {
  onClose: () => void
  onSaved: (msg: string) => void
  needs: ShoeNeed[]
  extraNames?: string[]
  activeFarriers?: Farrier[]
  horseFarrierMap?: Record<string, string | null>
}) {
  const today = new Date().toISOString().split('T')[0]
  const [visitDate, setVisitDate] = useState(today)
  const [farrierName, setFarrierName] = useState('')
  const [horses, setHorses] = useState<LogHorse[]>([])
  const [currentHorse, setCurrentHorse] = useState({
    horse_name: '', work_done: 'Full set', shoe_type: 'regular',
    shoe_size: '', placement: '', placement_other: '', notes: '',
  })
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [farrierOther, setFarrierOther] = useState(false)

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
          farrier_name: farrierName.trim(),
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
            <label>Farrier</label>
            <select
              value={farrierOther ? '__other__' : farrierName}
              onChange={e => {
                if (e.target.value === '__other__') { setFarrierOther(true); setFarrierName('') }
                else { setFarrierOther(false); setFarrierName(e.target.value) }
              }}
              style={{ fontSize: 13 }}
            >
              <option value="">— select farrier —</option>
              {activeFarriers.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
              <option value="__other__">Other…</option>
            </select>
            {farrierOther && (
              <input
                value={farrierName}
                onChange={e => setFarrierName(e.target.value)}
                placeholder="Farrier name…"
                autoFocus
                style={{ fontSize: 13, marginTop: 6 }}
              />
            )}
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
                  {WORK_LABELS[h.work_done] || h.work_done}
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
              extraNames={extraNames}
            />
            {(() => {
              const hf = currentHorse.horse_name ? horseFarrierMap[currentHorse.horse_name] : null
              if (hf && farrierName && normalizeFarrier(farrierName) !== normalizeFarrier(hf)) {
                return (
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4, fontStyle: 'italic' }}>
                    Note: {currentHorse.horse_name} is a {hf.split(' ')[0]}-only horse
                  </div>
                )
              }
              return null
            })()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }} className="log-horse-grid">
            <div>
              <label>What was done</label>
              <select value={currentHorse.work_done} onChange={e => setCurrentHorse(h => ({ ...h, work_done: e.target.value }))} style={{ fontSize: 13 }}>
                {['Full set', 'Fronts', 'Rears', 'Partial', 'Trim'].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
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
