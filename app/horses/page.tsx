'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { DbHorse, HorseSize, LEVEL_LABELS } from '@/lib/horses'
import { getTucsonToday } from '@/lib/timezone'

// ─── Types ────────────────────────────────────────────────────────────────────

const OTHER_GROUPS = ['Miniatures', 'Mares', 'Drafts', 'Geldings', 'Privates', 'Retirees', 'In Training', 'Out for injury', 'Other'] as const
type OtherGroup = typeof OTHER_GROUPS[number]

type OtherAnimal = {
  id: string; name: string; group_name: string; age: number | null; notes: string | null; created_at: string
}

type OtherAnimalForm = { name: string; group_name: OtherGroup; age: string; notes: string }
const BLANK_OTHER_FORM: OtherAnimalForm = { name: '', group_name: 'Other', age: '', notes: '' }

const LEVELS = ['B', 'AB', 'I', 'AI', 'A']
const SIZES: HorseSize[] = ['small', 'medium', 'large', 'draft']

const BLOCKING_TYPES = ['lame', 'injured', 'day_off', 'in_training', 'retired'] as const
type BlockingType = typeof BLOCKING_TYPES[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasBlockingFlag(h: DbHorse, today: string): boolean {
  return (h.flags || []).some(f => {
    if (f.flag_type === 'day_off') return f.day_off_date === today
    return BLOCKING_TYPES.includes(f.flag_type as BlockingType)
  })
}

function sortHorses(horses: DbHorse[], today: string): DbHorse[] {
  return [...horses].sort((a, b) => {
    const ga = !a.is_active ? 2 : hasBlockingFlag(a, today) ? 1 : 0
    const gb = !b.is_active ? 2 : hasBlockingFlag(b, today) ? 1 : 0
    if (ga !== gb) return ga - gb
    return a.name.localeCompare(b.name)
  })
}

function matchesFilter(h: DbHorse, filter: string, today: string): boolean {
  const hasFlag = (type: string) => (h.flags || []).some(f =>
    f.flag_type === type && (type !== 'day_off' || f.day_off_date === today)
  )
  switch (filter) {
    case 'all': return true
    case 'active': return h.is_active && !hasBlockingFlag(h, today)
    case 'inactive': return !h.is_active
    case 'lame': return hasFlag('lame')
    case 'injured': return hasFlag('injured')
    case 'day_off': return hasFlag('day_off')
    case 'in_training': return hasFlag('in_training')
    case 'retired_flag': return hasFlag('retired')
    case 'shoes': return (h.shoe_flags || []).length > 0
    default: return true
  }
}

// ─── FlagNotesModal ───────────────────────────────────────────────────────────

const FLAG_DISPLAY: Record<BlockingType, string> = {
  lame: 'Lame', injured: 'Injured', day_off: 'Day Off', in_training: 'In Training', retired: 'Retired',
}

function FlagNotesModal({ flagType, horseName, onConfirm, onClose }: {
  flagType: BlockingType; horseName: string
  onConfirm: (notes: string) => Promise<void>; onClose: () => void
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handle(withNotes: boolean) {
    setSaving(true)
    await onConfirm(withNotes ? notes.trim() : '')
    setSaving(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
            Flag {horseName} — {FLAG_DISPLAY[flagType]}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>
        <button
          onClick={() => handle(false)}
          disabled={saving}
          style={{ display: 'block', width: '100%', marginBottom: 12, padding: '7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)', fontWeight: 500 }}
        >
          {saving ? '...' : 'Flag without notes (quick)'}
        </button>
        <label style={{ fontSize: 12, color: 'var(--color-text-3)', display: 'block', marginBottom: 5 }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. left front, vet scheduled..."
          rows={3}
          autoFocus
          style={{ width: '100%', resize: 'vertical', marginBottom: 12 }}
          onKeyDown={e => e.key === 'Enter' && e.metaKey && handle(true)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handle(true)}
            disabled={saving}
            style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {saving ? 'Saving...' : `Flag as ${FLAG_DISPLAY[flagType]}`}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '9px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EditHorseModal ───────────────────────────────────────────────────────────

type EditHorseForm = {
  name: string; level: string; weight: string; size: string; notes: string
  is_active: boolean; exclude_from_ai: boolean; rank_last: boolean
}

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: on ? 'var(--color-accent)' : '#d1d5db',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: on ? 23 : 3,
        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function EditHorseModal({ horse, mode, onSave, onClose }: {
  horse: Partial<DbHorse> | null
  mode: 'new' | 'edit' | 'promote'
  onSave: (form: EditHorseForm) => Promise<void>
  onClose: () => void
}) {
  const isNew = mode === 'new'
  const isPromote = mode === 'promote'
  const nameEditable = isNew || isPromote

  const [form, setForm] = useState<EditHorseForm>({
    name: horse?.name ?? '',
    level: horse?.level ?? 'B',
    weight: horse?.weight?.toString() ?? '',
    size: horse?.size ?? 'medium',
    notes: horse?.notes ?? '',
    is_active: horse?.is_active ?? true,
    exclude_from_ai: horse?.exclude_from_ai ?? false,
    rank_last: horse?.rank_last ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof EditHorseForm>(field: K, value: EditHorseForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.level || !form.size) { setError('Name, level, and size are required.'); return }
    setSaving(true); setError(null)
    try { await onSave(form) }
    catch (e: any) { setError(e.message || 'Save failed'); setSaving(false) }
  }

  const title = isNew ? 'Add New Horse' : isPromote ? `Promote to Guest String` : `Edit — ${horse?.name}`

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>

        {isPromote && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-accent-bg)', border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-accent)' }}>
            Fill in level, weight, and size to add to the guest string.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Name {nameEditable && <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>*</span>}</label>
            <input
              value={form.name}
              onChange={e => nameEditable && set('name', e.target.value)}
              readOnly={!nameEditable}
              placeholder="Horse name..."
              autoFocus={isNew}
              style={{ opacity: nameEditable ? 1 : 0.55, background: nameEditable ? undefined : 'var(--color-bg)' }}
            />
          </div>
          <div>
            <label>Level <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>*</span></label>
            <select value={form.level} onChange={e => set('level', e.target.value)} autoFocus={isPromote}>
              {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABELS[l] || l}</option>)}
            </select>
          </div>
          <div>
            <label>Size <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>*</span></label>
            <select value={form.size} onChange={e => set('size', e.target.value)}>
              {SIZES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Max Weight (lbs)</label>
            <input type="number" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="e.g. 250" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label>Notes / Description</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="Notes about this horse..." />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 10 }}>Status &amp; AI flags</p>
          {[
            { field: 'is_active' as const, label: 'Active in guest string', desc: 'Shows on board and in AI matches' },
            { field: 'exclude_from_ai' as const, label: 'Manual Only', desc: 'Never in AI suggestions or Assign All — manual assignment only' },
            { field: 'rank_last' as const, label: 'Last Resort', desc: 'AI ranks last — only if no other suitable horse exists' },
          ].map(({ field, label, desc }) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{desc}</div>
              </div>
              <ToggleSwitch on={form[field]} onToggle={() => set(field, !form[field])} />
            </div>
          ))}
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.5 : 1 }}
          >
            {saving ? 'Saving...' : isNew ? 'Add Horse' : isPromote ? 'Add to Guest String' : 'Save Changes'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── HorseCard ────────────────────────────────────────────────────────────────

const STATUS_META: Record<BlockingType, { label: string; color: string; bg: string; border: string }> = {
  lame:        { label: 'Lame',       color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
  injured:     { label: 'Injured',    color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  day_off:     { label: 'Day Off',    color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd' },
  in_training: { label: 'Training',   color: '#6d28d9', bg: '#f5f3ff', border: '#c4b5fd' },
  retired:     { label: 'Retired',    color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
}

function HorseCard({ horse, today, onFlagClick, onMarkFit, onShoeClick, onToggleActive, onEdit, onDemote }: {
  horse: DbHorse; today: string
  onFlagClick: (flagType: BlockingType) => void
  onMarkFit: () => void
  onShoeClick: (shoeType: 'fronts' | 'rears') => void
  onToggleActive: () => void
  onEdit: () => void
  onDemote: () => void
}) {
  const activeFlags = (horse.flags || []).filter(f =>
    BLOCKING_TYPES.includes(f.flag_type as BlockingType) &&
    (f.flag_type !== 'day_off' || f.day_off_date === today)
  )
  const hasFronts = (horse.shoe_flags || []).some(s => s.what_needed === 'fronts')
  const hasRears = (horse.shoe_flags || []).some(s => s.what_needed === 'rears')
  const anyFlags = activeFlags.length > 0 || hasFronts || hasRears

  const isFlagged = activeFlags.length > 0
  const cardBg = !horse.is_active ? 'var(--color-bg)' : isFlagged ? '#fffbeb' : 'var(--color-surface)'
  const cardBorderColor = !horse.is_active ? 'var(--color-border)' : isFlagged ? '#fcd34d' : 'var(--color-border)'

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${cardBorderColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      opacity: !horse.is_active ? 0.65 : 1,
      transition: 'opacity 0.15s',
    }}>
      {/* Header row: name + level + active toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{horse.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {horse.weight ? `Max ${horse.weight} lbs · ` : ''}{horse.size}
            {horse.exclude_from_ai && (
              <span style={{ padding: '1px 5px', borderRadius: 999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 500 }}>Manual only</span>
            )}
            {horse.rank_last && (
              <span style={{ padding: '1px 5px', borderRadius: 999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 500 }}>Last resort</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: 'var(--color-accent-bg)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {LEVEL_LABELS[horse.level] || horse.level}
          </span>
          <button
            onClick={onToggleActive}
            title={horse.is_active ? 'Mark inactive' : 'Mark active'}
            style={{
              width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
              background: horse.is_active ? 'var(--color-accent)' : '#d1d5db',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3, left: horse.is_active ? 19 : 3,
              transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      </div>

      {/* Active flag badges */}
      {anyFlags && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {activeFlags.map(f => {
            const meta = STATUS_META[f.flag_type as BlockingType]
            if (!meta) return null
            return (
              <span key={f.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 600 }}>
                {meta.label}{f.notes ? ` · ${f.notes}` : ''}
              </span>
            )
          })}
          {hasFronts && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>🔴 Fronts</span>}
          {hasRears && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 600 }}>🟠 Rears</span>}
        </div>
      )}

      {/* Notes */}
      {horse.notes && (
        <p style={{ fontSize: 11, color: 'var(--color-text-2)', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 8, marginBottom: 0 }}>
          {horse.notes}
        </p>
      )}

      {/* Quick flag buttons */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, marginTop: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
          {BLOCKING_TYPES.map(type => {
            const meta = STATUS_META[type]
            const isOn = activeFlags.some(f => f.flag_type === type)
            return (
              <button
                key={type}
                onClick={() => onFlagClick(type)}
                style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: 11,
                  fontWeight: isOn ? 700 : 400,
                  border: `1px solid ${isOn ? meta.border : 'var(--color-border)'}`,
                  background: isOn ? meta.bg : 'transparent',
                  color: isOn ? meta.color : 'var(--color-text-3)',
                  cursor: 'pointer',
                }}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { type: 'fronts' as const, isOn: hasFronts, bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', label: 'Fronts' },
            { type: 'rears' as const, isOn: hasRears, bg: '#fef3c7', color: '#92400e', border: '#fcd34d', label: 'Rears' },
          ].map(({ type, isOn, bg, color, border, label }) => (
            <button
              key={type}
              onClick={() => onShoeClick(type)}
              style={{
                padding: '3px 9px', borderRadius: 999, fontSize: 11,
                fontWeight: isOn ? 700 : 400,
                border: `1px solid ${isOn ? border : 'var(--color-border)'}`,
                background: isOn ? bg : 'transparent',
                color: isOn ? color : 'var(--color-text-3)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          {anyFlags && (
            <button
              onClick={onMarkFit}
              style={{
                padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                border: '1px solid var(--color-success-border)',
                background: 'var(--color-success-bg)', color: 'var(--color-success)',
                cursor: 'pointer', marginLeft: 'auto',
              }}
            >
              Mark Fit ✓
            </button>
          )}
        </div>
      </div>

      {/* Footer: edit + demote */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
        <button
          onClick={onEdit}
          style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}
        >
          Edit
        </button>
        <button
          onClick={onDemote}
          style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-3)', marginLeft: 'auto' }}
        >
          → Retired/Other
        </button>
      </div>
    </div>
  )
}

// ─── OtherAnimalModal ─────────────────────────────────────────────────────────

function OtherAnimalModal({ animal, onClose, onSaved }: {
  animal: OtherAnimal | null; onClose: () => void; onSaved: () => void
}) {
  const isEdit = animal !== null
  const [form, setForm] = useState<OtherAnimalForm>(
    isEdit
      ? { name: animal.name, group_name: animal.group_name as OtherGroup, age: animal.age?.toString() ?? '', notes: animal.notes ?? '' }
      : BLANK_OTHER_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof OtherAnimalForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true); setError(null)
    try {
      const payload = { name: form.name.trim(), group_name: form.group_name, age: form.age ? parseInt(form.age, 10) : null, notes: form.notes.trim() || null }
      const res = await fetch('/api/other-animals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: animal.id, ...payload } : payload),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Save failed (${res.status})`); return }
      onSaved()
    } catch { setError('Network error — please try again') } finally { setSaving(false) }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>{isEdit ? `Edit — ${animal.name}` : 'Add horse'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label>Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Horse name..." autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label>Group</label>
            <select value={form.group_name} onChange={e => set('group_name', e.target.value)}>
              {OTHER_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label>Age (optional)</label>
            <input type="number" min={0} max={60} value={form.age} onChange={e => set('age', e.target.value)} placeholder="Years..." />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." rows={3} style={{ resize: 'vertical' }} />
        </div>
        {error && <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={handleSave} disabled={!form.name.trim() || saving} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !form.name.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add horse'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── OtherAnimalCard ──────────────────────────────────────────────────────────

function OtherAnimalCard({ animal, onEdit, onDelete, onPromote }: {
  animal: OtherAnimal; onEdit: () => void; onDelete: () => void; onPromote: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() { setDeleting(true); await onDelete(); setDeleting(false) }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: animal.notes ? 8 : 0 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{animal.name}</div>
          {animal.age != null && <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{animal.age} yr{animal.age !== 1 ? 's' : ''}</div>}
        </div>
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>Delete?</span>
            <button onClick={handleDelete} disabled={deleting} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}>{deleting ? '...' : 'Yes'}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}>No</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-3)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
            <button onClick={() => setConfirmDelete(true)} style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        )}
      </div>
      {animal.notes && <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: 8, margin: 0 }}>{animal.notes}</p>}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 10 }}>
        <button
          onClick={onPromote}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-accent-border)', background: 'var(--color-accent-bg)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Promote to guest string
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'lame', label: 'Lame' },
  { key: 'injured', label: 'Injured' },
  { key: 'shoes', label: 'Missing Shoes' },
  { key: 'day_off', label: 'Day Off' },
  { key: 'in_training', label: 'In Training' },
  { key: 'retired_flag', label: 'Retired' },
]

type RosterView = 'guest' | 'other'
type FlagModalState = { horse: DbHorse; flagType: BlockingType } | null

export default function HorsesPage() {
  const today = getTucsonToday()

  const [dbHorses, setDbHorses] = useState<DbHorse[]>([])
  const [horsesLoading, setHorsesLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editingHorse, setEditingHorse] = useState<Partial<DbHorse> | null>(null)
  const [editMode, setEditMode] = useState<'new' | 'edit' | 'promote'>('new')
  const [showEditModal, setShowEditModal] = useState(false)
  const [flagModal, setFlagModal] = useState<FlagModalState>(null)

  const [view, setView] = useState<RosterView>('guest')
  const [animals, setAnimals] = useState<OtherAnimal[]>([])
  const [animalsLoading, setAnimalsLoading] = useState(false)
  const [showOtherModal, setShowOtherModal] = useState(false)
  const [editingAnimal, setEditingAnimal] = useState<OtherAnimal | null>(null)
  const [promotingAnimal, setPromotingAnimal] = useState<OtherAnimal | null>(null)

  const fetchHorses = useCallback(async () => {
    setHorsesLoading(true)
    try { const res = await fetch('/api/horses'); const data = await res.json(); setDbHorses(data.horses || []) }
    catch (err) { console.error(err) } finally { setHorsesLoading(false) }
  }, [])

  const fetchAnimals = useCallback(async () => {
    setAnimalsLoading(true)
    try { const res = await fetch('/api/other-animals'); const data = await res.json(); setAnimals(data.animals || []) }
    catch (err) { console.error(err) } finally { setAnimalsLoading(false) }
  }, [])

  useEffect(() => { fetchHorses() }, [fetchHorses])
  useEffect(() => { if (view === 'other') fetchAnimals() }, [view, fetchAnimals])

  // Toggle active (optimistic)
  async function toggleActive(horse: DbHorse) {
    setDbHorses(prev => prev.map(h => h.id === horse.id ? { ...h, is_active: !h.is_active } : h))
    await fetch('/api/horses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: horse.id, is_active: !horse.is_active }),
    })
    fetchHorses()
  }

  // Flag management
  async function setFlag(horse: DbHorse, flagType: BlockingType, notes: string) {
    setFlagModal(null)
    await fetch('/api/horse-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horse_name: horse.name, flag_type: flagType, notes: notes || null }),
    })
    await fetchHorses()
  }

  async function clearFlag(horse: DbHorse, flagType: BlockingType) {
    await fetch(`/api/horse-flags?horse_name=${encodeURIComponent(horse.name)}&flag_type=${flagType}`, { method: 'DELETE' })
    await fetchHorses()
  }

  async function markFit(horse: DbHorse) {
    await fetch(`/api/horse-flags?horse_name=${encodeURIComponent(horse.name)}&all=true`, { method: 'DELETE' })
    await Promise.all((horse.shoe_flags || []).map(sf =>
      fetch(`/api/shoe-needs?id=${sf.id}`, { method: 'DELETE' })
    ))
    await fetchHorses()
  }

  function handleFlagClick(horse: DbHorse, flagType: BlockingType) {
    const already = (horse.flags || []).find(f =>
      f.flag_type === flagType && (flagType !== 'day_off' || f.day_off_date === today)
    )
    if (already) { clearFlag(horse, flagType) } else { setFlagModal({ horse, flagType }) }
  }

  async function handleShoeClick(horse: DbHorse, shoeType: 'fronts' | 'rears') {
    const existing = (horse.shoe_flags || []).find(s => s.what_needed === shoeType)
    if (existing) {
      await fetch(`/api/shoe-needs?id=${existing.id}`, { method: 'DELETE' })
    } else {
      await fetch('/api/shoe-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horse_name: horse.name, what_needed: shoeType }),
      })
    }
    await fetchHorses()
  }

  // Save horse (new / edit / promote)
  async function saveHorse(form: EditHorseForm) {
    const payload = {
      name: form.name.trim(), level: form.level,
      weight: form.weight ? parseInt(form.weight) : null,
      size: form.size, notes: form.notes,
      is_active: form.is_active, exclude_from_ai: form.exclude_from_ai, rank_last: form.rank_last,
    }
    if (editMode === 'new') {
      const res = await fetch('/api/horses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add horse') }
    } else if (editMode === 'promote' && promotingAnimal) {
      const res = await fetch('/api/horses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add horse') }
      await fetch(`/api/other-animals?id=${encodeURIComponent(promotingAnimal.id)}`, { method: 'DELETE' })
      setPromotingAnimal(null)
      fetchAnimals()
    } else if (editingHorse?.id) {
      const res = await fetch('/api/horses', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingHorse.id, ...payload }) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update horse') }
    }
    setShowEditModal(false); setEditingHorse(null)
    await fetchHorses()
  }

  // Demote to Retired/Other
  async function demoteHorse(horse: DbHorse) {
    if (!confirm(`Move ${horse.name} to Retired/Other? This removes them from the guest string.`)) return
    await fetch('/api/other-animals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: horse.name, group_name: 'Retirees', notes: horse.notes || null }),
    })
    await fetch(`/api/horses?id=${horse.id}`, { method: 'DELETE' })
    await fetchHorses()
  }

  async function handleOtherDelete(animal: OtherAnimal) {
    setAnimals(prev => prev.filter(a => a.id !== animal.id))
    await fetch(`/api/other-animals?id=${encodeURIComponent(animal.id)}`, { method: 'DELETE' })
  }

  async function handleOtherSaved() {
    setShowOtherModal(false); setEditingAnimal(null); await fetchAnimals()
  }

  const q = search.toLowerCase()
  const filteredHorses = sortHorses(
    dbHorses.filter(h =>
      matchesFilter(h, filter, today) &&
      (!q || h.name.toLowerCase().includes(q) || h.notes.toLowerCase().includes(q))
    ),
    today
  )

  const activeCount = dbHorses.filter(h => h.is_active && !hasBlockingFlag(h, today)).length

  const grouped = OTHER_GROUPS.map(g => ({ group: g, items: animals.filter(a => a.group_name === g) })).filter(g => g.items.length > 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>

        {/* Sticky header */}
        <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 24px 12px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: view === 'guest' ? 10 : 0 }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>Horse Roster</h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 2 }}>
                {view === 'guest'
                  ? horsesLoading ? 'Loading...' : `${activeCount} active · ${dbHorses.length} total`
                  : animalsLoading ? 'Loading...' : `${animals.length} horse${animals.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {view === 'guest' && (
                <button
                  onClick={() => { setEditMode('new'); setEditingHorse(null); setShowEditModal(true) }}
                  style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Add Horse
                </button>
              )}
              {view === 'other' && (
                <button
                  onClick={() => setShowOtherModal(true)}
                  style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Add horse
                </button>
              )}
              <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 999, padding: 3, gap: 2 }}>
                {(['guest', 'other'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} style={{ padding: '5px 14px', borderRadius: 999, border: 'none', background: view === v ? 'var(--color-surface)' : 'transparent', color: view === v ? 'var(--color-text)' : 'var(--color-text-3)', fontSize: 12, fontWeight: view === v ? 600 : 400, cursor: 'pointer', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                    {v === 'guest' ? 'Guest horses' : 'Retired / Other'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter chips */}
          {view === 'guest' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: 12, width: 130, height: 28, flexShrink: 0 }}
              />
              {FILTER_CHIPS.map(chip => {
                const isActive = filter === chip.key
                return (
                  <button
                    key={chip.key}
                    onClick={() => setFilter(chip.key)}
                    style={{
                      padding: '4px 11px', borderRadius: 999, flexShrink: 0,
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
          )}
        </div>

        {/* ── Guest horses view ── */}
        {view === 'guest' && (
          <div style={{ padding: 24 }}>
            {horsesLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13, padding: 40 }}>Loading horses...</p>
            ) : filteredHorses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>◈</div>
                <p style={{ fontSize: 13 }}>{search || filter !== 'all' ? 'No horses match your filters' : 'No horses yet — click + Add Horse to seed from roster'}</p>
                {(search || filter !== 'all') && (
                  <button
                    onClick={() => { setSearch(''); setFilter('all') }}
                    style={{ marginTop: 10, padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-2)' }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {filteredHorses.map(horse => (
                  <HorseCard
                    key={horse.id}
                    horse={horse}
                    today={today}
                    onFlagClick={type => handleFlagClick(horse, type)}
                    onMarkFit={() => markFit(horse)}
                    onShoeClick={st => handleShoeClick(horse, st)}
                    onToggleActive={() => toggleActive(horse)}
                    onEdit={() => { setEditingHorse(horse); setEditMode('edit'); setShowEditModal(true) }}
                    onDemote={() => demoteHorse(horse)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Retired / Other view ── */}
        {view === 'other' && (
          <div style={{ padding: 24 }}>
            {animalsLoading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Loading...</p>
            ) : animals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>◈</div>
                <p style={{ fontSize: 13 }}>No horses added yet</p>
                <button onClick={() => setShowOtherModal(true)} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}>Add the first one</button>
              </div>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group} style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    {group} · {items.length}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {items.map(animal => (
                      <OtherAnimalCard
                        key={animal.id}
                        animal={animal}
                        onEdit={() => setEditingAnimal(animal)}
                        onDelete={() => handleOtherDelete(animal)}
                        onPromote={() => {
                          setPromotingAnimal(animal)
                          setEditingHorse({ name: animal.name, notes: animal.notes || '', level: 'B', weight: null, size: 'medium', is_active: true, exclude_from_ai: false, rank_last: false })
                          setEditMode('promote')
                          setShowEditModal(true)
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </main>

      {/* Edit / Add / Promote modal */}
      {showEditModal && (
        <EditHorseModal
          horse={editingHorse}
          mode={editMode}
          onSave={saveHorse}
          onClose={() => { setShowEditModal(false); setEditingHorse(null); setPromotingAnimal(null) }}
        />
      )}

      {/* Other animal modal */}
      {(showOtherModal || editingAnimal) && (
        <OtherAnimalModal
          animal={editingAnimal}
          onClose={() => { setShowOtherModal(false); setEditingAnimal(null) }}
          onSaved={handleOtherSaved}
        />
      )}

      {/* Flag notes modal */}
      {flagModal && (
        <FlagNotesModal
          flagType={flagModal.flagType}
          horseName={flagModal.horse.name}
          onConfirm={async notes => { await setFlag(flagModal.horse, flagModal.flagType, notes) }}
          onClose={() => setFlagModal(null)}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          main > div[style*="padding: 24px"] { padding: 12px !important; }
        }
      ` }} />
    </div>
  )
}
