CREATE TYPE "public"."capture_device" AS ENUM('iphone', 'watch');--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "device" "capture_device";--> statement-breakpoint
-- Every phone capture before the Apple Watch app was made on the iPhone.
UPDATE "captures" SET "device" = 'iphone' WHERE "source" = 'phone';
