-- Weeks run Sunday to Saturday from here on (src/lib/week.ts); they ran
-- Monday to Sunday until now.
--
-- 1. Every stored week moves back one day: the Monday it was named by becomes
--    the Sunday before it, at the same time of day (a browser's local midnight
--    stays local midnight, `weekOfDay`'s noon UTC stays noon UTC). Monday to
--    Saturday of the old week are Monday to Saturday of the new one, so
--    everything recorded on those days is already where it belongs.
UPDATE "weekly_sync" SET "week_date" = "week_date" - interval '1 day';
--> statement-breakpoint
-- 2. What was recorded on the old week's Sunday belongs to the next week now.
--    The only record of the day a picture was taken is its name: the camera
--    writes IMG_YYYYMMDD_HHMMSS in local time. Each such picture taken on the
--    Sunday that closed its old week moves to the next week's sync (started if
--    there is none, as `weekOfDay` would: noon UTC on its Sunday), under the
--    same tracking item. Pictures with other names stay where they are.
DO $$
DECLARE
  r record;
  target_sync text;
  target_item text;
BEGIN
  FOR r IN
    SELECT a."id" AS attachment_id, ws."user_id", ws."template_id", i."tracking_item_id", i."order_idx", s.photo_day
    FROM "attachments" a
    JOIN "weekly_sync_items" i ON a."parent_type" = 'weekly_sync_item' AND a."parent_id" = i."id"
    JOIN "weekly_sync" ws ON ws."id" = i."weekly_sync_id"
    CROSS JOIN LATERAL (
      SELECT to_date(substring(a."file_name" FROM 'IMG_(\d{8})_'), 'YYYYMMDD') AS photo_day,
             (ws."week_date" + interval '14 hours')::date AS shifted
    ) d
    CROSS JOIN LATERAL (
      SELECT d.photo_day, d.shifted - extract(dow FROM d.shifted)::int AS week_sunday
    ) s
    WHERE a."file_name" ~ 'IMG_\d{8}_' AND s.photo_day = s.week_sunday + 7
  LOOP
    target_sync := NULL;
    target_item := NULL;

    SELECT "id" INTO target_sync FROM "weekly_sync"
    WHERE "user_id" = r."user_id"
      AND "week_date" BETWEEN (r.photo_day + time '12:00') - interval '36 hours'
                          AND (r.photo_day + time '12:00') + interval '36 hours'
    LIMIT 1;
    IF target_sync IS NULL THEN
      target_sync := 'w' || substr(md5(random()::text || clock_timestamp()::text), 1, 23);
      INSERT INTO "weekly_sync" ("id", "user_id", "week_date", "template_id")
      VALUES (target_sync, r."user_id", r.photo_day + time '12:00', r."template_id");
    END IF;

    SELECT "id" INTO target_item FROM "weekly_sync_items"
    WHERE "weekly_sync_id" = target_sync AND "tracking_item_id" = r."tracking_item_id"
    LIMIT 1;
    IF target_item IS NULL THEN
      target_item := 'w' || substr(md5(random()::text || clock_timestamp()::text), 1, 23);
      INSERT INTO "weekly_sync_items" ("id", "weekly_sync_id", "tracking_item_id", "order_idx")
      VALUES (target_item, target_sync, r."tracking_item_id", r."order_idx");
    END IF;

    UPDATE "attachments" SET "parent_id" = target_item WHERE "id" = r.attachment_id;
  END LOOP;
END $$;
