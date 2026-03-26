import { CategoryBreakdown } from '@/app/groups/[groupId]/stats/category-breakdown'
import { DailySpendingChart } from '@/app/groups/[groupId]/stats/daily-spending-chart'
import { Totals } from '@/app/groups/[groupId]/stats/totals'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export function TotalsPageClient() {
  const t = useTranslations('Stats')

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('Totals.title')}</CardTitle>
          <CardDescription>{t('Totals.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Totals />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('DailySpending.title')}</CardTitle>
          <CardDescription>
            {t('DailySpending.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailySpendingChart />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('Categories.title')}</CardTitle>
          <CardDescription>{t('Categories.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryBreakdown />
        </CardContent>
      </Card>
    </>
  )
}
