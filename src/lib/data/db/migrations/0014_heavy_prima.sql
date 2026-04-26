CREATE TYPE "public"."self_list_kind" AS ENUM('energizer', 'drainer', 'just_for_me', 'pattern', 'trigger', 'release', 'year_ahead');--> statement-breakpoint
CREATE TYPE "public"."self_pattern_category" AS ENUM('relational', 'self_pattern', 'communication', 'body_state', 'choice');--> statement-breakpoint
CREATE TABLE "self_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "self_list_kind" NOT NULL,
	"pattern_category" "self_pattern_category",
	"content" text NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "this_year_self_description" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "description_year" integer;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "my_story" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "attachment_tendencies" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "love_language_give" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "love_language_receive" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "apology_language" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "conflict_style" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "stress_response" text;--> statement-breakpoint
ALTER TABLE "user_self" ADD COLUMN "note_to_future_self" text;--> statement-breakpoint
ALTER TABLE "self_list_items" ADD CONSTRAINT "self_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "self_list_items_user_kind_idx" ON "self_list_items" USING btree ("user_id","kind");--> statement-breakpoint
-- Living-portrait redesign: seed `this_year_self_description` from any
-- pre-existing `identity_notes` so the user's existing prose is the
-- starting point of the new "How I'd describe myself this year" hero
-- block. `description_year` is left NULL on purpose — the UI prompts
-- the user to claim the current year on first edit.
UPDATE "user_self"
SET "this_year_self_description" = "identity_notes"
WHERE "identity_notes" IS NOT NULL
  AND "this_year_self_description" IS NULL;