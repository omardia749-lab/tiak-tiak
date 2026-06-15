import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get('input') || ''
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const type = searchParams.get('type') || 'autocomplete'

  if (!input) return NextResponse.json({ results: [] })

  try {
    let url = ''
    if (type === 'autocomplete') {
      const locationBias = lat && lng ? `&location=${lat},${lng}&radius=50000` : '&location=14.7167,-17.2833&radius=500000'
      url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&language=fr&components=country:sn${locationBias}&key=${GOOGLE_KEY}`
    } else if (type === 'textsearch') {
      const locationBias = lat && lng ? `&location=${lat},${lng}&radius=50000` : '&location=14.7167,-17.2833&radius=500000'
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(input + ' Sénégal')}&language=fr&region=sn${locationBias}&key=${GOOGLE_KEY}`
    } else if (type === 'details') {
      url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${input}&fields=geometry&key=${GOOGLE_KEY}`
    } else if (type === 'geocode') {
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${input}&language=fr&key=${GOOGLE_KEY}`
    }

    const res = await fetch(url)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}