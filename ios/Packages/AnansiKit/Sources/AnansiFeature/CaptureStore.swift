import Foundation
import Observation

/// What a "Record a thought" asks for: the recorder sheet shows while one is set (`CaptureStore.recording`).
struct RecordRequest: Identifiable, Hashable {
    let id = UUID()
    var questionId: String?
    var questionTitle: String?
}

/// The Inbox as the phone sees it: the latest captures from Anansi, the open questions a capture can be aimed at
/// (kept on disk too, so the question picker works offline), and the recorder the Action Button opens. Captures
/// themselves are written through the outbox (`OutboxStore.capture`, `addVoiceCapture`), which hands each answer
/// back here as it lands.
@Observable
final class CaptureStore {
    static let shared = CaptureStore()

    private(set) var captures: [Capture] = []
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var error: String?
    private(set) var questions: [OpenQuestionRef] = []

    /// Set by `RecordThoughtIntent` or the mic button; HomeView shows the recorder while it is.
    var recording: RecordRequest?
    /// Bumped when the Action Button is pressed while the recorder is open: the recorder stops and saves.
    var stopPresses = 0

    @ObservationIgnored private let questionsKey = "anansi.openQuestions"

    init() {
        if let data = UserDefaults.standard.data(forKey: questionsKey),
           let saved = try? JSONDecoder().decode([OpenQuestionRef].self, from: data) {
            questions = saved
        }
    }

    func load() async {
        guard Connection.shared.isConnected else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            captures = try await APIClient.shared.captures(limit: 50)
            hasLoaded = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The open questions, fresh when Anansi answers, else the last ones read.
    @discardableResult
    func loadQuestions() async -> [OpenQuestionRef] {
        guard Connection.shared.isConnected else { return questions }
        if let fresh = try? await APIClient.shared.openQuestions() {
            questions = fresh
            if let data = try? JSONEncoder().encode(fresh) { UserDefaults.standard.set(data, forKey: questionsKey) }
        }
        return questions
    }

    /// The outbox sent a capture (or its words): the server's copy replaces or joins the list.
    func didLand(_ capture: Capture) {
        if let index = captures.firstIndex(where: { $0.id == capture.id }) {
            captures[index] = capture
        } else {
            captures.insert(capture, at: 0)
        }
    }

    func clear() {
        captures = []
        hasLoaded = false
        error = nil
    }
}
