import AnansiActivity
import AppIntents
import SwiftUI
import WidgetKit

// The widget extension: the Live Activity of a voice note being recorded from the Action Button, and the Control
// Center control that starts one. Both only draw; their intents (AnansiActivity) run in the app, where the
// recorder is (`BackgroundRecorder`). Nothing here reads the app's data.

@main
struct AnansiWidgets: WidgetBundle {
    var body: some Widget {
        RecordingLiveActivity()
        RecordThoughtControl()
    }
}

/// Lets this extension's App Intents metadata include the intents its buttons run.
struct AnansiWidgetsIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [AnansiActivityIntents.self] }
}
