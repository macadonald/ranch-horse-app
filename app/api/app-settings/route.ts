import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'activity_log')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const value = (data?.value as Record<string, unknown> | null) ?? {}
  return NextResponse.json({
    enabled: value.enabled === true,
    excluded_emails: (value.excluded_emails as string[] | undefined) ?? [],
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { enabled, excluded_emails } = body as { enabled?: unknown; excluded_emails?: unknown }
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })

  const value = {
    enabled,
    excluded_emails: Array.isArray(excluded_emails) ? excluded_emails : [],
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'activity_log', value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
