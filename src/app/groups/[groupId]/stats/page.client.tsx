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
      <Card>
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
          <CardTitle>{t('Totals.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <Totals />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
          <CardTitle>{t('Categories.title')}</CardTitle>
          <CardDescription>{t('Categories.description')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <CategoryBreakdown />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
          <CardTitle>{t('DailySpending.title')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <DailySpendingChart />
        </CardContent>
      </Card>
    </>
  )
}
