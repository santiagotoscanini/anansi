CREATE TABLE "life_chapter_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"emoji" text,
	"color" text NOT NULL,
	"notes" text,
	"start_day" date,
	"end_day" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_view_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"view_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_views" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"order_idx" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "life_expectancy_years" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "life_chapter_goals" ADD CONSTRAINT "life_chapter_goals_chapter_id_life_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."life_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_chapter_goals" ADD CONSTRAINT "life_chapter_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_chapters" ADD CONSTRAINT "life_chapters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_view_chapters" ADD CONSTRAINT "life_view_chapters_view_id_life_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."life_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_view_chapters" ADD CONSTRAINT "life_view_chapters_chapter_id_life_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."life_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_views" ADD CONSTRAINT "life_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "life_chapter_goals_pair_unique" ON "life_chapter_goals" USING btree ("chapter_id","goal_id");--> statement-breakpoint
CREATE INDEX "life_chapter_goals_goal_idx" ON "life_chapter_goals" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "life_chapters_user_idx" ON "life_chapters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "life_view_chapters_pair_unique" ON "life_view_chapters" USING btree ("view_id","chapter_id");--> statement-breakpoint
CREATE INDEX "life_views_user_idx" ON "life_views" USING btree ("user_id");