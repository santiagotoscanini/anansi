CREATE TABLE "sync_item_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"weekly_sync_item_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_item_mentions" ADD CONSTRAINT "sync_item_mentions_weekly_sync_item_id_weekly_sync_items_id_fk" FOREIGN KEY ("weekly_sync_item_id") REFERENCES "public"."weekly_sync_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_item_mentions" ADD CONSTRAINT "sync_item_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_mentions" ADD CONSTRAINT "task_mentions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_mentions" ADD CONSTRAINT "task_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_item_mentions_pair_unique" ON "sync_item_mentions" USING btree ("weekly_sync_item_id","person_id");--> statement-breakpoint
CREATE INDEX "sync_item_mentions_person_idx" ON "sync_item_mentions" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_mentions_pair_unique" ON "task_mentions" USING btree ("task_id","person_id");--> statement-breakpoint
CREATE INDEX "task_mentions_person_idx" ON "task_mentions" USING btree ("person_id");