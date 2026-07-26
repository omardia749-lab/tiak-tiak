import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Récupérer les zones à risque
export async function GET() {
  const { data } = await supabase
    .from('danger_zones')
    .select('*')
    .eq('active', true)
    .order('votes', { ascending: false })
  return NextResponse.json(data || [])
}

// Signaler une zone à risque
export async function POST(request: NextRequest) {
  try {
    const { reported_by, reported_by_name, lat, lng, description, zone_type } = await request.json()

    // Vérifier si une zone existe déjà à moins de 200m
    const { data: existing } = await supabase
      .from('danger_zones')
      .select('*')
      .eq('active', true)

    const nearby = (existing || []).find((z: any) => {
      const dist = Math.sqrt(Math.pow((z.lat - lat) * 111000, 2) + Math.pow((z.lng - lng) * 111000, 2))
      return dist < 200
    })

    if (nearby) {
      // Incrémenter les votes si zone déjà signalée
      await supabase.from('danger_zones').update({ votes: (nearby.votes || 1) + 1 }).eq('id', nearby.id)
      return NextResponse.json({ success: true, message: 'Zone confirmée par un autre chauffeur' })
    }

    await supabase.from('danger_zones').insert({
      reported_by, reported_by_name, lat, lng, description, zone_type
    })

    return NextResponse.json({ success: true, message: 'Zone signalée avec succès' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}