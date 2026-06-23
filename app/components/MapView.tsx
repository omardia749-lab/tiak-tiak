'use client'

import { useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'

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

const calculateHeading = (lat1: number, lng1: number, lat2: number, lng2: number): number | null => {
  const dist = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2))
  if (dist < 0.000005) return null
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
  const bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
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
  const LRef = useRef<any>(null)
  const routeLayersRef = useRef<any[]>([])

  const createMotoIcon = useCallback((L: any, eta?: number, isAssigned = false, color?: string, heading = 0) => {
    const motoColor = getMotoColor(color)
    const ringColor = isAssigned ? '#0F5138' : 'white'
    return L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <div style="width:38px;height:38px;border-radius:50%;background:white;border:3px solid ${ringColor};box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;position:relative;">
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
      </div>`,
      iconSize: [38, eta !== undefined ? 56 : 38],
      iconAnchor: [19, eta !== undefined ? 56 : 38],
    })
  }, [])

  const arrivalMarkerRef = useRef<any>(null)

  const drawRoute = useCallback(async (L: any, map: any, from: [number, number], to: [number, number]) => {
    routeLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    routeLayersRef.current = []
    if (arrivalMarkerRef.current) { try { map.removeLayer(arrivalMarkerRef.current) } catch {}; arrivalMarkerRef.current = null }

    const samePoint = Math.abs(from[0] - to[0]) < 0.0001 && Math.abs(from[1] - to[1]) < 0.0001
    if (samePoint) return

    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
      )
      const data = await res.json()
      if (!mapRef.current || !data.routes?.[0]) throw new Error('no route')

      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      )

      if (onRouteCoords) onRouteCoords(coords)

      const durationSec = data.routes[0].duration || 0
      const arrivalDate = new Date(Date.now() + durationSec * 1000)
      const arrivalStr = arrivalDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const arrivalIcon = L.divIcon({
        className: '',
        html: `<div style="background:white;color:#111;font-size:12px;font-weight:700;padding:6px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:1px solid #eee;">arrivée à ${arrivalStr}</div>`,
        iconSize: [120, 30], iconAnchor: [60, 45],
      })
      arrivalMarkerRef.current = L.marker(to, { icon: arrivalIcon, zIndexOffset: 1000 }).addTo(map)

      const etaMin = Math.max(1, Math.round(durationSec / 60))
      const midIdx = Math.floor(coords.length / 2)
      const midPoint = coords[midIdx] || coords[0]
      const etaIcon = L.divIcon({
        className: '',
        html: `<div style="background:#1DB954;color:white;font-size:13px;font-weight:800;padding:5px 11px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${etaMin} min</div>`,
        iconSize: [60, 28], iconAnchor: [30, 14],
      })
      const etaMarker = L.marker(midPoint, { icon: etaIcon, zIndexOffset: 999 }).addTo(map)
      routeLayersRef.current.push(etaMarker)

      const mainLine = L.polyline(coords, {
        color: '#1DB954',
        weight: 3,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '6, 4',
      }).addTo(map)

      routeLayersRef.current = [mainLine]

      const bounds: [number, number][] = [...coords]
      if (showDriver && driverLat && driverLng) bounds.push([driverLat, driverLng])
      if (showNearby) nearbyDrivers.forEach(d => bounds.push([d.lat, d.lng]))

      map.fitBounds(L.latLngBounds(bounds), {
        padding: [80, 80], maxZoom: 14, minZoom: 12, animate: true, duration: 0.6
      })
    } catch {
      const fallback = L.polyline([from, to], {
        color: '#1DB954', weight: 5, opacity: 1, lineCap: 'round'
      }).addTo(map)
      routeLayersRef.current = [fallback]
      map.fitBounds(L.latLngBounds([from, to]), { padding: [50, 50], maxZoom: 15 })
    }
  }, [showDriver, driverLat, driverLng, showNearby, nearbyDrivers, onRouteCoords])

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    const c = containerRef.current as any
    if (c._leaflet_id) c._leaflet_id = null

    import('leaflet').then((mod) => {
      const L = mod
      LRef.current = L
      if (!containerRef.current) return
      const container = containerRef.current as any
      if (container._leaflet_id) container._leaflet_id = null

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      })
      mapRef.current = map

      L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`, {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
      }).addTo(map)

      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#1DB954;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })

      const toIcon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:30px;">
          <svg width="22" height="30" viewBox="0 0 22 30" fill="none">
            <path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.925 17.075 0 11 0z" fill="#E53935"/>
            <circle cx="11" cy="11" r="4.5" fill="white"/>
          </svg>
        </div>`,
        iconSize: [22, 30], iconAnchor: [11, 30],
      })

      const samePoint = Math.abs(fromLat - toLat) < 0.0001 && Math.abs(fromLng - toLng) < 0.0001

      L.marker([fromLat, fromLng], { icon: fromIcon }).addTo(map)
      if (!samePoint) L.marker([toLat, toLng], { icon: toIcon }).addTo(map)

      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          const m = L.marker([d.lat, d.lng], { icon: createMotoIcon(L, d.eta, false, d.motoColor) }).addTo(map)
          nearbyMarkersRef.current.push(m)
        })
      }

      if (showDriver && driverLat && driverLng) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], {
          icon: createMotoIcon(L, undefined, true, driverMotoColor)
        }).addTo(map)
      }

      if (!samePoint) {
        drawRoute(L, map, [fromLat, fromLng], [toLat, toLng])
      } else {
        if (showNearby && nearbyDrivers.length > 0) {
          const pts: [number, number][] = [[fromLat, fromLng], ...nearbyDrivers.map(d => [d.lat, d.lng] as [number, number])]
          map.fitBounds(L.latLngBounds(pts), { padding: [60, 90], maxZoom: 15 })
        } else {
          map.setView([fromLat, fromLng], 15)
        }
      }
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      if (containerRef.current) (containerRef.current as any)._leaflet_id = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby])

  const lastRouteUpdateRef = useRef<number>(0)

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showDriver || !driverLat || !driverLng) return
    const L = LRef.current
    if (driverMarkerRef.current) {
      const prevPos = driverMarkerRef.current.getLatLng()
      const heading = calculateHeading(prevPos.lat, prevPos.lng, driverLat, driverLng)
      driverMarkerRef.current.setLatLng([driverLat, driverLng])
      if (heading !== null) {
        driverMarkerRef.current.setIcon(createMotoIcon(L, undefined, true, driverMotoColor, heading))
      }
    } else {
      driverMarkerRef.current = L.marker([driverLat, driverLng], {
        icon: createMotoIcon(L, undefined, true, driverMotoColor)
      }).addTo(mapRef.current)
    }

    if (mode === 'driver') {
      mapRef.current.setView([driverLat, driverLng], 17, { animate: true })

      const now = Date.now()
      if (now - lastRouteUpdateRef.current > 15000) {
        lastRouteUpdateRef.current = now
        drawRoute(L, mapRef.current, [driverLat, driverLng], [toLat, toLng])
      }
    }
  }, [driverLat, driverLng, showDriver, createMotoIcon, mode, toLat, toLng, drawRoute, driverMotoColor])

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showNearby) return
    const L = LRef.current
    nearbyMarkersRef.current.forEach(m => { try { m.remove() } catch {} })
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      const m = L.marker([d.lat, d.lng], { icon: createMotoIcon(L, d.eta, false, d.motoColor) }).addTo(mapRef.current)
      nearbyMarkersRef.current.push(m)
    })
  }, [nearbyDrivers, showNearby, createMotoIcon])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
    />
  )
}