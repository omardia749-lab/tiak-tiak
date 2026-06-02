export interface Place {
  name: string
  address: string
  lat: number
  lng: number
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (query.length < 2) return []
  try {
    const url = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(query) + "&countrycodes=sn&format=json&addressdetails=1&limit=8"
    const response = await fetch(url, { headers: { "Accept-Language": "fr" } })
    if (!response.ok) return []
    const data = await response.json()
    return data.map((item: any) => {
      const a = item.address || {}
      const ville = a.city || a.town || a.village || a.county || a.state || "Senegal"
      const nom = item.name || item.display_name.split(",")[0]
      return { name: nom, address: ville, lat: parseFloat(item.lat), lng: parseFloat(item.lon) }
    })
  } catch (e) {
    return []
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = "https://nominatim.openstreetmap.org/reverse?lat=" + lat + "&lon=" + lng + "&format=json&addressdetails=1"
    const response = await fetch(url, { headers: { "Accept-Language": "fr" } })
    if (!response.ok) return "Position actuelle"
    const data = await response.json()
    const a = data.address || {}
    const quartier = a.suburb || a.neighbourhood || a.road || ""
    const ville = a.city || a.town || a.village || "Senegal"
    return quartier ? quartier + ", " + ville : ville
  } catch (e) {
    return "Position actuelle"
  }
}