import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Vérifier si un numéro est blacklisté
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ blacklisted: false })
  const { data } = await supabase.from('blacklist').select('id, reason').eq('phone', phone).single()
  return NextResponse.json({ blacklisted: !!data, reason: data?.reason || '' })
}

// Ajouter un numéro à la blacklist (admin uniquement)
export async function POST(request: NextRequest) {
  try {
    const { phone, name, role, reason, banned_by } = await request.json()
    const { error } = await supabase.from('blacklist').insert({ phone, name, role, reason, banned_by })
    if (error) throw error
    // Bloquer le compte dans users
    await supabase.from('users').update({ is_suspended: true }).eq('phone', phone)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}