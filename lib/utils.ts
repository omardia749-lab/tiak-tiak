export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function calculatePrice(km: number, service: 'moto' | 'livraison'): number {
  const raw = service === 'moto' ? 500 + (200 * km) : 700 + (250 * km)
  return Math.max(600, Math.ceil(raw / 100) * 100)
}

export function calculateCommission(price: number): number {
  return price <= 1500 ? 100 : 250
}

export function formatPrice(price: number): string {
  return `${price.toLocaleString('fr-FR')} FCFA`
}

export function calculateETA(km: number): number {
  return Math.ceil((km / 25) * 60)
}

export function formatETA(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes/60)}h${minutes%60 > 0 ? minutes%60 + 'min' : ''}`
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export const DESTINATIONS_SENEGAL = [
  { name: 'Marche Sandaga', address: 'Plateau, Dakar', lat: 14.6928, lng: -17.4447 },
  { name: 'Aeroport AIBD', address: 'Diass, Thies', lat: 14.6700, lng: -17.0700 },
  { name: 'Universite UCAD', address: 'Fann, Dakar', lat: 14.6920, lng: -17.4680 },
  { name: 'Hopital Principal', address: 'Plateau, Dakar', lat: 14.6870, lng: -17.4440 },
  { name: 'Gare Routiere Pompiers', address: 'Dakar', lat: 14.7000, lng: -17.4600 },
  { name: 'Stade LSS', address: 'Leopold, Dakar', lat: 14.7010, lng: -17.4630 },
  { name: 'Touba', address: 'Diourbel', lat: 14.8500, lng: -15.8800 },
  { name: 'Thies Centre', address: 'Thies', lat: 14.7886, lng: -16.9260 },
  { name: 'Saint-Louis', address: 'Saint-Louis', lat: 16.0179, lng: -16.4897 },
  { name: 'Mbour', address: 'Thies', lat: 14.3800, lng: -16.9700 },
  { name: 'Kaolack', address: 'Kaolack', lat: 14.1520, lng: -16.0760 },
  { name: 'Yoff', address: 'Dakar', lat: 14.7480, lng: -17.4920 },
  { name: 'Almadies', address: 'Dakar', lat: 14.7430, lng: -17.5250 },
  { name: 'Guediawaye', address: 'Dakar', lat: 14.7700, lng: -17.4000 },
  { name: 'Pikine', address: 'Dakar', lat: 14.7500, lng: -17.3900 },
  { name: 'Grand-Yoff', address: 'Dakar', lat: 14.7300, lng: -17.4550 },
  { name: 'Parcelles Assainies', address: 'Dakar', lat: 14.7600, lng: -17.4200 },
  { name: 'Mermoz', address: 'Dakar', lat: 14.7050, lng: -17.4850 },
  { name: 'Liberte 6', address: 'Dakar', lat: 14.7200, lng: -17.4500 },
  { name: 'HLM', address: 'Dakar', lat: 14.7100, lng: -17.4600 },
  { name: 'Medina', address: 'Dakar', lat: 14.7000, lng: -17.4500 },
  { name: 'Rufisque Centre', address: 'Rufisque', lat: 14.7167, lng: -17.2833 },
  { name: 'Bargny', address: 'Dakar', lat: 14.6960, lng: -17.2250 },
  { name: 'Ziguinchor', address: 'Ziguinchor', lat: 12.5681, lng: -16.2719 },
]