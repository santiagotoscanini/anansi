// swift-tools-version: 6.2
import PackageDescription

// Layout: `AnansiFeature` is the whole product (UI, stores, networking, and the pure logic under
// Core/ that has no UI imports). `AppFeature` is the thin root the app target embeds. `AnansiIntents` holds the
// App Intents, without the default main-actor isolation (see the note at the top of its file). `AnansiActivity` is
// the small part the widget extension (ios/AnansiWidgets) shares with the app: the recording's Live Activity
// attributes and the intents its Stop button and the Control Center control run. It imports no other target.
// `CaptureCore` is pure (Foundation only) and builds for watchOS too: what the Apple Watch app (ios/AnansiWatch) and
// the phone share about voice notes (WAV files, the recording limits, how a watch note reaches the phone).
// `WatchActivity` is the watch's "Record a thought" intent, shared by the watch app and its widget extension (the
// Action Button's control), like `AnansiActivity` on the phone.
let uiSettings: [SwiftSetting] = [
    .defaultIsolation(MainActor.self),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
]

// The App Intents' targets keep Swift's default (nonisolated) isolation: the system builds and runs intents off the
// main thread.
let intentSettings: [SwiftSetting] = [
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
]

let package = Package(
    name: "AnansiKit",
    platforms: [.iOS("27.0"), .watchOS("27.0")],
    products: [
        .library(name: "AppFeature", targets: ["AppFeature"]),
        .library(name: "AnansiActivity", targets: ["AnansiActivity"]),
        .library(name: "CaptureCore", targets: ["CaptureCore"]),
        .library(name: "WatchActivity", targets: ["WatchActivity"]),
    ],
    targets: [
        .target(name: "AnansiActivity", swiftSettings: intentSettings),
        .target(name: "CaptureCore", swiftSettings: intentSettings),
        .target(name: "WatchActivity", swiftSettings: intentSettings),
        .target(name: "AnansiFeature", dependencies: ["AnansiActivity", "CaptureCore"], swiftSettings: uiSettings),
        .target(name: "AnansiIntents", dependencies: ["AnansiFeature", "AnansiActivity"], swiftSettings: intentSettings),
        .target(name: "AppFeature", dependencies: ["AnansiFeature", "AnansiIntents", "AnansiActivity"],
                swiftSettings: uiSettings),

        // MARK: Tests
        .testTarget(name: "AnansiFeatureTests", dependencies: ["AnansiFeature", "CaptureCore"], swiftSettings: uiSettings),
    ],
    swiftLanguageModes: [.v6]
)
