CREATE TYPE "public"."capture_kind" AS ENUM('text', 'voice');--> statement-breakpoint
CREATE TYPE "public"."capture_source" AS ENUM('phone', 'web', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."capture_status" AS ENUM('new', 'routed', 'archived');--> statement-breakpoint
CREATE TABLE "captures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "capture_kind" NOT NULL,
	"text" text,
	"file_id" text,
	"duration_ms" integer,
	"question_id" text,
	"note_id" text,
	"ticktick_task_id" text,
	"ticktick_project_id" text,
	"status" "capture_status" DEFAULT 'new' NOT NULL,
	"route_error" text,
	"routed_at" timestamp,
	"source" "capture_source" NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_question_id_open_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."open_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captures_user_captured_idx" ON "captures" USING btree ("user_id","captured_at" DESC NULLS LAST);