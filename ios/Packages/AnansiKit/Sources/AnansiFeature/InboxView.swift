import SwiftUI

struct InboxRoute: Hashable {}

/// The Inbox: what was captured lately and where each one went (an open question, the TickTick inbox), with the
/// ones still on their way from this phone on top. Write or record from the toolbar.
struct InboxView: View {
    @State private var store = CaptureStore.shared
    @State private var outbox = OutboxStore.shared
    @State private var isWriting = false

    var body: some View {
        List {
            let pending = outbox.outbox.pendingCaptures
            if !pending.isEmpty {
                Section {
                    ForEach(pending) { op in PendingCaptureRow(op: op) }
                } header: {
                    Eyebrow(text: "On their way")
                }
                .anansiRow()
            }
            Section {
                if store.captures.isEmpty {
                    if store.isLoading && !store.hasLoaded {
                        ProgressView("Loading…").font(AN.text(.subheadline))
                    } else if let error = store.error {
                        Text("Couldn't reach Anansi: \(error)").font(AN.text(.footnote)).foregroundStyle(AN.rust)
                    } else {
                        Text("Nothing captured yet. Press the Action Button, ask Siri to capture a thought in Anansi, or use the buttons above.")
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink3)
                    }
                } else {
                    ForEach(store.captures) { capture in CaptureRow(capture: capture) }
                }
            } header: {
                Eyebrow(text: "Captured")
            }
            .anansiRow()
        }
        .anansiList()
        .refreshable {
            outbox.kick()
            await store.load()
        }
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Write", systemImage: "square.and.pencil") { isWriting = true }
                Button("Record", systemImage: "mic") { store.recording = RecordRequest() }
            }
        }
        .sheet(isPresented: $isWriting) { CaptureComposeView() }
        .task { await store.load() }
    }
}

private func shownTime(_ iso: String) -> String {
    guard let date = ISODate.parse(iso) else { return "" }
    if Calendar.current.isDateInToday(date) { return date.formatted(date: .omitted, time: .shortened) }
    return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
}

struct CaptureRow: View {
    let capture: Capture

    var body: some View {
        let destination = CaptureRules.destination(capture)
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: capture.isVoice ? "mic" : "text.alignleft")
                .font(.footnote)
                .foregroundStyle(AN.ink4)
            VStack(alignment: .leading, spacing: 4) {
                Group {
                    if let text = capture.text, !text.isEmpty {
                        Text(text).foregroundStyle(AN.ink)
                    } else if capture.text == nil {
                        Text("Transcribing…").italic().foregroundStyle(AN.ink3)
                    } else {
                        Text("No words heard").italic().foregroundStyle(AN.ink3)
                    }
                }
                .font(AN.text(.body))
                .lineLimit(6)
                HStack(spacing: 6) {
                    Text(shownTime(capture.capturedAt))
                    if let ms = capture.durationMs, capture.isVoice {
                        Text("· \(CaptureRules.duration(seconds: Double(ms) / 1000))")
                    }
                    Text("· \(CaptureRules.label(destination))")
                        .foregroundStyle(destinationColor(destination))
                        .lineLimit(2)
                }
                .font(AN.ui(.caption))
                .foregroundStyle(AN.ink3)
            }
        }
        .padding(.vertical, 2)
    }

    private func destinationColor(_ d: CaptureRules.Destination) -> Color {
        if case .failed = d { return AN.rust }
        return AN.ink3
    }
}

struct PendingCaptureRow: View {
    let op: OutboxOp

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: op.isVoiceCapture ? "mic" : "text.alignleft")
                .font(.footnote)
                .foregroundStyle(AN.ink4)
            VStack(alignment: .leading, spacing: 4) {
                Text(words).font(AN.text(.body)).foregroundStyle(AN.ink).lineLimit(4)
                Text("On its way to Anansi").font(AN.ui(.caption)).foregroundStyle(AN.ink3)
            }
        }
    }

    private var words: String {
        switch op.kind {
        case .capture(let text, _, _): text
        case .voiceCapture(_, _, _, let ms, _, let transcript):
            transcript.flatMap { $0.isEmpty ? nil : $0 }
                ?? "Voice note · \(CaptureRules.duration(seconds: Double(ms) / 1000))"
        default: op.itemTitle
        }
    }
}

/// On Pulse, under the journal: the latest captures and the two ways to add one.
struct CaptureCard: View {
    let open: () -> Void
    @State private var store = CaptureStore.shared
    @State private var outbox = OutboxStore.shared
    @State private var isWriting = false

    var body: some View {
        let latest = Array(store.captures.prefix(3))
        let pending = outbox.outbox.pendingCaptures.count
        VStack(alignment: .leading, spacing: 10) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: "tray").foregroundStyle(AN.clay)
                        Text("Inbox").font(AN.display(.title3)).foregroundStyle(AN.ink)
                        if pending > 0 {
                            Text("\(pending) on the way").font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AN.ink4)
                    }
                    if latest.isEmpty {
                        Text("Whatever crosses your mind: press the Action Button, or write or record it here.")
                            .font(AN.text(.subheadline))
                            .italic()
                            .foregroundStyle(AN.ink3)
                            .multilineTextAlignment(.leading)
                    }
                    ForEach(latest) { capture in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(capture.text.map { $0.isEmpty ? "No words heard" : CaptureRules.title($0) } ?? "Transcribing…")
                                .font(AN.text(.body))
                                .foregroundStyle(AN.ink)
                                .lineLimit(1)
                            Text(CaptureRules.label(CaptureRules.destination(capture)))
                                .font(AN.ui(.caption))
                                .foregroundStyle(AN.ink3)
                                .lineLimit(1)
                        }
                        .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            HStack(spacing: 10) {
                Button {
                    isWriting = true
                } label: {
                    Label("Write", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
                }
                Button {
                    store.recording = RecordRequest()
                } label: {
                    Label("Record", systemImage: "mic").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.anansiOutline)
        }
        .anansiCard()
        .sheet(isPresented: $isWriting) { CaptureComposeView() }
    }
}

/// A thought typed in the app, aimed at an open question or not.
struct CaptureComposeView: View {
    @State private var text = ""
    @State private var questionId: String?
    @State private var store = CaptureStore.shared
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(AN.text(.body))
                        .frame(minHeight: 140)
                        .focused($focused)
                } footer: {
                    Text("The first line is its title in TickTick.")
                }
                .anansiRow()
                Section {
                    Picker("Open question", selection: $questionId) {
                        Text("None (to the TickTick inbox)").tag(String?.none)
                        ForEach(store.questions) { q in
                            Text(q.question).tag(Optional(q.id))
                        }
                    }
                } header: {
                    Eyebrow(text: "For a question")
                }
                .anansiRow()
            }
            .anansiList()
            .navigationTitle("Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let thought = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !thought.isEmpty else { return }
                        OutboxStore.shared.capture(text: thought, questionId: questionId)
                        dismiss()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                focused = true
                await store.loadQuestions()
            }
        }
    }
}
