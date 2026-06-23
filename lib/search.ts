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

const getGoogleIcon = (types: string[]): { icon: string; category: string } => {
  if (types.includes('hospital') || types.includes('pharmacy') || types.includes('doctor')) return { icon: '🏥', category: 'Santé' }
  if (types.includes('school') || types.includes('university')) return { icon: '🏫', category: 'École' }
  if (types.includes('restaurant') || types.includes('cafe') || types.includes('food')) return { icon: '🍽️', category: 'Restaurant' }
  if (types.includes('mosque') || types.includes('church') || types.includes('place_of_worship')) return { icon: '🕌', category: 'Lieu de culte' }
  if (types.includes('bank') || types.includes('atm')) return { icon: '🏦', category: 'Banque' }
  if (types.includes('gas_station')) return { icon: '⛽', category: 'Station' }
  if (types.includes('shopping_mall') || types.includes('store') || types.includes('supermarket')) return { icon: '🛍️', category: 'Magasin' }
  if (types.includes('police')) return { icon: '🚔', category: 'Police' }
  if (types.includes('bus_station') || types.includes('transit_station')) return { icon: '🚌', category: 'Transport' }
  if (types.includes('hotel') || types.includes('lodging')) return { icon: '🏨', category: 'Hôtel' }
  if (types.includes('stadium') || types.includes('sports_complex')) return { icon: '🏟️', category: 'Stade' }
  if (types.includes('airport')) return { icon: '✈️', category: 'Aéroport' }
  if (types.includes('neighborhood') || types.includes('sublocality')) return { icon: '📍', category: 'Quartier' }
  if (types.includes('locality') || types.includes('city')) return { icon: '🏙️', category: 'Ville' }
  if (types.includes('route') || types.includes('street_address')) return { icon: '🛣️', category: 'Rue' }
  if (types.includes('market')) return { icon: '🛒', category: 'Marché' }
  return { icon: '📍', category: 'Lieu' }
}

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

// ── GOOGLE PLACES (priorité absolue) ──────────────────────────
async function fetchGooglePlaces(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  try {
    const location = userLat && userLng ? `&location=${userLat},${userLng}` : ''
    const url = `/api/places?query=${encodeURIComponent(query)}${location}`
    const response = await fetch(url)
    if (!response.ok) return []
    const data = await response.json()
    if (!data.results || data.results.length === 0) return []
    
    return data.results.map((r: any) => {
      const { icon, category } = getGoogleIcon(r.types || [])
      const lat = r.geometry.location.lat
      const lng = r.geometry.location.lng
      const distance = userLat && userLng ? haversine(userLat, userLng, lat, lng) : undefined
      return {
        name: r.name || r.formatted_address.split(',')[0],
        address: r.formatted_address || r.vicinity || 'Sénégal',
        lat,
        lng,
        icon,
        category,
        distance,
      }
    })
  } catch {
    return []
  }
}

// ── LOCATIONIQ (fallback 1) ────────────────────────────────────
async function fetchLocationIQ(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  try {
    const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(query)}&countrycodes=sn&format=json&addressdetails=1&extratags=1&limit=10&accept-language=fr`
    const response = await fetch(url)
    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return parseOSMResults(data, userLat, userLng)
  } catch {
    return []
  }
}

// ── NOMINATIM (fallback 2) ─────────────────────────────────────
async function fetchNominatim(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=sn&format=json&addressdetails=1&extratags=1&limit=10&accept-language=fr`
    const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
    if (!response.ok) return []
    const data = await response.json()
    return parseOSMResults(data, userLat, userLng)
  } catch {
    return []
  }
}

const parseOSMResults = (raw: any[], userLat?: number, userLng?: number): Place[] => {
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
  return places.filter(p => {
    const key = `${p.name}-${p.lat.toFixed(3)}-${p.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── RECHERCHE PRINCIPALE ───────────────────────────────────────
export async function searchPlaces(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (query.length < 2) return []

  const cacheKey = `${query.toLowerCase().trim()}-${userLat?.toFixed(2)}-${userLng?.toFixed(2)}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }

  // 1. Google Places en priorité — tous les lieux du Sénégal
  let result = await fetchGooglePlaces(`${query} Sénégal`, userLat, userLng)

  // 2. Si Google retourne rien → LocationIQ
  if (result.length === 0) {
    result = await fetchLocationIQ(`${query} Sénégal`, userLat, userLng)
  }

  // 3. Si LocationIQ retourne rien → Nominatim
  if (result.length === 0) {
    result = await fetchNominatim(`${query} Sénégal`, userLat, userLng)
  }

  // 4. Dernier essai sans "Sénégal"
  if (result.length === 0) {
    result = await fetchGooglePlaces(query, userLat, userLng)
  }

  // Tri par distance
  if (userLat && userLng) {
    result.sort((a, b) => (a.distance || 999) - (b.distance || 999))
  }

  searchCache.set(cacheKey, { data: result, timestamp: Date.now() })
  if (searchCache.size > 100) {
    const firstKey = searchCache.keys().next().value
    if (firstKey) searchCache.delete(firstKey)
  }

  return result
}

// ── REVERSE GEOCODING ──────────────────────────────────────────
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Google Geocoding en priorité
  try {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (key) {
      const url = `/api/geocode?lat=${lat}&lng=${lng}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        if (data.address) return data.address
      }
    }
  } catch {}

  // LocationIQ fallback
  try {
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

  // Nominatim dernier recours
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