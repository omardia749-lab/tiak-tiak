'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

type LatLng = { lat: number; lng: number }

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
  bottomOffset?: number
  className?: string
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

function startMarkerHtml() {
  return `
    <div style="transform:translate(-50%,-50%);">
      <svg width="28" height="28" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
        <circle cx="17" cy="17" r="14" fill="#ffffff" stroke="#13b15a" stroke-width="4"/>
        <circle cx="17" cy="17" r="6" fill="#13b15a"/>
      </svg>
    </div>
  `
}

function destinationMarkerHtml() {
  return `
    <div style="transform:translate(-50%,-100%);">
      <svg width="34" height="42" viewBox="0 0 38 46" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 45C19 45 36 26.8 36 17.3C36 8 28.4 1 19 1C9.6 1 2 8 2 17.3C2 26.8 19 45 19 45Z" fill="#0b7a3b" stroke="#ffffff" stroke-width="3.5"/>
        <circle cx="19" cy="17.5" r="6.5" fill="#ffffff"/>
      </svg>
    </div>
  `
}

function motoMarkerHtml(color: string, size: number) {
  return `
    <div style="transform:translate(-50%,-50%);">
      <svg width="${size}" height="${size}" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
        <circle cx="29" cy="29" r="25" fill="#ffffff" stroke="${color}" stroke-width="4"/>
        <circle cx="22.4" cy="34.5" r="5.4" fill="${color}"/>
        <circle cx="37.6" cy="34.5" r="5.4" fill="${color}"/>
        <path d="M22.4 34.5H28.5L34 24.8H39.2" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M28.5 34.5H37.6L32.4 27.2H25.8" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="28.8" cy="23.7" r="4.3" fill="#083b21"/>
        <path d="M25.5 27.5L22.6 31.6" stroke="#083b21" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </div>
  `
}

function durationBadgeHtml(text: string) {
  return `
    <div style="transform:translate(-50%,-50%);white-space:nowrap;">
      <div style="background:#083b21;color:#fff;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;line-height:1;box-shadow:0 4px 12px rgba(8,59,33,0.35);border:2px solid rgba(255,255,255,0.95);">${text}</div>
    </div>
  `
}

function arrivalBadgeHtml(text: string) {
  return `
    <div style="transform:translate(-50%,-155%);white-space:nowrap;">
      <div style="background:#fff;color:#083b21;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:800;line-height:1;box-shadow:0 4px 12px rgba(15,23,42,0.2);border:1.5px solid rgba(19,177,90,0.3);">${text}</div>
    </div>
  `
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng, driverMotoColor,
  nearbyDrivers = [], showNearby = false, showDriver = false,
  mode = 'client', onRouteCoords, bottomOffset = 0, className = '',
}: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)

  const routeLayersRef = useRef<any[]>([])
  const nearbyLayersRef = useRef<any[]>([])
  const driverLayerRef = useRef<any>(null)
  const requestIdRef = useRef(0)
  const onRouteCoordsRef = useRef(onRouteCoords)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { onRouteCoordsRef.current = onRouteCoords })

  // ══════════ 1. INITIALISATION — UNE SEULE FOIS ══════════
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

  // ══════════ 2. ROUTE + MARQUEURS — quand les coordonnées changent ══════════
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
        icon: L.divIcon({ html: startMarkerHtml(), className: '', iconSize: [0, 0] }),
        interactive: false, zIndexOffset: 700,
      }).addTo(map)
      routeLayersRef.current.push(m)
    }

    if (to) {
      const m = L.marker([to.lat, to.lng], {
        icon: L.divIcon({ html: destinationMarkerHtml(), className: '', iconSize: [0, 0] }),
        interactive: false, zIndexOffset: 720,
      }).addTo(map)
      routeLayersRef.current.push(m)
    }

    // Cadrage sécurisé — le padding ne dépasse JAMAIS la taille de la carte
    const fitSafe = (coords: [number, number][]) => {
      const size = map.getSize()
      const wantedBottom = 45 + bottomOffset
      const safeBottom = (size.y - wantedBottom - 90) > 120 ? wantedBottom : 45
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, {
        paddingTopLeft: [45, 90],
        paddingBottomRight: [45, safeBottom],
        maxZoom: 16,
      })
    }

    const centerSafe = (point: [number, number], zoom: number) => {
      map.setView(point, zoom, { animate: false })
      if (bottomOffset > 0) {
        const size = map.getSize()
        if (size.y - bottomOffset > 150) {
          map.panBy([0, bottomOffset / 2], { animate: false })
        }
      }
    }

    const samePoint = from && to &&
      Math.abs(from.lat - to.lat) < 0.0001 && Math.abs(from.lng - to.lng) < 0.0001

    if (from && to && !samePoint) {
      const requestId = ++requestIdRef.current

      const drawLine = (coords: [number, number][], durationSeconds: number) => {
        if (requestId !== requestIdRef.current || !mapRef.current) return

        const outline = L.polyline(coords, {
          color: '#ffffff', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round',
        }).addTo(map)
        const line = L.polyline(coords, {
          color: '#13b15a', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round',
        }).addTo(map)
        routeLayersRef.current.push(outline, line)

        if (durationSeconds > 0) {
          const durationPoint = coords[Math.floor(coords.length * 0.5)]
          const durBadge = L.marker(durationPoint, {
            icon: L.divIcon({ html: durationBadgeHtml(formatDuration(durationSeconds)), className: '', iconSize: [0, 0] }),
            interactive: false, zIndexOffset: 600,
          }).addTo(map)
          routeLayersRef.current.push(durBadge)

          const arrBadge = L.marker([to.lat, to.lng], {
            icon: L.divIcon({ html: arrivalBadgeHtml(`Arrivée à ${formatArrival(durationSeconds)}`), className: '', iconSize: [0, 0] }),
            interactive: false, zIndexOffset: 560,
          }).addTo(map)
          routeLayersRef.current.push(arrBadge)
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

  // ══════════ 3. MOTOS PROCHES — sans toucher au zoom ══════════
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return
    const L = LRef.current
    const map = mapRef.current

    nearbyLayersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    nearbyLayersRef.current = []

    if (!showNearby) return

    nearbyDrivers.forEach((driver) => {
      if (!isValidCoordinate(driver.lat, driver.lng)) return
      const color = driver.moto_color || driver.motoColor || driver.color || '#13b15a'
      const m = L.marker([driver.lat, driver.lng], {
        icon: L.divIcon({ html: motoMarkerHtml(color, 38), className: '', iconSize: [0, 0] }),
        interactive: false, zIndexOffset: 650,
      }).addTo(map)
      nearbyLayersRef.current.push(m)
    })
  }, [mapReady, nearbyDrivers, showNearby])

  // ══════════ 4. CHAUFFEUR ASSIGNÉ — bouge sans réinitialiser ══════════
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

    if (driverLayerRef.current) {
      driverLayerRef.current.setLatLng(pos)
    } else {
      driverLayerRef.current = L.marker(pos, {
        icon: L.divIcon({ html: motoMarkerHtml(driverMotoColor || '#13b15a', 46), className: '', iconSize: [0, 0] }),
        interactive: false, zIndexOffset: 800,
      }).addTo(map)
    }

    if (mode === 'driver') {
      map.panTo(pos, { animate: true, duration: 0.5 })
    }
  }, [mapReady, driverLat, driverLng, driverMotoColor, showDriver, mode])

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#f7faf7] ${className}`}>
      <div ref={mapElementRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#f7faf7] px-6 text-center">
          <div className="rounded-3xl bg-white px-5 py-4 shadow-lg">
            <p className="text-sm font-bold text-[#083b21]">{error}</p>
            <p className="mt-1 text-xs text-gray-500">Vérifie la connexion puis réessaie.</p>
          </div>
        </div>
      )}
    </div>
  )
}