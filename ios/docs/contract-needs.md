# What the phone would like from Anansi

The phone talks to `/api/v1` (see `src/routes/api.v1.*.ts`). Remaining rough edges, none blocking:

- **Uploads aren't idempotent.** A picture whose answer is lost on the way back is sent again and lands twice. An
  `Idempotency-Key` header on `POST /api/v1/sync-items/{id}/attachments` would let the server drop the duplicate.
- **Uploads are foreground.** The body is the file, so a background `URLSession` could send it while the app is
  suspended; today the outbox sends from the foreground (with a short background task) and retries on the next launch.
- **No thumbnails.** `GET /api/v1/attachments/{id}` returns the full picture (≤ 10 MB, usually ~1 MB after the
  phone's 2048 px scaling); a `?size=` thumbnail would make the grid cheaper.
- **No change feed.** The phone re-reads Pulse when it comes forward, on pull-to-refresh and after the outbox lands
  something. There are no push notifications.
