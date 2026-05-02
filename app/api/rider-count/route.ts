import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('daily_rider_counts')
      .select('*')
      .eq('date', today)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return NextResponse.json({ count: data?.rider_count || null })
  } catch (err) {
    console.error('GET rider count error:', err)
    return NextResponse.json({ error: 'Failed to fetch rider count' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { count } = await req.json()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('daily_rider_counts')
      .upsert({ date: today, rider_count: count }, { onConflict: 'date' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ count: data.rider_count })
  } catch (err) {
    console.error('POST rider count error:', err)
    return NextResponse.json({ error: 'Failed to save rider count' }, { status: 500 })
  }
}
