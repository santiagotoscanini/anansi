import AnansiActivity
import AppIntents
import SwiftUI
import WidgetKit

/// "Record a thought" in Control Center, on the Lock Screen, or on the Action Button (Controls): one press starts
/// a voice note without opening Anansi, the next stops it.
struct RecordThoughtControl: ControlWidget {
    static let kind = "com.santiagotoscanini.anansi.record-thought"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: ToggleRecordingIntent()) {
                Label("Record a thought", systemImage: "mic.fill")
            }
        }
        .displayName("Record a thought")
        .description("Record a voice note for your Anansi inbox without opening the app. Press again to stop.")
    }
}
