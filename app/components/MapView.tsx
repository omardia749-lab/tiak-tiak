'use client'

import { useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'

interface NearbyDriver {
  id: string
  lat: number
  lng: number
  name: string
  eta: number
}

interface MapViewProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  driverLat?: number
  driverLng?: number
  showDriver?: boolean
  mode?: 'client' | 'driver'
  nearbyDrivers?: NearbyDriver[]
  showNearby?: boolean
  onRouteCoords?: (coords: [number, number][]) => void
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng,
  showDriver = false,
  nearbyDrivers = [],
  showNearby = false,
  onRouteCoords,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const LRef = useRef<any>(null)
  const routeLayersRef = useRef<any[]>([])

  const createMotoIcon = useCallback((L: any, eta?: number, isAssigned = false) => L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="width:34px;height:34px;border-radius:50%;background:${isAssigned ? '#0F5138' : '#FFFFFF'};border:2px solid ${isAssigned ? 'white' : '#1DB954'};box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:17px;">🛵</div>
      ${eta !== undefined ? `<div style="background:#1DB954;color:white;font-size:10px;font-weight:800;padding:2px 6px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${eta} min</div>` : ''}
    </div>`,
    iconSize: [34, eta !== undefined ? 50 : 34],
    iconAnchor: [17, eta !== undefined ? 50 : 34],
  }), [])

  const drawRoute = useCallback(async (L: any, map: any, from: [number, number], to: [number, number]) => {
    routeLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    routeLayersRef.current = []

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

      // Trait vert épais simple, style Yango — sans animation
      const mainLine = L.polyline(coords, {
        color: '#1DB954',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)

      routeLayersRef.current = [mainLine]

      const bounds: [number, number][] = [...coords]
      if (showDriver && driverLat && driverLng) bounds.push([driverLat, driverLng])
      if (showNearby) nearbyDrivers.forEach(d => bounds.push([d.lat, d.lng]))

      map.fitBounds(L.latLngBounds(bounds), {
        padding: [50, 50], maxZoom: 16, animate: true, duration: 0.5
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

      // Tuiles claires/beiges style Yango — CartoDB Voyager (gratuit, sans cle)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
      }).addTo(map)

      // Marqueur depart — rond vert simple
      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#1DB954;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })

      // Marqueur destination — pin rouge simple
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
          const m = L.marker([d.lat, d.lng], { icon: createMotoIcon(L, d.eta, false) }).addTo(map)
          nearbyMarkersRef.current.push(m)
        })
      }

      if (showDriver && driverLat && driverLng) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], {
          icon: createMotoIcon(L, undefined, true)
        }).addTo(map)
      }

      if (!samePoint) {
        drawRoute(L, map, [fromLat, fromLng], [toLat, toLng])
      } else {
        if (showNearby && nearbyDrivers.length > 0) {
          const pts: [number, number][] = [[fromLat, fromLng], ...nearbyDrivers.map(d => [d.lat, d.lng] as [number, number])]
          map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 })
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

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showDriver || !driverLat || !driverLng) return
    const L = LRef.current
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng])
    } else {
      driverMarkerRef.current = L.marker([driverLat, driverLng], {
        icon: createMotoIcon(L, undefined, true)
      }).addTo(mapRef.current)
    }
  }, [driverLat, driverLng, showDriver, createMotoIcon])

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showNearby) return
    const L = LRef.current
    nearbyMarkersRef.current.forEach(m => { try { m.remove() } catch {} })
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      const m = L.marker([d.lat, d.lng], { icon: createMotoIcon(L, d.eta, false) }).addTo(mapRef.current)
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