-- Payment currencies offered as a one-tap switch in the expense form.
ALTER TABLE "Group" ADD COLUMN "quickCurrencies" TEXT[] DEFAULT ARRAY[]::TEXT[];
