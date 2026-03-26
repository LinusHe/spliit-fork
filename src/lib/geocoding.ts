'use server'

interface NominatimResult {
  address: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
    country?: string
  }
}

/**
 * Reverse geocode coordinates to the nearest city/town/village name.
 * Uses Nominatim (OpenStreetMap) — free, no API key needed.
 * Zoom level 10 = city level (avoids street-level granularity).
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Spliit/1.0 (expense-tracker)',
          'Accept-Language': 'de,en',
        },
        next: { revalidate: 86400 }, // Cache for 24h
      },
    )

    if (!res.ok) return null

    const data = (await res.json()) as NominatimResult
    const addr = data.address

    // Return the most specific city-level name
    return (
      addr.city ??
      addr.town ??
      addr.village ??
      addr.municipality ??
      addr.county ??
      null
    )
  } catch {
    return null
  }
}
