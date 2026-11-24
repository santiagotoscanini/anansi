CREATE TYPE "public"."transcript_source" AS ENUM('server', 'phone', 'user');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'done', 'failed', 'none');--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcript_status" "transcript_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcribe_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcribe_error" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcribe_after" timestamp;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcribed_at" timestamp;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "transcript_source" "transcript_source";--> statement-breakpoint
CREATE INDEX "captures_transcript_status_idx" ON "captures" USING btree ("transcript_status");--> statement-breakpoint
-- Voice notes from before: words that came from the phone are done; the rest wait for the server.
UPDATE "captures" SET "transcript_status" = 'done', "transcript_source" = 'phone', "transcribed_at" = "updated_at" WHERE "kind" = 'voice' AND "text" IS NOT NULL;--> statement-breakpoint
UPDATE "captures" SET "transcript_status" = 'pending' WHERE "kind" = 'voice' AND "text" IS NULL;
