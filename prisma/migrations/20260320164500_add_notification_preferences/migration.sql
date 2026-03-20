-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnCreate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnUpdate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PushSubscription" ADD COLUMN "notifyOnDelete" BOOLEAN NOT NULL DEFAULT true;
