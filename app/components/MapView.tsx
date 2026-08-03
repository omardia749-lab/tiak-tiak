'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

type NearbyDriver = {
  id?: string | number
  lat: number
  lng: number
  moto_color?: string
  motoColor?: string
  color?: string
}

type MapViewProps = {
  fromLat?: number | null
  fromLng?: number | null
  toLat?: number | null
  toLng?: number | null
  driverLat?: number | null
  driverLng?: number | null
  driverMotoColor?: string | null
  nearbyDrivers?: NearbyDriver[]
  showNearby?: boolean
  showDriver?: boolean
  mode?: 'client' | 'driver' | string
  onRouteCoords?: (coords: [number, number][]) => void
  onDuration?: (seconds: number) => void
  bottomOffset?: number
  className?: string
  dangerZones?: { lat: number; lng: number; zone_type: string; description?: string; votes: number }[]
  sosAlerts?: { id: string; lat: number; lng: number; triggered_by_name: string }[]
}

function isValidCoordinate(lat?: number | null, lng?: number | null) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  )
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} min`
}

function formatArrival(seconds: number) {
  const date = new Date(Date.now() + seconds * 1000)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const START_SIZE: [number, number] = [20, 20]
const START_ANCHOR: [number, number] = [10, 10]
function startMarkerHtml() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" fill="#fff" stroke="#083b21" stroke-width="3"/>
  </svg>`
}

const DEST_SIZE: [number, number] = [20, 20]
const DEST_ANCHOR: [number, number] = [10, 10]
function destinationMarkerHtml() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" fill="#fff" stroke="#1DB954" stroke-width="3"/>
    <circle cx="10" cy="10" r="3.5" fill="#1DB954"/>
  </svg>`
}

const DUR_SIZE: [number, number] = [100, 40]
const DUR_ANCHOR: [number, number] = [50, 40]
function durationBadgeHtml(text: string) {
  return `<div style="display:inline-flex;flex-direction:column;align-items:center;width:100px;">
    <div style="background:#1DB954;color:#fff;padding:7px 16px;border-radius:999px;font-size:13px;font-weight:800;line-height:1;white-space:nowrap;box-shadow:0 2px 8px rgba(15,81,56,0.35);">${text}</div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #1DB954;margin-top:-1px;"></div>
  </div>`
}

const ARR_SIZE: [number, number] = [150, 40]
const ARR_ANCHOR: [number, number] = [75, 40]
function arrivalBadgeHtml(text: string) {
  return `<div style="width:150px;display:flex;justify-content:center;">
    <div style="background:#fff;color:#111;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;line-height:1;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.18);">${text}</div>
  </div>`
}

function motoMarkerHtml(color: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
    <circle cx="29" cy="29" r="25" fill="#fff" stroke="${color}" stroke-width="4"/>
    <circle cx="22.4" cy="34.5" r="5.4" fill="${color}"/>
    <circle cx="37.6" cy="34.5" r="5.4" fill="${color}"/>
    <path d="M22.4 34.5H28.5L34 24.8H39.2" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M28.5 34.5H37.6L32.4 27.2H25.8" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="28.8" cy="23.7" r="4.3" fill="#083b21"/>
    <path d="M25.5 27.5L22.6 31.6" stroke="#083b21" stroke-width="3" stroke-linecap="round"/>
  </svg>`
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng, driverMotoColor,
  nearbyDrivers = [], showNearby = false, showDriver = false,
  mode = 'client', onRouteCoords, onDuration, bottomOffset = 0, className = '', dangerZones = [], sosAlerts = [],
}: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const routeLayersRef = useRef<any[]>([])
  const nearbyLayersRef = useRef<any[]>([])
  const driverLayerRef = useRef<any>(null)
  const requestIdRef = useRef(0)
  const onRouteCoordsRef = useRef(onRouteCoords)
  const onDurationRef = useRef(onDuration)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { onRouteCoordsRef.current = onRouteCoords })
  useEffect(() => { onDurationRef.current = onDuration })

  // 1. INIT
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const leafletModule = await import('leaflet')
        const L = leafletModule.default || leafletModule
        if (cancelled || !mapElementRef.current || mapRef.current) return
        LRef.current = L
        const map = L.map(mapElementRef.current, {
          center: [14.7167, -17.4677],
          zoom: 14,
          zoomControl: false,
          attributionControl: false,
        })
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          { maxZoom: 19, subdomains: 'abcd' }
        ).addTo(map)
        mapRef.current = map
        setTimeout(() => {
          try { map.invalidateSize() } catch {}
          setMapReady(true)
        }, 250)
      } catch {
        setError('Carte momentanément indisponible')
      }
    }
    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        try { mapRef.current.remove() } catch {}
        mapRef.current = null
      }
    }
  }, [])

  // 2. TRACÉ + MARQUEURS + BADGES
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return
    const L = LRef.current
    const map = mapRef.current

    routeLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    routeLayersRef.current = []

    const from = isValidCoordinate(fromLat, fromLng)
      ? { lat: fromLat as number, lng: fromLng as number } : undefined
    const to = isValidCoordinate(toLat, toLng)
      ? { lat: toLat as number, lng: toLng as number } : undefined

    if (from) {
      const m = L.marker([from.lat, from.lng], {
        icon: L.divIcon({ html: startMarkerHtml(), className: '', iconSize: START_SIZE, iconAnchor: START_ANCHOR }),
        interactive: false, zIndexOffset: 700,
      }).addTo(map)
      routeLayersRef.current.push(m)
    }

    if (to) {
      const m = L.marker([to.lat, to.lng], {
        icon: L.divIcon({ html: destinationMarkerHtml(), className: '', iconSize: DEST_SIZE, iconAnchor: DEST_ANCHOR }),
        interactive: false, zIndexOffset: 720,
      }).addTo(map)
      routeLayersRef.current.push(m)
    }

    const fitSafe = (coords: [number, number][]) => {
      const size = map.getSize()
      const wantedBottom = 60 + bottomOffset
      const safeBottom = (size.y - wantedBottom - 100) > 100 ? wantedBottom : 60
      map.fitBounds(L.latLngBounds(coords), {
        paddingTopLeft: [50, 80],
        paddingBottomRight: [50, safeBottom],
        maxZoom: 16,
      })
    }

    const centerSafe = (point: [number, number], zoom: number) => {
      map.setView(point, zoom, { animate: false })
      if (bottomOffset > 0) {
        const size = map.getSize()
        if (size.y - bottomOffset > 150) map.panBy([0, bottomOffset / 2], { animate: false })
      }
    }

    const samePoint = from && to &&
      Math.abs(from.lat - to.lat) < 0.0001 && Math.abs(from.lng - to.lng) < 0.0001

    if (from && to && !samePoint) {
      const requestId = ++requestIdRef.current

      const drawLine = (coords: [number, number][], durationSeconds: number) => {
        if (requestId !== requestIdRef.current || !mapRef.current) return

        const outline = L.polyline(coords, { color: '#ffffff', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map)
        const line = L.polyline(coords, { color: '#1DB954', weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map)
        routeLayersRef.current.push(outline, line)

        if (durationSeconds > 0) {
          // Badge durée sur le DÉPART
          const durBadge = L.marker([from.lat, from.lng], {
            icon: L.divIcon({ html: durationBadgeHtml(formatDuration(durationSeconds)), className: '', iconSize: DUR_SIZE, iconAnchor: DUR_ANCHOR }),
            interactive: false, zIndexOffset: 740,
          }).addTo(map)
          routeLayersRef.current.push(durBadge)

          // Badge arrivée sur la DESTINATION
          const arrBadge = L.marker([to.lat, to.lng], {
            icon: L.divIcon({ html: arrivalBadgeHtml(`Arrivée à ${formatArrival(durationSeconds)}`), className: '', iconSize: ARR_SIZE, iconAnchor: ARR_ANCHOR }),
            interactive: false, zIndexOffset: 760,
          }).addTo(map)
          routeLayersRef.current.push(arrBadge)

          // Transmettre la durée OSRM au parent
          onDurationRef.current?.(durationSeconds)
        }

        fitSafe(coords)
        onRouteCoordsRef.current?.(coords)
      }

      fetch(`/api/route-osrm?fromLng=${from.lng}&fromLat=${from.lat}&toLng=${to.lng}&toLat=${to.lat}`, { cache: 'no-store' })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          const route = data?.routes?.[0]
          if (!route?.geometry?.coordinates?.length) throw new Error()
          const coords: [number, number][] = route.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          )
          drawLine(coords, typeof route.duration === 'number' ? route.duration : 0)
        })
        .catch(() => {
          drawLine([[from.lat, from.lng], [to.lat, to.lng]], 0)
        })
    } else if (from) {
      centerSafe([from.lat, from.lng], 15)
    } else if (to) {
      centerSafe([to.lat, to.lng], 15)
    }
  }, [mapReady, fromLat, fromLng, toLat, toLng, bottomOffset])

  // ZONES À RISQUE
useEffect(() => {
  if (!mapReady || !mapRef.current || !LRef.current) return
  const L = LRef.current
  const map = mapRef.current

  // Supprimer anciennes zones
  if ((map as any)._dangerLayers) {
    (map as any)._dangerLayers.forEach((l: any) => { try { map.removeLayer(l) } catch {} })
  }
  ;(map as any)._dangerLayers = []

  if (!dangerZones || dangerZones.length === 0) return

  dangerZones.forEach(zone => {
    const icon = zone.zone_type === 'agression' ? '🔴' : zone.zone_type === 'vol' ? '🟠' : zone.zone_type === 'accident' ? '🟡' : '⚠️'
    const m = L.marker([zone.lat, zone.lng], {
      icon: L.divIcon({
        html: `<div style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${icon}</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      interactive: true,
      zIndexOffset: 500,
    }).addTo(map)
    m.bindPopup(`<b>⚠️ Zone dangereuse</b><br>${zone.description || zone.zone_type}<br><small>${zone.votes} signalement(s)</small>`)
    ;(map as any)._dangerLayers.push(m)
  })
}, [mapReady, dangerZones])

// ALERTES SOS PROCHES — épingle rouge sur carte chauffeur
useEffect(() => {
  if (!mapReady || !mapRef.current || !LRef.current) return
  const L = LRef.current
  const map = mapRef.current

  if ((map as any)._sosLayers) {
    (map as any)._sosLayers.forEach((l: any) => { try { map.removeLayer(l) } catch {} })
  }
  ;(map as any)._sosLayers = []

  sosAlerts.forEach(alert => {
    const m = L.marker([alert.lat, alert.lng], {
      icon: L.divIcon({
        html: `<div style="background:#DC2626;color:white;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800;box-shadow:0 2px 8px rgba(220,38,38,0.5);white-space:nowrap;">🚨 Collègue en danger</div>`,
        className: '',
        iconSize: [160, 32],
        iconAnchor: [80, 16],
      }),
      interactive: true,
      zIndexOffset: 900,
    }).addTo(map)
    m.bindPopup(`<b>🚨 Collègue en danger !</b><br>${alert.triggered_by_name || 'Chauffeur TIAK TIAK'}`)
    ;(map as any)._sosLayers.push(m)
  })
}, [mapReady, sosAlerts]) 

  // 3. MOTOS PROCHES
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return
    const L = LRef.current
    const map = mapRef.current

    nearbyLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    nearbyLayersRef.current = []
    if (!showNearby) return

    nearbyDrivers.forEach(driver => {
      if (!isValidCoordinate(driver.lat, driver.lng)) return
      const color = driver.moto_color || driver.motoColor || driver.color || '#13b15a'
      const sz = 38
      const m = L.marker([driver.lat, driver.lng], {
        icon: L.divIcon({ html: motoMarkerHtml(color, sz), className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        interactive: false, zIndexOffset: 650,
      }).addTo(map)
      nearbyLayersRef.current.push(m)
    })
  }, [mapReady, nearbyDrivers, showNearby])

  // 4. CHAUFFEUR ASSIGNÉ
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return
    const L = LRef.current
    const map = mapRef.current

    if (!showDriver || !isValidCoordinate(driverLat, driverLng)) {
      if (driverLayerRef.current) {
        try { map.removeLayer(driverLayerRef.current) } catch {}
        driverLayerRef.current = null
      }
      return
    }

    const pos: [number, number] = [driverLat as number, driverLng as number]
    const sz = 46

    if (driverLayerRef.current) {
      const currentPos = driverLayerRef.current.getLatLng()
      const startLat = currentPos.lat
      const startLng = currentPos.lng
      const endLat = pos[0]
      const endLng = pos[1]
      const duration = 500
      const startTime = performance.now()
      const animate = (now: number) => {
        const elapsed = now - startTime
        const t = Math.min(elapsed / duration, 1)
        const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        const lat = startLat + (endLat - startLat) * easedT
        const lng = startLng + (endLng - startLng) * easedT
        if (driverLayerRef.current) driverLayerRef.current.setLatLng([lat, lng])
        if (t < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    } else {
      driverLayerRef.current = L.marker(pos, {
        icon: L.divIcon({ html: motoMarkerHtml(driverMotoColor || '#13b15a', sz), className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        interactive: false, zIndexOffset: 800,
      }).addTo(map)
    }

    if (mode === 'driver') map.panTo(pos, { animate: true, duration: 0.5 })
  }, [mapReady, driverLat, driverLng, driverMotoColor, showDriver, mode])

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#f7faf7] ${className}`}>
      <div ref={mapElementRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#f7faf7] px-6 text-center">
          <div className="rounded-3xl bg-white px-5 py-4 shadow-lg">
            <p className="text-sm font-bold text-[#083b21]">{error}</p>
            <p className="mt-1 text-xs text-gray-500">Vérifie ta connexion puis réessaie.</p>
          </div>
        </div>
      )}
    </div>
  )
}