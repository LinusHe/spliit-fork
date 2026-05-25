ALTER TABLE "Group" ADD COLUMN "categoryPreset" TEXT NOT NULL DEFAULT 'all';

CREATE TABLE "GroupCategory" (
    "groupId" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "GroupCategory_pkey" PRIMARY KEY ("groupId","categoryId")
);

ALTER TABLE "GroupCategory" ADD CONSTRAINT "GroupCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupCategory" ADD CONSTRAINT "GroupCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "grouping", "name") VALUES
  (44, 'Travel', 'Accommodation'),
  (45, 'Travel', 'Package Tour'),
  (46, 'Travel', 'Deposit'),
  (47, 'Travel', 'Activities'),
  (48, 'Travel', 'Tickets'),
  (49, 'Travel', 'Gear Rental'),
  (50, 'Travel', 'Fees & Permits'),
  (51, 'Travel', 'Luggage'),
  (52, 'Travel', 'Travel Insurance'),
  (53, 'Travel', 'Ferry/Boat'),
  (54, 'Event', 'Venue'),
  (55, 'Event', 'Decoration'),
  (56, 'Event', 'Tickets'),
  (57, 'Event', 'Equipment'),
  (58, 'Work', 'Software'),
  (59, 'Work', 'Hardware'),
  (60, 'Work', 'Hosting'),
  (61, 'Work', 'Office Supplies'),
  (62, 'Work', 'Contractors')
ON CONFLICT ("id") DO NOTHING;
