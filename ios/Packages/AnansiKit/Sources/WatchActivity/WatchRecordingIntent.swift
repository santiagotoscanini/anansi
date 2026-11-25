import AppIntents
import Synchronization

// "Record a thought" on the Apple Watch: what the Ultra's Action Button runs (watch Settings → Action Button →
// Control → Anansi), what the watch's Control Center control and Smart Stack run, and what Siri and Shortcuts offer.
// It lives here because both the watch app and its widget extension must name it (the extension draws the control;
// the app, opened by the intent, runs it): the app registers its recorder at launch and the intent toggles it. Intent
// text must not name the phone's model (App Store Connect refuses it).

/// Lets the watch app's and its extension's App Intents metadata include the intent declared here.
public struct WatchActivityIntents: AppIntentsPackage {}

/// The watch app's recorder, as the intent sees it.
public protocol WatchRecordingController: Sendable {
    /// Starts a voice note, or stops and sends the one being recorded.
    func toggle(from origin: String) async
}

public enum WatchRecordingControl {
    private static let current = Mutex<(any WatchRecordingController)?>(nil)

    public static func register(_ controller: any WatchRecordingController) {
        current.withLock { $0 = controller }
    }

    /// The app's recorder. The intent can run in an app the system just launched for it, so this waits a moment
    /// for launch to register it.
    static func controller() async -> (any WatchRecordingController)? {
        for _ in 0..<60 {
            if let controller = current.withLock({ $0 }) { return controller }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return nil
    }
}

public struct ToggleWatchRecordingIntent: AppIntent {
    public static let title: LocalizedStringResource = "Record a thought"
    public static let description = IntentDescription(
        "Start recording a voice note on this watch, or stop and send the one being recorded.")
    public static let supportedModes: IntentModes = .foreground(.immediate)

    public init() {}

    public func perform() async throws -> some IntentResult {
        await WatchRecordingControl.controller()?.toggle(from: "action button or control")
        return .result()
    }
}
