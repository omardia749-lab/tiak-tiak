import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const {
      ride_id,
      triggered_by,
      triggered_by_name,
      triggered_by_phone,
      other_party_name,
      other_party_phone,
      lat,
      lng,
      address,
    } = await request.json()

    // Sauvegarder l'alerte SOS dans Supabase
    const { data, error } = await supabase.from('sos_alerts').insert({
      ride_id,
      triggered_by,
      triggered_by_name,
      triggered_by_phone,
      other_party_name,
      other_party_phone,
      lat,
      lng,
      address,
      status: 'active',
    }).select().single()

    if (error) throw error

    // Notifier l'admin via Firebase
    const { data: adminData } = await supabase
      .from('users')
      .select('fcm_token')
      .eq('role', 'admin')
      .not('fcm_token', 'is', null)

    const adminTokens = (adminData || []).map((d: any) => d.fcm_token).filter(Boolean)

    if (adminTokens.length > 0) {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://tiak-tiak-zeta.vercel.app'}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: adminTokens,
          title: '🚨 ALERTE SOS TIAK TIAK',
          body: `${triggered_by_name} (${triggered_by}) — ${address}`,
          data: { sosId: data.id, rideId: ride_id || '' },
        }),
      })
    }

    return NextResponse.json({ success: true, sosId: data.id })
  } catch (error) {
    console.error('SOS error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}