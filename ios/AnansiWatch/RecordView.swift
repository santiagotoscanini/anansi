import CaptureCore
import SwiftUI
import WatchKit

/// The whole app: a button that records (and stops), how long it has been going, and whether every note has
/// reached Anansi. A double tap of the fingers presses it too.
struct RecordView: View {
    @Environment(\.scenePhase) private var scenePhase
    private let recorder = WatchRecorder.shared
    private let notes = NoteStore.shared
    private let link = PhoneLink.shared

    var body: some View {
        VStack(spacing: 8) {
            Spacer(minLength: 0)
            Button {
                Task { await recorder.toggle(from: "button") }
            } label: {
                ZStack {
                    Circle()
                        .fill(recorder.isRecording ? Color.red : Color.accentColor)
                    Circle()
                        .stroke(.white.opacity(0.5), lineWidth: 3)
                        .scaleEffect(recorder.isRecording ? 1 + recorder.level * 0.12 : 1)
                        .opacity(recorder.isRecording ? 1 : 0)
                    Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 104, height: 104)
                .animation(.easeOut(duration: 0.1), value: recorder.level)
            }
            .buttonStyle(.plain)
            .handGestureShortcut(.primaryAction)
            .accessibilityLabel(recorder.isRecording ? "Stop and send" : "Record a thought")

            if recorder.isRecording, let startedAt = recorder.startedAt {
                Text(timerInterval: startedAt...startedAt.addingTimeInterval(RecordingRules.maxDuration),
                     countsDown: false)
                    .font(.system(.title3, design: .rounded).monospacedDigit())
            } else if case .failed(let message) = recorder.phase {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .onTapGesture { recorder.dismissFailure() }
            } else {
                Text("Tap to record")
                    .font(.headline)
            }
            Spacer(minLength: 0)
            status
        }
        .padding(.horizontal, 8)
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            recorder.becameActive()
            Delivery.deliver()
        }
        .onOpenURL { url in
            guard url.host() == "record" else { return }
            Task { await recorder.toggle(from: "complication") }
        }
    }

    @ViewBuilder private var status: some View {
        let waiting = notes.queue.notes.count
        if waiting == 0 {
            Label("All sent", systemImage: "checkmark.circle")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            Label(waitingText(waiting), systemImage: "arrow.up.circle")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func waitingText(_ count: Int) -> String {
        let notes = count == 1 ? "1 note" : "\(count) notes"
        if link.credentials == nil { return "\(notes) waiting for your phone" }
        if DirectUpload.shared.keyRefused { return "\(notes) waiting · reconnect Anansi on your phone" }
        return "\(notes) on the way"
    }
}
