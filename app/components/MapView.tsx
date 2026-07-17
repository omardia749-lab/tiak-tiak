'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

type LatLng = {
  lat: number
  lng: number
}

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
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Icônes SVG (gratuites, faites maison) ---

function startMarkerHtml() {
  return `
    <div style="transform:translate(-50%,-50%);">
      <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
        <circle cx="17" cy="17" r="14" fill="#ffffff" stroke="#13b15a" stroke-width="4"/>
        <circle cx="17" cy="17" r="6" fill="#13b15a"/>
      </svg>
    </div>
  `
}

function destinationMarkerHtml() {
  return `
    <div style="transform:translate(-50%,-100%);">
      <svg width="38" height="46" viewBox="0 0 38 46" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 45C19 45 36 26.8 36 17.3C36 8 28.4 1 19 1C9.6 1 2 8 2 17.3C2 26.8 19 45 19 45Z" fill="#0b7a3b" stroke="#ffffff" stroke-width="3.5"/>
        <circle cx="19" cy="17.5" r="6.5" fill="#ffffff"/>
      </svg>
    </div>
  `
}

function motoMarkerHtml(color: string, size: number) {
  const s = size
  return `
    <div style="transform:translate(-50%,-50%);">
      <svg width="${s}" height="${s}" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
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

function badgeHtml(text: string, variant: 'duration' | 'arrival') {
  if (variant === 'duration') {
    return `
      <div style="transform:translate(-50%,-50%);white-space:nowrap;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
        <div style="background:#083b21;color:#fff;padding:8px 13px;border-radius:999px;font-size:13px;font-weight:800;line-height:1;box-shadow:0 10px 25px rgba(8,59,33,0.28);border:2px solid rgba(255,255,255,0.95);">${text}</div>
      </div>
    `
  }
  return `
    <div style="transform:translate(-50%,-50%);white-space:nowrap;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
      <div style="background:#fff;color:#083b21;padding:7px 12px;border-radius:999px;font-size:12px;font-weight:800;line-height:1;box-shadow:0 10px 25px rgba(15,23,42,0.15);border:1px solid rgba(19,177,90,0.22);">${text}</div>
    </div>
  `
}

export default function MapView({
  fromLat,
  fromLng,
  toLat,
  toLng,
  driverLat,
  driverLng,
  driverMotoColor,
  nearbyDrivers = [],
  showNearby = false,
  showDriver = false,
  mode = 'client',
  onRouteCoords,
  className = '',
}: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)

  const layersRef = useRef<any[]>([])
  const requestIdRef = useRef(0)

  const [error, setError] = useState<string | null>(null)

  const clearLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer)
      } catch {
        // ignore
      }
    })
    layersRef.current = []
  }, [])

  const fitToRoute = useCallback(
    (L: any, map: any, coords: [number, number][]) => {
      if (!coords.length) return
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, {
        paddingTopLeft: [44, 80],
        paddingBottomRight: [44, mode === 'driver' ? 120 : 300],
        maxZoom: 15,
        animate: true,
        duration: 0.5,
      })
    },
    [mode]
  )

  const drawFallbackLine = useCallback(
    (L: any, map: any, from: LatLng, to: LatLng) => {
      const coords: [number, number][] = [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ]

      const outline = L.polyline(coords, {
        color: '#ffffff',
        weight: 10,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)

      const line = L.polyline(coords, {
        color: '#13b15a',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)

      layersRef.current.push(outline, line)
      fitToRoute(L, map, coords)
      onRouteCoords?.(coords)
    },
    [fitToRoute, onRouteCoords]
  )

  const drawRoute = useCallback(
    async (L: any, map: any, from: LatLng, to: LatLng) => {
      const currentRequestId = ++requestIdRef.current

      try {
        const url =
          `/api/route-osrm?fromLng=${from.lng}&fromLat=${from.lat}` +
          `&toLng=${to.lng}&toLat=${to.lat}`

        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error('OSRM indisponible')

        const data = await response.json()
        if (currentRequestId !== requestIdRef.current) return

        const route = data?.routes?.[0]
        if (!route?.geometry?.coordinates?.length) {
          throw new Error('Route OSRM vide')
        }

        const coords: [number, number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )

        const durationSeconds =
          typeof route.duration === 'number' ? route.duration : 0

        const outline = L.polyline(coords, {
          color: '#ffffff',
          weight: 11,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map)

        const line = L.polyline(coords, {
          color: '#13b15a',
          weight: 5,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map)

        layersRef.current.push(outline, line)

        if (durationSeconds > 0) {
          const durationPoint =
            coords[Math.floor(coords.length * 0.45)] || coords[0]
          const arrivalPoint =
            coords[Math.floor(coords.length * 0.82)] || coords[coords.length - 1]

          const durationBadge = L.marker(durationPoint, {
            icon: L.divIcon({
              html: badgeHtml(formatDuration(durationSeconds), 'duration'),
              className: '',
              iconSize: [0, 0],
            }),
            interactive: false,
            zIndexOffset: 600,
          }).addTo(map)

          const arrivalBadge = L.marker(arrivalPoint, {
            icon: L.divIcon({
              html: badgeHtml(
                `Arrivée à ${formatArrival(durationSeconds)}`,
                'arrival'
              ),
              className: '',
              iconSize: [0, 0],
            }),
            interactive: false,
            zIndexOffset: 560,
          }).addTo(map)

          layersRef.current.push(durationBadge, arrivalBadge)
        }

        fitToRoute(L, map, coords)
        onRouteCoords?.(coords)
      } catch {
        drawFallbackLine(L, map, from, to)
      }
    },
    [drawFallbackLine, fitToRoute, onRouteCoords]
  )

  const drawMarkers = useCallback(
    (L: any, map: any, from?: LatLng, to?: LatLng) => {
      if (from) {
        const marker = L.marker([from.lat, from.lng], {
          icon: L.divIcon({
            html: startMarkerHtml(),
            className: '',
            iconSize: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 700,
        }).addTo(map)
        layersRef.current.push(marker)
      }

      if (to) {
        const marker = L.marker([to.lat, to.lng], {
          icon: L.divIcon({
            html: destinationMarkerHtml(),
            className: '',
            iconSize: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 720,
        }).addTo(map)
        layersRef.current.push(marker)
      }

      if (showNearby && Array.isArray(nearbyDrivers)) {
        nearbyDrivers.forEach((driver) => {
          if (!isValidCoordinate(driver.lat, driver.lng)) return
          const color =
            driver.moto_color ||
            driver.motoColor ||
            driver.color ||
            '#13b15a'

          const marker = L.marker([driver.lat, driver.lng], {
            icon: L.divIcon({
              html: motoMarkerHtml(color, 42),
              className: '',
              iconSize: [0, 0],
            }),
            interactive: false,
            zIndexOffset: 650,
          }).addTo(map)
          layersRef.current.push(marker)
        })
      }

      if (showDriver && isValidCoordinate(driverLat, driverLng)) {
        const marker = L.marker([driverLat as number, driverLng as number], {
          icon: L.divIcon({
            html: motoMarkerHtml(driverMotoColor || '#13b15a', 50),
            className: '',
            iconSize: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 800,
        }).addTo(map)
        layersRef.current.push(marker)
      }
    },
    [
      driverLat,
      driverLng,
      driverMotoColor,
      nearbyDrivers,
      showDriver,
      showNearby,
    ]
  )

  useEffect(() => {
    let cancelled = false

    async function initialiseMap() {
      try {
        setError(null)

        const leafletModule = await import('leaflet')
        const L = leafletModule.default || leafletModule
        leafletRef.current = L

        if (cancelled || !mapElementRef.current) return

        const defaultCenter: [number, number] = [14.7167, -17.4677]

        if (!mapRef.current) {
          mapRef.current = L.map(mapElementRef.current, {
            center: defaultCenter,
            zoom: 13,
            zoomControl: false,
            attributionControl: false,
          })

          L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            {
              maxZoom: 19,
              subdomains: 'abcd',
            }
          ).addTo(mapRef.current)
        }

        const map = mapRef.current

        clearLayers()

        const from =
          isValidCoordinate(fromLat, fromLng)
            ? { lat: fromLat as number, lng: fromLng as number }
            : undefined

        const to =
          isValidCoordinate(toLat, toLng)
            ? { lat: toLat as number, lng: toLng as number }
            : undefined

        drawMarkers(L, map, from, to)

        if (from && to) {
          await drawRoute(L, map, from, to)
        } else if (from) {
          map.setView([from.lat, from.lng], 15)
        } else if (to) {
          map.setView([to.lat, to.lng], 15)
        } else {
          map.setView(defaultCenter, 12)
        }

        window.setTimeout(() => {
          try {
            map.invalidateSize()
          } catch {
            // ignore
          }
        }, 200)
      } catch {
        setError('Carte momentanément indisponible')
      }
    }

    initialiseMap()

    return () => {
      cancelled = true
    }
  }, [
    clearLayers,
    drawMarkers,
    drawRoute,
    fromLat,
    fromLng,
    toLat,
    toLng,
  ])

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          // ignore
        }
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[#f7faf7] ${className}`}
    >
      <div ref={mapElementRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/60 to-transparent z-[400]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/50 to-transparent z-[400]" />

      {error && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-[#f7faf7] px-6 text-center">
          <div className="rounded-3xl bg-white px-5 py-4 shadow-lg">
            <p className="text-sm font-bold text-[#083b21]">{error}</p>
            <p className="mt-1 text-xs text-gray-500">
              Vérifie la connexion puis réessaie.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}