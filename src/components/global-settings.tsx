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

export function GlobalSettings() {
  const t = useTranslations('Settings')

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">{t('globalTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('globalDescription')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('appearance')}</CardTitle>
          <CardDescription>{t('appearanceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">{t('language')}</div>
              <div className="text-sm text-muted-foreground">
                {t('languageDescription')}
              </div>
            </div>
            <LocaleSwitcher />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
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
        <CardHeader>
          <CardTitle>{t('about')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
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
