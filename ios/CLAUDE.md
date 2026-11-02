# Anansi (iPhone app): agent notes

- This folder is the iPhone app for Anansi, the web app at the repo root. Work on the phone app touches only `ios/`
  and `.github/workflows/ios-*.yml`; the web app, its server and its MCP tool catalog are never edited from here.
- One iOS app, one product. The root view is Pulse; there is no tab bar.
- Keep the app target thin (`Anansi/`: @main, assets). All code lives in `Packages/AnansiKit`:
  `Sources/AnansiFeature` (UI, stores, networking) and `Sources/AppFeature` (RootView + app delegate hooks).
- `Sources/AnansiFeature/Core/` is pure logic: Foundation only, no UIKit/SwiftUI/CryptoKit imports. The contract
  models, `LocalDay` week maths, the MCP envelope, the OAuth helpers, the outbox and the wording live there so they
  can be type-checked and tested without a simulator. New logic that can be pure goes in `Core/`.
- The server contract is Anansi's MCP server (`POST /api/mcp`, tools in `src/lib/mcp/tools/*.ts`, the catalog pinned
  in `.golden/mcp-tools.json`) and its OAuth 2.1 server (`src/lib/mcp/oauth/`). The phone is just another MCP client.
  Anything it needs that the tools don't offer goes in `ios/docs/contract-needs.md`.
- Weeks are named by the user's calendar day (`LocalDay`, `YYYY-MM-DD`), never by an instant: see `localDay` in
  `src/lib/mcp/tools/fields.ts`.
- Don't hand-edit `project.pbxproj` to add files: `Anansi/` is a synchronized folder, and package files are picked up
  automatically.
- Targets: iOS 27, Swift 6 language mode, default MainActor isolation. Use `@Observable`, not ObservableObject. Use
  Swift Testing (`@Test`, `#expect`), not XCTest.
- Test: `cd ios/Packages/AnansiKit && xcodebuild test -scheme AnansiKit -destination 'platform=iOS Simulator,name=<an available iPhone>'`
- Build app: `cd ios && xcodebuild build -project Anansi.xcodeproj -scheme Anansi -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`
- App identity/versioning lives only in `Config/App.xcconfig`.
- JSON and Markdown under `ios/` are part of the web app's `prettier --check .` (run inside its image build), so keep
  them Prettier-clean: `npx prettier --write ios` from the repo root.
- A push to `main` that changes `ios/` ships a TestFlight build (`ios-deploy.yml`, after `ios-ci.yml` passes).
