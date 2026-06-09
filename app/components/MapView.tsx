'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

interface Driver {
  id: string
  lat: number
  lng: number
  name: string
  eta?: number
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
  nearbyDrivers?: Driver[]
  showNearby?: boolean
}

export default function MapView({
  fromLat, fromLng, toLat, toLng,
  driverLat, driverLng,
  showDriver = false,
  mode = 'client',
  nearbyDrivers = [],
  showNearby = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const animFrameRef = useRef<number | null>(null)
  const driverMarkerRef = useRef<any>(null)
  const nearbyMarkersRef = useRef<any[]>([])
  const LRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    const container = containerRef.current as any
    if (container._leaflet_id) container._leaflet_id = null

    import('leaflet').then((mod) => {
      const L = mod
      LRef.current = L
      if (!containerRef.current) return
      const c = containerRef.current as any
      if (c._leaflet_id) c._leaflet_id = null

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      })
      mapRef.current = map

      // Tuiles style cartoon/dessin animé — Stamen Watercolor
      L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      // ===== MARQUEURS =====

      // Point vert pulsant (position client / départ)
      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:22px;height:22px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#1DB954;opacity:0.35;animation:tpulse 1.8s ease-out infinite;"></div>
          <div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#1DB954;border:2.5px solid white;box-shadow:0 2px 8px rgba(29,185,84,0.7);"></div>
          <style>@keyframes tpulse{0%{transform:scale(1);opacity:0.4}70%{transform:scale(2.8);opacity:0}100%{transform:scale(1);opacity:0}}</style>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })

      // Pin rouge destination
      const toIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:26px;height:34px;">
          <div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#E53935;border:2.5px solid white;box-shadow:0 3px 10px rgba(229,57,53,0.6);transform:rotate(-45deg);"></div>
          <div style="position:absolute;top:5px;left:5px;width:12px;height:12px;border-radius:50%;background:white;opacity:0.9;"></div>
        </div>`,
        iconSize: [26, 34],
        iconAnchor: [13, 32],
      })

      // Icône moto chauffeur assigné
      const motoIcon = (premium = false) => L.divIcon({
        className: '',
        html: `<div style="position:relative;width:40px;height:40px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:${premium ? '#1D6BF5' : '#0F5138'};opacity:0.2;animation:tpulse 2s ease-out infinite;"></div>
          <div style="position:absolute;top:2px;left:2px;width:36px;height:36px;border-radius:50%;background:${premium ? '#1D6BF5' : '#0F5138'};border:2.5px solid white;box-shadow:0 3px 12px rgba(15,81,56,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>
          ${premium ? '<div style="position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:#1D6BF5;border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:900;">✓</div>' : ''}
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      // Icône moto proche (carte accueil)
      const nearbyMotoIcon = (eta: number) => L.divIcon({
        className: '',
        html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="width:34px;height:34px;border-radius:50%;background:#0F5138;border:2px solid white;box-shadow:0 2px 8px rgba(15,81,56,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>
          <div style="margin-top:2px;background:#0F5138;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:8px;white-space:nowrap;">${eta} min</div>
        </div>`,
        iconSize: [34, 48],
        iconAnchor: [17, 48],
      })

      L.marker([fromLat, fromLng], { icon: fromIcon }).addTo(map)

      // N'afficher la destination que si c'est pas le même point
      if (Math.abs(fromLat - toLat) > 0.0001 || Math.abs(fromLng - toLng) > 0.0001) {
        L.marker([toLat, toLng], { icon: toIcon }).addTo(map)
      }

      // Chauffeurs proches sur carte accueil
      if (showNearby && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(d => {
          const m = L.marker([d.lat, d.lng], { icon: nearbyMotoIcon(d.eta || 5) }).addTo(map)
          nearbyMarkersRef.current.push(m)
        })
        const allPoints = [[fromLat, fromLng], ...nearbyDrivers.map(d => [d.lat, d.lng])]
        map.fitBounds(L.latLngBounds(allPoints as any), { padding: [50, 50], maxZoom: 15, animate: true })
      }

      // Chauffeur assigné
      if (showDriver && driverLat && driverLng) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: motoIcon() }).addTo(map)
      }

      // ===== ITINÉRAIRE OSRM =====
      if (Math.abs(fromLat - toLat) > 0.0001 || Math.abs(fromLng - toLng) > 0.0001) {
        const fetchRoute = async () => {
          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`
            const res = await fetch(url)
            const data = await res.json()
            if (!mapRef.current) return

            if (data.routes?.[0]) {
              const coords = data.routes[0].geometry.coordinates.map(
                ([lng, lat]: [number, number]) => [lat, lng]
              )

              // Contour blanc épais pour effet cartoon
              L.polyline(coords, {
                color: 'white',
                weight: 7,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map)

              // Route principale verte
              L.polyline(coords, {
                color: '#1DB954',
                weight: 4,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map)

              // Pointillés animés blanc
              const animLine = L.polyline(coords, {
                color: 'rgba(255,255,255,0.8)',
                weight: 2,
                opacity: 1,
                lineCap: 'round',
                dashArray: '6, 20',
                dashOffset: '0',
              }).addTo(map)

              let offset = 0
              const animate = () => {
                if (!mapRef.current) return
                offset -= 1
                const el = (animLine as any)._path
                if (el) el.style.strokeDashoffset = String(offset)
                animFrameRef.current = requestAnimationFrame(animate)
              }
              animFrameRef.current = requestAnimationFrame(animate)

              // Zoom adapté
              const allPoints: any[] = [...coords]
              if (showDriver && driverLat && driverLng) allPoints.push([driverLat, driverLng])

              map.fitBounds(L.latLngBounds(allPoints), {
                padding: [50, 50],
                animate: true,
                duration: 0.8,
                maxZoom: 16,
              })
            } else {
              // Fallback ligne droite
              L.polyline([[fromLat, fromLng], [toLat, toLng]], {
                color: 'white', weight: 7, lineCap: 'round'
              }).addTo(map)
              L.polyline([[fromLat, fromLng], [toLat, toLng]], {
                color: '#1DB954', weight: 4, lineCap: 'round'
              }).addTo(map)
              map.fitBounds(L.latLngBounds([[fromLat, fromLng], [toLat, toLng]]), { padding: [50, 50], maxZoom: 15 })
            }
          } catch {
            if (!mapRef.current) return
            L.polyline([[fromLat, fromLng], [toLat, toLng]], {
              color: 'white', weight: 7, lineCap: 'round'
            }).addTo(map)
            L.polyline([[fromLat, fromLng], [toLat, toLng]], {
              color: '#1DB954', weight: 4, lineCap: 'round'
            }).addTo(map)
            map.fitBounds(L.latLngBounds([[fromLat, fromLng], [toLat, toLng]]), { padding: [50, 50], maxZoom: 15 })
          }
        }
        fetchRoute()
      } else {
        // Même point — juste centrer
        map.setView([fromLat, fromLng], 15)
      }
    })

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      if (containerRef.current) (containerRef.current as any)._leaflet_id = null
    }
  }, [fromLat, fromLng, toLat, toLng, showNearby])

  // Mise à jour moto assignée en temps réel
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showDriver || !driverLat || !driverLng) return
    const L = LRef.current
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng])
    } else {
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:40px;height:40px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#0F5138;opacity:0.2;animation:tpulse 2s ease-out infinite;"></div>
          <div style="position:absolute;top:2px;left:2px;width:36px;height:36px;border-radius:50%;background:#0F5138;border:2.5px solid white;box-shadow:0 3px 12px rgba(15,81,56,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })
      driverMarkerRef.current = L.marker([driverLat, driverLng], { icon }).addTo(mapRef.current)
    }
  }, [driverLat, driverLng, showDriver])

  // Mise à jour chauffeurs proches
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !showNearby) return
    const L = LRef.current
    nearbyMarkersRef.current.forEach(m => m.remove())
    nearbyMarkersRef.current = []
    nearbyDrivers.forEach(d => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="width:34px;height:34px;border-radius:50%;background:#0F5138;border:2px solid white;box-shadow:0 2px 8px rgba(15,81,56,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>
          <div style="margin-top:2px;background:#0F5138;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:8px;white-space:nowrap;">${d.eta || 5} min</div>
        </div>`,
        iconSize: [34, 48],
        iconAnchor: [17, 48],
      })
      const m = L.marker([d.lat, d.lng], { icon }).addTo(mapRef.current)
      nearbyMarkersRef.current.push(m)
    })
  }, [nearbyDrivers, showNearby])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}