export interface Place {
  name: string
  address: string
  lat: number
  lng: number
  category?: string
  icon?: string
  distance?: number
}

const searchCache = new Map<string, { data: Place[]; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000

const LOCATIONIQ_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_KEY || ''

const getCategoryIcon = (type: string, classType: string): { icon: string; category: string } => {
  if (classType === 'amenity') {
    if (type === 'hospital' || type === 'clinic' || type === 'pharmacy' || type === 'doctors') return { icon: '🏥', category: 'Santé' }
    if (type === 'school' || type === 'university' || type === 'college') return { icon: '🏫', category: 'École' }
    if (type === 'restaurant' || type === 'cafe' || type === 'fast_food' || type === 'bar') return { icon: '🍽️', category: 'Restaurant' }
    if (type === 'place_of_worship') return { icon: '🕌', category: 'Lieu de culte' }
    if (type === 'bank' || type === 'atm') return { icon: '🏦', category: 'Banque' }
    if (type === 'fuel') return { icon: '⛽', category: 'Station' }
    if (type === 'marketplace') return { icon: '🛒', category: 'Marché' }
    if (type === 'police') return { icon: '🚔', category: 'Police' }
    if (type === 'post_office') return { icon: '📮', category: 'Poste' }
    if (type === 'bus_station' || type === 'taxi') return { icon: '🚌', category: 'Transport' }
  }
  if (classType === 'shop') return { icon: '🛍️', category: 'Magasin' }
  if (classType === 'tourism') {
    if (type === 'hotel' || type === 'guest_house') return { icon: '🏨', category: 'Hôtel' }
  }
  if (classType === 'leisure') {
    if (type === 'stadium') return { icon: '🏟️', category: 'Stade' }
  }
  if (classType === 'place') {
    if (type === 'suburb' || type === 'neighbourhood' || type === 'quarter') return { icon: '📍', category: 'Quartier' }
    if (type === 'city' || type === 'town' || type === 'village') return { icon: '🏙️', category: 'Ville' }
  }
  if (classType === 'highway') return { icon: '🛣️', category: 'Rue' }
  if (classType === 'aeroway') return { icon: '✈️', category: 'Aéroport' }
  return { icon: '📍', category: 'Lieu' }
}

const formatAddress = (a: any): string => {
  const parts = []
  if (a.suburb) parts.push(a.suburb)
  else if (a.neighbourhood) parts.push(a.neighbourhood)
  if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village)
  if (a.state) parts.push(a.state)
  return parts.join(', ') || 'Sénégal'
}

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10
}

const parseResults = (raw: any[], userLat?: number, userLng?: number): Place[] => {
  const places: Place[] = raw.map((item: any) => {
    const a = item.address || {}
    const { icon, category } = getCategoryIcon(item.type, item.class)
    const name = item.name || item.display_name.split(',')[0].trim()
    const address = formatAddress(a)
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    const distance = userLat && userLng ? haversine(userLat, userLng, lat, lng) : undefined
    return { name, address, lat, lng, category, icon, distance }
  })

  const seen = new Set<string>()
  const deduped = places.filter(p => {
    const key = `${p.name}-${p.lat.toFixed(3)}-${p.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (userLat && userLng) {
    deduped.sort((a, b) => (a.distance || 999) - (b.distance || 999))
  }

  return deduped
}

async function fetchLocationIQ(query: string): Promise<any[]> {
  try {
    const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(query)}&countrycodes=sn&format=json&addressdetails=1&extratags=1&limit=10&accept-language=fr`
    const response = await fetch(url)
    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
}

async function fetchNominatim(query: string): Promise<any[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=sn&format=json&addressdetails=1&extratags=1&limit=10&accept-language=fr`
    const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

async function fetchWithFallback(query: string): Promise<any[]> {
  // Essaie LocationIQ en priorité
  let raw = await fetchLocationIQ(query)
  
  // Si LocationIQ échoue ou retourne rien → Nominatim en fallback
  if (raw.length === 0) {
    raw = await fetchNominatim(query)
  }
  
  return raw
}

export async function searchPlaces(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (query.length < 2) return []

  const cacheKey = query.toLowerCase().trim()
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }

  // Essai 1 : query + Sénégal
  let raw = await fetchWithFallback(`${query} Sénégal`)

  // Essai 2 : query brute
  if (raw.length === 0) {
    raw = await fetchWithFallback(query)
  }

  // Essai 3 : premier mot seulement
  if (raw.length === 0) {
    const simplified = query.split(' ')[0]
    if (simplified.length >= 3 && simplified !== query) {
      raw = await fetchWithFallback(`${simplified} Sénégal`)
    }
  }

  const result = parseResults(raw, userLat, userLng)

  searchCache.set(cacheKey, { data: result, timestamp: Date.now() })

  if (searchCache.size > 50) {
    const firstKey = searchCache.keys().next().value
    if (firstKey) searchCache.delete(firstKey)
  }

  return result
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    // LocationIQ en priorité pour le reverse geocoding
    const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json&addressdetails=1`
    const response = await fetch(url)
    if (response.ok) {
      const data = await response.json()
      const a = data.address || {}
      const quartier = a.suburb || a.neighbourhood || a.road || ''
      const ville = a.city || a.town || a.village || 'Sénégal'
      return quartier ? `${quartier}, ${ville}` : ville
    }
  } catch {}

  // Fallback Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
    const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
    if (!response.ok) return 'Position actuelle'
    const data = await response.json()
    const a = data.address || {}
    const quartier = a.suburb || a.neighbourhood || a.road || ''
    const ville = a.city || a.town || a.village || 'Sénégal'
    return quartier ? `${quartier}, ${ville}` : ville
  } catch {
    return 'Position actuelle'
  }
}