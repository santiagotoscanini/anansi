CREATE TABLE "important_dates" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"label" text NOT NULL,
	"month" integer NOT NULL,
	"day" integer NOT NULL,
	"year" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_ideas" ADD COLUMN "due_at" timestamp;--> statement-breakpoint
ALTER TABLE "gift_ideas" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;