CREATE TYPE "public"."capture_ticktick_state" AS ENUM('open', 'done', 'deleted');--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "ticktick_state" "capture_ticktick_state";--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "ticktick_checked_at" timestamp;--> statement-breakpoint
-- Every capture already in TickTick is taken to be open until the poller looks.
UPDATE "captures" SET "ticktick_state" = 'open' WHERE "ticktick_task_id" IS NOT NULL;
