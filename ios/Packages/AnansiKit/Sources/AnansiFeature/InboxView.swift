import SwiftUI

struct InboxRoute: Hashable {}

/// The Inbox: what was captured lately and where each one went (an open question, the TickTick inbox), with the
/// ones still on their way from this phone on top. Write or record from the toolbar. Voice notes are transcribed
/// by the server: the list reads again while one is still waiting, and a voice note's words can be corrected.
struct InboxView: View {
    @State private var store = CaptureStore.shared
    @State private var outbox = OutboxStore.shared
    @State private var isWriting = false
    @State private var correcting: Capture?
    @Environment(\.scenePhase) private var scenePhase

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
            if store.captures.isEmpty {
                Section {
                    if store.isLoading && !store.hasLoaded {
                        ProgressView("Loading…").font(AN.text(.subheadline))
                    } else if let error = store.error {
                        Text("Couldn't reach Anansi: \(error)").font(AN.text(.footnote)).foregroundStyle(AN.rust)
                    } else {
                        Text("Nothing captured yet. Press the Action Button, ask Siri to capture a thought in Anansi, or use the buttons above.")
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink3)
                    }
                }
                .anansiRow()
            } else {
                let today = LocalDay.today()
                ForEach(CaptureRules.byDay(store.captures, calendar: .current), id: \.day) { group in
                    Section {
                        ForEach(group.captures) { capture in
                            if capture.isVoice, capture.text != nil {
                                Button { correcting = capture } label: { CaptureRow(capture: capture) }
                                    .buttonStyle(.plain)
                                    .accessibilityHint("Correct its words")
                            } else {
                                CaptureRow(capture: capture)
                            }
                        }
                    } header: {
                        Eyebrow(text: CaptureRules.dayTitle(group.day, today: today, calendar: .current))
                    }
                    .anansiRow()
                }
            }
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
        .sheet(item: $correcting) { capture in TranscriptEditView(capture: capture) }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.load()
            // Words still on their way from the server: read again every few seconds for a while.
            for _ in 0..<24 where store.captures.contains(where: \.isTranscribing) {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                await store.load()
            }
        }
    }
}

/// A voice note's words, corrected by hand. They are the user's from then on: the server's transcriber never
/// replaces them.
struct TranscriptEditView: View {
    let capture: Capture
    @State private var text: String
    @State private var isSaving = false
    @State private var problem: String?
    @Environment(\.dismiss) private var dismiss

    init(capture: Capture) {
        self.capture = capture
        _text = State(initialValue: capture.text ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(AN.text(.body))
                        .frame(minHeight: 160)
                } footer: {
                    Text(problem ?? "The first line is its title in TickTick.")
                        .foregroundStyle(problem == nil ? AN.ink3 : AN.rust)
                }
                .anansiRow()
            }
            .anansiList()
            .navigationTitle("Correct the words")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let saved = try await APIClient.shared.setCaptureTranscript(capture.id, transcript: words)
            CaptureStore.shared.didLand(saved)
            dismiss()
        } catch {
            problem = "Couldn't save it: \(error.localizedDescription)"
        }
    }
}

private func timeOfDay(_ iso: String) -> String {
    ISODate.parse(iso)?.formatted(date: .omitted, time: .shortened) ?? ""
}

/// One capture, under its day: the words (or a voice note's tidied title and notes), then a quiet line with the
/// time, a voice note's length and the device it came from. Where it went is said only when it is not simply a task in
/// TickTick (a question, a failure, words on their way); a task done there is struck through with a check, a task
/// deleted there is faded with a red bin.
struct CaptureRow: View {
    let capture: Capture

    var body: some View {
        let destination = CaptureRules.destination(capture)
        let state = CaptureRules.tickTickState(destination)
        let settled = CaptureRules.isSettled(destination)
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
                words(struck: state == .done, faded: settled)
                HStack(spacing: 8) {
                    Text(timeOfDay(capture.capturedAt)).monospacedDigit()
                    if capture.isVoice {
                        HStack(spacing: 3) {
                            Image(systemName: "mic")
                            if let ms = capture.durationMs {
                                Text(CaptureRules.duration(seconds: Double(ms) / 1000)).monospacedDigit()
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Voice note")
                    } else {
                        Image(systemName: "text.alignleft").accessibilityLabel("Written")
                    }
                    if let origin = CaptureRules.origin(capture) {
                        Image(systemName: Self.symbol(origin)).accessibilityLabel(Self.name(origin))
                    }
                    if let note = CaptureRules.note(destination) {
                        Text(note)
                            .foregroundStyle(destination.isFailure ? AN.rust : AN.ink3)
                            .lineLimit(2)
                    }
                }
                .font(AN.ui(.caption))
                .foregroundStyle(AN.ink4)
            }
            Spacer(minLength: 0)
            if state == .done {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(AN.moss)
                    .accessibilityLabel("Done in TickTick")
            } else if state == .deleted {
                Image(systemName: "trash")
                    .foregroundStyle(AN.rust)
                    .accessibilityLabel("Deleted in TickTick")
            }
        }
        .padding(.vertical, 2)
        .opacity(settled ? 0.55 : 1)
    }

    @ViewBuilder private func words(struck: Bool, faded: Bool) -> some View {
        let ink = faded ? AN.ink3 : AN.ink
        switch CaptureRules.words(capture) {
        case .text(let text):
            if let title = capture.title, !title.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(AN.ui(.body).weight(.medium)).foregroundStyle(ink).strikethrough(struck)
                    if let notes = capture.notes, !notes.isEmpty {
                        Text(notes).font(AN.text(.subheadline)).foregroundStyle(AN.ink2).lineLimit(4)
                    }
                }
            } else {
                Text(text).font(AN.text(.body)).foregroundStyle(ink).strikethrough(struck).lineLimit(6)
            }
        case .failed(let message):
            Text(message.isEmpty ? "Couldn't transcribe it." : "Couldn't transcribe it: \(message)")
                .font(AN.text(.body))
                .foregroundStyle(AN.rust)
        default:
            Text(CaptureRules.wordsLine(capture)).font(AN.text(.body)).italic().foregroundStyle(AN.ink3)
        }
    }

    static func symbol(_ origin: CaptureRules.Origin) -> String {
        switch origin {
        case .iphone: "iphone"
        case .watch: "applewatch"
        case .web: "desktopcomputer"
        case .claude: "sparkles"
        }
    }

    static func name(_ origin: CaptureRules.Origin) -> String {
        switch origin {
        case .iphone: "From the iPhone"
        case .watch: "From the Apple Watch"
        case .web: "From the web"
        case .claude: "From Claude"
        }
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
                            Text(capture.text.map { $0.isEmpty ? "No words heard" : CaptureRules.title($0) }
                                ?? CaptureRules.wordsLine(capture))
                                .font(AN.text(.body))
                                .foregroundStyle(AN.ink)
                                .lineLimit(1)
                            Text(CaptureRules.cardLine(capture, time: timeOfDay(capture.capturedAt)))
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
