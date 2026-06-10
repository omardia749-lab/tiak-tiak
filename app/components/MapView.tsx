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
  mode = 'client',
  nearbyDrivers = [],
  showNearby = false,
  onRouteCoords,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const animFrameRef = useRef<number | null>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const LRef = useRef<any>(null)
  const routeLayersRef = useRef<any[]>([])

  const createMotoIcon = useCallback((L: any, eta?: number, isAssigned = false) => L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="width:36px;height:36px;border-radius:50%;background:${isAssigned ? '#0F5138' : '#1DB954'};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>
      ${eta !== undefined ? `<div style="background:#0F5138;color:white;font-size:9px;font-weight:900;padding:1px 5px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${eta} min</div>` : ''}
    </div>`,
    iconSize: [36, eta !== undefined ? 50 : 36],
    iconAnchor: [18, eta !== undefined ? 50 : 36],
  }), [])

  const drawRoute = useCallback(async (L: any, map: any, from: [number, number], to: [number, number]) => {
    // Supprimer anciens layers
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

      // Contour blanc épais
      const outline = L.polyline(coords, {
        color: 'white', weight: 7, opacity: 1,
        lineCap: 'round', lineJoin: 'round'
      }).addTo(map)

      // Ligne verte fine style Yango
      const mainLine = L.polyline(coords, {
        color: '#1DB954', weight: 3.5, opacity: 1,
        lineCap: 'round', lineJoin: 'round'
      }).addTo(map)

      // Pointillés animés
      const dashLine = L.polyline(coords, {
        color: 'rgba(255,255,255,0.8)', weight: 1.5,
        lineCap: 'round', dashArray: '4, 16', dashOffset: '0'
      }).addTo(map)

      routeLayersRef.current = [outline, mainLine, dashLine]

      // Animation pointillés
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      let offset = 0
      const animate = () => {
        if (!mapRef.current) return
        offset -= 0.6
        const el = (dashLine as any)._path
        if (el) el.style.strokeDashoffset = String(offset)
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animFrameRef.current = requestAnimationFrame(animate)

      // Zoom adapté
      const bounds: [number, number][] = [...coords]
      if (showDriver && driverLat && driverLng) bounds.push([driverLat, driverLng])
      if (showNearby) nearbyDrivers.forEach(d => bounds.push([d.lat, d.lng]))

      map.fitBounds(L.latLngBounds(bounds), {
        padding: [55, 55], maxZoom: 16, animate: true, duration: 0.5
      })
    } catch {
      // Fallback ligne droite
      const fallback = L.polyline([from, to], {
        color: '#1DB954', weight: 3.5, dashArray: '6, 10'
      }).addTo(map)
      routeLayersRef.current = [fallback]
      map.fitBounds(L.latLngBounds([from, to]), { padding: [55, 55], maxZoom: 15 })
    }
  }, [showDriver, driverLat, driverLng, showNearby, nearbyDrivers, onRouteCoords])

  useEffect(() => {
    if (!containerRef.current) return
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
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

      // Tuiles OpenStreetMap — propres, gratuites, nettes
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        tileSize: 256,
      }).addTo(map)

      // Marqueur départ — point vert pulsant style Yango
      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:18px;height:18px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#1DB954;opacity:0.25;animation:tiakPulse 1.8s ease-out infinite;"></div>
          <div style="position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#1DB954;border:2.5px solid white;box-shadow:0 1px 6px rgba(29,185,84,0.7);"></div>
          <style>@keyframes tiakPulse{0%{transform:scale(1);opacity:0.3}70%{transform:scale(3);opacity:0}100%{opacity:0}}</style>
        </div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })

      // Marqueur destination — pin rouge style Yango
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

      // Chauffeurs proches
      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          const m = L.marker([d.lat, d.lng], { icon: createMotoIcon(L, d.eta, false) }).addTo(map)
          nearbyMarkersRef.current.push(m)
        })
      }

      // Chauffeur assigné
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
          map.fitBounds(L.latLngBounds(pts), { padding: [55, 55], maxZoom: 15 })
        } else {
          map.setView([fromLat, fromLng], 15)
        }
      }
    })

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      if (containerRef.current) (containerRef.current as any)._leaflet_id = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby])

  // Mise à jour position chauffeur en temps réel
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

  // Mise à jour chauffeurs proches
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
      style={{ width: '100%', height: '100%' }}
    />
  )
}