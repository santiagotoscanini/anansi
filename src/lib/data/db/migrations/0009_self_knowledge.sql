CREATE TYPE "public"."open_question_status" AS ENUM('open', 'settled');--> statement-breakpoint
CREATE TABLE "open_question_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_question_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_question_people" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"status" "open_question_status" DEFAULT 'open' NOT NULL,
	"answer" text,
	"settled_at" timestamp,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_results" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"test" text NOT NULL,
	"taken_at" date,
	"source" text,
	"summary" text NOT NULL,
	"details" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "values" ADD COLUMN "interpretation" text;--> statement-breakpoint
ALTER TABLE "open_question_goals" ADD CONSTRAINT "open_question_goals_question_id_open_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."open_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_question_goals" ADD CONSTRAINT "open_question_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_question_notes" ADD CONSTRAINT "open_question_notes_question_id_open_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."open_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_question_people" ADD CONSTRAINT "open_question_people_question_id_open_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."open_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_question_people" ADD CONSTRAINT "open_question_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_results" ADD CONSTRAINT "personality_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_question_goals_pair_unique" ON "open_question_goals" USING btree ("question_id","goal_id");--> statement-breakpoint
CREATE INDEX "open_question_notes_question_idx" ON "open_question_notes" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "open_question_people_pair_unique" ON "open_question_people" USING btree ("question_id","person_id");--> statement-breakpoint
CREATE INDEX "open_questions_user_idx" ON "open_questions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personality_results_user_idx" ON "personality_results" USING btree ("user_id");