'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { HORSES, LEVEL_LABELS } from '@/lib/horses'

// ─── Guest horse view (unchanged) ────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: 'var(--color-success-bg)',  text: 'var(--color-success)',  label: 'Active' },
  backup:    { bg: 'var(--color-warning-bg)',   text: 'var(--color-warning)',  label: 'Backup' },
  out:       { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Out' },
  lame:      { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Lame' },
  donotuse:  { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Do Not Use' },
  naughty:   { bg: 'var(--color-danger-bg)',    text: 'var(--color-danger)',   label: 'Naughty' },
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function HorseCard({ horse, dimmed }: { horse: typeof HORSES[0]; dimmed?: boolean }) {
  const status = STATUS_COLORS[horse.status] || STATUS_COLORS.active
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px', opacity: dimmed ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
          {horse.name}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 999,
            background: 'var(--color-accent-bg)', color: 'var(--color-accent)',
            border: '1px solid var(--color-accent-border)', fontWeight: 600,
          }}>
            {LEVEL_LABELS[horse.level] || horse.level}
          </span>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: status.bg, color: status.text, fontWeight: 600 }}>
            {status.label}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>
        Max {horse.weight ?? '—'} lbs · {horse.size}
      </div>
      {horse.notes && (
        <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
          {horse.notes}
        </p>
      )}
    </div>
  )
}

// ─── Retired / Other view ─────────────────────────────────────────────────────

const OTHER_GROUPS = ['Miniatures', 'Mares', 'Drafts', 'Geldings', 'Privates', 'Retirees', 'In Training', 'Other'] as const
type OtherGroup = typeof OTHER_GROUPS[number]

type OtherAnimal = {
  id: string
  name: string
  group_name: string
  age: number | null
  notes: string | null
  created_at: string
}

type OtherAnimalForm = {
  name: string
  group_name: OtherGroup
  age: string
  notes: string
}

const BLANK_OTHER_FORM: OtherAnimalForm = {
  name: '', group_name: 'Other', age: '', notes: '',
}

function OtherAnimalModal({
  animal,
  onClose,
  onSaved,
}: {
  animal: OtherAnimal | null
  onClose: () => void
  onSaved: () => void
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
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        group_name: form.group_name,
        age: form.age ? parseInt(form.age, 10) : null,
        notes: form.notes.trim() || null,
      }
      const res = await fetch('/api/other-animals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: animal.id, ...payload } : payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Save failed (${res.status})`)
        return
      }
      onSaved()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>
            {isEdit ? `Edit — ${animal.name}` : 'Add animal'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-3)' }}>✕</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Animal name..." autoFocus />
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
            <input
              type="number"
              min={0}
              max={60}
              value={form.age}
              onChange={e => set('age', e.target.value)}
              placeholder="Years..."
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any notes about this animal..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || saving}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: !form.name.trim() || saving ? 'not-allowed' : 'pointer', opacity: !form.name.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add animal'}
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

function OtherAnimalCard({
  animal,
  onEdit,
  onDelete,
}: {
  animal: OtherAnimal
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await onDelete()
    setDeleting(false)
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: animal.notes ? 8 : 0 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
            {animal.name}
          </div>
          {animal.age != null && (
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>{animal.age} yr{animal.age !== 1 ? 's' : ''}</div>
          )}
        </div>

        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>Delete?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, cursor: 'pointer' }}
            >
              {deleting ? '...' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-2)', cursor: 'pointer' }}
            >
              No
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button
              onClick={onEdit}
              title="Edit"
              style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-3)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✎
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-border)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {animal.notes && (
        <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, borderTop: '1px solid var(--color-border)', paddingTop: 8, margin: 0 }}>
          {animal.notes}
        </p>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type RosterView = 'guest' | 'other'

export default function HorsesPage() {
  const [view, setView]                 = useState<RosterView>('guest')
  const [animals, setAnimals]           = useState<OtherAnimal[]>([])
  const [loading, setLoading]           = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [editingAnimal, setEditingAnimal] = useState<OtherAnimal | null>(null)

  const active      = HORSES.filter(h => h.status === 'active' || h.status === 'backup')
  const unavailable = HORSES.filter(h => !['active', 'backup'].includes(h.status))

  const fetchAnimals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/other-animals')
      const data = await res.json()
      setAnimals(data.animals || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'other') fetchAnimals()
  }, [view, fetchAnimals])

  async function handleDelete(animal: OtherAnimal) {
    setAnimals(prev => prev.filter(a => a.id !== animal.id))
    await fetch(`/api/other-animals?id=${encodeURIComponent(animal.id)}`, { method: 'DELETE' })
  }

  async function handleSaved() {
    setShowModal(false)
    setEditingAnimal(null)
    await fetchAnimals()
  }

  // Group animals by group_name, preserving canonical order
  const grouped = OTHER_GROUPS.map(group => ({
    group,
    items: animals.filter(a => a.group_name === group),
  })).filter(g => g.items.length > 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>

        {/* Sticky header */}
        <div style={{
          background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
          padding: '16px 32px', position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>Horse Roster</h1>
              <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginTop: 2 }}>
                {view === 'guest'
                  ? `${active.length} active horses · ${unavailable.length} unavailable`
                  : loading ? 'Loading...' : `${animals.length} animal${animals.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* View toggle */}
            <div style={{
              display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 999, padding: 3, gap: 2,
            }}>
              {(['guest', 'other'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '5px 14px', borderRadius: 999, border: 'none',
                    background: view === v ? 'var(--color-surface)' : 'transparent',
                    color: view === v ? 'var(--color-text)' : 'var(--color-text-3)',
                    fontSize: 12, fontWeight: view === v ? 600 : 400,
                    cursor: 'pointer',
                    boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {v === 'guest' ? 'Guest horses' : 'Retired / Other'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Guest horses view ── */}
        {view === 'guest' && (
          <div style={{ padding: 32 }}>
            <SectionTitle>Active Horses</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 32 }}>
              {active.map(horse => <HorseCard key={horse.name} horse={horse} />)}
            </div>

            <SectionTitle>Unavailable</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {unavailable.map(horse => <HorseCard key={horse.name} horse={horse} dimmed />)}
            </div>
          </div>
        )}

        {/* ── Retired / Other view ── */}
        {view === 'other' && (
          <div style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <button
                onClick={() => setShowModal(true)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add animal
              </button>
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Loading...</p>
            ) : animals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-3)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>◈</div>
                <p style={{ fontSize: 13 }}>No animals added yet</p>
                <button
                  onClick={() => setShowModal(true)}
                  style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-2)' }}
                >
                  Add the first one
                </button>
              </div>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group} style={{ marginBottom: 32 }}>
                  <SectionTitle>{group} · {items.length}</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {items.map(animal => (
                      <OtherAnimalCard
                        key={animal.id}
                        animal={animal}
                        onEdit={() => setEditingAnimal(animal)}
                        onDelete={() => handleDelete(animal)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </main>

      {(showModal || editingAnimal) && (
        <OtherAnimalModal
          animal={editingAnimal}
          onClose={() => { setShowModal(false); setEditingAnimal(null) }}
          onSaved={handleSaved}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .horses-content { padding: 16px !important; }
        }
      ` }} />
    </div>
  )
}
