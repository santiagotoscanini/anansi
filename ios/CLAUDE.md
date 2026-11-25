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
- A video or a voice recording (`fileType` `video`/`audio`) is played by `MediaPlayerView`, straight from
  `/api/v1/attachments/{id}` with the device key in the request; the phone lists them on a journal day but does
  not upload them.
- Over time (one tracking item across its weeks, `/api/v1/tracking-items/{id}/history`) has its rules in
  `Core/History.swift`: what a frame is, where a week sits on the timeline, what a gap is. The web has the same in
  `src/lib/over-time.ts`, with the same test cases; change the two together.
- The journal is one entry per `LocalDay` (`/api/v1/journal/{day}`). Journal text and pictures go through the outbox
  under the item id `journal:YYYY-MM-DD` (`OutboxOp.journalItemId`), and a write replaces the whole prose or the
  whole highlight list, so the day screen only edits a day it has read.
- Don't hand-edit `project.pbxproj` to add files: `Anansi/`, `AnansiWidgets/`, `AnansiWatch/` and `AnansiWatchWidgets/` are synchronized folders, and package
  files are picked up automatically. Adding a target is the one reason to edit it.
- Targets: iOS 27, Swift 6 language mode, default MainActor isolation. Use `@Observable`, not ObservableObject. Use
  Swift Testing (`@Test`, `#expect`), not XCTest.
- **A closure that UIKit or SwiftUI may call off the main thread must be `@Sendable` and take plain values.** With
  default MainActor isolation, any other closure handed to them is compiled as main-actor code, and Swift 6 traps
  (`_dispatch_assert_queue_fail`) when it runs elsewhere. Nothing warns at compile time. SwiftUI's async render
  thread resolves colors and draws `Canvas` while anything animates, so `UIColor { traits in … }` providers and
  `Canvas` renderers are the known cases. Build 102 crashed on every screen transition through `Color(light:dark:)`.
  `ThemeThreadingTests` guards it. `PasteButton` was replaced for the same reason.
- Test: `cd ios/Packages/AnansiKit && xcodebuild test -scheme AnansiKit-Package -destination 'platform=iOS Simulator,name=<an available iPhone>'`
- Build app: `cd ios && xcodebuild build -project Anansi.xcodeproj -scheme Anansi -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- App identity/versioning lives only in `Config/App.xcconfig`.
- Anything under `src/` must pass the web app's `pnpm ci` (format, lint, typecheck, tests, MCP golden, build) and
  ships with daedalus on push to `main`: deploy the server before a phone build that needs it.
- JSON and Markdown under `ios/` are part of the web app's `prettier --check .` (run inside its image build), so keep
  them Prettier-clean: `npx prettier --write ios` from the repo root.
- A push to `main` that changes `ios/` ships a TestFlight build (`ios-deploy.yml`, after `ios-ci.yml` passes).
- Apple Health (`HealthSync.swift`, pure half in `Core/Health.swift`): off until turned on in Settings, then the last
  days' totals go to `PUT /api/v1/health/days` (each day replaces the server's). HealthKit calls back on its own
  queues, so `HealthReader` is `nonisolated` with `@concurrent` methods and only `HealthDay` values cross to the
  main actor. Read only; the entitlements (`Config/Anansi.entitlements`) reach the TestFlight build through the
  ad-hoc signature step in `ios-deploy.yml`, and the App ID's HEALTHKIT capability is turned on by
  `scripts/asc-capability.mjs`. The server's side is `src/lib/health.ts`: keep the fields in step.
- A sync item may take a fixed number of pictures a week (`photosPerWeek`; rules in `Core/SyncItemRules.swift`, the
  web's in `src/lib/sync-item.ts`): when full there is no "add", and an item that takes one has a single slot whose
  button replaces the picture. A replace is an outbox upload with `replaces` set; the old attachment is deleted
  only after the new one has landed. Named `blocks` on a sync item (a transcript, a summary) are shown read-only
  under the notes; they are written on the web or by Claude.
- Capture (the Inbox): `Sources/AnansiIntents/CaptureIntents.swift` (a target of its own with Swift's default
  nonisolated isolation, since `@Parameter` properties cannot be made `nonisolated` under the package's main-actor
  default; it reaches the app only through `CaptureActions`) holds "Capture a thought", "Add to an open question" (both
  `supportedModes = .background`, written through the outbox so they work offline), "Record a thought" (below) and
  "Record in Anansi" (`OpenRecorderIntent`, `.foreground(.immediate)`: it sets `CaptureStore.recording` and HomeView
  shows `RecorderView`, which records at once). The App Shortcuts (English and Spanish phrases) are in the app
  target, `Anansi/AnansiShortcuts.swift`, which reaches the package's intents through `AppIntentsPackage`
  (`AnansiAppIntents` → `AppFeatureIntents` → `AnansiIntentsPackage` → `AnansiActivityIntents`); keep that chain when
  adding an intent. A recording is written to `Application Support/Recordings/` (`VoiceRecorder.folder`, never purged)
  and moved into the outbox only once stopped (`VoiceCaptures.queue`), then uploaded.
  **A thought is never lost:** an interruption (a call, Siri) stops the recording and keeps it (`onInterrupted`; its
  length comes from the file, since the recorder says 0 once paused); a queue that fails leaves the file where it is;
  and at launch `RecordingRecovery` queues every WAV left in `Recordings/` (or the old temporary folder) by a
  recording the app did not live to finish, after writing the real sizes into its header (`Core/WAVFile.swift`).
  Each capture is sent with its outbox op id as `clientId`, so a send repeated after a lost answer gets the same
  capture back rather than a second. `OutboxBackground` sends with the app in the background: on the network
  coming back (`NWPathMonitor`), and in `BGAppRefreshTask` / `BGProcessingTask` runs (identifiers in
  `BGTaskSchedulerPermittedIdentifiers`, background modes `fetch` and `processing`), asked for whenever the queue
  is not empty. Discarding a capture the server refused asks first (`DiscardFailedButton`). `RecordingLog` notes each
  step of a recording (the press, the session, the Live Activity, the recorder, a level line a second, interruptions,
  app and lock state, the stop and why) in `Application Support/recording-log.txt`; the lines not yet sent go with
  the next voice note (`clientLog`, kept as `captures.device_log`), and Settings → Recording log shows them. The
  in-app recorder takes the whole screen while open (HomeView swaps it in rather than presenting it, since a
  presentation fails silently over another sheet), starts only once the scene is active (iOS will not start the
  microphone for an app still coming up), and a second "open the recorder" while it is open stops and saves. **The phone does not transcribe**: the server does, with the box's Whisper
  through the LiteLLM gateway's `stt` model (`src/server/transcribe.ts`). That Whisper refuses AAC and the server
  has no ffmpeg, so `VoiceRecorder` records **16 kHz mono 16-bit little-endian linear PCM WAV** (`.wav`, uploaded as
  `audio/wav`, about 1.9 MB a minute, 58 MB at the 30-minute limit); `API.voiceFormat` sends an `.m4a` still in an
  old outbox as `audio/mp4`, which the server keeps and marks `failed` (shown in the Inbox). A capture carries
  `transcriptStatus` (`pending|done|failed|none`); the Inbox shows "Transcribing…" until the words arrive, reads
  again on foreground and every few seconds while one is pending, and lets a voice note's words be corrected
  (`TranscriptEditView`, `PATCH /api/v1/captures/{id}`), which makes them the user's: the server never replaces
  them. The `transcript` of a queued `voiceCapture` and the `captureTranscript` op are kept only so queues written
  by builds that transcribed on the phone still decode and send. No speech-recognition permission. Pure rules
  (title, where a capture went, what its words line says) are `Core/Capture.swift`, the server's
  `src/lib/captures.ts`. The phone does not play a capture's audio back (the server serves it to the web only).
- Recording without opening the app: "Record a thought" (`RecordThoughtIntent`, the Action Button, Siri, Shortcuts)
  and the Control Center control (`ToggleRecordingIntent`) are `AudioRecordingIntent` + `LiveActivityIntent`, so they
  run in the app's process, in the background. `BackgroundRecorder` (AnansiFeature) requests the Live Activity **first**, then activates the audio session (a mixable `playAndRecord` session, up to three tries: with the session first iOS refused every background activation, "Session activation failed", build 128, and a plain `.record` session is refused in the background even after it, build 129),
  then starts `VoiceRecorder`; the system stops a background recording that has no Live
  Activity, so the two live and end together. A second press, the Live Activity's Stop (`StopRecordingIntent`, an `AudioRecordingIntent` too: as a plain `LiveActivityIntent` a locked phone asked for Face ID first) or the
  30-minute limit (`RecordingRules`, `Core/Recording.swift`) stop it and queue it like the in-app recorder (the server
  transcribes it). When it cannot start in the background (microphone not yet
  allowed, which only the app can ask; Live Activities off; the system refusing), the intent calls
  `continueInForeground` and opens the in-app recorder. The app needs `UIBackgroundModes` `audio` and
  `NSSupportsLiveActivities` (`Config/Info.plist`). The three recording intents set `authenticationPolicy = .alwaysAllowed`.
- The widget extension, `AnansiWidgets/` (target `AnansiWidgets`, bundle id `com.santiagotoscanini.anansi.Widgets`,
  `Config/Widgets.xcconfig` which includes `App.xcconfig` for the version, `Config/Widgets-Info.plist`, no
  entitlements; a synchronized folder, embedded by the app's "Embed Foundation Extensions" phase) draws the Live
  Activity and the control, and nothing else: it links only the package's `AnansiActivity` product (the
  `RecordingActivityAttributes`, the two intents, and `VoiceRecordingControl`, through which the intents reach the
  recorder the app registers at launch). Don't link AnansiFeature into it. `ios-deploy.yml` ad-hoc signs the
  `.appex` before the app, and `scripts/asc-capability.mjs` registers its App ID.
- **App Intent text must not name the device.** App Store Connect rejects a build (ITMS-90626, "Invalid Siri
  Support") when an intent's title, description, parameter or App Shortcut phrase contains "iPhone"; build 123 was
  refused for "transcribed on this iPhone". Say "this phone" or "this device" in any string the intents, the
  Live Activity or the widgets carry.
- **The Apple Watch app** (`AnansiWatch/`, target `AnansiWatch`, bundle id `com.santiagotoscanini.anansi.watchkitapp`,
  `Config/Watch.xcconfig` + `Config/Watch-Info.plist`, watchOS 27, embedded in the phone app by its "Embed Watch
  Content" phase) records voice notes from the wrist: one screen with one button (a double tap of the fingers presses
  it), started also from the complication (`AnansiWatchWidgets/`, bundle id `…watchkitapp.Widgets`, which opens
  `anansiwatch://record`), the Ultra's Action Button (Settings → Action Button → Shortcut → "Record a thought", the
  watch's `RecordThoughtIntent`), Siri and Shortcuts; a second press stops it. It records the same 16 kHz mono WAV as
  the phone (`WatchRecorder`, background audio so it goes on with the wrist down; interruptions and the 30-minute
  limit stop and keep it; a haptic on start and stop) and keeps a per-note log (`NoteLog`, sent as `clientLog`). Its
  code is in the target itself (it links only the package's `CaptureCore`, the pure part it shares with the phone:
  `WAVFile`/`WAVDisk`, `RecordingRules`, `WatchLink`, `WatchQueue`; AnansiFeature re-exports it).
  **A watch note is never lost:** it is written to `Recordings/`, moved to `Notes/` and listed in `notes.json`
  (`NoteStore`) when stopped, and leaves the watch only once the server has it. It travels two ways at once, under
  one id (the server's `clientId`, so it becomes one capture whichever lands first): the watch uploads it itself
  (`DirectUpload`, a background `URLSession` with the phone's key, lent in WatchConnectivity's application context
  and kept in the watch's Keychain, `device=watch`), and hands the file to the phone (`PhoneLink`, `transferFile`).
  The phone (`WatchBridge`, AnansiFeature) stages a received file before the delegate returns (details first, then
  the file, in `Application Support/FromWatch/`), puts it in the outbox under the watch's id with `device = watch`
  and the watch's log, and answers through `transferUserInfo`: `received` once it is queued, `landed` once uploaded
  (said again on every activation for the last 200). A note the watch's own upload delivered is dropped from the
  phone's outbox unsent. At launch the watch repairs and queues any note cut off while recording, and re-queues a
  note file its queue lost. `ios-deploy.yml` ad-hoc signs the watch's extension, then the watch app, before the
  phone's bundles, and `scripts/asc-capability.mjs` registers both App IDs. The server shows the device in the Inbox
  and puts "Recorded from my Apple Watch" (or "my iPhone") on the TickTick task.
