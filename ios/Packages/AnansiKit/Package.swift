// swift-tools-version: 6.2
import PackageDescription

// Layout: `AnansiFeature` is the whole product (UI, stores, networking, and the pure logic under
// Core/ that has no UI imports). `AppFeature` is the thin root the app target embeds.
let uiSettings: [SwiftSetting] = [
    .defaultIsolation(MainActor.self),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
]

let package = Package(
    name: "AnansiKit",
    platforms: [.iOS("27.0")],
    products: [
        .library(name: "AppFeature", targets: ["AppFeature"]),
    ],
    targets: [
        .target(name: "AnansiFeature", swiftSettings: uiSettings),
        .target(name: "AppFeature", dependencies: ["AnansiFeature"], swiftSettings: uiSettings),

        // MARK: Tests
        .testTarget(name: "AnansiFeatureTests", dependencies: ["AnansiFeature"], swiftSettings: uiSettings),
    ],
    swiftLanguageModes: [.v6]
)
