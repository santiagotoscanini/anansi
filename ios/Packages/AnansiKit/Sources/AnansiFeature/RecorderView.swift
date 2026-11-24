import Foundation
import Observation
import SwiftUI

/// One voice note from start to sent: it records as soon as it opens (the Action Button's "Record a thought"),
/// queues the audio the moment it stops, transcribes it on the phone and lets the words be fixed before they go.
/// Closing early never loses anything: a recording in progress is stopped and kept, and words still being
/// transcribed are sent when they are ready.
@Observable
final class RecordingSession {
    enum Step: Equatable {
        case recording
        case transcribing
        case reviewing
        case done
        case failed(String)
    }

    let request: RecordRequest
    let recorder = VoiceRecorder()
    private(set) var step: Step = .recording
    var transcript = ""
    private(set) var transcriptionProblem: String?
    @ObservationIgnored private var captureItemId: String?
    @ObservationIgnored private var startedAt = Date.now
    @ObservationIgnored private var sendWhenTranscribed = false
    @ObservationIgnored private var sent = false

    init(request: RecordRequest) {
        self.request = request
    }

    func start() async {
        startedAt = .now
        await recorder.start()
        if case .failed(let message) = recorder.phase { step = .failed(message) }
    }

    func stop() {
        guard step == .recording else { return }
        guard let durationMs = recorder.stop() else {
            step = .failed("Nothing was recorded.")
            return
        }
        // The outbox owns the recording from here; the transcriber reads its own copy.
        let copy: URL
        do {
            let queued = try VoiceCaptures.queue(recordingAt: recorder.fileURL, questionId: request.questionId,
                                                 capturedAt: startedAt, durationMs: durationMs)
            captureItemId = queued.itemId
            guard let made = queued.copy else {
                transcriptionProblem = "The recording is saved; it goes to Anansi without its words."
                step = .done
                return
            }
            copy = made
        } catch {
            step = .failed("The recording couldn't be saved: \(error.localizedDescription)")
            return
        }
        step = .transcribing
        Task {
            do {
                let words = try await OnDeviceTranscriber.transcribe(copy)
                transcript = words
                step = .reviewing
                if sendWhenTranscribed { send() }
            } catch {
                transcriptionProblem = "Couldn't transcribe it on this iPhone (\(error.localizedDescription)). The audio is saved and goes to Anansi as a voice note."
                step = .done
            }
            try? FileManager.default.removeItem(at: copy)
        }
    }

    /// The words, as they stand, go after the recording.
    func send() {
        guard !sent, let captureItemId, step == .reviewing else { return }
        sent = true
        OutboxStore.shared.setTranscript(captureItemId: captureItemId,
                                         transcript: transcript.trimmingCharacters(in: .whitespacesAndNewlines))
        step = .done
    }

    /// The sheet is going away: keep whatever there is.
    func close() {
        switch step {
        case .recording: stop(); sendWhenTranscribed = true
        case .transcribing: sendWhenTranscribed = true
        case .reviewing: send()
        default: break
        }
    }
}

struct RecorderView: View {
    @State private var session: RecordingSession
    @Environment(\.dismiss) private var dismiss

    init(request: RecordRequest) {
        _session = State(initialValue: RecordingSession(request: request))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if let title = session.request.questionTitle {
                    Text("For “\(title)”")
                        .font(AN.text(.subheadline))
                        .italic()
                        .foregroundStyle(AN.ink3)
                        .multilineTextAlignment(.center)
                }
                content
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .anansiScreen()
            .navigationTitle("Record a thought")
            .navigationBarTitleDisplayMode(.inline)
            .anansiNavigationBar()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if session.step != .recording {
                        Button("Done") {
                            session.close()
                            dismiss()
                        }
                    }
                }
            }
        }
        .interactiveDismissDisabled(session.step == .recording)
        .task { await session.start() }
        .onDisappear { session.close() }
    }

    @ViewBuilder
    private var content: some View {
        switch session.step {
        case .recording:
            Spacer()
            Text(CaptureRules.duration(seconds: session.recorder.elapsed))
                .font(AN.mono(.largeTitle))
                .foregroundStyle(AN.ink)
            LevelMeter(level: session.recorder.level)
                .frame(height: 48)
            Spacer()
            Button {
                session.stop()
            } label: {
                ZStack {
                    Circle().fill(AN.clay).frame(width: 96, height: 96)
                    RoundedRectangle(cornerRadius: 6).fill(AN.onClay).frame(width: 32, height: 32)
                }
            }
            .accessibilityLabel("Stop recording")
            Text("Tap to stop").font(AN.ui(.footnote)).foregroundStyle(AN.ink3)
        case .transcribing:
            Spacer()
            ProgressView()
            Text("Transcribing…").font(AN.text(.body)).foregroundStyle(AN.ink2)
            Text("The audio is already on its way.").font(AN.ui(.footnote)).foregroundStyle(AN.ink3)
            Spacer()
        case .reviewing:
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(text: "What you said")
                TextEditor(text: $session.transcript)
                    .font(AN.text(.body))
                    .scrollContentBackground(.hidden)
                    .anansiRecess()
                Text("Fix anything, then Done. The first line is its title in TickTick.")
                    .font(AN.ui(.footnote))
                    .foregroundStyle(AN.ink3)
            }
        case .done:
            Spacer()
            Image(systemName: "checkmark.circle").font(.system(size: 44)).foregroundStyle(AN.moss)
            Text(session.request.questionTitle == nil ? "Saved to your inbox." : "Added to the question.")
                .font(AN.text(.body))
                .foregroundStyle(AN.ink)
            if let problem = session.transcriptionProblem {
                Text(problem).font(AN.ui(.footnote)).foregroundStyle(AN.ink3).multilineTextAlignment(.center)
            }
            Spacer()
        case .failed(let message):
            Spacer()
            Text(message).font(AN.text(.body)).foregroundStyle(AN.rust).multilineTextAlignment(.center)
            Spacer()
        }
    }
}

/// The input level as a row of bars that fill from the middle out.
private struct LevelMeter: View {
    let level: Double

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<24, id: \.self) { index in
                let distance = abs(Double(index) - 11.5) / 12
                let lit = level > distance
                Capsule()
                    .fill(lit ? AN.clay : AN.hairline2)
                    .frame(width: 6, height: 8 + 40 * max(0, level - distance))
            }
        }
        .animation(.linear(duration: 0.06), value: level)
        .accessibilityHidden(true)
    }
}
