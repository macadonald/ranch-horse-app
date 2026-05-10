'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  { href: '/swap',   label: 'Horse Swap',       icon: '\u21c4' },
  { href: '/guests', label: 'Guests',            icon: '\u25ce' },
  { href: '/board',  label: 'Assignment Board',  icon: '\u25a6' },
  { href: '/horses', label: 'Horse Roster',      icon: '\u25c8' },
  { href: '/shoes',  label: 'Shoes',             icon: '\u2229' },
  { href: '/health', label: 'Horse Health',      icon: '\u2665' },
]

export default function Sidebar() {
  const path = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mobile-menu-btn"
        style={{ display: 'none', position: 'fixed', top: 12, left: 12, zIndex: 200, background: 'var(--color-sidebar)', border: 'none', borderRadius: 8, width: 40, height: 40, cursor: 'pointer', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#f5ede0' }}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }} />
      )}

      <aside
        className={"sidebar" + (mobileOpen ? " sidebar-open" : "")}
        style={{ width: 230, flexShrink: 0, background: 'var(--color-sidebar)', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}
      >
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#f5ede0', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.2 }}>Ranch Horse</div>
          <div style={{ fontSize: 11, color: 'rgba(245,237,224,0.45)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Assignment System</div>
        </div>

        <nav style={{ padding: '12px 0', flex: 1 }}>
          {NAV.map(item => {
            const active = path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }} onClick={() => setMobileOpen(false)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#f5ede0' : 'rgba(245,237,224,0.5)', borderLeft: active ? '2px solid #d4924a' : '2px solid transparent', background: active ? 'rgba(212,146,74,0.1)' : 'transparent', transition: 'all 0.15s', cursor: 'pointer' }}>
                  <span style={{ fontSize: 14, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(245,237,224,0.25)', letterSpacing: '0.04em' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
          .sidebar { position: fixed !important; left: -230px !important; top: 0 !important; height: 100vh !important; z-index: 160 !important; transition: left 0.25s ease !important; }
          .sidebar-open { left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
