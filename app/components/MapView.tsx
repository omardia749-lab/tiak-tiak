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
  const key = colorName.trim().toLowerCase()
  return MOTO_COLOR_MAP[key] || DARK_GREEN
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
    if (typeof window === 'undefined') return

    if (window.google?.maps) {
      googleMapsLoaded = true
      resolve()
      return
    }

    if (googleMapsLoaded) {
      resolve()
      return
    }

    googleMapsCallbacks.push(resolve)

    if (googleMapsLoading) return

    googleMapsLoading = true

    window.initGoogleMaps = () => {
      googleMapsLoaded = true
      googleMapsLoading = false
      googleMapsCallbacks.forEach((cb) => cb())
      googleMapsCallbacks.length = 0
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    )

    if (existingScript) return

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=initGoogleMaps&language=fr&v=beta`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

function hideGoogleControls() {
  if (document.getElementById('hide-google-controls')) return

  const style = document.createElement('style')
  style.id = 'hide-google-controls'
  style.textContent = `
    .gmnoprint,
    .gm-style-cc,
    .gm-bundled-control,
    .gm-svpc,
    .gm-fullscreen-control {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}

function isSamePoint(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  return Math.abs(from.lat - to.lat) < 0.0001 && Math.abs(from.lng - to.lng) < 0.0001
}

function isValidPoint(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
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

  const routeOutlineRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)

  const fromMarkerRef = useRef<any>(null)
  const toMarkerRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const arrivalMarkerRef = useRef<any>(null)
  const etaMarkerRef = useRef<any>(null)

  const clearMarker = (marker: any) => {
    if (!marker) return
    try {
      marker.map = null
    } catch {
      try {
        marker.setMap(null)
      } catch {}
    }
  }

  const clearRoute = () => {
    if (routeOutlineRef.current) {
      routeOutlineRef.current.setMap(null)
      routeOutlineRef.current = null
    }

    if (routeLineRef.current) {
      routeLineRef.current.setMap(null)
      routeLineRef.current = null
    }

    clearMarker(arrivalMarkerRef.current)
    clearMarker(etaMarkerRef.current)

    arrivalMarkerRef.current = null
    etaMarkerRef.current = null
  }

  const createMotoElement = useCallback(
    (color?: string, heading = 0, eta?: number, isAssigned = false) => {
      const motoColor = getMotoColor(color)
      const ringColor = isAssigned ? DARK_GREEN : 'white'

      const div = document.createElement('div')
      div.style.cssText =
        'display:flex;flex-direction:column;align-items:center;gap:3px;'

      div.innerHTML = `
        <div style="
          width:38px;
          height:38px;
          border-radius:50%;
          background:white;
          border:3px solid ${ringColor};
          box-shadow:0 3px 10px rgba(0,0,0,0.25);
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <div style="
            transform:rotate(${heading}deg);
            transition:transform 0.4s ease;
            width:26px;
            height:26px;
            display:flex;
            align-items:center;
            justify-content:center;
          ">
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
            ? `<div style="
                background:${GREEN};
                color:white;
                font-size:10px;
                font-weight:900;
                padding:2px 7px;
                border-radius:8px;
                white-space:nowrap;
                box-shadow:0 2px 5px rgba(0,0,0,0.18);
              ">${eta} min</div>`
            : ''
        }
      `

      return div
    },
    []
  )

  const createStartMarker = () => {
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="
        width:18px;
        height:18px;
        border-radius:50%;
        background:${GREEN};
        border:4px solid white;
        box-shadow:0 4px 12px rgba(0,0,0,0.25);
      "></div>
    `
    return el.firstElementChild as HTMLElement
  }

  const createEndMarker = () => {
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="
        width:28px;
        height:38px;
        transform:translateY(-100%);
        filter:drop-shadow(0 5px 8px rgba(0,0,0,0.22));
      ">
        <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
          <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 38 14 38C14 38 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${RED}"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>
      </div>
    `
    return el.firstElementChild as HTMLElement
  }

  const createArrivalBadge = (arrivalText: string) => {
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="
        background:white;
        color:#111;
        font-size:12px;
        font-weight:900;
        padding:7px 12px;
        border-radius:16px;
        white-space:nowrap;
        box-shadow:0 6px 18px rgba(0,0,0,0.20);
        border:1px solid rgba(0,0,0,0.06);
        transform:translate(-50%, -130%);
      ">
        Arrivée à ${arrivalText}
      </div>
    `
    return el.firstElementChild as HTMLElement
  }

  const createEtaBadge = (etaMin: number) => {
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="
        background:${DARK_GREEN};
        color:white;
        font-size:14px;
        font-weight:950;
        padding:7px 11px;
        border-radius:16px;
        white-space:nowrap;
        box-shadow:0 6px 18px rgba(0,0,0,0.25);
        border:2px solid white;
        transform:translate(-50%, -50%);
      ">
        ${etaMin}<br>
        <span style="font-size:11px;font-weight:800;">min</span>
      </div>
    `
    return el.firstElementChild as HTMLElement
  }

  const drawRoute = useCallback(
    async (
      map: any,
      from: { lat: number; lng: number },
      to: { lat: number; lng: number }
    ) => {
      clearRoute()

      if (isSamePoint(from, to)) return

      try {
        const url =
          `/api/route-osrm?` +
          `fromLng=${encodeURIComponent(from.lng)}` +
          `&fromLat=${encodeURIComponent(from.lat)}` +
          `&toLng=${encodeURIComponent(to.lng)}` +
          `&toLat=${encodeURIComponent(to.lat)}`

        const response = await fetch(url, { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('OSRM proxy failed')
        }

        const data = await response.json()

        if (!data.routes?.[0]?.geometry?.coordinates) {
          throw new Error('No OSRM route')
        }

        const route = data.routes[0]
        const durationSec = Number(route.duration || 0)
        const coordinates = route.geometry.coordinates as [number, number][]

        const points = coordinates
          .map(([lng, lat]) => ({ lat, lng }))
          .filter((p) => isValidPoint(p.lat, p.lng))

        if (points.length < 2) {
          throw new Error('Invalid route points')
        }

        if (onRouteCoords) {
          onRouteCoords(points.map((p) => [p.lat, p.lng]))
        }

        routeOutlineRef.current = new window.google.maps.Polyline({
          path: points,
          geodesic: false,
          strokeColor: '#FFFFFF',
          strokeOpacity: 0.95,
          strokeWeight: 10,
          map,
          zIndex: 20,
        })

        routeLineRef.current = new window.google.maps.Polyline({
          path: points,
          geodesic: false,
          strokeColor: GREEN,
          strokeOpacity: 1,
          strokeWeight: 5,
          map,
          zIndex: 30,
        })

        const etaMin = Math.max(1, Math.round(durationSec / 60))

        const arrivalDate = new Date(Date.now() + durationSec * 1000)
        const arrivalText = arrivalDate.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })

        const etaPoint = points[Math.floor(points.length * 0.5)]
        const arrivalPoint = points[Math.max(0, Math.floor(points.length * 0.82))]

        etaMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: etaPoint,
          map,
          content: createEtaBadge(etaMin),
          zIndex: 1000,
        })

        arrivalMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: arrivalPoint,
          map,
          content: createArrivalBadge(arrivalText),
          zIndex: 1001,
        })

        const bounds = new window.google.maps.LatLngBounds()
        points.forEach((point) => bounds.extend(point))

        map.fitBounds(bounds, {
          top: 70,
          right: 45,
          bottom: mode === 'driver' ? 70 : 90,
          left: 45,
        })
      } catch (error) {
        console.error('TIAK TIAK OSRM route error:', error)

        routeOutlineRef.current = new window.google.maps.Polyline({
          path: [from, to],
          geodesic: false,
          strokeColor: '#FFFFFF',
          strokeOpacity: 0.95,
          strokeWeight: 9,
          map,
          zIndex: 20,
        })

        routeLineRef.current = new window.google.maps.Polyline({
          path: [from, to],
          geodesic: false,
          strokeColor: GREEN,
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map,
          zIndex: 30,
        })

        const bounds = new window.google.maps.LatLngBounds()
        bounds.extend(from)
        bounds.extend(to)

        map.fitBounds(bounds, {
          top: 70,
          right: 45,
          bottom: mode === 'driver' ? 70 : 90,
          left: 45,
        })
      }
    },
    [mode, onRouteCoords]
  )

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

    if (!apiKey || !containerRef.current) return
    if (!isValidPoint(fromLat, fromLng)) return

    let cancelled = false

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || !window.google?.maps) return

      hideGoogleControls()

      const from = { lat: fromLat, lng: fromLng }
      const to = { lat: toLat, lng: toLng }
      const samePoint = isSamePoint(from, to)

      const map = new window.google.maps.Map(containerRef.current, {
        center: from,
        zoom: 14,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        backgroundColor: '#f8f8f8',
      })

      mapRef.current = map

      window.google.maps.event.addListenerOnce(map, 'idle', hideGoogleControls)

      fromMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: from,
        map,
        content: createStartMarker(),
        zIndex: 100,
      })

      if (!samePoint && isValidPoint(to.lat, to.lng)) {
        toMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: to,
          map,
          content: createEndMarker(),
          zIndex: 100,
        })
      }

      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach((driver) => {
          if (!isValidPoint(driver.lat, driver.lng)) return

          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: driver.lat, lng: driver.lng },
            map,
            content: createMotoElement(driver.motoColor, 0, driver.eta, false),
            zIndex: 200,
          })

          nearbyMarkersRef.current.push(marker)
        })
      }

      if (showDriver && driverLat && driverLng && isValidPoint(driverLat, driverLng)) {
        driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat: driverLat, lng: driverLng },
          map,
          content: createMotoElement(driverMotoColor, 0, undefined, true),
          zIndex: 300,
        })
      }

      if (!samePoint && isValidPoint(to.lat, to.lng)) {
        drawRoute(map, from, to)
      } else if (showNearby && nearbyDrivers.length > 0) {
        const bounds = new window.google.maps.LatLngBounds()
        bounds.extend(from)

        nearbyDrivers.forEach((driver) => {
          if (isValidPoint(driver.lat, driver.lng)) {
            bounds.extend({ lat: driver.lat, lng: driver.lng })
          }
        })

        map.fitBounds(bounds, {
          top: 60,
          right: 60,
          bottom: 60,
          left: 60,
        })
      } else {
        map.setCenter(from)
        map.setZoom(15)
      }
    })

    return () => {
      cancelled = true

      clearRoute()

      clearMarker(fromMarkerRef.current)
      clearMarker(toMarkerRef.current)
      clearMarker(driverMarkerRef.current)

      nearbyMarkersRef.current.forEach((marker) => clearMarker(marker))
      nearbyMarkersRef.current = []

      fromMarkerRef.current = null
      toMarkerRef.current = null
      driverMarkerRef.current = null
      mapRef.current = null
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
    createMotoElement,
    drawRoute,
  ])

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || !showDriver || !driverLat || !driverLng) {
      return
    }

    if (!isValidPoint(driverLat, driverLng)) return

    if (driverMarkerRef.current) {
      driverMarkerRef.current.position = { lat: driverLat, lng: driverLng }
    } else {
      driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: driverLat, lng: driverLng },
        map: mapRef.current,
        content: createMotoElement(driverMotoColor, 0, undefined, true),
        zIndex: 300,
      })
    }

    if (mode === 'driver') {
      mapRef.current.setCenter({ lat: driverLat, lng: driverLng })
      mapRef.current.setZoom(17)
    }
  }, [driverLat, driverLng, showDriver, createMotoElement, mode, driverMotoColor])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#f3f4f6',
      }}
    />
  )
}