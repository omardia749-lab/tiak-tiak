'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

interface MapViewProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

export default function MapView({ fromLat, fromLng, toLat, toLng }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Nettoyage complet avant init
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
    const container = containerRef.current as any
    if (container._leaflet_id) container._leaflet_id = null

    let L: any

    import('leaflet').then((mod) => {
      L = mod
      if (!containerRef.current) return
      const c = containerRef.current as any
      if (c._leaflet_id) c._leaflet_id = null

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      })
      mapRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Marqueur départ — pulsation verte
      const fromIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:28px;height:28px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#1DB954;opacity:0.3;animation:tpulse 1.8s ease-out infinite;"></div>
          <div style="position:absolute;top:5px;left:5px;width:18px;height:18px;border-radius:50%;background:#1DB954;border:3px solid white;box-shadow:0 2px 8px rgba(29,185,84,0.6);"></div>
          <style>@keyframes tpulse{0%{transform:scale(1);opacity:0.4}70%{transform:scale(2.2);opacity:0}100%{transform:scale(1);opacity:0}}</style>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      // Marqueur destination — pin rouge qui rebondit
      const toIcon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:40px;animation:tbounce 2s ease infinite;">
          <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:linear-gradient(135deg,#E53935,#B71C1C);border:3px solid white;box-shadow:0 4px 12px rgba(229,57,53,0.5);transform:rotate(-45deg);"></div>
          <div style="position:absolute;top:7px;left:7px;width:12px;height:12px;border-radius:50%;background:white;"></div>
          <style>@keyframes tbounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}</style>
        </div>`,
        iconSize: [30, 40],
        iconAnchor: [14, 38],
      })

      L.marker([fromLat, fromLng], { icon: fromIcon }).addTo(map)
      L.marker([toLat, toLng], { icon: toIcon }).addTo(map)

      map.fitBounds(
        L.latLngBounds([[fromLat, fromLng], [toLat, toLng]]),
        { padding: [40, 40], animate: true, duration: 1.2 }
      )

      fetch(`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
          if (!mapRef.current) return
          if (data.routes?.[0]) {
            const coords = data.routes[0].geometry.coordinates.map(
              ([lng, lat]: [number, number]) => [lat, lng]
            )
            // Ombre
            L.polyline(coords, { color: '#0a3d25', weight: 9, opacity: 0.25, lineCap: 'round', lineJoin: 'round' }).addTo(map)
            // Route verte
            L.polyline(coords, { color: '#1DB954', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map)
            // Lumière animée
            const animLine = L.polyline(coords, {
              color: 'white', weight: 2, opacity: 0.9,
              lineCap: 'round', dashArray: '12, 40', dashOffset: '0',
            }).addTo(map)

            let offset = 0
            const animate = () => {
              if (!mapRef.current) return
              offset -= 2
              const el = (animLine as any)._path
              if (el) el.style.strokeDashoffset = String(offset)
              animFrameRef.current = requestAnimationFrame(animate)
            }
            animFrameRef.current = requestAnimationFrame(animate)

            map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], animate: true, duration: 1.0 })
          } else {
            L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#1DB954', weight: 4, dashArray: '10,8' }).addTo(map)
          }
        })
        .catch(() => {
          if (!mapRef.current) return
          L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#1DB954', weight: 4, dashArray: '10,8' }).addTo(map)
        })
    })

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      if (containerRef.current) {
        (containerRef.current as any)._leaflet_id = null
      }
    }
  }, [fromLat, fromLng, toLat, toLng])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}