import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  try {
    const { suggestion_id, final_horse } = await req.json()
    if (!suggestion_id) return NextResponse.json({ error: 'Missing suggestion_id' }, { status: 400 })
    const { error } = await supabase
      .from('assign_all_suggestions')
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        final_horse: final_horse ?? null,
      })
      .eq('id', suggestion_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
