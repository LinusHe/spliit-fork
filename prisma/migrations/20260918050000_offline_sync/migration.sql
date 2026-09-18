ALTER TABLE "Expense" ADD COLUMN "syncVersion" TEXT NOT NULL DEFAULT 'initial';
CREATE TABLE "OfflineMutation" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineMutation_pkey" PRIMARY KEY ("id")
);
