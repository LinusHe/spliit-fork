import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import useSWR from 'swr'

export function useMediaQuery(query: string): boolean {
  const getMatches = (query: string): boolean => {
    // Prevents SSR issues
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  }

  const [matches, setMatches] = useState<boolean>(getMatches(query))

  function handleChange() {
    setMatches(getMatches(query))
  }

  useEffect(() => {
    const matchMedia = window.matchMedia(query)

    // Triggered at the first client-side load and if query changes
    handleChange()

    // Listen matchMedia
    if (matchMedia.addListener) {
      matchMedia.addListener(handleChange)
    } else {
      matchMedia.addEventListener('change', handleChange)
    }

    return () => {
      if (matchMedia.removeListener) {
        matchMedia.removeListener(handleChange)
      } else {
        matchMedia.removeEventListener('change', handleChange)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return matches
}

export function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])
  return baseUrl
}

/**
 * @returns The active user, or `null` until it is fetched from local storage
 */
export function useActiveUser(groupId?: string) {
  const [activeUser, setActiveUser] = useState<string | null>(null)

  useEffect(() => {
    if (groupId) {
      const activeUser = localStorage.getItem(`${groupId}-activeUser`)
      if (activeUser) setActiveUser(activeUser)
    }
  }, [groupId])

  return activeUser
}

type FrankfurterRate = {
  date: string
  base: string
  quote: string
  rate: number
}
type CurrencyRate = { date: string; rate: number | undefined }

// Frankfurter moved api.frankfurter.app to api.frankfurter.dev. The old host
// only answers with a redirect that browsers reject (no CORS headers), so the
// rate could not be fetched anymore. v2 also covers more currencies (e.g. ALL).
const FRANKFURTER = 'https://api.frankfurter.dev/v2/rates'

async function fetchRates(query: string) {
  const res = await fetch(`${FRANKFURTER}?${query}`)
  if (!res.ok)
    throw new TypeError('Unsuccessful response from API', { cause: res })
  return (await res.json()) as FrankfurterRate[]
}

// Both currencies are quoted against EUR and divided: v2 rounds small rates
// (e.g. ALL→EUR = 0.0109) to few digits, EUR-based quotes are more precise.
async function fetchCurrencyRate(
  date: string,
  base: string,
  target: string,
): Promise<CurrencyRate> {
  const quotes = [base, target].filter((code) => code !== 'EUR').join(',')
  const query = `base=EUR&quotes=${quotes}`
  let rates = await fetchRates(`${query}&date=${date}`)
  // No rate for this day yet (e.g. a future date): use the latest one.
  if (!rates.length) rates = await fetchRates(query)
  const eurTo = (code: string) =>
    code === 'EUR' ? 1 : rates.find((r) => r.quote === code)?.rate
  const from = eurTo(base)
  const to = eurTo(target)
  return {
    // The older of both quotes; differs from `date` when no rate existed then.
    date: rates.map((r) => r.date).sort()[0] ?? date,
    rate: from && to ? Number((to / from).toPrecision(6)) : undefined,
  }
}

export function useCurrencyRate(
  date: Date,
  baseCurrency: string,
  targetCurrency: string,
) {
  const dateString = dayjs(date).format('YYYY-MM-DD')

  // Only send request if both currency codes are given and not the same
  const key =
    !isNaN(date.getTime()) &&
    !!baseCurrency.length &&
    !!targetCurrency.length &&
    baseCurrency !== targetCurrency &&
    (['frankfurter', dateString, baseCurrency, targetCurrency] as const)
  const { data, error, isLoading, mutate } = useSWR<CurrencyRate>(
    key,
    ([, day, base, target]: [string, string, string, string]) =>
      fetchCurrencyRate(day, base, target),
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )

  if (data) {
    let sentError = error
    if (!error && data.date !== dateString) {
      // this happens if for example, the requested date is in the future.
      sentError = new RangeError(data.date)
    }
    return {
      data: data.rate,
      error: sentError,
      isLoading,
      refresh: mutate,
    }
  }

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  }
}
