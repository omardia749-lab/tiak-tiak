import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')
  const location = request.nextUrl.searchParams.get('location')
  const radius = request.nextUrl.searchParams.get('radius') || '50000'
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  if (!query || !key) {
    return NextResponse.json({ results: [] })
  }

  try {
    const locationParam = location ? `&location=${location}&radius=${radius}` : ''
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + ' Sénégal')}${locationParam}&language=fr&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    return NextResponse.json({ results: data.results || [] })
  } catch {
    return NextResponse.json({ results: [] })
  }
}