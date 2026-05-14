--
-- Migration: profile avatars move from the local `uploads/` directory to a
-- Supabase Storage bucket so they survive serverless deploys (Vercel et al
-- have an ephemeral, read-only filesystem at runtime — local fs writes
-- worked in dev and silently lost data in prod).
--
-- This migration is SQL-only — there are no Drizzle schema changes. Like
-- the `on_auth_user_created` trigger in 0020, Drizzle will not re-introspect
-- the bucket/policies, so re-running `npm run db:pull` should not regress
-- this file. The matching `meta/0021_snapshot.json` is a copy of 0020's
-- (no app-schema delta).
--

-- 1. Create the bucket. `public = true` makes objects readable by anyone
--    with the URL; writes are still gated by the RLS policies below. The
--    profile image is not sensitive — losing the auth wall on the read
--    path is acceptable in exchange for not having to mint signed URLs on
--    every render. Unguessable userIds + stable filenames still mean an
--    attacker would need the victim's user UUID to even attempt a fetch.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2. RLS policies on storage.objects. The first path segment must equal
--    the caller's auth uid — same pattern the local-fs route used, just
--    enforced by Postgres now. The bucket-level policies are scoped with
--    `bucket_id = 'avatars'` so they don't leak into other buckets that
--    may be added later.

DROP POLICY IF EXISTS "Avatars: owner insert" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Avatars: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "Avatars: owner update" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Avatars: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "Avatars: owner delete" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Avatars: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
