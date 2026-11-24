import ActivityKit
import AnansiActivity
import AVFoundation
import Foundation
import Observation

/// A voice note recorded without opening the app: the Action Button ("Record a thought"), the Control Center
/// control, Siri. The system lets an `AudioRecordingIntent` use the microphone from the background only while a Live
/// Activity shows the recording, so one is started with it (ios/AnansiWidgets draws it) and ended when it stops.
/// A second press, the Live Activity's Stop or the 30-minute limit (`RecordingRules.maxDuration`) stop it. The
/// recording then goes exactly like one made in the app: the file into the outbox, the words worked out on the
/// phone (`TranscriptionStore`, which finishes later what the background time does not cover) and sent after it.
@Observable
final class BackgroundRecorder {
    static let shared = BackgroundRecorder()

    private(set) var isRecording = false

    @ObservationIgnored private var recorder: VoiceRecorder?
    @ObservationIgnored private var activity: Activity<RecordingActivityAttributes>?
    @ObservationIgnored private var startedAt = Date.now
    @ObservationIgnored private var questionId: String?
    @ObservationIgnored private var limit: Task<Void, Never>?
    @ObservationIgnored private var isStarting = false

    func toggle(questionId: String?, questionTitle: String?) async throws -> RecordingToggle {
        if isRecording {
            await stop()
            return .stopped
        }
        try await start(questionId: questionId, questionTitle: questionTitle)
        return .started
    }

    func start(questionId: String?, questionTitle: String?) async throws {
        guard !isRecording, !isStarting else { return }
        isStarting = true
        defer { isStarting = false }
        guard Connection.shared.isConnected else { throw RecordingStartFailure.notConnected }
        // The app's own recorder is open: that one is recording.
        guard CaptureStore.shared.recording == nil else {
            throw RecordingStartFailure.needsApp("The recorder is already open in Anansi.")
        }
        // The microphone prompt can only be shown by the app.
        guard AVAudioApplication.shared.recordPermission == .granted else {
            throw RecordingStartFailure.needsApp("Anansi needs to ask for the microphone first.")
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw RecordingStartFailure.needsApp("Live Activities are off for Anansi.")
        }

        // The session first, then the Live Activity, then the recorder: the order reported to work.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
        } catch {
            throw RecordingStartFailure.needsApp("The microphone couldn't start: \(error.localizedDescription)")
        }
        let now = Date.now
        let state = RecordingActivityAttributes.ContentState(startedAt: now, endsBy: RecordingRules.endsBy(startedAt: now))
        let activity: Activity<RecordingActivityAttributes>
        do {
            activity = try Activity.request(attributes: RecordingActivityAttributes(questionTitle: questionTitle),
                                            content: ActivityContent(state: state, staleDate: nil))
        } catch {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            throw RecordingStartFailure.needsApp("The Live Activity couldn't start: \(error.localizedDescription)")
        }
        let recorder = VoiceRecorder()
        await recorder.start()
        guard recorder.phase == .recording else {
            await activity.end(nil, dismissalPolicy: .immediate)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            var reason = "The recording couldn't start."
            if case .failed(let message) = recorder.phase { reason = message }
            throw RecordingStartFailure.needsApp(reason)
        }

        self.recorder = recorder
        self.activity = activity
        self.questionId = questionId
        startedAt = now
        isRecording = true
        limit = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(RecordingRules.maxDuration)) } catch { return }
            await self?.stop()
        }
    }

    /// Stops, saves, and lets the Live Activity say so for a moment.
    func stop() async {
        guard isRecording, let recorder else { return }
        isRecording = false
        limit?.cancel()
        limit = nil
        let durationMs = recorder.stop()
        let activity = self.activity
        self.recorder = nil
        self.activity = nil

        var saved = false
        if let durationMs {
            do {
                let queued = try VoiceCaptures.queue(recordingAt: recorder.fileURL, questionId: questionId,
                                                     capturedAt: startedAt, durationMs: durationMs)
                if let copy = queued.copy { TranscriptionStore.shared.add(captureItemId: queued.itemId, copy: copy) }
                saved = true
            } catch {
                try? FileManager.default.removeItem(at: recorder.fileURL)
            }
        } else {
            try? FileManager.default.removeItem(at: recorder.fileURL)
        }

        if let activity {
            let final = RecordingActivityAttributes.ContentState(startedAt: startedAt,
                                                                 endsBy: .now, saved: saved)
            await activity.end(ActivityContent(state: final, staleDate: nil),
                               dismissalPolicy: saved ? .after(.now.addingTimeInterval(4)) : .immediate)
        }
    }

    /// At launch: a Live Activity left by a recording the app did not live to finish has nothing behind it.
    func endLeftovers() async {
        // Taken in one go, while no recording is starting, so the list holds only leftovers.
        guard !isRecording, !isStarting else { return }
        let leftovers = Activity<RecordingActivityAttributes>.activities
        for leftover in leftovers {
            await leftover.end(nil, dismissalPolicy: .immediate)
        }
    }

    // MARK: For the intents (off the main actor)

    static func toggle(questionId: String?, questionTitle: String?) async throws -> RecordingToggle {
        try await shared.toggle(questionId: questionId, questionTitle: questionTitle)
    }

    static func stopRecording() async {
        await shared.stop()
    }
}

/// The app's recorder as the shared intents (AnansiActivity) see it, registered at launch.
nonisolated struct AppVoiceRecording: VoiceRecordingController {
    func toggle(questionId: String?, questionTitle: String?) async throws -> RecordingToggle {
        try await BackgroundRecorder.toggle(questionId: questionId, questionTitle: questionTitle)
    }

    func stop() async {
        await BackgroundRecorder.stopRecording()
    }

    func openRecorder(questionId: String?, questionTitle: String?) async {
        await CaptureActions.record(questionId: questionId, questionTitle: questionTitle)
    }
}
