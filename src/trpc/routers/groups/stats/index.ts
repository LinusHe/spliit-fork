import { createTRPCRouter } from '@/trpc/init'
import { getCategoryExpensesProcedure } from '@/trpc/routers/groups/stats/category-expenses.procedure'
import { getCategoryStatsProcedure } from '@/trpc/routers/groups/stats/category-stats.procedure'
import { getDailySpendingProcedure } from '@/trpc/routers/groups/stats/daily-spending.procedure'
import { getGroupStatsProcedure } from '@/trpc/routers/groups/stats/get.procedure'

export const groupStatsRouter = createTRPCRouter({
  get: getGroupStatsProcedure,
  categoryBreakdown: getCategoryStatsProcedure,
  categoryExpenses: getCategoryExpensesProcedure,
  dailySpending: getDailySpendingProcedure,
})
