'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type AiSummary = { overview: string; highlights: string[] }

// ── Print styles ─────────────────────────────────────────────────────────────

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, serif; font-size: 11pt; color: #111; background: #fff; margin: 0; }
  @page { size: letter; margin: 0.75in; }
  @page { @bottom-center { content: "White Stallion Ranch · Ranch Report"; font-size: 8pt; color: #666; } }
  .no-print { display: none !important; }
  .section { break-before: auto; margin-bottom: 32pt; }
  .avoid-break { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { background: #f0f0f0; font-weight: 600; text-align: left; padding: 4pt 6pt; border: 1px solid #ccc; }
  td { padding: 4pt 6pt; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .bar-row { display: flex; align-items: center; gap: 6pt; margin-bottom: 3pt; }
  .bar-label { width: 110pt; font-size: 9pt; text-align: right; flex-shrink: 0; }
  .bar-track { flex: 1; height: 10pt; background: #e8e8e8; border-radius: 2pt; }
  .bar-fill  { height: 100%; border-radius: 2pt; background: #1e40af; }
  .bar-val   { width: 28pt; font-size: 9pt; flex-shrink: 0; }
  .key-numbers { display: grid; gap: 10pt; margin-bottom: 14pt; }
  .kn-item { background: #f7f7f7; border: 1px solid #ddd; border-radius: 4pt; padding: 8pt 10pt; text-align: center; }
  .kn-val  { font-size: 18pt; font-weight: 700; font-family: Georgia, serif; }
  .kn-lbl  { font-size: 8.5pt; color: #666; margin-top: 2pt; }
  .pill { display: inline-block; font-size: 8.5pt; padding: 1pt 6pt; border-radius: 999pt; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; margin: 2pt; }
  .pill-grey { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
  @media screen {
    body { background: #f3f4f6; padding: 0; }
    .page-wrap { max-width: 820px; margin: 0 auto; background: #fff; box-shadow: 0 2px 20px rgba(0,0,0,0.12); padding: 48px 56px 64px; min-height: 100vh; }
    .sticky-bar { position: sticky; top: 0; z-index: 100; background: #1e293b; color: #fff; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; font-family: system-ui, sans-serif; }
    .sticky-bar button { padding: 6px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-pdf { background: #2563eb; color: #fff; }
    .btn-close { background: rgba(255,255,255,0.15); color: #fff; }
    .key-numbers { grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); }
    section.section { margin-bottom: 40px; }
    .section-title { font-family: Georgia, serif; font-size: 17px; font-weight: 700; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; color: #111; }
    .sub-label { font-size: 10.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin: 14px 0 7px; }
    h1 { font-family: Georgia, serif; font-size: 24px; font-weight: 700; margin: 0 0 4px; }
    h2 { font-family: Georgia, serif; font-size: 15px; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .spinner { display: flex; align-items: center; justify-content: center; height: 60vh; font-size: 16px; color: #6b7280; font-family: system-ui; }
  }
  @media print {
    .page-wrap { padding: 0; box-shadow: none; }
    .section-title { font-size: 14pt; border-bottom: 1.5pt solid #ccc; padding-bottom: 4pt; margin-bottom: 10pt; }
    .sub-label { font-size: 8.5pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin: 10pt 0 5pt; }
    h1 { font-size: 18pt; margin: 0 0 3pt; }
    .meta { font-size: 9pt; color: #555; margin-bottom: 4pt; }
  }
`

// ── Chart helpers ─────────────────────────────────────────────────────────────

function HBar({ label, value, max, color = '#1e40af' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-row avoid-break">
      <div className="bar-label">{label}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
      <div className="bar-val">{value}</div>
    </div>
  )
}

function BarChart({ data, labelKey, valueKey, color }: { data: any[]; labelKey: string; valueKey: string; color?: string }) {
  if (!data || data.length === 0) return <p style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>No data</p>
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div className="avoid-break">
      {data.map((d, i) => <HBar key={i} label={String(d[labelKey])} value={d[valueKey]} max={max} color={color} />)}
    </div>
  )
}

function LineSparkline({ data }: { data: { week: string; count: number }[] }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data.map(d => d.count), 1)
  const W = 500, H = 70, PAD = 6
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((d.count / max) * (H - PAD * 2))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <div className="avoid-break" style={{ marginTop: 6 }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ height: 70, display: 'block' }}>
        <polyline points={pts.join(' ')} fill="none" stroke="#1e40af" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((d.count / max) * (H - PAD * 2))
          return <circle key={i} cx={x} cy={y} r="3" fill="#1e40af" />
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
        <span style={{ color: '#888' }}>{data[0]?.week}</span>
        <span style={{ color: '#888' }}>{data[data.length - 1]?.week}</span>
      </div>
    </div>
  )
}

function KeyNumbers({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="key-numbers avoid-break">
      {items.map((it, i) => (
        <div key={i} className="kn-item">
          <div className="kn-val">{it.value}</div>
          <div className="kn-lbl">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

function SubLabel({ children }: { children: string }) {
  return <div className="sub-label">{children}</div>
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (!rows || rows.length === 0) return <p style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>None</p>
  return (
    <table className="avoid-break">
      <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
    </table>
  )
}

// ── Section renderers ─────────────────────────────────────────────────────────

function GuestsSection({ data }: { data: any }) {
  return (
    <section className="section">
      <div className="section-title">Guests</div>
      <KeyNumbers items={[
        { label: 'Total guests', value: data.total },
        { label: 'Arrivals',     value: data.arrivals },
        { label: 'Avg stay',     value: `${data.avg_stay_days}d` },
        { label: 'Repeat guests',value: `${data.repeat_share_pct}%` },
        { label: 'Kids (<13)',   value: data.kids },
        { label: 'Teens',        value: data.teens },
        { label: 'Adults',       value: data.adults },
      ]} />

      {data.guests_per_week?.length > 1 && (
        <div className="avoid-break">
          <SubLabel>Guests per week</SubLabel>
          <LineSparkline data={data.guests_per_week} />
        </div>
      )}

      <SubLabel>Weight distribution</SubLabel>
      <BarChart data={data.weight_band_mix?.filter((b: any) => b.count > 0)} labelKey="label" valueKey="count" color="#059669" />

      <SubLabel>Riding level mix</SubLabel>
      <BarChart data={data.level_mix} labelKey="level" valueKey="count" color="#7c3aed" />

      {data.top_groups?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Top groups</SubLabel>
          <DataTable
            headers={['Group', 'Guests']}
            rows={data.top_groups.map((g: any) => [g.name, g.count])}
          />
        </div>
      )}
    </section>
  )
}

function HorsesSection({ data }: { data: any }) {
  return (
    <section className="section">
      <div className="section-title">Horses</div>
      <KeyNumbers items={[
        { label: 'Active horses',  value: data.herd_depth?.total_active ?? '—' },
        { label: 'Available',      value: data.herd_depth?.available    ?? '—' },
        { label: 'Blocked',        value: data.herd_depth?.blocked      ?? '—' },
        { label: 'Draft horses',   value: data.herd_depth?.draft_count  ?? '—' },
        { label: 'Idle 14+ days',  value: data.idle_14_plus?.length     ?? 0 },
      ]} />

      <SubLabel>Top 10 by guest-days (range)</SubLabel>
      <BarChart data={data.top_by_guest_days} labelKey="name" valueKey="guest_days" color="#d97706" />

      {data.idle_14_plus?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Idle available horses (14+ days at range end)</SubLabel>
          <DataTable
            headers={['Horse', 'Last assigned', 'Days idle']}
            rows={data.idle_14_plus.map((h: any) => [h.name, h.last_assigned ?? 'never', h.days_idle === 999 ? '999+' : h.days_idle])}
          />
        </div>
      )}

      {data.draft_usage_heavy_riders?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Draft horse usage (200+ lb riders)</SubLabel>
          <DataTable
            headers={['Horse', 'Heavy-rider uses']}
            rows={data.draft_usage_heavy_riders.map((h: any) => [h.name, h.heavy_rider_uses])}
          />
        </div>
      )}
    </section>
  )
}

function SwapsSection({ data }: { data: any }) {
  return (
    <section className="section">
      <div className="section-title">Swaps</div>
      <KeyNumbers items={[
        { label: 'Total swaps',  value: data.total },
        { label: 'Not a fit',    value: data.not_a_fit?.length ?? 0 },
      ]} />

      {data.by_category?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>By category</SubLabel>
          <BarChart data={data.by_category} labelKey="category" valueKey="count" color="#dc2626" />
        </div>
      )}

      {data.by_reason?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>By reason</SubLabel>
          <BarChart data={data.by_reason} labelKey="reason" valueKey="count" color="#ea580c" />
        </div>
      )}

      {data.most_swapped_off?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Most swapped-off horses</SubLabel>
          <DataTable
            headers={['Horse', 'Swaps', 'Reasons']}
            rows={data.most_swapped_off.map((h: any) => [h.name, h.swaps, (h.reasons || []).join(', ') || '—'])}
          />
        </div>
      )}

      {data.not_a_fit?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Not a fit — full list</SubLabel>
          <DataTable
            headers={['Horse', 'Guest', 'Reason', 'Date']}
            rows={data.not_a_fit.map((r: any) => [r.horse, r.guest, r.reason || '—', r.date || '—'])}
          />
        </div>
      )}
    </section>
  )
}

function HealthSection({ data }: { data: any }) {
  return (
    <section className="section">
      <div className="section-title">Health</div>
      <KeyNumbers items={[
        { label: 'Flags opened', value: data.opened },
        { label: 'Flags resolved', value: data.resolved },
        { label: 'Open at range end', value: data.open_at_range_end?.length ?? 0 },
      ]} />

      {data.opened_by_type?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Opened by type</SubLabel>
          <BarChart data={data.opened_by_type} labelKey="type" valueKey="count" color="#dc2626" />
        </div>
      )}

      {data.most_flagged_horses?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Horses with most flags opened</SubLabel>
          <DataTable
            headers={['Horse', 'Flags']}
            rows={data.most_flagged_horses.map((h: any) => [h.name, h.flags])}
          />
        </div>
      )}

      {data.open_at_range_end?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Open flags at range end</SubLabel>
          <DataTable
            headers={['Horse', 'Type', 'Since']}
            rows={data.open_at_range_end.map((f: any) => [f.horse, f.type, f.since || '—'])}
          />
        </div>
      )}
    </section>
  )
}

function ShoesSection({ data }: { data: any }) {
  return (
    <section className="section">
      <div className="section-title">Shoes</div>
      <KeyNumbers items={[
        { label: 'Farrier visits',    value: data.visits_in_range },
        { label: 'Avg full-set gap',  value: data.avg_full_set_gap_days != null ? `${data.avg_full_set_gap_days}d` : '—' },
        { label: 'Overdue horses',    value: data.overdue_horses?.length ?? 0 },
      ]} />

      {data.by_farrier?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>By farrier</SubLabel>
          <DataTable
            headers={['Farrier', 'Visits', 'Horses seen']}
            rows={data.by_farrier.map((f: any) => [f.farrier, f.visits, f.horses_seen])}
          />
        </div>
      )}

      {data.work_categories?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Work categories</SubLabel>
          <BarChart data={data.work_categories} labelKey="category" valueKey="count" color="#0891b2" />
        </div>
      )}

      {data.overdue_horses?.length > 0 && (
        <div className="avoid-break">
          <SubLabel>Past usual shoeing gap (at range end)</SubLabel>
          <DataTable
            headers={['Horse', 'Last full set', 'Days since', 'Usual gap', 'Days overdue']}
            rows={data.overdue_horses.map((h: any) => [h.name, h.last_full_set, h.days_since, h.usual_gap, h.days_overdue])}
          />
        </div>
      )}
    </section>
  )
}

function PatternsSection({ data }: { data: any[] }) {
  if (!data || data.length === 0) return (
    <section className="section">
      <div className="section-title">Patterns</div>
      <p style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>No action findings detected.</p>
    </section>
  )
  return (
    <section className="section">
      <div className="section-title">Patterns</div>
      {data.map((f, i) => (
        <div key={i} className="avoid-break" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{f.title}</div>
          {f.n > 0 && <span style={{ fontSize: 10, marginLeft: 6, background: '#dbeafe', color: '#1e40af', borderRadius: 999, padding: '1px 6px' }}>n={f.n}</span>}
          <p style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 1.5 }}>{f.detail}</p>
        </div>
      ))}
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00Z')
  const e = new Date(end   + 'T12:00:00Z')
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${mo[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()} – ${mo[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
}

export default function ReportPrintPage() {
  const [facts, setFacts]       = useState<any>(null)
  const [summary, setSummary]   = useState<AiSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [meta, setMeta]         = useState({ start: '', end: '', sections: [] as string[], generatedBy: '', generatedAt: '' })
  const router = useRouter()

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const start    = params.get('start')    || ''
    const end      = params.get('end')      || ''
    const sections = (params.get('sections') || '').split(',').filter(Boolean)
    const ai       = params.get('ai') === '1'
    const now      = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' })

    if (!start || !end || sections.length === 0) {
      setError('Missing report parameters. Close this tab and try again.')
      setLoading(false)
      return
    }

    fetch('/api/me')
      .then(r => r.json())
      .then(d => {
        if (d.role !== 'admin') { router.replace('/guests'); return null }
        return fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start, end, sections, aiSummary: ai }),
        })
      })
      .then(r => r ? r.json() : null)
      .then(d => {
        if (!d) return
        if (d.error) throw new Error(d.error)
        setFacts(d.facts)
        setSummary(d.summary || null)
        setMeta({ start, end, sections, generatedBy: d.generatedBy || '', generatedAt: now })
        setLoading(false)
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to generate report')
        setLoading(false)
      })
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Sticky bar — hidden when printing */}
      <div className="sticky-bar no-print">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Ranch Report</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-pdf"   onClick={() => window.print()}>Download PDF</button>
          <button className="btn-close" onClick={() => window.close()}>Close</button>
        </div>
      </div>

      <div className="page-wrap">
        {loading && (
          <div className="spinner">Building your report…</div>
        )}

        {!loading && error && (
          <div style={{ padding: '32px 0', color: '#dc2626', fontFamily: 'system-ui' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && facts && (
          <>
            {/* Report header */}
            <div className="avoid-break" style={{ marginBottom: 28 }}>
              <h1>White Stallion Ranch · Ranch Report</h1>
              <p className="meta">{fmtDateRange(meta.start, meta.end)}</p>
              <p className="meta">
                Generated {meta.generatedAt}{meta.generatedBy ? ` by ${meta.generatedBy}` : ''} ·
                Sections: {meta.sections.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}
              </p>
            </div>

            {/* AI summary */}
            {summary && (
              <section className="section avoid-break">
                <div className="section-title">Summary</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{summary.overview}</p>
                {summary.highlights.length > 0 && (
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    {summary.highlights.map((h, i) => (
                      <li key={i} style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>{h}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Data sections */}
            {meta.sections.includes('guests')   && facts.guests   && <GuestsSection   data={facts.guests} />}
            {meta.sections.includes('horses')   && facts.horses   && <HorsesSection   data={facts.horses} />}
            {meta.sections.includes('swaps')    && facts.swaps    && <SwapsSection    data={facts.swaps} />}
            {meta.sections.includes('health')   && facts.health   && <HealthSection   data={facts.health} />}
            {meta.sections.includes('shoes')    && facts.shoes    && <ShoesSection    data={facts.shoes} />}
            {meta.sections.includes('patterns') && facts.patterns && <PatternsSection data={facts.patterns} />}
          </>
        )}
      </div>
    </>
  )
}
