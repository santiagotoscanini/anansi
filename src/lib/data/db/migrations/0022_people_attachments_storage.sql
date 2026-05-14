--
-- Migration: move the remaining filesystem uploads (people photos + sync
-- attachments) into Supabase Storage so they survive serverless deploys.
-- Sibling of 0021 (avatars). Two new buckets:
--
--   people-photos  — public read (same rationale as avatars: identity-marker
--                    images rendered widely across the UI; the user UUID +
--                    object UUID make URLs unguessable in practice).
--                    Writes RLS-gated to the owning user.
--
--   attachments    — fully private. Sync attachments can legitimately
--                    contain sensitive content (receipts, journal scans,
--                    photos of others), so neither reads nor writes are
--                    public. All four ops gated on the first path segment
--                    matching auth.uid(). The router mints short-lived
--                    signed URLs (~1h) when hydrating sync items.
--
-- SQL-only — no Drizzle schema delta. The matching meta/0022_snapshot.json
-- is a copy of 0021's.
--

-- 1. Buckets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('people-photos', 'people-photos', true)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- 2. people-photos RLS — owner-only writes; reads are public via the bucket.

DROP POLICY IF EXISTS "People photos: owner insert" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "People photos: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'people-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "People photos: owner update" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "People photos: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'people-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'people-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "People photos: owner delete" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "People photos: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'people-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

-- 3. attachments RLS — private bucket; ALL operations (incl. SELECT) gated
--    on owner folder. SELECT permission is what allows the session-scoped
--    client in the router to mint signed URLs without escalating to the
--    service role key.

DROP POLICY IF EXISTS "Attachments: owner select" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Attachments: owner select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "Attachments: owner insert" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Attachments: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "Attachments: owner update" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Attachments: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "Attachments: owner delete" ON storage.objects;
--> statement-breakpoint
CREATE POLICY "Attachments: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
