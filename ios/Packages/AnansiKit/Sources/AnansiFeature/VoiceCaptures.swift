import Foundation

/// A finished recording, handed over to the outbox, which uploads it; the server transcribes it (the box's Whisper)
/// and the Inbox shows its words when they arrive. Shared by the in-app recorder (`RecorderView`) and the one the
/// Action Button starts (`BackgroundRecorder`).
enum VoiceCaptures {
    /// Queues the recording (moving the file into the outbox). Answers the capture's item id.
    @discardableResult
    static func queue(recordingAt url: URL, questionId: String?, capturedAt: Date, durationMs: Int) throws -> String {
        try OutboxStore.shared.addVoiceCapture(recordingAt: url, questionId: questionId, capturedAt: capturedAt,
                                               durationMs: durationMs)
    }

    /// Earlier builds transcribed voice notes on the phone and kept a copy of each to read; those copies, and the
    /// queue that listed them, have nothing left to do.
    static func removeOldTranscriptionCopies() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.removeItem(at: base.appending(path: "Transcriptions", directoryHint: .isDirectory))
    }
}
