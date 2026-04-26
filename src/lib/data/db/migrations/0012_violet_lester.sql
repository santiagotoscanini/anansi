CREATE TABLE "tasks_to_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"group_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks_to_groups" ADD CONSTRAINT "tasks_to_groups_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_to_groups" ADD CONSTRAINT "tasks_to_groups_group_id_person_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."person_groups"("id") ON DELETE cascade ON UPDATE no action;