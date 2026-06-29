'use client'

import { useCallback, useEffect, useRef } from 'react'
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

const GREEN = '#1DB954'
const DARK_GREEN = '#0F5138'
const RED = '#E53935'

const MOTO_COLOR_MAP: Record<string, string> = {
  rouge: '#E53935',
  noir: '#212121',
  noire: '#212121',
  bleu: '#1E88E5',
  bleue: '#1E88E5',
  vert: '#1DB954',
  verte: '#1DB954',
  blanc: '#F5F5F5',
  blanche: '#F5F5F5',
  gris: '#757575',
  grise: '#757575',
  jaune: '#FBC02D',
  orange: '#FB8C00',
  marron: '#6D4C41',
  violet: '#8E24AA',
  violette: '#8E24AA',
  rose: '#EC407A',
}

const getMotoColor = (colorName?: string): string => {
  if (!colorName) return DARK_GREEN
  return MOTO_COLOR_MAP[colorName.trim().toLowerCase()] || DARK_GREEN
}

const calculateHeading = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number | null => {
  const dist = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2))
  if (dist < 0.000005) return null

  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const isSamePoint = (from: [number, number], to: [number, number]) => {
  return Math.abs(from[0] - to[0]) < 0.0001 && Math.abs(from[1] - to[1]) < 0.0001
}

export default function MapView({
  fromLat,
  fromLng,
  toLat,
  toLng,
  driverLat,
  driverLng,
  driverMotoColor,
  showDriver = false,
  nearbyDrivers = [],
  showNearby = false,
  onRouteCoords,
  mode = 'client',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)

  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const routeLayersRef = useRef<any[]>([])
  const arrivalMarkerRef = useRef<any>(null)
  const lastRouteUpdateRef = useRef<number>(0)

  const createMotoIcon = useCallback(
    (L: any, eta?: number, isAssigned = false, color?: string, heading = 0) => {
      const motoColor = getMotoColor(color)
      const ringColor = isAssigned ? DARK_GREEN : 'white'

      return L.divIcon({
        className: '',
        html: `
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
            ${
              eta !== undefined
                ? `<div style="background:${GREEN};color:white;font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${eta} min</div>`
                : ''
            }
          </div>
        `,
        iconSize: [38, eta !== undefined ? 56 : 38],
        iconAnchor: [19, eta !== undefined ? 56 : 38],
      })
    },
    []
  )

  const clearRoute = useCallback((map: any) => {
    routeLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer)
      } catch {}
    })

    routeLayersRef.current = []

    if (arrivalMarkerRef.current) {
      try {
        map.removeLayer(arrivalMarkerRef.current)
      } catch {}

      arrivalMarkerRef.current = null
    }
  }, [])

  const drawRoute = useCallback(
    async (L: any, map: any, from: [number, number], to: [number, number]) => {
      clearRoute(map)

      if (isSamePoint(from, to)) return

      try {
        const url = `/api/route-osrm?fromLng=${from[1]}&fromLat=${from[0]}&toLng=${to[1]}&toLat=${to[0]}`
        const res = await fetch(url, { cache: 'no-store' })

        if (!res.ok) throw new Error('OSRM failed')

        const data = await res.json()

        if (!data.routes?.[0]?.geometry?.coordinates) {
          throw new Error('No route')
        }

        const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )

        if (coords.length < 2) throw new Error('Invalid route')

        if (onRouteCoords) onRouteCoords(coords)

        const durationSec = data.routes[0].duration || 0
        const etaMin = Math.max(1, Math.round(durationSec / 60))

        const arrivalDate = new Date(Date.now() + durationSec * 1000)
        const arrivalStr = arrivalDate.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })

        const arrivalIcon = L.divIcon({
          className: '',
          html: `<div style="background:white;color:#111;font-size:12px;font-weight:800;padding:6px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:1px solid #eee;">Arrivée à ${arrivalStr}</div>`,
          iconSize: [140, 32],
          iconAnchor: [70, 50],
        })

        arrivalMarkerRef.current = L.marker(to, {
          icon: arrivalIcon,
          zIndexOffset: 1000,
        }).addTo(map)

        const midPoint = coords[Math.floor(coords.length / 2)]

        const etaIcon = L.divIcon({
          className: '',
          html: `<div style="background:${DARK_GREEN};color:white;font-size:13px;font-weight:900;padding:5px 12px;border-radius:16px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.3);border:2px solid white;">${etaMin} min</div>`,
          iconSize: [70, 30],
          iconAnchor: [35, 15],
        })

        const etaMarker = L.marker(midPoint, {
          icon: etaIcon,
          zIndexOffset: 999,
        }).addTo(map)

        const outlineLine = L.polyline(coords, {
          color: '#FFFFFF',
          weight: 10,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map)

        const mainLine = L.polyline(coords, {
          color: GREEN,
          weight: 5,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map)

        routeLayersRef.current = [outlineLine, mainLine, etaMarker]

        map.fitBounds(L.latLngBounds(coords), {
          paddingTopLeft: [40, 60],
          paddingBottomRight: [40, 280],
          maxZoom: 13,
          animate: true,
          duration: 0.5,
        })
      } catch {
        const fallback = L.polyline([from, to], {
          color: GREEN,
          weight: 5,
          opacity: 1,
          lineCap: 'round',
        }).addTo(map)

        routeLayersRef.current = [fallback]

        map.fitBounds(L.latLngBounds([from, to]), {
          paddingTopLeft: [40, 60],
          paddingBottomRight: [40, 280],
          maxZoom: 13,
        })
      }
    },
    [clearRoute, onRouteCoords]
  )

  useEffect(() => {
    if (!containerRef.current) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const container = containerRef.current as any
    if (container._leaflet_id) container._leaflet_id = null

    import('leaflet').then((leafletModule) => {
      const L = (leafletModule as any).default || leafletModule
      LRef.current = L

      if (!containerRef.current) return

      const currentContainer = containerRef.current as any
      if (currentContainer._leaflet_id) currentContainer._leaflet_id = null

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      })

      mapRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map)

      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${GREEN};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      const toIcon = L.divIcon({
        className: '',
        html: `
          <div style="width:24px;height:32px;">
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
              <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.373 18.627 0 12 0Z" fill="${RED}"/>
              <circle cx="12" cy="12" r="5" fill="white"/>
            </svg>
          </div>
        `,
        iconSize: [24, 32],
        iconAnchor: [12, 32],
      })

      const samePoint = Math.abs(fromLat - toLat) < 0.0001 && Math.abs(fromLng - toLng) < 0.0001

      L.marker([fromLat, fromLng], { icon: fromIcon }).addTo(map)

      if (!samePoint) {
        L.marker([toLat, toLng], { icon: toIcon }).addTo(map)
      }

      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach((driver) => {
          const marker = L.marker([driver.lat, driver.lng], {
            icon: createMotoIcon(L, driver.eta, false, driver.motoColor),
          }).addTo(map)

          nearbyMarkersRef.current.push(marker)
        })
      }

      if (showDriver && driverLat && driverLng) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], {
          icon: createMotoIcon(L, undefined, true, driverMotoColor),
        }).addTo(map)
      }

      if (!samePoint) {
        drawRoute(L, map, [fromLat, fromLng], [toLat, toLng])
      } else if (showNearby && nearbyDrivers.length > 0) {
        const points: [number, number][] = [
          [fromLat, fromLng],
          ...nearbyDrivers.map((driver) => [driver.lat, driver.lng] as [number, number]),
        ]

        map.fitBounds(L.latLngBounds(points), {
          padding: [60, 90],
          maxZoom: 15,
        })
      } else {
        map.setView([fromLat, fromLng], 15)
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      if (containerRef.current) {
        ;(containerRef.current as any)._leaflet_id = null
      }
    }
  }, [
    fromLat,
    fromLng,
    toLat,
    toLng,
    showNearby,
    nearbyDrivers,
    showDriver,
    driverLat,
    driverLng,
    driverMotoColor,
    createMotoIcon,
    drawRoute,
  ])

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showDriver || !driverLat || !driverLng) return

    const L = LRef.current

    if (driverMarkerRef.current) {
      const prevPos = driverMarkerRef.current.getLatLng()
      const heading = calculateHeading(prevPos.lat, prevPos.lng, driverLat, driverLng)

      driverMarkerRef.current.setLatLng([driverLat, driverLng])

      if (heading !== null) {
        driverMarkerRef.current.setIcon(
          createMotoIcon(L, undefined, true, driverMotoColor, heading)
        )
      }
    } else {
      driverMarkerRef.current = L.marker([driverLat, driverLng], {
        icon: createMotoIcon(L, undefined, true, driverMotoColor),
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
  }, [
    driverLat,
    driverLng,
    showDriver,
    createMotoIcon,
    mode,
    toLat,
    toLng,
    drawRoute,
    driverMotoColor,
  ])

  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showNearby) return

    const L = LRef.current

    nearbyMarkersRef.current.forEach((marker) => {
      try {
        marker.remove()
      } catch {}
    })

    nearbyMarkersRef.current = []

    nearbyDrivers.forEach((driver) => {
      const marker = L.marker([driver.lat, driver.lng], {
        icon: createMotoIcon(L, driver.eta, false, driver.motoColor),
      }).addTo(mapRef.current)

      nearbyMarkersRef.current.push(marker)
    })
  }, [nearbyDrivers, showNearby, createMotoIcon])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    />
  )
}