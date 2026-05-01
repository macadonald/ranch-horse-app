'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/swap',   label: 'Horse Swap',       icon: '⇄' },
  { href: '/guests', label: 'Guests',            icon: '◎' },
  { href: '/board',  label: 'Assignment Board',  icon: '▦' },
  { href: '/horses', label: 'Horse Roster',      icon: '◈' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside style={{
      width: 230,
      flexShrink: 0,
      background: 'var(--color-sidebar)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          color: '#f5ede0',
          fontWeight: 700,
          letterSpacing: '0.01em',
          lineHeight: 1.2,
        }}>
          Ranch Horse
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(245,237,224,0.45)',
          marginTop: 4,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Assignment System
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 0', flex: 1 }}>
        {NAV.map(item => {
          const active = path.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#f5ede0' : 'rgba(245,237,224,0.5)',
                borderLeft: active ? '2px solid #d4924a' : '2px solid transparent',
                background: active ? 'rgba(212,146,74,0.1)' : 'transparent',
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: 14, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
        color: 'rgba(245,237,224,0.25)',
        letterSpacing: '0.04em',
      }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </aside>
  )
}
