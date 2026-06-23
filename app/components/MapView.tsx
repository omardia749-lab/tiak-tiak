'use client'

import { useCallback, useEffect, useRef } from 'react'

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

const GREEN = '#1DB954'
const DARK_GREEN = '#0F5138'
const RED = '#E53935'

const MOTO_COLOR_MAP: Record<string, string> = {
  rouge: '#E53935', noir: '#212121', noire: '#212121',
  bleu: '#1E88E5', bleue: '#1E88E5', vert: '#1DB954', verte: '#1DB954',
  blanc: '#F5F5F5', blanche: '#F5F5F5', gris: '#757575', grise: '#757575',
  jaune: '#FBC02D', orange: '#FB8C00', marron: '#6D4C41',
  violet: '#8E24AA', violette: '#8E24AA', rose: '#EC407A',
}

const getMotoColor = (colorName?: string): string => {
  if (!colorName) return DARK_GREEN
  return MOTO_COLOR_MAP[colorName.trim().toLowerCase()] || DARK_GREEN
}

const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d0d0d0' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f8f8f6' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8f5' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
]

declare global {
  interface Window { google: any; initGoogleMaps: () => void }
}

let googleMapsLoaded = false
let googleMapsLoading = false
const googleMapsCallbacks: (() => void)[] = []

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return
    if (window.google?.maps) { googleMapsLoaded = true; resolve(); return }
    if (googleMapsLoaded) { resolve(); return }
    googleMapsCallbacks.push(resolve)
    if (googleMapsLoading) return
    googleMapsLoading = true
    window.initGoogleMaps = () => {
      googleMapsLoaded = true
      googleMapsLoading = false
      googleMapsCallbacks.forEach(cb => cb())
      googleMapsCallbacks.length = 0
    }
    if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) return
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=initGoogleMaps&language=fr&v=beta`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

function hideGoogleControls() {
  if (document.getElementById('tiak-hide-google')) return
  const s = document.createElement('style')
  s.id = 'tiak-hide-google'
  s.textContent = `
    .gmnoprint, .gm-style-cc, .gm-bundled-control,
    .gm-svpc, .gm-fullscreen-control,
    a[href*="maps.google.com"], .gm-style > div > a,
    .gm-style-mtc, img[alt="Google"] { display: none !important; }
  `
  document.head.appendChild(s)
}

function isSamePoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001
}

function isValidPoint(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng, driverMotoColor,
  showDriver = false,
  nearbyDrivers = [],
  showNearby = false,
  onRouteCoords,
  mode = 'client',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const routeOutlineRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)
  const fromMarkerRef = useRef<any>(null)
  const toMarkerRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const etaMarkerRef = useRef<any>(null)
  const arrivalMarkerRef = useRef<any>(null)

  const clearMarker = (ref: React.MutableRefObject<any>) => {
    if (!ref.current) return
    try { ref.current.map = null } catch { try { ref.current.setMap(null) } catch {} }
    ref.current = null
  }

  const clearRoute = useCallback(() => {
    if (routeOutlineRef.current) { routeOutlineRef.current.setMap(null); routeOutlineRef.current = null }
    if (routeLineRef.current) { routeLineRef.current.setMap(null); routeLineRef.current = null }
    clearMarker(etaMarkerRef)
    clearMarker(arrivalMarkerRef)
  }, [])

  const createMotoElement = useCallback((color?: string, eta?: number, isAssigned = false) => {
    const motoColor = getMotoColor(color)
    const ringColor = isAssigned ? DARK_GREEN : 'white'
    const div = document.createElement('div')
    div.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;'
    div.innerHTML = `
      <div style="width:38px;height:38px;border-radius:50%;background:white;border:3px solid ${ringColor};box-shadow:0 3px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <ellipse cx="13" cy="6" rx="3.2" ry="3.6" fill="${motoColor}"/>
          <rect x="11" y="9" width="4" height="9" rx="2" fill="${motoColor}"/>
          <path d="M13 17 L8 23 M13 17 L18 23" stroke="${motoColor}" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="7" cy="24" r="2" fill="#1a1a1a"/>
          <circle cx="19" cy="24" r="2" fill="#1a1a1a"/>
          <path d="M9 11 L4 9 M17 11 L22 9" stroke="${motoColor}" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      ${eta !== undefined ? `<div style="background:${GREEN};color:white;font-size:10px;font-weight:900;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,0.18);">${eta} min</div>` : ''}
    `
    return div
  }, [])

  const drawRoute = useCallback(async (
    map: any,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ) => {
    clearRoute()
    if (isSamePoint(from, to)) return

    try {
      const url = `/api/route-osrm?fromLng=${from.lng}&fromLat=${from.lat}&toLng=${to.lng}&toLat=${to.lat}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('OSRM failed')
      const data = await res.json()
      if (!data.routes?.[0]?.geometry?.coordinates) throw new Error('No route')

      const route = data.routes[0]
      const durationSec = Number(route.duration || 0)
      const coords = route.geometry.coordinates as [number, number][]
      const points = coords.map(([lng, lat]) => ({ lat, lng })).filter(p => isValidPoint(p.lat, p.lng))
      if (points.length < 2) throw new Error('Invalid points')

      if (onRouteCoords) onRouteCoords(points.map(p => [p.lat, p.lng]))

      routeOutlineRef.current = new window.google.maps.Polyline({
        path: points, geodesic: false, strokeColor: '#FFFFFF',
        strokeOpacity: 1, strokeWeight: 9, map, zIndex: 20,
      })
      routeLineRef.current = new window.google.maps.Polyline({
        path: points, geodesic: false, strokeColor: GREEN,
        strokeOpacity: 1, strokeWeight: 5, map, zIndex: 30,
      })

      const etaMin = Math.max(1, Math.round(durationSec / 60))
      const arrivalDate = new Date(Date.now() + durationSec * 1000)
      const arrivalText = arrivalDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

      const midIdx = Math.floor(points.length * 0.45)
      const etaEl = document.createElement('div')
      etaEl.style.cssText = 'transform:translate(-50%,-130%);'
      etaEl.innerHTML = `
        <div style="background:${DARK_GREEN};color:white;font-size:13px;font-weight:900;padding:6px 12px;border-radius:20px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,0.30);border:2px solid white;line-height:1.1;text-align:center;">${etaMin} min</div>
      `
      etaMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: points[midIdx], map, content: etaEl, zIndex: 1000,
      })

      const arrIdx = Math.floor(points.length * 0.82)
      const arrEl = document.createElement('div')
      arrEl.style.cssText = 'transform:translate(-50%,-145%);'
      arrEl.innerHTML = `
        <div style="background:white;color:#111;font-size:11px;font-weight:800;padding:5px 10px;border-radius:16px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,0.18);border:1px solid rgba(0,0,0,0.07);">Arrivée à ${arrivalText}</div>
      `
      arrivalMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: points[arrIdx], map, content: arrEl, zIndex: 1001,
      })

      const bounds = new window.google.maps.LatLngBounds()
      points.forEach(p => bounds.extend(p))
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 260, left: 60 })

    } catch {
      routeOutlineRef.current = new window.google.maps.Polyline({
        path: [from, to], strokeColor: '#FFFFFF', strokeOpacity: 1, strokeWeight: 9, map, zIndex: 20,
      })
      routeLineRef.current = new window.google.maps.Polyline({
        path: [from, to], strokeColor: GREEN, strokeOpacity: 0.9, strokeWeight: 5, map, zIndex: 30,
      })
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(from); bounds.extend(to)
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 260, left: 60 })
    }
  }, [clearRoute, onRouteCoords])

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey || !containerRef.current || !isValidPoint(fromLat, fromLng)) return
    let cancelled = false

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || !window.google?.maps) return
      hideGoogleControls()

      const from = { lat: fromLat, lng: fromLng }
      const to = { lat: toLat, lng: toLng }
      const samePoint = isSamePoint(from, to)

      const map = new window.google.maps.Map(containerRef.current, {
        center: from, zoom: 14, mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true, gestureHandling: 'cooperative',
        clickableIcons: false, backgroundColor: '#f8f8f6',
        styles: MAP_STYLE,
      })
      mapRef.current = map

      window.google.maps.event.addListenerOnce(map, 'idle', hideGoogleControls)
      setTimeout(hideGoogleControls, 1000)
      setTimeout(hideGoogleControls, 2500)

      const fromEl = document.createElement('div')
      fromEl.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:${GREEN};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`
      fromMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: from, map, content: fromEl.firstElementChild as HTMLElement, zIndex: 100,
      })

      if (!samePoint && isValidPoint(to.lat, to.lng)) {
        const toEl = document.createElement('div')
        toEl.style.cssText = 'transform:translateY(-50%);'
        toEl.innerHTML = `
          <div style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.25));">
            <svg width="26" height="34" viewBox="0 0 26 34" fill="none">
              <path d="M13 0C5.82 0 0 5.82 0 13C0 22.75 13 34 13 34C13 34 26 22.75 26 13C26 5.82 20.18 0 13 0Z" fill="${RED}"/>
              <circle cx="13" cy="13" r="5" fill="white"/>
            </svg>
          </div>
        `
        toMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: to, map, content: toEl, zIndex: 100,
        })
      }

      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          if (!isValidPoint(d.lat, d.lng)) return
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: d.lat, lng: d.lng }, map,
            content: createMotoElement(d.motoColor, d.eta, false), zIndex: 200,
          })
          nearbyMarkersRef.current.push(marker)
        })
      }

      if (showDriver && driverLat && driverLng && isValidPoint(driverLat, driverLng)) {
        driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat: driverLat, lng: driverLng }, map,
          content: createMotoElement(driverMotoColor, undefined, true), zIndex: 300,
        })
      }

      if (!samePoint && isValidPoint(to.lat, to.lng)) {
        drawRoute(map, from, to)
      } else if (showNearby && nearbyDrivers.length > 0) {
        const bounds = new window.google.maps.LatLngBounds()
        bounds.extend(from)
        nearbyDrivers.forEach(d => { if (isValidPoint(d.lat, d.lng)) bounds.extend({ lat: d.lat, lng: d.lng }) })
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
      } else {
        map.setCenter(from); map.setZoom(15)
      }
    })

    return () => {
      cancelled = true
      clearRoute()
      clearMarker(fromMarkerRef)
      clearMarker(toMarkerRef)
      clearMarker(driverMarkerRef)
      nearbyMarkersRef.current.forEach(m => { try { m.map = null } catch {} })
      nearbyMarkersRef.current = []
      mapRef.current = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby, nearbyDrivers, showDriver, driverLat, driverLng, driverMotoColor, createMotoElement, drawRoute, clearRoute])

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !showDriver || !driverLat || !driverLng) return
    if (!isValidPoint(driverLat, driverLng)) return
    if (driverMarkerRef.current) {
      driverMarkerRef.current.position = { lat: driverLat, lng: driverLng }
    } else {
      driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: driverLat, lng: driverLng }, map: mapRef.current,
        content: createMotoElement(driverMotoColor, undefined, true), zIndex: 300,
      })
    }
    if (mode === 'driver') {
      mapRef.current.setCenter({ lat: driverLat, lng: driverLng })
      mapRef.current.setZoom(17)
    }
  }, [driverLat, driverLng, showDriver, createMotoElement, mode, driverMotoColor])

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !showNearby) return
    nearbyMarkersRef.current.forEach(m => { try { m.map = null } catch {} })
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      if (!isValidPoint(d.lat, d.lng)) return
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: d.lat, lng: d.lng }, map: mapRef.current,
        content: createMotoElement(d.motoColor, d.eta, false), zIndex: 200,
      })
      nearbyMarkersRef.current.push(marker)
    })
  }, [nearbyDrivers, showNearby, createMotoElement])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden', background: '#f3f4f6' }}
    />
  )
}