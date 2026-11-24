import AppFeature
import AppIntents

// The App Shortcuts: what shows up in Shortcuts, Spotlight, Siri and the Action Button's "Shortcut" setting
// without the user building anything. The intents themselves live in the AnansiKit package
// (AnansiIntents/CaptureIntents.swift, AnansiActivity/RecordingIntents.swift); `AnansiAppIntents` lets this
// target's metadata include them.

nonisolated struct AnansiAppIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [AppFeatureIntents.self] }
}

nonisolated struct AnansiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureThoughtIntent(),
            phrases: [
                "Capture a thought in \(.applicationName)",
                "Capture in \(.applicationName)",
                "Note a thought in \(.applicationName)",
                "Anotar en \(.applicationName)",
                "Capturar una idea en \(.applicationName)",
            ],
            shortTitle: "Capture a thought",
            systemImageName: "square.and.pencil"
        )
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
        AppShortcut(
            intent: OpenRecorderIntent(),
            phrases: [
                "Open the recorder in \(.applicationName)",
                "Record a voice note in \(.applicationName)",
                "Abrir la grabadora en \(.applicationName)",
            ],
            shortTitle: "Record in Anansi",
            systemImageName: "mic.circle"
        )
        AppShortcut(
            intent: AddToQuestionIntent(),
            phrases: [
                "Add to a question in \(.applicationName)",
                "Add to an open question in \(.applicationName)",
                "Agregar a una pregunta en \(.applicationName)",
            ],
            shortTitle: "Add to a question",
            systemImageName: "questionmark.bubble"
        )
    }
}
