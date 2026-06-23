import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const fromLng = request.nextUrl.searchParams.get('fromLng')
  const fromLat = request.nextUrl.searchParams.get('fromLat')
  const toLng = request.nextUrl.searchParams.get('toLng')
  const toLat = request.nextUrl.searchParams.get('toLat')

  if (!fromLng || !fromLat || !toLng || !toLat) {
    return NextResponse.json(
      { error: 'Missing coordinates' },
      { status: 400 }
    )
  }

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=full&geometries=geojson&steps=false`

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'OSRM request failed' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'OSRM server error' },
      { status: 500 }
    )
  }
}