import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, email')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const people = (data || [])
    .filter((p: any) => p.email)
    .map((p: any) => ({
      id: p.id as string,
      email: p.email as string,
      name: (p.email as string).split('@')[0],
      role: p.role as string,
    }))
    .sort((a: any, b: any) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return a.name.localeCompare(b.name)
    })

  return NextResponse.json({ people })
}
