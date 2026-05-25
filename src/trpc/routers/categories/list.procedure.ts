import { getCategoriesForGroup } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listCategoriesProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1).optional() }).optional())
  .query(async ({ input }) => {
    return { categories: await getCategoriesForGroup(input?.groupId) }
  })
