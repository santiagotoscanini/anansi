CREATE TYPE "public"."file_type" AS ENUM('image', 'document', 'video', 'audio', 'other');--> statement-breakpoint
CREATE TABLE "tracking_items" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sync_item_files" (
	"id" text PRIMARY KEY NOT NULL,
	"weekly_sync_item_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" "file_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sync_items" (
	"id" text PRIMARY KEY NOT NULL,
	"weekly_sync_id" text NOT NULL,
	"tracking_item_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "weekly_review_goals" CASCADE;--> statement-breakpoint
DROP TABLE "weekly_reviews" CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_items" ADD CONSTRAINT "tracking_items_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sync" ADD CONSTRAINT "weekly_sync_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sync_item_files" ADD CONSTRAINT "weekly_sync_item_files_weekly_sync_item_id_weekly_sync_items_id_fk" FOREIGN KEY ("weekly_sync_item_id") REFERENCES "public"."weekly_sync_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sync_items" ADD CONSTRAINT "weekly_sync_items_weekly_sync_id_weekly_sync_id_fk" FOREIGN KEY ("weekly_sync_id") REFERENCES "public"."weekly_sync"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sync_items" ADD CONSTRAINT "weekly_sync_items_tracking_item_id_tracking_items_id_fk" FOREIGN KEY ("tracking_item_id") REFERENCES "public"."tracking_items"("id") ON DELETE cascade ON UPDATE no action;