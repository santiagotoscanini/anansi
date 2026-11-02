# What the phone would like from Anansi

The phone uses only what the MCP server already offers. These are the places where it works around a gap; none of
them block the app.

- **Attachment bytes need a browser session.** `/api/files/{id}` is cookie-only, so the phone reads pictures through
  `get_sync_attachment`, which base64s the whole file into a JSON-RPC answer and refuses anything over 5 MB. A
  bearer-accepting file route (or a thumbnail size on the tool) would make the picture grid cheaper.
- **Uploads are base64 in one JSON body.** `upload_sync_attachment` takes the file inline, so a 3 MB picture is a
  4 MB request that cannot use a background `URLSession`. The phone scales pictures to 2048 px JPEG and keeps them in
  an on-disk outbox instead. A plain `PUT` upload route would let iOS send them while the app is suspended.
- **Uploads aren't idempotent.** A picture whose answer is lost on the way back is sent again and lands twice. A
  client-chosen id on `upload_sync_attachment` would let the server drop the duplicate.
- **No change feed.** The phone re-reads Pulse when it comes forward, on pull-to-refresh and after the outbox lands
  something. There are no push notifications.
