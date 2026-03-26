'use client'

import { Input } from '@/components/ui/input'
import { MapPin, Navigation } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { geocodeAction } from './geocode-action'

interface LocationFieldProps {
  value: string | undefined
  onChange: (name: string | undefined, lat?: number, lon?: number) => void
  isCreate?: boolean
}

export function LocationField({ value, onChange, isCreate }: LocationFieldProps) {
  const t = useTranslations('ExpenseForm')
  const [isLocating, setIsLocating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const autoDetectDone = useRef(false)

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) return

    setIsLocating(true)
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000, // 5 min cache
          }),
      )

      const { latitude, longitude } = position.coords
      const result = await geocodeAction(latitude, longitude)

      if (result.locationName) {
        onChange(result.locationName, latitude, longitude)
      }
    } catch {
      // Silently fail — user can enter manually
    } finally {
      setIsLocating(false)
    }
  }, [onChange])

  // Auto-detect on mount for new expenses (only if permission already granted)
  useEffect(() => {
    if (!isCreate || autoDetectDone.current || value) return
    autoDetectDone.current = true

    if (!navigator.geolocation || !navigator.permissions) return

    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') {
        detectLocation()
      }
    })
  }, [isCreate, value, detectLocation])

  if (value && !isEditing) {
    return (
      <div className="flex items-center gap-2 w-full">
        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
        <button
          type="button"
          className="text-base text-muted-foreground hover:text-foreground transition-colors truncate text-left flex-1"
          onClick={() => setIsEditing(true)}
        >
          {value}
        </button>
        <button
          type="button"
          className="text-sm text-muted-foreground/50 hover:text-destructive transition-colors shrink-0 p-1"
          onClick={() => {
            onChange(undefined)
            setIsEditing(false)
          }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="relative w-full">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={t('locationPlaceholder')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={() => {
          if (value) setIsEditing(false)
        }}
        className="text-base pl-9 pr-10"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
        onClick={detectLocation}
        disabled={isLocating}
        title={t('detectLocation')}
      >
        <Navigation
          className={`w-4 h-4 ${isLocating ? 'animate-pulse' : ''}`}
        />
      </button>
    </div>
  )
}
