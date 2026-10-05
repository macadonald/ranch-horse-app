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
