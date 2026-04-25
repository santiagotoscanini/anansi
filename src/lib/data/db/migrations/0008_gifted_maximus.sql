CREATE TABLE "value_behaviors" (
	"id" text PRIMARY KEY NOT NULL,
	"value_id" text NOT NULL,
	"content" text NOT NULL,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "value_behaviors" ADD CONSTRAINT "value_behaviors_value_id_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."values"("id") ON DELETE cascade ON UPDATE no action;