'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  heading?: number
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

let googleMapsPromise: Promise<any> | null = null

function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window unavailable'))
  }

  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google)
  }

  if (googleMapsPromise) {
    return googleMapsPromise
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  if (!apiKey) {
    return Promise.reject(
      new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY manquante')
    )
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="true"]'
    )

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        resolve((window as any).google)
      })
      existingScript.addEventListener('error', reject)
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&language=fr&region=SN`
    script.async = true
    script.defer = true
    script.dataset.googleMaps = 'true'

    script.onload = () => {
      resolve((window as any).google)
    }

    script.onerror = () => {
      reject(new Error('Impossible de charger Google Maps'))
    }

    document.head.appendChild(script)
  })

  return googleMapsPromise
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

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function startMarkerIcon() {
  return svgToDataUri(`
    <svg width="42" height="42" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
      <circle cx="21" cy="21" r="18" fill="#ffffff" stroke="#13b15a" stroke-width="4"/>
      <circle cx="21" cy="21" r="7" fill="#13b15a"/>
    </svg>
  `)
}

function destinationMarkerIcon() {
  return svgToDataUri(`
    <svg width="46" height="56" viewBox="0 0 46 56" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 54C23 54 43 32.8 43 20.8C43 9.9 34 1 23 1C12 1 3 9.9 3 20.8C3 32.8 23 54 23 54Z" fill="#0b7a3b" stroke="#ffffff" stroke-width="4"/>
      <circle cx="23" cy="21" r="8" fill="#ffffff"/>
    </svg>
  `)
}

function motoMarkerIcon(color = '#13b15a') {
  return svgToDataUri(`
    <svg width="58" height="58" viewBox="0 0 58 58" xmlns="http://www.w3.org/2000/svg">
      <circle cx="29" cy="29" r="25" fill="#ffffff" stroke="${color}" stroke-width="4"/>
      <path d="M17 34.5C17 31.5 19.4 29.1 22.4 29.1C25.4 29.1 27.8 31.5 27.8 34.5C27.8 37.5 25.4 39.9 22.4 39.9C19.4 39.9 17 37.5 17 34.5Z" fill="${color}"/>
      <path d="M32.2 34.5C32.2 31.5 34.6 29.1 37.6 29.1C40.6 29.1 43 31.5 43 34.5C43 37.5 40.6 39.9 37.6 39.9C34.6 39.9 32.2 37.5 32.2 34.5Z" fill="${color}"/>
      <path d="M22.4 34.5H28.5L34 24.8H39.2" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M28.5 34.5H37.6L32.4 27.2H25.8" fill="none" stroke="#083b21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M28.8 19.4C31.2 19.4 33.1 21.3 33.1 23.7C33.1 26.1 31.2 28 28.8 28C26.4 28 24.5 26.1 24.5 23.7C24.5 21.3 26.4 19.4 28.8 19.4Z" fill="#083b21"/>
      <path d="M25.5 27.5L22.6 31.6" stroke="#083b21" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `)
}

const premiumMapStyles = [
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b7280' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#f3f4f6' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#f7faf7' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#dbeafe' }],
  },
]

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

  const routeOutlineRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const overlaysRef = useRef<any[]>([])
  const requestIdRef = useRef(0)

  const [error, setError] = useState<string | null>(null)

  const clearMapObjects = useCallback(() => {
    if (routeOutlineRef.current) {
      routeOutlineRef.current.setMap(null)
      routeOutlineRef.current = null
    }

    if (routeLineRef.current) {
      routeLineRef.current.setMap(null)
      routeLineRef.current = null
    }

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
  }, [])

  const createBadgeOverlay = useCallback(
    (
      google: any,
      map: any,
      position: LatLng,
      text: string,
      variant: 'duration' | 'arrival'
    ) => {
      const overlay = new google.maps.OverlayView()

      overlay.onAdd = function () {
        const div = document.createElement('div')

        div.style.position = 'absolute'
        div.style.transform = 'translate(-50%, -50%)'
        div.style.zIndex = variant === 'duration' ? '30' : '28'
        div.style.whiteSpace = 'nowrap'
        div.style.pointerEvents = 'none'
        div.style.fontFamily =
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

        if (variant === 'duration') {
          div.innerHTML = `
            <div style="
              background:#083b21;
              color:#ffffff;
              padding:8px 13px;
              border-radius:999px;
              font-size:13px;
              font-weight:800;
              line-height:1;
              box-shadow:0 10px 25px rgba(8,59,33,0.28);
              border:2px solid rgba(255,255,255,0.95);
            ">
              ${text}
            </div>
          `
        } else {
          div.innerHTML = `
            <div style="
              background:#ffffff;
              color:#083b21;
              padding:7px 12px;
              border-radius:999px;
              font-size:12px;
              font-weight:800;
              line-height:1;
              box-shadow:0 10px 25px rgba(15,23,42,0.15);
              border:1px solid rgba(19,177,90,0.22);
            ">
              ${text}
            </div>
          `
        }

        ;(this as any).div = div
        const panes = this.getPanes()
        panes?.overlayMouseTarget?.appendChild(div)
      }

      overlay.draw = function () {
        const projection = this.getProjection()
        const div = (this as any).div

        if (!projection || !div) return

        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(position.lat, position.lng)
        )

        if (!point) return

        div.style.left = `${point.x}px`
        div.style.top = `${point.y}px`
      }

      overlay.onRemove = function () {
        const div = (this as any).div

        if (div && div.parentNode) {
          div.parentNode.removeChild(div)
        }

        ;(this as any).div = null
      }

      overlay.setMap(map)
      overlaysRef.current.push(overlay)

      return overlay
    },
    []
  )

  const fitMapToRoute = useCallback((google: any, map: any, coords: LatLng[]) => {
    if (!coords.length) return

    const bounds = new google.maps.LatLngBounds()

    coords.forEach((coord) => {
      bounds.extend(new google.maps.LatLng(coord.lat, coord.lng))
    })

    map.fitBounds(bounds, {
      top: 80,
      right: 48,
      bottom: mode === 'driver' ? 120 : 310,
      left: 48,
    })

    window.setTimeout(() => {
      const zoom = map.getZoom()

      if (typeof zoom === 'number' && zoom > 15) {
        map.setZoom(15)
      }

      if (typeof zoom === 'number' && zoom < 11) {
        map.setZoom(11)
      }
    }, 350)
  }, [mode])

  const drawFallbackLine = useCallback(
    (google: any, map: any, from: LatLng, to: LatLng) => {
      const coords = [from, to]

      routeOutlineRef.current = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        strokeWeight: 10,
        zIndex: 20,
        map,
      })

      routeLineRef.current = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: '#13b15a',
        strokeOpacity: 1,
        strokeWeight: 5,
        zIndex: 21,
        map,
      })

      fitMapToRoute(google, map, coords)
      onRouteCoords?.(coords.map((coord) => [coord.lat, coord.lng]))
    },
    [fitMapToRoute, onRouteCoords]
  )

  const drawRoute = useCallback(
    async (google: any, map: any, from: LatLng, to: LatLng) => {
      const currentRequestId = ++requestIdRef.current

      try {
        const url =
          `/api/route-osrm?fromLng=${from.lng}&fromLat=${from.lat}` +
          `&toLng=${to.lng}&toLat=${to.lat}`

        const response = await fetch(url, {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('OSRM indisponible')
        }

        const data = await response.json()

        if (currentRequestId !== requestIdRef.current) {
          return
        }

        const route = data?.routes?.[0]

        if (!route?.geometry?.coordinates?.length) {
          throw new Error('Route OSRM vide')
        }

        const coords: LatLng[] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => ({
            lat,
            lng,
          })
        )

        const durationSeconds =
          typeof route.duration === 'number' ? route.duration : 0

        routeOutlineRef.current = new google.maps.Polyline({
          path: coords,
          geodesic: true,
          strokeColor: '#ffffff',
          strokeOpacity: 1,
          strokeWeight: 11,
          zIndex: 20,
          map,
        })

        routeLineRef.current = new google.maps.Polyline({
          path: coords,
          geodesic: true,
          strokeColor: '#13b15a',
          strokeOpacity: 1,
          strokeWeight: 5,
          zIndex: 21,
          map,
        })

        const durationPoint = coords[Math.floor(coords.length * 0.45)] || coords[0]
        const arrivalPoint = coords[Math.floor(coords.length * 0.82)] || to

        if (durationSeconds > 0) {
          createBadgeOverlay(
            google,
            map,
            durationPoint,
            formatDuration(durationSeconds),
            'duration'
          )

          createBadgeOverlay(
            google,
            map,
            arrivalPoint,
            `Arrivée à ${formatArrival(durationSeconds)}`,
            'arrival'
          )
        }

        fitMapToRoute(google, map, coords)
        onRouteCoords?.(coords.map((coord) => [coord.lat, coord.lng]))
      } catch {
        drawFallbackLine(google, map, from, to)
      }
    },
    [createBadgeOverlay, drawFallbackLine, fitMapToRoute, onRouteCoords]
  )

  const drawMarkers = useCallback(
    (google: any, map: any, from?: LatLng, to?: LatLng) => {
      if (from) {
        markersRef.current.push(
          new google.maps.Marker({
            position: from,
            map,
            icon: {
              url: startMarkerIcon(),
              scaledSize: new google.maps.Size(34, 34),
              anchor: new google.maps.Point(17, 17),
            },
            zIndex: 40,
            title: 'Départ',
          })
        )
      }

      if (to) {
        markersRef.current.push(
          new google.maps.Marker({
            position: to,
            map,
            icon: {
              url: destinationMarkerIcon(),
              scaledSize: new google.maps.Size(38, 46),
              anchor: new google.maps.Point(19, 44),
            },
            zIndex: 42,
            title: 'Destination',
          })
        )
      }

      if (showNearby && Array.isArray(nearbyDrivers)) {
        nearbyDrivers.forEach((driver) => {
          if (!isValidCoordinate(driver.lat, driver.lng)) return

          const color =
            driver.moto_color ||
            driver.motoColor ||
            driver.color ||
            '#13b15a'

          markersRef.current.push(
            new google.maps.Marker({
              position: {
                lat: driver.lat,
                lng: driver.lng,
              },
              map,
              icon: {
                url: motoMarkerIcon(color),
                scaledSize: new google.maps.Size(42, 42),
                anchor: new google.maps.Point(21, 21),
              },
              zIndex: 35,
              title: 'Moto proche',
            })
          )
        })
      }

      if (showDriver && isValidCoordinate(driverLat, driverLng)) {
        markersRef.current.push(
          new google.maps.Marker({
            position: {
              lat: driverLat as number,
              lng: driverLng as number,
            },
            map,
            icon: {
              url: motoMarkerIcon(driverMotoColor || '#13b15a'),
              scaledSize: new google.maps.Size(48, 48),
              anchor: new google.maps.Point(24, 24),
            },
            zIndex: 50,
            title: 'Chauffeur Tiak Tiak',
          })
        )
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

        const google = await loadGoogleMaps()

        if (cancelled || !mapElementRef.current) return

        const defaultCenter = {
          lat: 14.7167,
          lng: -17.4677,
        }

        const initialCenter =
          isValidCoordinate(fromLat, fromLng)
            ? {
                lat: fromLat as number,
                lng: fromLng as number,
              }
            : defaultCenter

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapElementRef.current, {
            center: initialCenter,
            zoom: 13,
            disableDefaultUI: true,
            clickableIcons: false,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            cameraControl: false,
            zoomControl: false,
            gestureHandling: 'greedy',
            backgroundColor: '#f7faf7',
            styles: premiumMapStyles,
          })
        }

        const map = mapRef.current

        clearMapObjects()

        const from =
          isValidCoordinate(fromLat, fromLng)
            ? {
                lat: fromLat as number,
                lng: fromLng as number,
              }
            : undefined

        const to =
          isValidCoordinate(toLat, toLng)
            ? {
                lat: toLat as number,
                lng: toLng as number,
              }
            : undefined

        drawMarkers(google, map, from, to)

        if (from && to) {
          await drawRoute(google, map, from, to)
        } else if (from) {
          map.setCenter(from)
          map.setZoom(15)
        } else if (to) {
          map.setCenter(to)
          map.setZoom(15)
        } else {
          map.setCenter(defaultCenter)
          map.setZoom(12)
        }
      } catch {
        setError('Carte momentanément indisponible')
      }
    }

    initialiseMap()

    return () => {
      cancelled = true
    }
  }, [
    clearMapObjects,
    drawMarkers,
    drawRoute,
    fromLat,
    fromLng,
    toLat,
    toLng,
  ])

  useEffect(() => {
    return () => {
      clearMapObjects()
    }
  }, [clearMapObjects])

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#f7faf7] ${className}`}>
      <div ref={mapElementRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/70 to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/60 to-transparent" />

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f7faf7] px-6 text-center">
          <div className="rounded-3xl bg-white px-5 py-4 shadow-lg">
            <p className="text-sm font-bold text-[#083b21]">
              {error}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Vérifie la connexion puis réessaie.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}