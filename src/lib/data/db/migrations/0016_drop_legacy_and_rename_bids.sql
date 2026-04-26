DROP TABLE "weekly_sync_item_files" CASCADE;--> statement-breakpoint
ALTER TABLE "gift_ideas" RENAME TO "next_bids";--> statement-breakpoint
ALTER TABLE "next_bids" DROP CONSTRAINT "gift_ideas_person_id_people_id_fk";
--> statement-breakpoint
ALTER TABLE "next_bids" ADD CONSTRAINT "next_bids_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_self" DROP COLUMN "identity_notes";--> statement-breakpoint
ALTER TABLE "user_self" DROP COLUMN "patterns";--> statement-breakpoint
ALTER TABLE "user_self" DROP COLUMN "current_work";
