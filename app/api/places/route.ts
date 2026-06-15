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
    if (type === 'autocomplete' || type === 'textsearch') {
      const body: any = {
        textQuery: input.includes('Sénégal') ? input : `${input} Sénégal`,
        languageCode: 'fr',
        regionCode: 'SN',
        maxResultCount: 8,
      }
      if (lat && lng) {
        body.locationBias = {
          circle: {
            center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
            radius: 50000.0
          }
        }
      }
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY!,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types,places.id'
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      return NextResponse.json(data)
    }

    if (type === 'details') {
      const res = await fetch(`https://places.googleapis.com/v1/places/${input}`, {
        headers: {
          'X-Goog-Api-Key': GOOGLE_KEY!,
          'X-Goog-FieldMask': 'location'
        }
      })
      const data = await res.json()
      return NextResponse.json(data)
    }

    if (type === 'geocode') {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${input}&language=fr&key=${GOOGLE_KEY}`)
      const data = await res.json()
      return NextResponse.json(data)
    }

    return NextResponse.json({ results: [] })
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}