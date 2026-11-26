import AnansiActivity
import SwiftUI

/// The app's one product. The app target embeds `AnansiApp.rootView` and forwards launch.
public enum AnansiApp {
    /// The tab bar, Pulse first: this week's sync to fill, what's coming, what needs attention; then Life, Goals,
    /// Journal and the Inbox.
    public static var rootView: some View { MainTabs() }

    /// Starts sending whatever the outbox kept from the last run (notes and pictures not yet confirmed).
    public static func didFinishLaunching() {
        // The Live Activity's Stop and the Control Center control reach the recorder through this. A launch the
        // system makes to run one of them comes through here before the intent asks for it.
        RecordingLog.shared.note("launch")
        AppLifecycleLog.start()
        VoiceRecordingControl.register(AppVoiceRecording())
        // Sending with the app in the background: the handlers must be registered before launch finishes.
        OutboxBackground.register()
        // Recordings cut off by the app or the phone dying go into the outbox first, then everything is sent.
        RecordingRecovery.recoverLeftovers()
        // The Apple Watch's notes: those it handed over before the app last stopped are queued, then the link opens.
        WatchBridge.shared.start()
        OutboxStore.shared.resume()
        // Registers for Health's background wake-ups, which must happen on every launch.
        HealthSync.shared.start()
        // Voice notes are transcribed by the server now; the phone's old copies go.
        VoiceCaptures.removeOldTranscriptionCopies()
        Task { await BackgroundRecorder.shared.endLeftovers() }
    }
}
