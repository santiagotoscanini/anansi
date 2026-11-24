import Foundation

// Captures: a thought or a voice note dropped from the Action Button, Siri, a shortcut or the app, kept by
// Anansi and sent on once: to an open question as a note, else to the user's TickTick Inbox. The server's
// rules are anansi/src/lib/captures.ts and src/server/services/captures.ts; the routes are
// src/routes/api.v1.captures*.ts. Keep the title rule and the labels in step with the web.

/// One capture as `/api/v1/captures` answers it.
nonisolated struct Capture: Codable, Hashable, Sendable, Identifiable {
    var id: String
    /// `text` or `voice`.
    var kind: String
    /// The typed text, or a voice note's transcript once it arrived; `""` means no words were heard.
    var text: String?
    var durationMs: Int?
    var questionId: String?
    /// The question's text, when the capture is aimed at one.
    var question: String?
    var noteId: String?
    var tickTickTaskId: String?
    /// `new`, `routed` or `archived`.
    var status: String
    var routeError: String?
    var source: String?
    /// ISO 8601: the moment on the device that captured it.
    var capturedAt: String
    /// A voice note's words, written by the server's transcriber: `pending`, `done`, `failed` (it refused the
    /// audio), or `none` for typed text. Absent from servers before server transcription.
    var transcriptStatus: String?
    var transcribeAttempts: Int?
    var transcribeError: String?

    var isVoice: Bool { kind == "voice" }

    /// A voice note whose words the server has not written yet (and has not given up on).
    var isTranscribing: Bool { isVoice && text == nil && transcriptStatus != "failed" }
}

/// An open question, for the question picker (`/api/v1/open-questions`).
nonisolated struct OpenQuestionRef: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var question: String
    /// The first line of what the user knows so far, if anything.
    var summary: String?
}

nonisolated enum CaptureRules {
    /// A TickTick title is the capture's first line, at most this long (the server's `CAPTURE_TITLE_MAX`).
    static let titleMax = 120

    /// The first line with something on it, trimmed, cut to `titleMax` with an ellipsis.
    static func title(_ text: String) -> String {
        let first = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first(where: { !$0.isEmpty }) ?? ""
        guard first.count > titleMax else { return first }
        let cut = String(first.prefix(titleMax - 1))
        return cut.trimmingCharacters(in: .whitespaces) + "…"
    }

    /// Where a capture went, or why it is still in Anansi: the line under it in the Inbox.
    enum Destination: Hashable, Sendable {
        case question(String)
        case tickTick
        case failed(String)
        case transcribing
        case kept
        case archived
    }

    static func destination(_ c: Capture) -> Destination {
        if c.status == "archived" { return .archived }
        if c.noteId != nil { return .question(c.question ?? "an open question") }
        if c.tickTickTaskId != nil { return .tickTick }
        if let error = c.routeError { return .failed(error) }
        if c.isVoice && c.text == nil && c.transcriptStatus != "failed" { return .transcribing }
        return .kept
    }

    /// What the Inbox shows in place of a capture's words (the web's `transcriptView`).
    enum Words: Hashable, Sendable {
        case text(String)
        case empty
        case transcribing(retrying: Bool)
        case failed(String)
    }

    static func words(_ c: Capture) -> Words {
        if let text = c.text { return text.isEmpty ? .empty : .text(text) }
        if c.transcriptStatus == "failed" { return .failed(c.transcribeError ?? "") }
        return .transcribing(retrying: (c.transcribeAttempts ?? 0) > 0 || c.transcribeError != nil)
    }

    /// The words as one line of text, for a row or a card.
    static func wordsLine(_ c: Capture) -> String {
        switch words(c) {
        case .text(let text): text
        case .empty: "No words heard"
        case .transcribing(let retrying): retrying ? "Transcribing… (waiting for the transcriber)" : "Transcribing…"
        case .failed: "Couldn't transcribe it"
        }
    }

    static func label(_ destination: Destination) -> String {
        switch destination {
        case .question(let q): "→ question: \(q)"
        case .tickTick: "→ TickTick inbox"
        case .failed(let message): "Couldn't send it on: \(message)"
        case .transcribing: "Waiting for its words"
        case .kept: "Kept in Anansi"
        case .archived: "Archived"
        }
    }

    /// What Siri or the Shortcuts banner says once a capture is saved.
    static func confirmation(question: String?) -> String {
        guard let question, !question.isEmpty else { return "Saved to your inbox." }
        return "Added to “\(title(question))”."
    }

    /// "0:42", "12:05": a recording's length.
    static func duration(seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }
}
