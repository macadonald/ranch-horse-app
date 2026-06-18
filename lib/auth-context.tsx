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
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setRole(null); setLoading(false); return }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setRole((data?.role as Role) ?? 'viewer')
      setLoading(false)
    }
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load())
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
