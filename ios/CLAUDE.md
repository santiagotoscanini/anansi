# Anansi (iPhone app): agent notes

- This folder is the iPhone app for Anansi, the web app at the repo root. The phone's server side is the REST API in
  `src/routes/api.v1.*.ts` (helpers in `src/server/api/v1.ts`, keys in `src/server/services/api-keys.ts`); change it
  together with the app, keep it calling the service layer, and never touch the MCP tool catalog for the phone.
- One iOS app, one product. The root view is Pulse; there is no tab bar.
- Keep the app target thin (`Anansi/`: @main, assets). All code lives in `Packages/AnansiKit`:
  `Sources/AnansiFeature` (UI, stores, networking) and `Sources/AppFeature` (RootView + app delegate hooks).
- `Sources/AnansiFeature/Core/` is pure logic: Foundation only, no UIKit/SwiftUI/CryptoKit imports. The contract
  models, `LocalDay` week maths, the API endpoints and errors, the connect link, the overlay (outline) model, the
  mention grammar, the outbox and the wording live there so they can be tested without a simulator. New logic
  that can be pure goes in `Core/`.
- The server contract is `/api/v1` with `Authorization: Bearer ank_…`, a per-device key the user creates on the web
  (Profile → Devices, shown once as text and as a QR of `anansi://connect?server=…&key=…`). Errors are
  `{ "error": { code, message } }`. `Core/API.swift` mirrors every route; the camera outline's shape is
  `src/lib/overlay.ts` on the server and `Core/Overlay.swift` here, limits included.
- Weeks are named by the user's calendar day (`LocalDay`, `YYYY-MM-DD`), never by an instant: see
  `weekOfDay` in `src/lib/week.ts`.
- Text names a person with the token `@[Name](person:<id>)` in three places: journal text, a sync item's notes
  (`textContent`) and a task's title and description. The grammar is `src/lib/mentions.ts` on the server and
  `Core/MentionText.swift` here. The phone only reads tokens (`MentionStyle.attributed` where text is read,
  `MentionText.editable` in an editor, `MentionText.plain` in one-line previews and task titles; never a raw
  token on screen) and sends plain `@Name` back: the server links it on every write, so never build tokens on the
  phone. Only a journal entry carries `mentions` (current names); elsewhere the token's own label is shown, which
  the server keeps current. An editor's text, the outbox's unsent text and `editable(stored)` are one form, so
  compare in that form and never against the stored text.
- Over time (one tracking item across its weeks, `/api/v1/tracking-items/{id}/history`) has its rules in
  `Core/History.swift`: what a frame is, where a week sits on the timeline, what a gap is. The web has the same in
  `src/lib/over-time.ts`, with the same test cases; change the two together.
- The journal is one entry per `LocalDay` (`/api/v1/journal/{day}`). Journal text and pictures go through the outbox
  under the item id `journal:YYYY-MM-DD` (`OutboxOp.journalItemId`), and a write replaces the whole prose or the
  whole highlight list, so the day screen only edits a day it has read.
- Don't hand-edit `project.pbxproj` to add files: `Anansi/` is a synchronized folder, and package files are picked up
  automatically.
- Targets: iOS 27, Swift 6 language mode, default MainActor isolation. Use `@Observable`, not ObservableObject. Use
  Swift Testing (`@Test`, `#expect`), not XCTest.
- **A closure that UIKit or SwiftUI may call off the main thread must be `@Sendable` and take plain values.** With
  default MainActor isolation, any other closure handed to them is compiled as main-actor code, and Swift 6 traps
  (`_dispatch_assert_queue_fail`) when it runs elsewhere. Nothing warns at compile time. SwiftUI's async render
  thread resolves colors and draws `Canvas` while anything animates, so `UIColor { traits in … }` providers and
  `Canvas` renderers are the known cases. Build 102 crashed on every screen transition through `Color(light:dark:)`.
  `ThemeThreadingTests` guards it. `PasteButton` was replaced for the same reason.
- Test: `cd ios/Packages/AnansiKit && xcodebuild test -scheme AnansiKit -destination 'platform=iOS Simulator,name=<an available iPhone>'`
- Build app: `cd ios && xcodebuild build -project Anansi.xcodeproj -scheme Anansi -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- App identity/versioning lives only in `Config/App.xcconfig`.
- Anything under `src/` must pass the web app's `pnpm ci` (format, lint, typecheck, tests, MCP golden, build) and
  ships with daedalus on push to `main`: deploy the server before a phone build that needs it.
- JSON and Markdown under `ios/` are part of the web app's `prettier --check .` (run inside its image build), so keep
  them Prettier-clean: `npx prettier --write ios` from the repo root.
- A push to `main` that changes `ios/` ships a TestFlight build (`ios-deploy.yml`, after `ios-ci.yml` passes).
