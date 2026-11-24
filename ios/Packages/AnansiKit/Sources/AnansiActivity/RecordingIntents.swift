import AppIntents
import Foundation

// The intents the widget extension puts on buttons: the Live Activity's Stop, and the Control Center control.
// They are `LiveActivityIntent`s, so the system runs them in the app's process, where the recorder is. The intent
// the Action Button, Siri and Shortcuts use is "Record a thought" (`RecordThoughtIntent` in AnansiIntents), which
// can also aim the note at an open question.

/// Lets the app's and the extension's App Intents metadata include the intents declared here.
public struct AnansiActivityIntents: AppIntentsPackage {}

enum RecordingIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notConnected
    case unavailable

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notConnected: "This phone isn't connected to Anansi yet. Open Anansi and connect it first."
        case .unavailable: "Anansi couldn't start recording. Open Anansi and try again."
        }
    }
}

/// The Control Center control (and the Lock Screen's): starts a voice note, or stops the one being recorded.
public struct ToggleRecordingIntent: AudioRecordingIntent, LiveActivityIntent {
    public static let title: LocalizedStringResource = "Record a thought"
    public static let description = IntentDescription(
        "Start recording a voice note without opening Anansi, or stop the one being recorded.")
    public static let isDiscoverable = false
    public static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    public static let supportedModes: IntentModes = [.background, .foreground(.dynamic)]

    public init() {}

    public func perform() async throws -> some IntentResult {
        guard let controller = await VoiceRecordingControl.controller() else { throw RecordingIntentError.unavailable }
        do {
            _ = try await controller.toggle(questionId: nil, questionTitle: nil)
        } catch RecordingStartFailure.notConnected {
            throw RecordingIntentError.notConnected
        } catch {
            // The system would not let it record from here: record in the app instead.
            try await continueInForeground(alwaysConfirm: false)
            await controller.openRecorder(questionId: nil, questionTitle: nil)
        }
        return .result()
    }
}

/// The Live Activity's Stop button. An `AudioRecordingIntent` too ("starts, stops, or otherwise modifies audio
/// recording"): a plain `LiveActivityIntent` on a locked phone waited for Face ID before it ran (build 129), even with
/// `.alwaysAllowed`.
public struct StopRecordingIntent: AudioRecordingIntent, LiveActivityIntent {
    public static let title: LocalizedStringResource = "Stop recording"
    public static let description = IntentDescription("Stop the voice note being recorded and save it to Anansi.")
    public static let isDiscoverable = false
    public static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    public static let supportedModes: IntentModes = .background

    public init() {}

    public func perform() async throws -> some IntentResult {
        await VoiceRecordingControl.controller()?.stop()
        return .result()
    }
}
