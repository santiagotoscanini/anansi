import AppIntents

// "Record a thought" on the watch: what the Apple Watch Ultra's Action Button runs (Settings → Action Button →
// Shortcut → Record a thought), and what Siri and Shortcuts offer. It opens the app, which records at once; run
// again, it stops and sends. Intent text must not name the phone's model (App Store Connect refuses it).

nonisolated struct RecordThoughtIntent: AppIntent {
    static let title: LocalizedStringResource = "Record a thought"
    static let description = IntentDescription(
        "Start recording a voice note on this watch, or stop and send the one being recorded.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    init() {}

    func perform() async throws -> some IntentResult {
        await WatchRecorder.shared.toggle(from: "shortcut")
        return .result()
    }
}

nonisolated struct AnansiWatchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordThoughtIntent(),
            phrases: [
                "Record a thought in \(.applicationName)",
                "Record in \(.applicationName)",
                "Grabar una idea en \(.applicationName)",
                "Grabar en \(.applicationName)",
            ],
            shortTitle: "Record a thought",
            systemImageName: "mic"
        )
    }
}
