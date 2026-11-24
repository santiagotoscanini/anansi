import Foundation
import Observation
import SwiftUI

/// One voice note from start to saved: it records as soon as it opens (the Action Button's "Record a thought") and
/// queues the audio the moment it stops. Anansi's server transcribes it; the Inbox shows the words when they come.
/// Closing early never loses anything: a recording in progress is stopped and kept.
@Observable
final class RecordingSession {
    enum Step: Equatable {
        case recording
        case done
        case failed(String)
    }

    let request: RecordRequest
    let recorder = VoiceRecorder()
    private(set) var step: Step = .recording
    @ObservationIgnored private var startedAt = Date.now

    init(request: RecordRequest) {
        self.request = request
    }

    func start() async {
        startedAt = .now
        // A call or Siri taking the microphone: stop and keep what there is.
        recorder.onInterrupted = { [weak self] in self?.stop() }
        await recorder.start()
        if case .failed(let message) = recorder.phase { step = .failed(message) }
    }

    func stop() {
        guard step == .recording else { return }
        guard let durationMs = recorder.stop() else {
            step = .failed("Nothing was recorded.")
            return
        }
        do {
            try VoiceCaptures.queue(recordingAt: recorder.fileURL, questionId: request.questionId,
                                    capturedAt: startedAt, durationMs: durationMs)
            step = .done
        } catch {
            // The file stays in Recordings/, and the next launch queues it (`RecordingRecovery`).
            step = .failed("The recording couldn't be queued yet (\(error.localizedDescription)). It's kept on this phone and will be sent the next time Anansi opens.")
        }
    }

    /// The sheet is going away: keep whatever there is.
    func close() {
        if step == .recording { stop() }
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
        case .done:
            Spacer()
            Image(systemName: "checkmark.circle").font(.system(size: 44)).foregroundStyle(AN.moss)
            Text(session.request.questionTitle == nil ? "Saved to your inbox." : "Saved for the question.")
                .font(AN.text(.body))
                .foregroundStyle(AN.ink)
            Text("Anansi transcribes it; its words show in the Inbox in a moment.")
                .font(AN.ui(.footnote))
                .foregroundStyle(AN.ink3)
                .multilineTextAlignment(.center)
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
