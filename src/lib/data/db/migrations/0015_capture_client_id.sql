ALTER TABLE "captures" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "captures_user_client_unique" ON "captures" USING btree ("user_id","client_id");