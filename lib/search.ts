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
  if (types.includes('hospital') || types.includes('health') || types.includes('pharmacy') || types.includes('doctor')) return { icon: '🏥', category: 'Santé' }
  if (types.includes('school') || types.includes('university') || types.includes('education')) return { icon: '🏫', category: 'École' }
  if (types.includes('restaurant') || types.includes('cafe') || types.includes('food') || types.includes('bakery')) return { icon: '🍽️', category: 'Restaurant' }
  if (types.includes('mosque') || types.includes('church') || types.includes('place_of_worship')) return { icon: '🕌', category: 'Lieu de culte' }
  if (types.includes('bank') || types.includes('atm') || types.includes('finance')) return { icon: '🏦', category: 'Banque' }
  if (types.includes('gas_station')) return { icon: '⛽', category: 'Station' }
  if (types.includes('supermarket') || types.includes('grocery_or_supermarket') || types.includes('store') || types.includes('shopping_mall')) return { icon: '🛒', category: 'Marché/Magasin' }
  if (types.includes('stadium') || types.includes('sports_complex')) return { icon: '🏟️', category: 'Stade' }
  if (types.includes('police')) return { icon: '🚔', category: 'Police' }
  if (types.includes('post_office')) return { icon: '📮', category: 'Poste' }
  if (types.includes('bus_station') || types.includes('transit_station') || types.includes('taxi_stand')) return { icon: '🚌', category: 'Transport' }
  if (types.includes('lodging') || types.includes('hotel')) return { icon: '🏨', category: 'Hôtel' }
  if (types.includes('neighborhood') || types.includes('sublocality')) return { icon: '📍', category: 'Quartier' }
  if (types.includes('locality') || types.includes('administrative_area_level_2')) return { icon: '🏙️', category: 'Ville' }
  if (types.includes('route') || types.includes('street_address')) return { icon: '🛣️', category: 'Rue' }
  if (types.includes('airport')) return { icon: '✈️', category: 'Aéroport' }
  if (types.includes('park') || types.includes('natural_feature')) return { icon: '🌿', category: 'Parc' }
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
    const locationBias = userLat && userLng
      ? `&location=${userLat},${userLng}&radius=50000`
      : '&location=14.7167,-17.2833&radius=500000'

    const params = new URLSearchParams({ input: query, type: 'textsearch', ...(userLat && userLng ? { lat: String(userLat), lng: String(userLng) } : {}) })
    const url = `${API_BASE}?${params}`

    const response = await fetch(url)
    if (!response.ok) return []
    const data = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places error:', data.status)
      return []
    }

    return (data.results || []).slice(0, 10).map((item: any) => {
      const types = item.types || []
      const { icon, category } = getCategoryIcon(types)
      const lat = item.geometry?.location?.lat || 0
      const lng = item.geometry?.location?.lng || 0

      const distance = userLat && userLng ? haversine(userLat, userLng, lat, lng) : undefined

      return {
        name: item.name || item.formatted_address?.split(',')[0] || '',
        address: item.formatted_address || '',
        lat,
        lng,
        category,
        icon,
        distance,
        placeId: item.place_id,
      }
    })
  } catch (e) {
    console.error('searchPlaces error:', e)
    return []
  }
}

export async function searchPlacesAutocomplete(input: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (input.length < 1) return []
  try {
    const locationBias = userLat && userLng
      ? `&location=${userLat},${userLng}&radius=50000`
      : '&location=14.7167,-17.2833&radius=500000'

    const params = new URLSearchParams({ input, type: 'autocomplete', ...(userLat && userLng ? { lat: String(userLat), lng: String(userLng) } : {}) })
    const url = `${API_BASE}?${params}`

    const response = await fetch(url)
    if (!response.ok) return []
    const data = await response.json()

    if (!data.predictions?.length) return []

    const results = await Promise.all(
      data.predictions.slice(0, 6).map(async (pred: any) => {
        const types = pred.types || []
        const { icon, category } = getCategoryIcon(types)
        const coords = await getPlaceCoords(pred.place_id)
        const distance = userLat && userLng && coords ? haversine(userLat, userLng, coords.lat, coords.lng) : undefined

        return {
          name: pred.structured_formatting?.main_text || pred.description.split(',')[0],
          address: pred.structured_formatting?.secondary_text || pred.description,
          lat: coords?.lat || 14.7167,
          lng: coords?.lng || -17.2833,
          category,
          icon,
          distance,
          placeId: pred.place_id,
        }
      })
    )
    return results.filter(r => r.lat !== 14.7167)
  } catch (e) {
    console.error('autocomplete error:', e)
    return []
  }
}

async function getPlaceCoords(placeId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${API_BASE}?input=${placeId}&type=details`
    const res = await fetch(url)
    const data = await res.json()
    const loc = data.result?.geometry?.location
    if (!loc) return null
    return { lat: loc.lat, lng: loc.lng }
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `${API_BASE}?input=${lat},${lng}&type=geocode`
    const response = await fetch(url)
    if (!response.ok) return 'Position actuelle'
    const data = await response.json()
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