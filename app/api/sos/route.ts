import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export async function POST(request: NextRequest) {
  try {
    const { ride_id, triggered_by, triggered_by_name, triggered_by_phone, other_party_name, other_party_phone, lat, lng, address } = await request.json()

    // 1. Sauvegarder l'alerte SOS
    const { data, error } = await supabase.from('sos_alerts').insert({
      ride_id, triggered_by, triggered_by_name, triggered_by_phone,
      other_party_name, other_party_phone, lat, lng, address, status: 'active',
    }).select().single()

    if (error) throw error

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://tiak-tiak-zeta.vercel.app'

    // 2. Notifier l'admin
    const { data: adminData } = await supabase.from('users').select('fcm_token').eq('role', 'admin').not('fcm_token', 'is', null)
    const adminTokens = (adminData || []).map((d: any) => d.fcm_token).filter(Boolean)
    if (adminTokens.length > 0) {
      await fetch(`${baseUrl}/api/notify`, {
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

    // 3. Alerte communautaire — chauffeurs dans 2km
    if (lat && lng && triggered_by === 'chauffeur') {
      const { data: nearbyDrivers } = await supabase
        .from('users')
        .select('fcm_token, current_lat, current_lng')
        .eq('role', 'chauffeur')
        .eq('is_online', true)
        .not('fcm_token', 'is', null)
        .not('current_lat', 'is', null)

      const nearbyTokens = (nearbyDrivers || [])
        .filter((d: any) => {
          if (!d.current_lat || !d.current_lng) return false
          const dist = haversineDistance(lat, lng, d.current_lat, d.current_lng)
          return dist <= 2
        })
        .map((d: any) => d.fcm_token)
        .filter(Boolean)

      if (nearbyTokens.length > 0) {
        await fetch(`${baseUrl}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: nearbyTokens,
            title: '🚨 Collègue en danger près de toi !',
            body: `Un chauffeur TIAK TIAK a besoin d'aide — à moins de 2km de toi. Sois vigilant.`,
            data: { sosId: data.id, lat: String(lat), lng: String(lng) },
          }),
        })
      }
    }

    return NextResponse.json({ success: true, sosId: data.id })
  } catch (error) {
    console.error('SOS error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}