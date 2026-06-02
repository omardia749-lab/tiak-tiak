'use client'

import { useEffect, useRef } from 'react'

interface MapViewProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  fromLabel?: string
  toLabel?: string
}

export default function MapView({ fromLat, fromLng, toLat, toLng }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let L: any

    const initMap = async () => {
      L = (await import('leaflet')).default

      // Charger le CSS de Leaflet
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      if (!mapRef.current || mapInstance.current) return

      // Centre entre les deux points
      const centerLat = (fromLat + toLat) / 2
      const centerLng = (fromLng + toLng) / 2

      const map = L.map(mapRef.current, {
        center: [centerLat, centerLng],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      })
      mapInstance.current = map

      // Tuiles style clair moderne (CARTO Voyager)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Icône départ (vert)
      const fromIcon = L.divIcon({
        html: '<div style="background:#1DB954;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })

      // Icône destination (rouge)
      const toIcon = L.divIcon({
        html: '<div style="background:#EF4444;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })

      L.marker([fromLat, fromLng], { icon: fromIcon }).addTo(map)
      L.marker([toLat, toLng], { icon: toIcon }).addTo(map)

      // Ligne verte entre les deux points
      L.polyline([[fromLat, fromLng], [toLat, toLng]], {
        color: '#0F5138',
        weight: 4,
        opacity: 0.7,
        dashArray: '8, 8',
      }).addTo(map)

      // Ajuster la vue pour voir les deux points
      const bounds = L.latLngBounds([[fromLat, fromLng], [toLat, toLng]])
      map.fitBounds(bounds, { padding: [50, 50] })
    }

    initMap()

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [fromLat, fromLng, toLat, toLng])

  return <div ref={mapRef} className="w-full h-full" />
}