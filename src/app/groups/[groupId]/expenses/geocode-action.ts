'use server'

import { reverseGeocode } from '@/lib/geocoding'

export async function geocodeAction(lat: number, lon: number) {
  const locationName = await reverseGeocode(lat, lon)
  return { locationName }
}
