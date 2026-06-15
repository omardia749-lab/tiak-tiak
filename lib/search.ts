export interface Place {
  name: string
  address: string
  lat: number
  lng: number
  category?: string
  icon?: string
  distance?: number
}

const getCategoryIcon = (type: string, tags: any): { icon: string; category: string } => {
  const t = type || ''
  const amenity = tags?.amenity || ''
  const shop = tags?.shop || ''
  const leisure = tags?.leisure || ''
  const healthcare = tags?.healthcare || ''

  if (amenity === 'hospital' || amenity === 'clinic' || healthcare || amenity === 'pharmacy') return { icon: '🏥', category: 'Santé' }
  if (amenity === 'school' || amenity === 'university' || amenity === 'college') return { icon: '🏫', category: 'École' }
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food' || amenity === 'bar') return { icon: '🍽️', category: 'Restaurant' }
  if (amenity === 'mosque' || amenity === 'place_of_worship') return { icon: '🕌', category: 'Lieu de culte' }
  if (amenity === 'bank' || amenity === 'atm') return { icon: '🏦', category: 'Banque' }
  if (amenity === 'fuel') return { icon: '⛽', category: 'Station' }
  if (amenity === 'marketplace' || shop === 'marketplace' || amenity === 'market') return { icon: '🛒', category: 'Marché' }
  if (shop) return { icon: '🛍️', category: 'Magasin' }
  if (leisure === 'stadium' || amenity === 'stadium') return { icon: '🏟️', category: 'Stade' }
  if (amenity === 'police') return { icon: '🚔', category: 'Police' }
  if (amenity === 'post_office') return { icon: '📮', category: 'Poste' }
  if (amenity === 'bus_station' || amenity === 'taxi') return { icon: '🚌', category: 'Transport' }
  if (amenity === 'hotel' || amenity === 'guest_house') return { icon: '🏨', category: 'Hôtel' }
  if (t === 'suburb' || t === 'neighbourhood' || t === 'residential' || t === 'quarter') return { icon: '📍', category: 'Quartier' }
  if (t === 'city' || t === 'town' || t === 'village' || t === 'municipality') return { icon: '🏙️', category: 'Ville' }
  if (t === 'road' || t === 'street') return { icon: '🛣️', category: 'Rue' }
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

export async function searchPlaces(query: string, userLat?: number, userLng?: number): Promise<Place[]> {
  if (query.length < 2) return []
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Sénégal')}&countrycodes=sn&format=json&addressdetails=1&extratags=1&limit=12&accept-language=fr`
    const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
    if (!response.ok) return []
    const data = await response.json()

    return data.map((item: any) => {
      const a = item.address || {}
      const tags = item.extratags || {}
      const { icon, category } = getCategoryIcon(item.type, { amenity: a.amenity, shop: tags.shop, leisure: tags.leisure, healthcare: a.healthcare })

      const nom = item.name || item.display_name.split(',')[0].trim()
      const adresse = formatAddress(a)

      let distance: number | undefined
      if (userLat && userLng) {
        const R = 6371
        const dLat = (parseFloat(item.lat) - userLat) * Math.PI / 180
        const dLng = (parseFloat(item.lon) - userLng) * Math.PI / 180
        const aa = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(userLat * Math.PI / 180) * Math.cos(parseFloat(item.lat) * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
        distance = Math.round(R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa)) * 10) / 10
      }

      return { name: nom, address: adresse, lat: parseFloat(item.lat), lng: parseFloat(item.lon), category, icon, distance }
    })
  } catch {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
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