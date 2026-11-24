CREATE TABLE "ticktick_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"project_id" text,
	"project_name" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticktick_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ticktick_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"local_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"remote_state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticktick_connections" ADD CONSTRAINT "ticktick_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticktick_links" ADD CONSTRAINT "ticktick_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticktick_links_local_unique" ON "ticktick_links" USING btree ("user_id","kind","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticktick_links_remote_unique" ON "ticktick_links" USING btree ("user_id","remote_id");