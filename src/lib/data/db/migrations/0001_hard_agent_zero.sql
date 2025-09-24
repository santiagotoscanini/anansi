-- Add week_date column as nullable first
ALTER TABLE "weekly_sync" ADD COLUMN "week_date" timestamp;

-- Update existing records to calculate week_date from created_at
-- Week starts on Monday, so we need to find the Monday of the week containing created_at
UPDATE "weekly_sync"
SET "week_date" = DATE_TRUNC('week', "created_at"::timestamp)::timestamp;

-- Now make the column NOT NULL
ALTER TABLE "weekly_sync" ALTER COLUMN "week_date" SET NOT NULL;