'use client'

import { useEffect, useRef, useCallback } from 'react'

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
    if (googleMapsLoaded) { resolve(); return }
    googleMapsCallbacks.push(resolve)
    if (googleMapsLoading) return
    googleMapsLoading = true
    window.initGoogleMaps = () => {
      googleMapsLoaded = true
      googleMapsCallbacks.forEach(cb => cb())
      googleMapsCallbacks.length = 0
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,marker&callback=initGoogleMaps&language=fr&v=beta`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

// Cacher logo Google globalement
function hideGoogleLogo() {
  const style = document.getElementById('hide-google-logo')
  if (style) return
  const s = document.createElement('style')
  s.id = 'hide-google-logo'
  s.textContent = `
    .gmnoprint, .gm-style-cc, 
    a[href*="maps.google.com"],
    .gm-style a[target="_blank"],
    .gm-bundled-control,
    .gm-svpc,
    button[title="Activer/désactiver le mode plein écran"],
    .gm-fullscreen-control { 
      display: none !important; 
    }
  `
  document.head.appendChild(s)
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
  const routePolylineRef = useRef<any>(null)
  const arrivalMarkerRef = useRef<any>(null)
  const etaMarkerRef = useRef<any>(null)

  const createMotoElement = useCallback((color?: string, heading = 0, eta?: number, isAssigned = false) => {
    const motoColor = getMotoColor(color)
    const ringColor = isAssigned ? '#0F5138' : 'white'
    const div = document.createElement('div')
    div.style.display = 'flex'
    div.style.flexDirection = 'column'
    div.style.alignItems = 'center'
    div.style.gap = '3px'
    div.innerHTML = `
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
      ${eta !== undefined ? `<div style="background:#1DB954;color:white;font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">${eta} min</div>` : ''}
    `
    return div
  }, [])

  const drawRoute = useCallback(async (map: any, from: {lat: number, lng: number}, to: {lat: number, lng: number}) => {
    // Nettoyer anciens éléments
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null }
    if (arrivalMarkerRef.current) { arrivalMarkerRef.current.map = null; arrivalMarkerRef.current = null }
    if (etaMarkerRef.current) { etaMarkerRef.current.map = null; etaMarkerRef.current = null }

    const samePoint = Math.abs(from.lat - to.lat) < 0.0001 && Math.abs(from.lng - to.lng) < 0.0001
    if (samePoint) return

    try {
      const directionsService = new window.google.maps.DirectionsService()

      const result = await new Promise<any>((resolve, reject) => {
        directionsService.route({
          origin: new window.google.maps.LatLng(from.lat, from.lng),
          destination: new window.google.maps.LatLng(to.lat, to.lng),
          travelMode: window.google.maps.TravelMode.DRIVING,
          region: 'sn',
        }, (result: any, status: any) => {
          if (status === 'OK') resolve(result)
          else reject(new Error(status))
        })
      })

      const route = result.routes[0]
      const leg = route.legs[0]
      const path: any[] = []
      route.legs.forEach((l: any) => {
        l.steps.forEach((s: any) => {
          s.path.forEach((p: any) => path.push(p))
        })
      })

      // Callback coords pour le chauffeur
      if (onRouteCoords) {
        const coords: [number, number][] = path.map((p: any) => [p.lat(), p.lng()])
        onRouteCoords(coords)
      }

      // Tracé de route vert comme Yango
      routePolylineRef.current = new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#1DB954',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map,
        zIndex: 10,
      })

      // Badge heure d'arrivée
      const durationSec = leg.duration?.value || 0
      const arrivalDate = new Date(Date.now() + durationSec * 1000)
      const arrivalStr = arrivalDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const etaMin = Math.max(1, Math.round(durationSec / 60))

      const arrivalDiv = document.createElement('div')
      arrivalDiv.innerHTML = `<div style="background:white;color:#111;font-size:12px;font-weight:700;padding:6px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:1px solid #eee;transform:translateX(-50%) translateY(-110%);">arrivée à ${arrivalStr}</div>`
      arrivalMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: to,
        map,
        content: arrivalDiv.firstChild as HTMLElement,
        zIndex: 1000,
      })

      // Badge ETA au milieu du tracé
      const midIdx = Math.floor(path.length / 2)
      const midPoint = path[midIdx]
      const etaDiv = document.createElement('div')
      etaDiv.innerHTML = `<div style="background:#1DB954;color:white;font-size:13px;font-weight:800;padding:5px 11px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:translateX(-50%) translateY(-50%);">${etaMin} min</div>`
      etaMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: midPoint,
        map,
        content: etaDiv.firstChild as HTMLElement,
        zIndex: 999,
      })

      // Zoom sur le trajet
      const bounds = new window.google.maps.LatLngBounds()
      path.forEach((p: any) => bounds.extend(p))
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 60, left: 60 })

    } catch {
      // Fallback ligne droite si Google Directions échoue
      routePolylineRef.current = new window.google.maps.Polyline({
        path: [from, to],
        geodesic: true,
        strokeColor: '#1DB954',
        strokeOpacity: 0.7,
        strokeWeight: 4,
        strokeDasharray: '8 4',
        map,
      })
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(from)
      bounds.extend(to)
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 60, left: 60 })
    }
  }, [onRouteCoords])

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!apiKey || !containerRef.current) return

    loadGoogleMaps(apiKey).then(() => {
      if (!containerRef.current) return
      hideGoogleLogo()

      const map = new window.google.maps.Map(containerRef.current, {
        center: { lat: fromLat, lng: fromLng },
        zoom: 14,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        backgroundColor: '#f8f8f8',
      })
      mapRef.current = map

      // Cacher logo après chargement de la carte
      window.google.maps.event.addListenerOnce(map, 'idle', hideGoogleLogo)

      // Marqueur départ — point vert
      const fromDiv = document.createElement('div')
      fromDiv.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:#1DB954;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`
      new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: fromLat, lng: fromLng },
        map,
        content: fromDiv.firstChild as HTMLElement,
        zIndex: 100,
      })

      const samePoint = Math.abs(fromLat - toLat) < 0.0001 && Math.abs(fromLng - toLng) < 0.0001

      // Marqueur destination — épingle rouge
      if (!samePoint) {
        const toDiv = document.createElement('div')
        toDiv.innerHTML = `<div style="width:22px;height:30px;transform:translateX(-50%) translateY(-100%);"><svg width="22" height="30" viewBox="0 0 22 30" fill="none"><path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.925 17.075 0 11 0z" fill="#E53935"/><circle cx="11" cy="11" r="4.5" fill="white"/></svg></div>`
        new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat: toLat, lng: toLng },
          map,
          content: toDiv.firstChild as HTMLElement,
          zIndex: 100,
        })
      }

      // Marqueurs motos proches
      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          const el = createMotoElement(d.motoColor, 0, d.eta, false)
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: d.lat, lng: d.lng },
            map,
            content: el,
          })
          nearbyMarkersRef.current.push(marker)
        })
      }

      // Marqueur chauffeur assigné
      if (showDriver && driverLat && driverLng) {
        const el = createMotoElement(driverMotoColor, 0, undefined, true)
        driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
          position: { lat: driverLat, lng: driverLng },
          map,
          content: el,
        })
      }

      if (!samePoint) {
        drawRoute(map, { lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng })
      } else {
        if (showNearby && nearbyDrivers.length > 0) {
          const bounds = new window.google.maps.LatLngBounds()
          bounds.extend({ lat: fromLat, lng: fromLng })
          nearbyDrivers.forEach(d => bounds.extend({ lat: d.lat, lng: d.lng }))
          map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
        } else {
          map.setCenter({ lat: fromLat, lng: fromLng })
          map.setZoom(15)
        }
      }
    })

    return () => {
      if (routePolylineRef.current) routePolylineRef.current.setMap(null)
      if (arrivalMarkerRef.current) arrivalMarkerRef.current.map = null
      if (etaMarkerRef.current) etaMarkerRef.current.map = null
      nearbyMarkersRef.current.forEach(m => { try { m.map = null } catch {} })
      nearbyMarkersRef.current = []
      mapRef.current = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby])

  useEffect(() => {
    if (!mapRef.current || !window.google || !showDriver || !driverLat || !driverLng) return
    if (driverMarkerRef.current) {
      driverMarkerRef.current.position = { lat: driverLat, lng: driverLng }
    } else {
      const el = createMotoElement(driverMotoColor, 0, undefined, true)
      driverMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: driverLat, lng: driverLng },
        map: mapRef.current,
        content: el,
      })
    }
    if (mode === 'driver') {
      mapRef.current.setCenter({ lat: driverLat, lng: driverLng })
      mapRef.current.setZoom(17)
    }
  }, [driverLat, driverLng, showDriver, createMotoElement, mode, driverMotoColor])

  useEffect(() => {
    if (!mapRef.current || !window.google || !showNearby) return
    nearbyMarkersRef.current.forEach(m => { try { m.map = null } catch {} })
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      const el = createMotoElement(d.motoColor, 0, d.eta, false)
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: d.lat, lng: d.lng },
        map: mapRef.current,
        content: el,
      })
      nearbyMarkersRef.current.push(marker)
    })
  }, [nearbyDrivers, showNearby, createMotoElement])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
    />
  )
}