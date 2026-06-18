'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Mode = 'password' | 'magic'

export default function LoginPage() {
  const [mode, setMode]       = useState<Mode>('password')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setSent(false)
  }

  const isPasswordDisabled = loading || !email.trim() || !password
  const isMagicDisabled    = loading || !email.trim()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Brand header */}
        <div style={{
          background: 'var(--color-sidebar)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 32px',
          marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 700,
            color: '#f5ede0',
            letterSpacing: '-0.5px',
          }}>
            HerdAI
          </div>
          <div style={{
            fontSize: 11,
            color: '#d4924a',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: 5,
          }}>
            Know Your Herd
          </div>
        </div>

        {/* Login card */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 28px 24px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 5,
          }}>
            Sign in
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 22 }}>
            {mode === 'password'
              ? 'Enter your credentials to access your ranch dashboard'
              : 'Enter your email to receive a one-time login link'}
          </p>

          {sent ? (
            <div style={{
              background: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              color: 'var(--color-success)',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.5,
            }}>
              Check your email for a login link
              <div style={{ fontSize: 12, marginTop: 4, fontWeight: 400, opacity: 0.8 }}>
                The link expires in 60 minutes
              </div>
            </div>
          ) : mode === 'password' ? (
            <form onSubmit={handlePasswordSignIn}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                  style={{ marginBottom: 0 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ marginBottom: 0 }}
                />
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={isPasswordDisabled}
                style={submitButtonStyle(isPasswordDisabled, loading)}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => switchMode('magic')}
                  style={subtleLinkStyle}
                >
                  Send me a login link instead
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMagicLink}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                  style={{ marginBottom: 0 }}
                />
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={isMagicDisabled}
                style={submitButtonStyle(isMagicDisabled, loading)}
              >
                {loading ? 'Sending…' : 'Send Login Link'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => switchMode('password')}
                  style={subtleLinkStyle}
                >
                  Sign in with password instead
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: 'var(--color-danger-bg)',
      border: '1px solid var(--color-danger-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 12px',
      color: 'var(--color-danger)',
      fontSize: 13,
      marginBottom: 14,
    }}>
      {message}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const subtleLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 12,
  color: 'var(--color-text-3)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationColor: 'var(--color-border-2)',
  textUnderlineOffset: 3,
}

function submitButtonStyle(disabled: boolean, loading: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: disabled ? 'var(--color-border-2)' : 'var(--color-accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    marginTop: 4,
  }
}
