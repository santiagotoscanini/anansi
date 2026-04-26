CREATE INDEX "connections_source_idx" ON "connections" USING btree ("source");--> statement-breakpoint
CREATE INDEX "connections_target_idx" ON "connections" USING btree ("target");--> statement-breakpoint
CREATE INDEX "next_bids_person_idx" ON "next_bids" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "next_bids_open_idx" ON "next_bids" USING btree ("person_id") WHERE completed_at IS NULL;--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_parent_idx" ON "goals" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "important_dates_person_idx" ON "important_dates" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_user_idx" ON "people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_referents_task_idx" ON "task_referents" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_referents_person_idx" ON "task_referents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "tasks_goal_idx" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_idx" ON "tasks" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_sync_user_week_unique" ON "weekly_sync" USING btree ("user_id","week_date");--> statement-breakpoint
CREATE INDEX "weekly_sync_items_sync_order_idx" ON "weekly_sync_items" USING btree ("weekly_sync_id","order_idx");