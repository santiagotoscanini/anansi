--
-- Migration: switch the local `users` table from a hand-rolled bcrypt+JWT
-- identity to a thin profile mirror of Supabase's `auth.users`.
--
-- Destructive. The clean-cut decision was made in the plan: existing rows
-- in `public.users` (and everything that cascades from them) are wiped so
-- the surviving rows can be rekeyed to UUIDs that match `auth.users(id)`.
-- Re-sign-up flow restores them.
--
-- Drizzle does not introspect the `on_auth_user_created` trigger defined
-- below — see CLAUDE.md's "Database migrations" note before running
-- `npm run db:pull`. The trigger lives only in this file.
--

-- 1. Wipe owned data. Cascades clear every user-scoped child table.
TRUNCATE TABLE "users" RESTART IDENTITY CASCADE;
--> statement-breakpoint

-- 2. Drop child FKs so we can retype the user_id columns. Drizzle's default
--    constraint name is <table>_<col>_<reftable>_<refcol>_fk.
ALTER TABLE "values"            DROP CONSTRAINT "values_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "goals"             DROP CONSTRAINT "goals_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tracking_items"    DROP CONSTRAINT "tracking_items_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "weekly_sync"       DROP CONSTRAINT "weekly_sync_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sync_templates"    DROP CONSTRAINT "sync_templates_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "attachments"       DROP CONSTRAINT "attachments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "people"            DROP CONSTRAINT "people_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "bucket_list_items" DROP CONSTRAINT "bucket_list_items_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "person_groups"     DROP CONSTRAINT "person_groups_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "self_list_items"   DROP CONSTRAINT "self_list_items_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_self"         DROP CONSTRAINT "user_self_user_id_users_id_fk";--> statement-breakpoint

-- 3. Retype text → uuid. Tables are empty after the TRUNCATE so the USING
--    cast is trivial; we still need the explicit USING because text→uuid
--    is not an implicit cast even on empty tables.
ALTER TABLE "users"             ALTER COLUMN "id"      DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users"             ALTER COLUMN "id"      SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "users"             DROP  COLUMN "password";--> statement-breakpoint
ALTER TABLE "values"            ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "goals"             ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "tracking_items"    ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "weekly_sync"       ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "sync_templates"    ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "attachments"       ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "people"            ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "bucket_list_items" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "person_groups"     ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "self_list_items"   ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user_self"         ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint

-- 4. New parent FK: public.users.id references auth.users(id). Supabase
--    Auth owns the row; deleting an auth user cascades through here and
--    out through every child table.
ALTER TABLE "users" ADD CONSTRAINT "users_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint

-- 5. Recreate the 11 child FKs.
ALTER TABLE "values"            ADD CONSTRAINT "values_user_id_users_id_fk"            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "goals"             ADD CONSTRAINT "goals_user_id_users_id_fk"             FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tracking_items"    ADD CONSTRAINT "tracking_items_user_id_users_id_fk"    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "weekly_sync"       ADD CONSTRAINT "weekly_sync_user_id_users_id_fk"       FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_templates"    ADD CONSTRAINT "sync_templates_user_id_users_id_fk"    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments"       ADD CONSTRAINT "attachments_user_id_users_id_fk"       FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "people"            ADD CONSTRAINT "people_user_id_users_id_fk"            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bucket_list_items" ADD CONSTRAINT "bucket_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "person_groups"     ADD CONSTRAINT "person_groups_user_id_users_id_fk"     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "self_list_items"   ADD CONSTRAINT "self_list_items_user_id_users_id_fk"   FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_self"         ADD CONSTRAINT "user_self_user_id_users_id_fk"         FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint

-- 6. Trigger: mirror every auth.users INSERT into public.users so an app
--    profile row is ready by the time the user's first request lands. The
--    name comes from raw_user_meta_data (set during signUp options.data),
--    with fallbacks for OAuth providers (Google's full_name) and a final
--    fallback to the email local-part so the row is never name-less.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
