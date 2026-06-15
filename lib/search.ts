export interface Place {
  name: string
  address: string
  lat: number
  lng: number
  category?: string
  icon?: string
  distance?: number
  placeId?: string
}

const API_BASE = '/api/places'

const getCategoryIcon = (types: string[]): { icon: string; category: string } => {
  if (types.some(t => ['hospital', 'health', 'pharmacy', 'doctor', 'medical_lab'].includes(t))) return { icon: '🏥', category: 'Santé' }
  if (types.some(t => ['school', 'university', 'primary_school', 'secondary_school'].includes(t))) return { icon: '🏫', category: 'École' }
  if (types.some(t => ['restaurant', 'cafe', 'food', 'bakery', 'meal_takeaway'].includes(t))) return { icon: '🍽️', category: 'Restaurant' }
  if (types.some(t => ['mosque', 'church', 'place_of_worship'].includes(t))) return { icon: '🕌', category: 'Lieu de culte' }
  if (types.some(t => ['bank', 'atm'].includes(t))) return { icon: '🏦', category: 'Banque' }
  if (types.includes('gas_station')) return { icon: '⛽', category: 'Station' }
  if (types.some(t => ['supermarket', 'grocery_or_supermarket', 'store', 'shopping_mall', 'market'].includes(t))) return { icon: '🛒', category: 'Marché' }
  if (types.some(t => ['stadium', 'sports_complex', 'sports_activity_location'].includes(t))) return { icon: '🏟️', category: 'Stade' }
  if (types.includes('police')) return { icon: '🚔', category: 'Police' }
  if (types.some(t => ['bus_station', 'transit_station', 'taxi_stand'].includes(t))) return { icon: '🚌', category: 'Transport' }
  if (types.some(t => ['lodging', 'hotel'].includes(t))) return { icon: '🏨', category: 'Hôtel' }
  if (types.includes('airport')) return { icon: '✈️', category: 'Aéroport' }
  if (types.some(t => ['neighborhood', 'sublocality', 'sublocality_level_1'].includes(t))) return { icon: '📍', category: 'Quartier' }
  if (types.some(t => ['locality', 'administrative_area_level_2'].includes(t))) return { icon: '🏙️', category: 'Ville' }
  if (types.some(t => ['route', 'street_address'].includes(t))) return { icon: '🛣️', category: 'Rue' }
  return { icon: '📍', category: 'Lieu' }
}

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10
}

export async function searchPlaces(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (query.length < 1) return []
  try {
    const params = new URLSearchParams({
      input: query,
      type: 'textsearch',
      ...(userLat && userLng ? { lat: String(userLat), lng: String(userLng) } : {})
    })
    const res = await fetch(`${API_BASE}?${params}`)
    const data = await res.json()
    return parsePlacesResponse(data, userLat, userLng)
  } catch {
    return []
  }
}

export async function searchPlacesAutocomplete(input: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (input.length < 1) return []
  try {
    const params = new URLSearchParams({
      input,
      type: 'autocomplete',
      ...(userLat && userLng ? { lat: String(userLat), lng: String(userLng) } : {})
    })
    const res = await fetch(`${API_BASE}?${params}`)
    const data = await res.json()
    return parsePlacesResponse(data, userLat, userLng)
  } catch {
    return []
  }
}

function parsePlacesResponse(data: any, userLat?: number, userLng?: number): Place[] {
  const places = data.places || data.results || []
  return places.slice(0, 8).map((item: any) => {
    const types = item.types || []
    const { icon, category } = getCategoryIcon(types)
    const lat = item.location?.latitude || item.geometry?.location?.lat || 0
    const lng = item.location?.longitude || item.geometry?.location?.lng || 0
    const name = item.displayName?.text || item.name || item.formatted_address?.split(',')[0] || ''
    const address = item.formattedAddress || item.formatted_address || ''
    const distance = userLat && userLng && lat && lng ? haversine(userLat, userLng, lat, lng) : undefined
    return { name, address, lat, lng, category, icon, distance, placeId: item.id || item.place_id }
  })
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const params = new URLSearchParams({ input: `${lat},${lng}`, type: 'geocode' })
    const res = await fetch(`${API_BASE}?${params}`)
    const data = await res.json()
    if (data.status !== 'OK') return 'Position actuelle'
    const result = data.results?.[0]
    if (!result) return 'Position actuelle'
    const components = result.address_components || []
    const neighbourhood = components.find((c: any) => c.types.includes('neighborhood') || c.types.includes('sublocality'))?.long_name
    const city = components.find((c: any) => c.types.includes('locality'))?.long_name
    if (neighbourhood && city) return `${neighbourhood}, ${city}`
    return city || result.formatted_address?.split(',')[0] || 'Position actuelle'
  } catch {
    return 'Position actuelle'
  }
}