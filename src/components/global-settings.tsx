'use client'

import { AppVersion } from '@/components/app-version'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export function GlobalSettings({
  showHeading = true,
}: {
  showHeading?: boolean
}) {
  const t = useTranslations('Settings')

  return (
    <section className="space-y-3">
      {showHeading && (
        <div>
          <h2 className="text-xl font-semibold">{t('globalTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('globalDescription')}
          </p>
        </div>
      )}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-2xl">
            {t('appearance')}
          </CardTitle>
          <CardDescription>{t('appearanceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
          <div className="flex flex-col items-start gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{t('language')}</div>
              <div className="text-sm text-muted-foreground">
                {t('languageDescription')}
              </div>
            </div>
            <LocaleSwitcher />
          </div>
          <div className="flex flex-col items-start gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{t('theme')}</div>
              <div className="text-sm text-muted-foreground">
                {t('themeDescription')}
              </div>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-2xl">{t('about')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 pt-0 text-sm text-muted-foreground sm:p-6 sm:pt-0">
          <AppVersion />
          <p>
            {t('builtWith')}{' '}
            <a
              href="https://github.com/spliit-app/spliit"
              target="_blank"
              rel="noopener"
              className="underline"
            >
              Spliit
            </a>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}

