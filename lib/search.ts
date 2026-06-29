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

// Centre par défaut : Dakar
const DEFAULT_LAT = 14.7167
const DEFAULT_LNG = -17.4677

const getCategoryIcon = (
  type: string,
  classType: string
): { icon: string; category: string } => {
  if (classType === 'amenity') {
    if (type === 'hospital' || type === 'clinic' || type === 'pharmacy' || type === 'doctors')
      return { icon: '🏥', category: 'Santé' }
    if (type === 'school' || type === 'university' || type === 'college')
      return { icon: '🏫', category: 'École' }
    if (type === 'restaurant' || type === 'cafe' || type === 'fast_food' || type === 'bar')
      return { icon: '🍽️', category: 'Restaurant' }
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
    if (type === 'attraction' || type === 'viewpoint') return { icon: '📸', category: 'Lieu' }
  }
  if (classType === 'leisure') {
    if (type === 'stadium') return { icon: '🏟️', category: 'Stade' }
    if (type === 'park') return { icon: '🌳', category: 'Parc' }
  }
  if (classType === 'place') {
    if (type === 'suburb' || type === 'neighbourhood' || type === 'quarter')
      return { icon: '📍', category: 'Quartier' }
    if (type === 'city' || type === 'town' || type === 'village')
      return { icon: '🏙️', category: 'Ville' }
  }
  if (classType === 'highway') return { icon: '🛣️', category: 'Rue' }
  if (classType === 'aeroway') return { icon: '✈️', category: 'Aéroport' }
  if (classType === 'building') return { icon: '🏢', category: 'Bâtiment' }
  return { icon: '📍', category: 'Lieu' }
}

const formatAddress = (a: any): string => {
  const parts: string[] = []
  if (a.suburb) parts.push(a.suburb)
  else if (a.neighbourhood) parts.push(a.neighbourhood)
  else if (a.road) parts.push(a.road)
  if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village)
  else if (a.county) parts.push(a.county)
  if (a.state) parts.push(a.state)
  return parts.join(', ') || 'Sénégal'
}

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

const parseOSMResults = (
  raw: any[],
  userLat?: number,
  userLng?: number
): Place[] => {
  if (!Array.isArray(raw)) return []

  const places: Place[] = raw.map((item: any) => {
    const a = item.address || {}
    const { icon, category } = getCategoryIcon(item.type, item.class)
    const name =
      item.name ||
      (item.display_name ? item.display_name.split(',')[0].trim() : 'Lieu')
    const address = formatAddress(a)
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    const distance =
      userLat != null && userLng != null
        ? haversine(userLat, userLng, lat, lng)
        : undefined
    return { name, address, lat, lng, category, icon, distance }
  })

  const seen = new Set<string>()
  return places.filter((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false
    const key = `${p.name}-${p.lat.toFixed(3)}-${p.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── NOMINATIM (OpenStreetMap) — 100% gratuit, sans clé ──────────
async function fetchNominatim(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<Place[]> {
  try {
    // viewbox autour de l'utilisateur (ou Dakar) pour prioriser les lieux proches
    const cLat = userLat ?? DEFAULT_LAT
    const cLng = userLng ?? DEFAULT_LNG
    const delta = 0.5 // ~55 km autour
    const viewbox = `${cLng - delta},${cLat + delta},${cLng + delta},${cLat - delta}`

    const params =
      `q=${encodeURIComponent(query)}` +
      `&countrycodes=sn` +
      `&format=json` +
      `&addressdetails=1` +
      `&limit=12` +
      `&accept-language=fr` +
      `&viewbox=${viewbox}` +
      `&bounded=0`

    const url = `https://nominatim.openstreetmap.org/search?${params}`

    const response = await fetch(url, {
      headers: { 'Accept-Language': 'fr' },
    })

    if (!response.ok) return []

    const data = await response.json()
    return parseOSMResults(data, userLat, userLng)
  } catch {
    return []
  }
}

// ── RECHERCHE PRINCIPALE ───────────────────────────────────────
export async function searchPlaces(
  query: string,
  userLat?: number,
  userLng?: number
): Promise<Place[]> {
  if (query.trim().length < 2) return []

  const cacheKey = `${query.toLowerCase().trim()}-${userLat?.toFixed(2)}-${userLng?.toFixed(2)}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }

  // 1. Recherche avec "Sénégal" pour cibler le pays
  let result = await fetchNominatim(`${query}, Sénégal`, userLat, userLng)

  // 2. Si rien → recherche brute
  if (result.length === 0) {
    result = await fetchNominatim(query, userLat, userLng)
  }

  // Tri par distance si position connue
  if (userLat != null && userLng != null) {
    result.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))
  }

  searchCache.set(cacheKey, { data: result, timestamp: Date.now() })
  if (searchCache.size > 100) {
    const firstKey = searchCache.keys().next().value
    if (firstKey) searchCache.delete(firstKey)
  }

  return result
}

// ── REVERSE GEOCODING (adresse depuis position) — gratuit ───────
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?` +
      `lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=fr`

    const response = await fetch(url, {
      headers: { 'Accept-Language': 'fr' },
    })

    if (!response.ok) return 'Position actuelle'

    const data = await response.json()
    const a = data.address || {}
    const quartier = a.suburb || a.neighbourhood || a.road || ''
    const ville = a.city || a.town || a.village || a.county || 'Sénégal'
    return quartier ? `${quartier}, ${ville}` : ville
  } catch {
    return 'Position actuelle'
  }
}