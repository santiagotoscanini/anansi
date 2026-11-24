CREATE TABLE "capture_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"heard" text NOT NULL,
	"meant" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "heard" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "tidied_at" timestamp;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "tidy_error" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "ticktick_list_name" text;--> statement-breakpoint
ALTER TABLE "capture_terms" ADD CONSTRAINT "capture_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capture_terms_user_heard_unique" ON "capture_terms" USING btree ("user_id",lower("heard"));--> statement-breakpoint
-- The list each capture already sent landed in: the Inbox (its id starts "inbox"), else the captures list when it is that one.
UPDATE "captures" SET "ticktick_list_name" = 'Inbox' WHERE "ticktick_project_id" LIKE 'inbox%';--> statement-breakpoint
UPDATE "captures" c SET "ticktick_list_name" = t."capture_project_name" FROM "ticktick_connections" t WHERE c."user_id" = t."user_id" AND c."ticktick_project_id" = t."capture_project_id" AND c."ticktick_list_name" IS NULL;
