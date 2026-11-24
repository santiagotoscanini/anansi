import ActivityKit
import AnansiActivity
import AVFoundation
import Foundation
import Observation

/// A voice note recorded without opening the app: the Action Button ("Record a thought"), the Control Center
/// control, Siri. The system lets an `AudioRecordingIntent` use the microphone from the background only while a Live
/// Activity shows the recording, so one is started with it (ios/AnansiWidgets draws it) and ended when it stops.
/// A second press, the Live Activity's Stop or the 30-minute limit (`RecordingRules.maxDuration`) stop it. The
/// recording then goes exactly like one made in the app: the file into the outbox, and the server transcribes it.
@Observable
final class BackgroundRecorder {
    static let shared = BackgroundRecorder()

    private(set) var isRecording = false

    @ObservationIgnored private var recorder: VoiceRecorder?
    /// The Live Activity's id (an `Activity` is not Sendable, so it is looked up again to end it).
    @ObservationIgnored private var activityId: String?
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
            await Self.endActivity(activity.id, final: nil, linger: false)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            var reason = "The recording couldn't start."
            if case .failed(let message) = recorder.phase { reason = message }
            throw RecordingStartFailure.needsApp(reason)
        }

        // A call or Siri taking the microphone: stop and keep what there is, rather than a recording that sits
        // paused under a Live Activity still counting.
        recorder.onInterrupted = { [weak self] in
            Task { await self?.stop() }
        }
        self.recorder = recorder
        activityId = activity.id
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
        let activityId = self.activityId
        self.recorder = nil
        self.activityId = nil

        // Too short (`durationMs` nil): the recorder already dropped it. A queue that fails leaves the file in
        // `Recordings/`, and the next launch queues it (`RecordingRecovery`); it is never deleted here.
        var saved = false
        if let durationMs {
            saved = (try? VoiceCaptures.queue(recordingAt: recorder.fileURL, questionId: questionId,
                                              capturedAt: startedAt, durationMs: durationMs)) != nil
        }

        if let activityId {
            let final = RecordingActivityAttributes.ContentState(startedAt: startedAt, endsBy: .now, saved: saved)
            await Self.endActivity(activityId, final: final, linger: saved)
        }
    }

    /// At launch: a Live Activity left by a recording the app did not live to finish has nothing behind it.
    func endLeftovers() async {
        // Taken in one go, while no recording is starting, so the list holds only leftovers.
        guard !isRecording, !isStarting else { return }
        let leftovers = Activity<RecordingActivityAttributes>.activities.map(\.id)
        for id in leftovers {
            await Self.endActivity(id, final: nil, linger: false)
        }
    }

    /// Ends a Live Activity by id, off the main actor: an `Activity` is not Sendable, so only its id crosses.
    @concurrent nonisolated private static func endActivity(_ id: String, final: RecordingActivityAttributes.ContentState?,
                                                         linger: Bool) async {
        guard let activity = Activity<RecordingActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        await activity.end(final.map { ActivityContent(state: $0, staleDate: nil) },
                           dismissalPolicy: linger ? .after(.now.addingTimeInterval(4)) : .immediate)
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
