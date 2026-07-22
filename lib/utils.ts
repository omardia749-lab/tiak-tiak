export const WAVE_PAYMENT_LINK = 'https://pay.wave.com/m/M_sn_E4kXre9QgO9U/c/sn/'

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function calculatePrice(km: number, service: 'moto' | 'livraison'): number {
  let price: number
  if (service === 'livraison') {
    price = 700 + 250 * km
  } else {
    price = 500 + 200 * km
  }
  price = Math.max(price, 600)
  return Math.round(price / 100) * 100
}

export function calculateCommission(price: number, isPremium: boolean, serviceType: 'moto' | 'livraison' = 'moto'): number {
  if (isPremium) {
    return serviceType === 'livraison' ? 200 : 100
  }
  if (serviceType === 'livraison') {
    return price >= 3000 ? 500 : 200
  }
  if (price < 2000) return 100
  if (price < 5000) return 200
  return 400
}

export function applyFirstRideDiscount(price: number, isFirstRide: boolean): number {
  if (!isFirstRide) return price
  const discounted = price * 0.9
  return Math.round(discounted / 50) * 50
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(price)) + ' FCFA'
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function calculateETA(km: number): number {
  return Math.max(2, Math.round((km / 40) * 60))
}

export function formatETA(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h${m > 0 ? m + 'min' : ''}`
}