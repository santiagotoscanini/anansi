import ActivityKit
import Foundation
import Synchronization

// What the app and the widget extension (ios/AnansiWidgets) share about a voice note recorded without opening the
// app: the Live Activity's attributes, and the door through which the intents here reach the recorder, which
// lives in the app (`BackgroundRecorder` in AnansiFeature). The intents run in the app's process (they are
// `LiveActivityIntent`s), and the extension only needs their types to put them on a button. This target imports
// no other target, so the extension stays small.

/// The recording's Live Activity: on the Lock Screen and in the Dynamic Island for as long as it records.
public struct RecordingActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable, Sendable {
        /// When the recording started: the timer counts up from here.
        public var startedAt: Date
        /// When it stops by itself (the 30-minute limit).
        public var endsBy: Date
        /// The recording stopped and is saved; shown for a moment before the activity goes away.
        public var saved: Bool

        public init(startedAt: Date, endsBy: Date, saved: Bool = false) {
            self.startedAt = startedAt
            self.endsBy = endsBy
            self.saved = saved
        }
    }

    /// The open question it is for, if one was picked.
    public var questionTitle: String?

    public init(questionTitle: String?) {
        self.questionTitle = questionTitle
    }
}

/// What a press did.
public enum RecordingToggle: Sendable {
    case started
    case stopped
}

/// Why a recording could not start in the background.
public enum RecordingStartFailure: Error, Sendable {
    /// This iPhone has no key for Anansi yet.
    case notConnected
    /// It has to start in the app (the microphone not yet allowed, Live Activities off, the system refused).
    case needsApp(String)
}

/// The recorder, as the app provides it. Called from the intents, off the main actor.
public protocol VoiceRecordingController: Sendable {
    /// Starts a recording, or stops the one in progress.
    func toggle(questionId: String?, questionTitle: String?) async throws -> RecordingToggle
    /// Stops the recording in progress, if any, and saves it.
    func stop() async
    /// Opens the app's own recorder (the fallback, once the intent is in the foreground).
    func openRecorder(questionId: String?, questionTitle: String?) async
}

/// Where the app registers its recorder at launch (`AnansiApp.didFinishLaunching`).
public enum VoiceRecordingControl {
    private static let current = Mutex<(any VoiceRecordingController)?>(nil)

    public static func register(_ controller: any VoiceRecordingController) {
        current.withLock { $0 = controller }
    }

    /// The app's recorder. An intent can run in a process the system just launched for it, so this waits a moment
    /// for launch to register it.
    static func controller() async -> (any VoiceRecordingController)? {
        for _ in 0..<40 {
            if let controller = current.withLock({ $0 }) { return controller }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return nil
    }
}
