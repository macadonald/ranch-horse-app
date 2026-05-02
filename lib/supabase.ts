import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Guest = {
  id: string
  name: string
  room_number: string
  check_in_date: string
  check_out_date: string
  age: number
  weight: number
  height: string
  riding_level: string
  notes: string
  horse_request: string
  created_at: string
}

export type HorseAssignment = {
  id: string
  guest_id: string
  horse_name: string
  assignment_type: 'primary' | 'secondary' | 'additional'
  status: 'active' | 'removed'
  incompatible: boolean
  requested_by_guest: boolean
  reason: string
  assigned_at: string
}

export type DailyRiderCount = {
  id: string
  date: string
  rider_count: number
}
