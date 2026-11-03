# Anansi for iPhone

The iPhone side of Anansi: fill the weekly sync from the phone (notes, pictures from the camera or the library),
see Pulse at a glance, and set up the items every week starts with.

- **iOS 27+**, Swift 6 (strict concurrency, MainActor by default), SwiftUI, Observation, Swift Testing
- **Xcode 27**, synchronized folders: adding files never touches the `.xcodeproj`
- **CI/CD**: GitHub Actions, only for `ios/`. Every push that touches `ios/` runs the tests, and every green `main`
  ships to TestFlight. The web app (including the phone's API) keeps shipping through daedalus.

## How it talks to Anansi

The phone has its own REST API on the server, `/api/v1/*` (`src/routes/api.v1.*.ts`), private to keys you create
after signing in on the web. Each route calls the same service layer the web app and the MCP tools use. MCP stays
for Claude; the phone doesn't use it.

1. **Connect**: on the web, open your profile → **Devices** → **Create key**. The key is shown once, as text and as a
   QR code of `anansi://connect?server=…&key=…`. Scan it in the app (Connect → Scan the QR code) or with the iPhone
   Camera app, open the link on the phone, or type the key. The app checks it against `GET /api/v1/me` before
   keeping it in the Keychain. Revoke the key on the web to cut the phone off.
2. **Read**: `GET /api/v1/pulse?day=` and `GET /api/v1/weeks/{day}` with the phone's own calendar day (`YYYY-MM-DD`),
   because Anansi names a week by the user's day, not the server's clock.
3. **Write**: notes (`PATCH /api/v1/sync-items/{id}`), pictures (`POST /api/v1/sync-items/{id}/attachments`, the
   JPEG itself as the body), the week's items and order, the library, the default template, and each item's camera
   outline (`PUT /api/v1/tracking-items/{id}/overlay`).

## What it does

- **Pulse** (home): the greeting and how much of the week is filled, every item of this week's sync as a card (state,
  goal, notes so far, pictures, and "Add picture" right there), Upcoming (next bids and important dates), On the
  horizon (month, quarter, year), and the people needing attention. "Start this week" when the week has no sync yet.
  Pull down to refresh; it also refreshes when the app comes forward and after uploads land.
- **An item**: notes saved as you type, pictures in a grid (tap to view full screen, long-press to delete), "Take a
  picture" (the pose camera) or "Choose from library" (up to 10 at once).
- **Pose camera**: for pictures you retake every week (face, chest, side, back). A 3:4 live preview with the item's
  **outline** drawn over it and **last time's picture** faded underneath (opacity slider), a 3 or 10 second
  **self-timer**, and the front/back switch. Front-camera pictures are saved mirrored, as previewed, so the outline,
  the ghost and the picture share one frame. **Draw outline** turns the same screen into the editor: draw with a
  finger over the live camera (thin, medium, thick; undo; clear) and save it on the tracking item, where every phone
  finds it. Also reachable from Sync setup → an item → Camera outline.
- **Weekly sync**: any week, back and forth, grouped by goal with the goal's importance as on the web. Start a week,
  add an item from the library (or a new one) to that week only, swipe to take one off, change the order.
- **Sync setup**: the library of tracking items (create, edit title/description/goal, delete; an item past weeks used
  is archived by the server instead) and the **default items**, the template every new week starts with: add, remove,
  reorder.
- **Settings**: the connection (server, account, connect again, disconnect), what is still being sent (with retry/discard for anything Anansi refused), the
  picture cache.

### Offline and uploads

Notes and pictures go through an outbox kept on disk (`Core/SyncOutbox.swift`): the newest unsent notes for an item
replace older unsent ones, pictures are scaled to 2048 px JPEG and kept as files until Anansi confirms them, and
everything goes out one op at a time, in order, with backoff when offline. Screens show the outbox on top of the
server's answer, so what you typed is what you see. A refusal for good (the item was removed from the week, the file
was rejected) is kept with Anansi's sentence until you retry or discard it.

## Layout

```
ios/
  Anansi/                    App target: just the @main entry + assets
  Config/App.xcconfig        Bundle ID, team, version: the single source of truth
  Packages/AnansiKit/
    Sources/AppFeature/      RootView (shows Pulse) + the app delegate hook
    Sources/AnansiFeature/   Everything else
      Core/                  Pure logic, no UI imports: contract models, LocalDay, API, connect link, overlay, outbox
      Theme.swift            Anansi's warm paper look (tokens from src/styles/globals.css), light and dark
      APIClient.swift ...    The connection, the API client, stores, camera, screens
    Tests/AnansiFeatureTests/  Swift Testing suites for Core
  docs/contract-needs.md     Where the phone works around the server
  scripts/setup-ci.sh        One-time TestFlight secrets
.github/workflows/ios-ci.yml, ios-deploy.yml
```

## Local commands

```bash
cd ios/Packages/AnansiKit && xcodebuild test -scheme AnansiKit -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
```

```bash
cd ios && xcodebuild build -project Anansi.xcodeproj -scheme Anansi -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

For a dev server, create a key at `http://localhost:5173` and use "Enter a key instead" with that server
(loopback `http://` is allowed for the simulator).

## Releasing

Push to `main`. When iOS CI passes, `ios-deploy.yml` archives the app with cloud-managed signing and uploads it to
TestFlight. The build number is `github.run_number + 100`. Bump `MARKETING_VERSION` in `Config/App.xcconfig` for a
new version.

One-time setup:

1. In App Store Connect, create the app with the bundle ID `com.santiagotoscanini.anansi` (Apps → + → New App).
2. Run `ios/scripts/setup-ci.sh` with the App Store Connect API key in `~/Downloads` (the same key device-lab uses
   works). It sets:

| Kind     | Name                 | Value                         |
| -------- | -------------------- | ----------------------------- |
| secret   | `ASC_KEY_ID`         | App Store Connect API key ID  |
| secret   | `ASC_ISSUER_ID`      | API key issuer ID             |
| secret   | `ASC_KEY_P8_BASE64`  | `base64 -i AuthKey_XXXX.p8`   |
| variable | `IOS_DEPLOY_ENABLED` | `true`                        |
