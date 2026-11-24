// The app target declares the App Shortcuts (Anansi/AnansiShortcuts.swift) and needs to name the intents, which
// live in AnansiIntents; this makes them visible through AppFeature, the one product the app links.
@_exported import AnansiIntents
import AppIntents

/// The App Intents of this package and the one under it, for the app target's `AppIntentsPackage`.
public nonisolated struct AppFeatureIntents: AppIntentsPackage {
    public static var includedPackages: [any AppIntentsPackage.Type] { [AnansiIntentsPackage.self] }
}
