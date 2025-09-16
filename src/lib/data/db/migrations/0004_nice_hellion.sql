CREATE TYPE "public"."importance" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "importance" SET DEFAULT 'Low'::"public"."importance";--> statement-breakpoint
ALTER TABLE "goals" ALTER COLUMN "importance" SET DATA TYPE "public"."importance" USING "importance"::"public"."importance";