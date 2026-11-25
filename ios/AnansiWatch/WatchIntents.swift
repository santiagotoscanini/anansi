import AppIntents
import WatchActivity

// The App Shortcut that puts "Record a thought" (`ToggleWatchRecordingIntent`, WatchActivity) in Siri and Shortcuts
// on the watch without the user building anything. The Action Button uses the control (AnansiWatchWidgets).

nonisolated struct AnansiWatchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ToggleWatchRecordingIntent(),
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
