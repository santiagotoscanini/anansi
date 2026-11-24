import AnansiActivity
import Foundation

/// An open question as the intents' question parameter shows it. A plain value, read from any thread.
public nonisolated struct OpenQuestionChoice: Sendable, Hashable {
    public let id: String
    public let question: String
    public let summary: String?
}

/// What the App Intents (the AnansiIntents target) can ask of the app: they live in a target of their own, without
/// this package's default main-actor isolation, and reach the outbox and the stores only through here.
public nonisolated enum CaptureFailure: Error, Sendable {
    /// This iPhone has no key for Anansi yet.
    case notConnected
}

public enum CaptureActions {
    /// The open questions, fresh from Anansi when it answers, else the last ones read.
    public static func openQuestions() async -> [OpenQuestionChoice] {
        await CaptureStore.shared.loadQuestions().map {
            OpenQuestionChoice(id: $0.id, question: $0.question, summary: $0.summary)
        }
    }

    /// Queues a typed thought in the outbox (so it goes later when offline), gives it a few seconds to go now, and
    /// answers the sentence to confirm it with.
    public static func capture(text: String, questionId: String?, questionTitle: String?) async throws -> String {
        guard Connection.shared.isConnected else { throw CaptureFailure.notConnected }
        let itemId = OutboxStore.shared.capture(text: text, questionId: questionId)
        _ = await OutboxStore.shared.waitUntilSent(itemId, timeout: .seconds(6))
        return CaptureRules.confirmation(question: questionTitle)
    }

    /// Opens the recorder (HomeView shows it while a request is set).
    public static func record(questionId: String?, questionTitle: String?) {
        // Already open: a second "open the recorder" must not replace the one recording.
        guard CaptureStore.shared.recording == nil else { return }
        CaptureStore.shared.recording = RecordRequest(questionId: questionId, questionTitle: questionTitle)
    }

    /// Starts a voice note without opening the app (under its Live Activity), or stops the one in progress.
    /// Throws `RecordingStartFailure` when it has to be recorded in the app instead.
    public static func toggleRecording(questionId: String?, questionTitle: String?) async throws -> RecordingToggle {
        try await BackgroundRecorder.shared.toggle(questionId: questionId, questionTitle: questionTitle)
    }
}
