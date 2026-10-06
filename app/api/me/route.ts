import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId, supabase } = auth
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return NextResponse.json({ role: (data as any)?.role ?? 'viewer' })
}
