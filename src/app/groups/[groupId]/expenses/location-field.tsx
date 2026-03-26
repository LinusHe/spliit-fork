'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MapPin, Navigation } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { geocodeAction } from './geocode-action'

interface LocationFieldProps {
  value: string | undefined
  onChange: (name: string | undefined, lat?: number, lon?: number) => void
}

export function LocationField({ value, onChange }: LocationFieldProps) {
  const t = useTranslations('ExpenseForm')
  const [isLocating, setIsLocating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

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

  if (value && !isEditing) {
    return (
      <div className="flex items-center gap-2">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate text-left"
          onClick={() => setIsEditing(true)}
        >
          {value}
        </button>
        <button
          type="button"
          className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
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
    <div className="flex items-center gap-2">
      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Input
        placeholder={t('locationPlaceholder')}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={() => {
          if (value) setIsEditing(false)
        }}
        className="h-8 text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={detectLocation}
        disabled={isLocating}
        title={t('detectLocation')}
      >
        <Navigation
          className={`w-3.5 h-3.5 ${isLocating ? 'animate-pulse' : ''}`}
        />
      </Button>
    </div>
  )
}
