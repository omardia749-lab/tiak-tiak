'use client'

import { useEffect, useRef, useCallback } from 'react'

interface NearbyDriver {
  id: string
  lat: number
  lng: number
  name: string
  eta: number
  motoColor?: string
}

interface MapViewProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  driverLat?: number
  driverLng?: number
  driverMotoColor?: string
  showDriver?: boolean
  mode?: 'client' | 'driver'
  nearbyDrivers?: NearbyDriver[]
  showNearby?: boolean
  onRouteCoords?: (coords: [number, number][]) => void
}

const MOTO_COLOR_MAP: Record<string, string> = {
  'rouge': '#E53935', 'noir': '#212121', 'noire': '#212121', 'bleu': '#1E88E5', 'bleue': '#1E88E5',
  'vert': '#1DB954', 'verte': '#1DB954', 'blanc': '#F5F5F5', 'blanche': '#F5F5F5',
  'gris': '#757575', 'grise': '#757575', 'jaune': '#FBC02D', 'orange': '#FB8C00',
  'marron': '#6D4C41', 'violet': '#8E24AA', 'violette': '#8E24AA', 'rose': '#EC407A',
}

const getMotoColor = (colorName?: string): string => {
  if (!colorName) return '#0F5138'
  const key = colorName.trim().toLowerCase()
  return MOTO_COLOR_MAP[key] || '#0F5138'
}

declare global {
  interface Window {
    google: any
    initGoogleMaps: () => void
  }
}

let googleMapsLoaded = false
let googleMapsLoading = false
const googleMapsCallbacks: (() => void)[] = []

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded) { resolve(); return }
    googleMapsCallbacks.push(resolve)
    if (googleMapsLoading) return
    googleMapsLoading = true
    window.initGoogleMaps = () => {
      googleMapsLoaded = true
      googleMapsCallbacks.forEach(cb => cb())
      googleMapsCallbacks.length = 0
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initGoogleMaps&language=fr`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng,
  driverMotoColor,
  showDriver = false,
  nearbyDrivers = [],
  showNearby = false,
  onRouteCoords,
  mode = 'client',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const routePolylineRef = useRef<any>(null)
  const arrivalMarkerRef = useRef<any>(null)
  const etaMarkerRef = useRef<any>(null)
  const fromMarkerRef = useRef<any>(null)
  const toMarkerRef = useRef<any>(null)

  const createMotoMarker = useCallback((map: any, lat: number, lng: number, eta?: number, isAssigned = false, color?: string, heading = 0) => {
    const motoColor = getMotoColor(color)
    const ringColor = isAssigned ? '#0F5138' : 'white'
    const svgContent = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <div style="width:38px;height:38px;border-radius:50%;background:white;border:3px solid ${ringColor};box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
          <div style="transform:rotate(${heading}deg);transition:transform 0.4s ease;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <ellipse cx="13" cy="6" rx="3.2" ry="3.6" fill="${motoColor}"/>
              <rect x="11" y="9" width="4" height="9" rx="2" fill="${motoColor}"/>
              <path d="M13 17 L8 23 M13 17 L18 23" stroke="${motoColor}" stroke-width="2.4" stroke-linecap="round"/>
              <circle cx="7" cy="24" r="2" fill="#1a1a1a"/>
              <circle cx="19" cy="24" r="2" fill="#1a1a1a"/>
              <path d="M9 11 L4 9 M17 11 L22 9" stroke="${motoColor}" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        ${eta !== undefined ? `<div style="background:#1DB954;color:white;font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${eta} min</div>` : ''}
      </div>`

    const marker = new window.google.maps.marker.AdvancedMarkerElement({
      position: { lat, lng },
      map,
      content: (() => { const d = document.createElement('div'); d.innerHTML = svgContent; return d.firstChild as HTMLElement })(),
    })
    return marker
  }, [])

  const drawRoute = useCallback(async (map: any, from: { lat: number, lng: number }, to: { lat: number, lng: number }) => {
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null }
    if (arrivalMarkerRef.current) { arrivalMarkerRef.current.map = null; arrivalMarkerRef.current = null }
    if (etaMarkerRef.current) { etaMarkerRef.current.map = null; etaMarkerRef.current = null }

    const samePoint = Math.abs(from.lat - to.lat) < 0.0001 && Math.abs(from.lng - to.lng) < 0.0001
    if (samePoint) return

    try {
      const directionsService = new window.google.maps.DirectionsService()
      const result = await directionsService.route({
        origin: from,
        destination: to,
        travelMode: window.google.maps.TravelMode.DRIVING,
      })

      const route = result.routes[0]
      const leg = route.legs[0]
      const path = route.overview_path

      if (onRouteCoords) {
        const coords: [number, number][] = path.map((p: any) => [p.lat(), p.lng()])
        onRouteCoords(coords)
      }

      routePolylineRef.current = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#1DB954',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map,
      })

      const durationSec = leg.duration?.value || 0
      const arrivalDate = new Date(Date.now() + durationSec * 1000)
      const arrivalStr = arrivalDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const etaMin = Math.max(1, Math.round(durationSec / 60))

      const arrivalDiv = document.createElement('div')
      arrivalDiv.innerHTML = `<div style="background:white;color:#111;font-size:12px;font-weight:700;padding:6px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:1px solid #eee;">arrivée à ${arrivalStr}</div>`
      arrivalMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: to,
        map,
        content: arrivalDiv.firstChild as HTMLElement,
        zIndex: 1000,
      })

      const midIdx = Math.floor(path.length / 2)
      const midPoint = path[midIdx]
      const etaDiv = document.createElement('div')
      etaDiv.innerHTML = `<div style="background:#1DB954;color:white;font-size:13px;font-weight:800;padding:5px 11px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${etaMin} min</div>`
      etaMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: midPoint,
        map,
        content: etaDiv.firstChild as HTMLElement,
        zIndex: 999,
      })

      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(from)
      bounds.extend(to)
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })

    } catch (e) {
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(from)
      bounds.extend(to)
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
    }
  }, [onRouteCoords])

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey || !containerRef.current) return

    loadGoogleMaps(apiKey).then(() => {
      if (!containerRef.current) return

      const map = new window.google.maps.Map(containerRef.current, {
        center: { lat: fromLat, lng: fromLng },
        zoom: 13,
        mapId: 'tiak_tiak_map',
        disableDefaultUI: true,
        gestureHandling: 'cooperative',
        styles: [],
      })
      mapRef.current = map

      const fromDiv = document.createElement('div')
      fromDiv.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:#1DB954;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`
      fromMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: fromLat, lng: fromLng },
        map,
        content: fromDiv.firstChild as HTMLElement,
      })

      const samePoint = Math.abs(fromLat - toLat) < 0.0001 && Math.abs(fromLng - toLng) < 0.0001

      if (!samePoint) {
        const toDiv = document.createElement('div')
        toDiv.innerHTML = `<div style="width:22px;height:30px;"><svg width="22" height="30" viewBox="0 0 22 30" fill="none"><path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.925 17.075 0 11 0z" fill="#E53935"/><circle cx="11" cy="11" r="4.5" fill="white"/></svg></div>`
        toMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat: toLat, lng: toLng },
          map,
          content: toDiv.firstChild as HTMLElement,
        })
      }

      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          const marker = createMotoMarker(map, d.lat, d.lng, d.eta, false, d.motoColor)
          nearbyMarkersRef.current.push(marker)
        })
      }

      if (showDriver && driverLat && driverLng) {
        driverMarkerRef.current = createMotoMarker(map, driverLat, driverLng, undefined, true, driverMotoColor)
      }

      if (!samePoint) {
        drawRoute(map, { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })
      } else {
        if (showNearby && nearbyDrivers.length > 0) {
          const bounds = new window.google.maps.LatLngBounds()
          bounds.extend({ lat: fromLat, lng: fromLng })
          nearbyDrivers.forEach(d => bounds.extend({ lat: d.lat, lng: d.lng }))
          map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
        } else {
          map.setCenter({ lat: fromLat, lng: fromLng })
          map.setZoom(15)
        }
      }
    })

    return () => {
      if (routePolylineRef.current) routePolylineRef.current.setMap(null)
      nearbyMarkersRef.current.forEach(m => { m.map = null })
      nearbyMarkersRef.current = []
      mapRef.current = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby])

  useEffect(() => {
    if (!mapRef.current || !window.google || !showDriver || !driverLat || !driverLng) return

    if (driverMarkerRef.current) {
      driverMarkerRef.current.position = { lat: driverLat, lng: driverLng }
    } else {
      driverMarkerRef.current = createMotoMarker(mapRef.current, driverLat, driverLng, undefined, true, driverMotoColor)
    }

    if (mode === 'driver') {
      mapRef.current.setCenter({ lat: driverLat, lng: driverLng })
      mapRef.current.setZoom(17)
    }
  }, [driverLat, driverLng, showDriver, createMotoMarker, mode, driverMotoColor])

  useEffect(() => {
    if (!mapRef.current || !window.google || !showNearby) return
    nearbyMarkersRef.current.forEach(m => { m.map = null })
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      const marker = createMotoMarker(mapRef.current, d.lat, d.lng, d.eta, false, d.motoColor)
      nearbyMarkersRef.current.push(marker)
    })
  }, [nearbyDrivers, showNearby, createMotoMarker])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
    />
  )
}