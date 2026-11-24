import AnansiActivity
import SwiftUI

/// The app's one product. The app target embeds `AnansiApp.rootView` and forwards launch.
public enum AnansiApp {
    /// Pulse: this week's sync to fill, what's coming, what needs attention.
    public static var rootView: some View { HomeView() }

    /// Starts sending whatever the outbox kept from the last run (notes and pictures not yet confirmed).
    public static func didFinishLaunching() {
        // The Live Activity's Stop and the Control Center control reach the recorder through this. A launch the
        // system makes to run one of them comes through here before the intent asks for it.
        VoiceRecordingControl.register(AppVoiceRecording())
        OutboxStore.shared.resume()
        // Registers for Health's background wake-ups, which must happen on every launch.
        HealthSync.shared.start()
        // Words of voice notes the last run did not have time to transcribe.
        TranscriptionStore.shared.runPending()
        Task { await BackgroundRecorder.shared.endLeftovers() }
    }
}
