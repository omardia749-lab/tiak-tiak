import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get('lat')
  const lng = request.nextUrl.searchParams.get('lng')
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  if (!lat || !lng || !key) return NextResponse.json({ address: null })

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.results?.[0]) {
      const components = data.results[0].address_components
      const suburb = components.find((c: any) => c.types.includes('sublocality') || c.types.includes('neighborhood'))?.long_name
      const city = components.find((c: any) => c.types.includes('locality'))?.long_name
      const address = suburb && city ? `${suburb}, ${city}` : city || data.results[0].formatted_address.split(',')[0]
      return NextResponse.json({ address })
    }
    return NextResponse.json({ address: null })
  } catch {
    return NextResponse.json({ address: null })
  }
}