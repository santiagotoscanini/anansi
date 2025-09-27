CREATE TYPE "public"."goal_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tracking_item_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "status" "goal_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_items" ADD COLUMN "status" "tracking_item_status" DEFAULT 'active' NOT NULL;