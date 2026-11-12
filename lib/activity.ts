import { createClient } from '@supabase/supabase-js'

const EXCLUDED_EMAILS = ['terencemcdonald99@gmail.com']

type Settings = { enabled: boolean; excluded_emails: string[] }

let settingsCache: { value: Settings; at: number } | null = null
const CACHE_TTL = 60_000

async function getActivitySettings(): Promise<Settings> {
  const now = Date.now()
  if (settingsCache && now - settingsCache.at < CACHE_TTL) return settingsCache.value

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return { enabled: false, excluded_emails: EXCLUDED_EMAILS }

  try {
    const sc = createClient(url, key)
    const { data, error } = await sc
      .from('app_settings')
      .select('value')
      .eq('key', 'activity_log')
      .maybeSingle()

    if (error || !data) return { enabled: false, excluded_emails: EXCLUDED_EMAILS }

    const v = data.value as Record<string, unknown>
    const result: Settings = {
      enabled: v.enabled === true,
      excluded_emails: [
        ...EXCLUDED_EMAILS,
        ...((v.excluded_emails as string[] | undefined) ?? []),
      ],
    }
    settingsCache = { value: result, at: now }
    return result
  } catch {
    return { enabled: false, excluded_emails: EXCLUDED_EMAILS }
  }
}

export async function logActivity(
  supabase: any,
  user: { id: string; email: string },
  params: {
    action: string
    entityType?: string
    entityId?: string
    summary: string
    details?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const settings = await getActivitySettings()
    if (!settings.enabled) return
    if (settings.excluded_emails.some(e => e.toLowerCase() === user.email.toLowerCase())) return

    await supabase.from('activity_log').insert({
      user_id: user.id,
      user_email: user.email,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId != null ? String(params.entityId) : null,
      summary: params.summary,
      details: params.details ?? {},
    })
  } catch (err) {
    console.error('[activity] logging failed:', err)
  }
}
