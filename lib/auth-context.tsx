'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Role = 'admin' | 'viewer'

interface AuthContextValue {
  role: Role | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ role: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole]     = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function fetchRole(userId: string) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      setRole((data?.role as Role) ?? 'viewer')
      setLoading(false)
    }

    // onAuthStateChange fires immediately with INITIAL_SESSION so no separate
    // initial fetch is needed. Using the session from the callback avoids a
    // second getUser() round-trip that can return null before the session
    // stabilises and race this call to incorrectly set role → null (viewer).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          setRole(null)
          setLoading(false)
          return
        }
        fetchRole(session.user.id)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  return (
    <AuthContext.Provider value={{ role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useRole() {
  const { role, loading } = useContext(AuthContext)
  const isAdmin  = role === 'admin'
  const isViewer = !isAdmin          // null (loading) and 'viewer' both → viewer-safe
  return { role, loading, isAdmin, isViewer }
}
