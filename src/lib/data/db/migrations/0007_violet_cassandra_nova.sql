CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" "file_type" NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_template_items" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"tracking_item_id" text NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracking_items" DROP CONSTRAINT "tracking_items_goal_id_goals_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_items" ALTER COLUMN "goal_id" DROP NOT NULL;--> statement-breakpoint
-- user_id added nullable, backfilled from owning goal, then locked to NOT NULL.
-- Safe pattern for adding a required FK column to a non-empty table.
ALTER TABLE "tracking_items" ADD COLUMN "user_id" text;--> statement-breakpoint
UPDATE "tracking_items" SET "user_id" = "goals"."user_id" FROM "goals" WHERE "tracking_items"."goal_id" = "goals"."id";--> statement-breakpoint
ALTER TABLE "tracking_items" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_sync" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "weekly_sync_items" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "weekly_sync_items" ADD COLUMN "order_idx" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_template_items" ADD CONSTRAINT "sync_template_items_template_id_sync_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sync_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_template_items" ADD CONSTRAINT "sync_template_items_tracking_item_id_tracking_items_id_fk" FOREIGN KEY ("tracking_item_id") REFERENCES "public"."tracking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_templates" ADD CONSTRAINT "sync_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_parent_idx" ON "attachments" USING btree ("parent_type","parent_id");--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_template_items_pair_unique" ON "sync_template_items" USING btree ("template_id","tracking_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_templates_one_default_per_user" ON "sync_templates" USING btree ("user_id") WHERE is_default = true;--> statement-breakpoint
ALTER TABLE "tracking_items" ADD CONSTRAINT "tracking_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_items" ADD CONSTRAINT "tracking_items_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sync" ADD CONSTRAINT "weekly_sync_template_id_sync_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sync_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracking_items_user_idx" ON "tracking_items" USING btree ("user_id");