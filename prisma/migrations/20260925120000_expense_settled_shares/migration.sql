-- Shares already paid back directly (additive, nullable: existing rows stay open).
ALTER TABLE "ExpensePaidFor" ADD COLUMN "settledAt" TIMESTAMP(3);

-- Activity log entries for marking shares as paid / open again.
ALTER TYPE "ActivityType" ADD VALUE 'SETTLE_EXPENSE';
ALTER TYPE "ActivityType" ADD VALUE 'UNSETTLE_EXPENSE';
