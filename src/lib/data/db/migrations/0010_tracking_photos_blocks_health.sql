CREATE TABLE "health_days" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_item_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"weekly_sync_item_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracking_items" ADD COLUMN "photos_per_week" integer;--> statement-breakpoint
ALTER TABLE "tracking_items" ADD COLUMN "health_metric" text;--> statement-breakpoint
ALTER TABLE "health_days" ADD CONSTRAINT "health_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item_blocks" ADD CONSTRAINT "sync_item_blocks_weekly_sync_item_id_weekly_sync_items_id_fk" FOREIGN KEY ("weekly_sync_item_id") REFERENCES "public"."weekly_sync_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_days_user_day_unique" ON "health_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "sync_item_blocks_item_order_idx" ON "sync_item_blocks" USING btree ("weekly_sync_item_id","order_idx");