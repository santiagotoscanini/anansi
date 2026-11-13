import SwiftUI

struct JournalRoute: Hashable { var day: LocalDay }
struct JournalListRoute: Hashable {}

/// Journal text for the screen: a mention (the stored token `@[Name](person:<id>)`) drawn as a tinted, bold
/// `@Name` with the person's current name.
enum JournalStyle {
    static func attributed(_ text: String, names: [String: String]) -> AttributedString {
        let tint: Color = AN.clayDeep
        var out = AttributedString()
        for segment in JournalText.segments(text) {
            switch segment {
            case .text(let run):
                out.append(AttributedString(run))
            case .mention(let personId, let label):
                var piece = AttributedString("@" + (names[personId] ?? label))
                piece.foregroundColor = tint
                piece.inlinePresentationIntent = .stronglyEmphasized
                out.append(piece)
            }
        }
        return out
    }
}

/// A highlight being added (no index) or edited.
private struct HighlightDraft: Identifiable {
    var index: Int?
    var text: String

    var id: Int { index ?? -1 }
}

/// Today's journal on Pulse: the first highlights and lines of the day, or the prompt to write, its pictures, and
/// a quick way to add one.
struct JournalCard: View {
    let open: () -> Void
    @State private var store = JournalStore.shared
    @State private var outbox = OutboxStore.shared

    var body: some View {
        let today = LocalDay.today()
        let entry = outbox.outbox.overlay(store.entries[today], day: today)
        let names = store.entries[today]?.names ?? [:]
        let pending = outbox.outbox.pendingUploads(for: OutboxOp.journalItemId(today))
        let highlights = Array((entry?.highlights ?? []).prefix(3))
        let content = (entry?.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let attachments = entry?.attachments ?? []
        VStack(alignment: .leading, spacing: 10) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: "book.closed").foregroundStyle(AN.clay)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Journal").font(AN.display(.title3)).foregroundStyle(AN.ink)
                            Text(Wording.journalDate(today, currentYear: today.year))
                                .font(AN.mono(.caption2))
                                .foregroundStyle(AN.ink3)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AN.ink4)
                    }
                    ForEach(Array(highlights.enumerated()), id: \.offset) { _, highlight in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(AN.clay)
                            Text(JournalStyle.attributed(highlight, names: names))
                                .font(AN.text(.body))
                                .foregroundStyle(AN.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    if !content.isEmpty {
                        Text(JournalStyle.attributed(content, names: names))
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink2)
                            .lineLimit(highlights.isEmpty ? 4 : 2)
                            .multilineTextAlignment(.leading)
                    }
                    if highlights.isEmpty && content.isEmpty {
                        Text("What happened today?")
                            .font(AN.text(.body))
                            .italic()
                            .foregroundStyle(AN.ink4)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens today's journal")

            if !attachments.isEmpty || !pending.isEmpty {
                ThumbnailStrip(attachments: attachments, pending: pending)
            }
            HStack {
                if !outbox.outbox.pendingJournal(for: today).isEmpty {
                    Label("Saving", systemImage: "arrow.up.circle").font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                }
                Spacer()
                AddPictureButton(itemId: OutboxOp.journalItemId(today), itemTitle: Wording.journalTitle(today),
                                 trackingItemId: nil, compact: true)
            }
        }
        .anansiCard()
    }
}

/// One day of the journal: its highlights (add, edit, delete), the prose (read with mentions tinted, tap to edit),
/// its pictures and the people it mentions. Back and forth between days, never past today. Text is written
/// through the outbox, so it is kept on the phone until Anansi confirms it.
struct JournalDayView: View {
    @State private var day: LocalDay
    @State private var store = JournalStore.shared
    @State private var outbox = OutboxStore.shared
    @State private var isEditingProse = false
    @State private var highlightDraft: HighlightDraft?
    @State private var viewing: SyncAttachment?
    @State private var toDelete: SyncAttachment?
    @State private var deleteError: String?

    init(initialDay: LocalDay) {
        _day = State(initialValue: min(initialDay, LocalDay.today()))
    }

    private var today: LocalDay { .today() }
    private var itemId: String { OutboxOp.journalItemId(day) }

    /// The day as the screen shows it: the server's entry with the outbox laid over it.
    private var entry: JournalEntry? { outbox.outbox.overlay(store.entries[day], day: day) }

    /// Person id to current name, from the server's entry.
    private var names: [String: String] { store.entries[day]?.names ?? [:] }

    /// A write replaces the whole text (or the whole list of highlights), so the day must have been read first:
    /// writing over a day the phone never saw would erase what was written elsewhere.
    private var canEdit: Bool { store.loadedDays.contains(day) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if let error = store.dayErrors[day] {
                    ProblemCard(message: "Couldn't load this day: \(error)") { Task { await store.refresh(day) } }
                }
                if !canEdit {
                    if store.loadingDays.contains(day) {
                        HStack {
                            Spacer()
                            ProgressView("Loading…").font(AN.text(.subheadline))
                            Spacer()
                        }
                        .padding(.vertical, 8)
                    } else if store.dayErrors[day] != nil {
                        Text("The text can be edited once Anansi has answered with what this day holds. Pictures can be added now.")
                            .font(AN.text(.footnote))
                            .foregroundStyle(AN.ink3)
                    }
                }
                highlights
                prose
                pictures
                people
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .refreshable {
            outbox.kick()
            await store.refresh(day)
        }
        .anansiScreen()
        .navigationTitle("Journal")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(value: JournalListRoute()) {
                    Label("Past entries", systemImage: "list.bullet")
                }
            }
        }
        .task(id: day) { await store.refresh(day) }
        .sheet(isPresented: $isEditingProse) {
            JournalTextEditor(title: Wording.journalDate(day, currentYear: today.year),
                              prompt: "What happened, who was there, how it felt.",
                              limit: JournalLimits.contentCharacters,
                              initial: JournalText.editable(entry?.content ?? "", names: names),
                              onSave: { text in saveProse(text) })
        }
        .sheet(item: $highlightDraft) { draft in
            let index = draft.index
            JournalTextEditor(title: index == nil ? "New highlight" : "Highlight",
                              prompt: "One line worth keeping.",
                              limit: JournalLimits.highlightCharacters,
                              initial: draft.text,
                              canDelete: index != nil,
                              onDelete: { if let index { removeHighlight(index) } },
                              onSave: { text in saveHighlight(index, text) })
        }
        .fullScreenCover(item: $viewing) { attachment in
            AttachmentViewer(attachment: attachment)
        }
        .confirmationDialog("Delete this picture?",
                            isPresented: .init(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }),
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let attachment = toDelete { Task { await delete(attachment) } }
                toDelete = nil
            }
        } message: {
            Text("It is deleted from Anansi. This can't be undone.")
        }
        .alert("Couldn't delete", isPresented: .init(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
            Button("OK") {}
        } message: {
            Text(deleteError ?? "")
        }
    }

    // MARK: Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Journal · one day at a time")
            HStack(spacing: 12) {
                Button("Previous day", systemImage: "chevron.left") { day = day.adding(days: -1) }
                    .labelStyle(.iconOnly)
                VStack(spacing: 2) {
                    Text(Wording.journalDate(day, currentYear: today.year))
                        .font(AN.display(.title3))
                        .foregroundStyle(AN.ink)
                    Text(Wording.journalDistance(from: today, to: day))
                        .font(AN.mono(.caption2))
                        .foregroundStyle(day == today ? AN.clay : AN.ink3)
                }
                .frame(maxWidth: .infinity)
                Button("Next day", systemImage: "chevron.right") { day = day.adding(days: 1) }
                    .labelStyle(.iconOnly)
                    .disabled(day >= today)
            }
            .font(.title3)
            .padding(.vertical, 6)
            .buttonStyle(.borderless)
            if day != today {
                Button("Back to today") { day = today }
                    .font(AN.ui(.footnote))
                    .buttonStyle(.borderless)
            }
        }
        .padding(.top, 8)
    }

    private var saveState: String {
        guard !outbox.outbox.pendingJournal(for: day).isEmpty else { return "" }
        return outbox.outbox.lastError == nil ? "saving" : "saved on this phone, waiting to send"
    }

    private var highlights: some View {
        let list = entry?.highlights ?? []
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Eyebrow(text: "Highlights")
                Spacer()
                Text(saveState).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
            }
            if list.isEmpty {
                Text("The day in a few lines.").font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink4)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.offset) { index, highlight in
                        if index > 0 { Divider().overlay(AN.hairline) }
                        Button {
                            highlightDraft = HighlightDraft(index: index, text: JournalText.editable(highlight, names: names))
                        } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("•").foregroundStyle(AN.clay)
                                Text(JournalStyle.attributed(highlight, names: names))
                                    .font(AN.text(.body))
                                    .foregroundStyle(AN.ink)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!canEdit)
                        .accessibilityHint("Opens the highlight to edit or delete it")
                    }
                }
                .anansiCard(padding: 4)
            }
            Button {
                highlightDraft = HighlightDraft(index: nil, text: "")
            } label: {
                Label("Add highlight", systemImage: "plus").frame(maxWidth: .infinity)
            }
            .buttonStyle(.anansiOutline)
            .disabled(!canEdit || list.count >= JournalLimits.highlights)
        }
    }

    private var prose: some View {
        let content = entry?.content ?? ""
        let isBlank = content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "The day")
            Button {
                isEditingProse = true
            } label: {
                Group {
                    if isBlank {
                        Text(day == today ? "What happened today?" : "What happened that day?")
                            .font(AN.text(.body))
                            .italic()
                            .foregroundStyle(AN.ink4)
                    } else {
                        Text(JournalStyle.attributed(content, names: names))
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: isBlank ? 80 : 0, alignment: .topLeading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canEdit)
            .accessibilityHint("Opens the editor")
            .anansiCard()
        }
    }

    private var pictures: some View {
        let pending = outbox.outbox.pendingUploads(for: itemId)
        let attachments = entry?.attachments ?? []
        let images = attachments.filter(\.isImage)
        let files = attachments.filter { !$0.isImage }
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Eyebrow(text: "Pictures")
                Spacer()
                if !pending.isEmpty {
                    Text(Wording.uploading(pending.count).lowercased()).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                }
            }
            if images.isEmpty && pending.isEmpty {
                Text("No pictures yet.").font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink4)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                    ForEach(images) { attachment in
                        Button {
                            viewing = attachment
                        } label: {
                            AttachmentThumbnail(attachment: attachment, size: 104)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button("Delete", systemImage: "trash", role: .destructive) { toDelete = attachment }
                        }
                    }
                    ForEach(pending) { op in
                        PendingThumbnail(op: op, size: 104)
                    }
                }
            }
            AddPictureButton(itemId: itemId, itemTitle: Wording.journalTitle(day), trackingItemId: nil)

            if !files.isEmpty {
                Eyebrow(text: "Other files").padding(.top, 6)
                ForEach(files) { file in
                    HStack(spacing: 10) {
                        Image(systemName: "doc").foregroundStyle(AN.ink3)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(file.fileName).font(AN.text(.body)).lineLimit(1)
                            Text(file.sizeBytes.map(Wording.fileSize) ?? file.fileType).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                        }
                        Spacer()
                        Button("Delete", systemImage: "trash", role: .destructive) { toDelete = file }
                            .labelStyle(.iconOnly)
                    }
                    .anansiRecess(padding: 10)
                }
                Text("Open other files in Anansi on the web.").font(AN.text(.footnote)).foregroundStyle(AN.ink3)
            }
        }
    }

    @ViewBuilder
    private var people: some View {
        let mentions = store.entries[day]?.mentions ?? []
        if !mentions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(text: "People")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(mentions) { mention in
                            Tag(text: [mention.glyph, mention.name].compactMap { $0 }.joined(separator: " "), tone: .relation)
                        }
                    }
                }
            }
        }
    }

    // MARK: Actions

    private func saveProse(_ text: String) {
        outbox.setJournal(day: day, content: text.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Saves one highlight as edited (a new one with no index). The others go back as stored, tokens and all.
    private func saveHighlight(_ index: Int?, _ text: String) {
        let clean = text.split(whereSeparator: \.isNewline).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var list = entry?.highlights ?? []
        if let index {
            guard list.indices.contains(index) else { return }
            if clean.isEmpty { list.remove(at: index) } else { list[index] = clean }
        } else {
            guard !clean.isEmpty else { return }
            list.append(clean)
        }
        outbox.setJournal(day: day, highlights: list)
    }

    private func removeHighlight(_ index: Int) {
        var list = entry?.highlights ?? []
        guard list.indices.contains(index) else { return }
        list.remove(at: index)
        outbox.setJournal(day: day, highlights: list)
    }

    private func delete(_ attachment: SyncAttachment) async {
        do {
            try await store.deleteAttachment(attachment, from: day)
        } catch {
            deleteError = error.localizedDescription
        }
    }
}

/// The editor for a day's prose or for one highlight: plain text with `@Name` for a person, and a people picker
/// that writes the `@Name` for you. Nothing is saved until Save.
struct JournalTextEditor: View {
    let title: String
    let prompt: String
    let limit: Int
    let initial: String
    var canDelete = false
    var onDelete: () -> Void = {}
    let onSave: (String) -> Void

    @State private var text: String
    @State private var isPicking = false
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss

    init(title: String, prompt: String, limit: Int, initial: String, canDelete: Bool = false,
         onDelete: @escaping () -> Void = {}, onSave: @escaping (String) -> Void) {
        self.title = title
        self.prompt = prompt
        self.limit = limit
        self.initial = initial
        self.canDelete = canDelete
        self.onDelete = onDelete
        self.onSave = onSave
        _text = State(initialValue: initial)
    }

    private var overLimit: Int { max(0, text.count - limit) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ZStack(alignment: .topLeading) {
                        if text.isEmpty {
                            Text(prompt)
                                .font(AN.text(.body))
                                .italic()
                                .foregroundStyle(AN.ink4)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 8)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $text)
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink)
                            .scrollContentBackground(.hidden)
                            .focused($focused)
                            .frame(minHeight: canDelete || limit <= JournalLimits.highlightCharacters ? 120 : 260)
                    }
                    .anansiCard(padding: 10)

                    HStack {
                        Button {
                            isPicking = true
                        } label: {
                            Label("Mention someone", systemImage: "at")
                        }
                        .buttonStyle(.anansiOutline)
                        Spacer()
                        if overLimit > 0 {
                            Text("\(overLimit) over the limit").font(AN.mono(.caption2)).foregroundStyle(AN.rust)
                        }
                    }
                    Text("Write @ and a name, or pick someone. Anansi links the name to the person when it saves.")
                        .font(AN.text(.footnote))
                        .foregroundStyle(AN.ink3)
                    if canDelete {
                        Button("Delete this highlight", systemImage: "trash", role: .destructive) {
                            onDelete()
                            dismiss()
                        }
                        .font(AN.ui(.subheadline))
                        .buttonStyle(.borderless)
                        .padding(.top, 4)
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .anansiScreen()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if text != initial { onSave(text) }
                        dismiss()
                    }
                    .disabled(overLimit > 0)
                }
            }
            .sheet(isPresented: $isPicking) {
                PeoplePicker { person in
                    text = JournalText.appendingMention(to: text, name: person.name)
                }
            }
            .interactiveDismissDisabled(text != initial)
            .task { focused = true }
        }
    }
}

/// The people who can be mentioned, by name.
struct PeoplePicker: View {
    let onPick: (PersonRef) -> Void

    @State private var store = JournalStore.shared
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    private var shown: [PersonRef] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return store.people }
        return store.people.filter { $0.name.localizedCaseInsensitiveContains(needle) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error = store.peopleError, store.people.isEmpty {
                    Section { Text(error).foregroundStyle(AN.rust) }.anansiRow()
                }
                Section {
                    if shown.isEmpty {
                        Text(emptyMessage).font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
                    }
                    ForEach(shown) { person in
                        Button {
                            onPick(person)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                Text(person.glyph ?? String(person.name.prefix(1)).uppercased())
                                    .font(AN.display(.headline))
                                    .foregroundStyle(AN.indigo)
                                    .frame(width: 32, height: 32)
                                    .background(AN.indigoSoft, in: Circle())
                                Text(person.name).font(AN.text(.body)).foregroundStyle(AN.ink)
                                Spacer()
                            }
                        }
                    }
                }
                .anansiRow()
            }
            .anansiList()
            .searchable(text: $query, prompt: "Find a person")
            .navigationTitle("Mention")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await store.loadPeople() }
        }
    }

    private var emptyMessage: String {
        if store.isLoadingPeople { return "Loading…" }
        return store.people.isEmpty ? "No people in Anansi yet. Add them on the web." : "Nobody by that name."
    }
}

/// Past days of the journal, newest first, with a search over their text.
struct JournalListView: View {
    @State private var store = JournalStore.shared
    @State private var query = ""

    private var today: LocalDay { .today() }

    var body: some View {
        List {
            if let error = store.recentError {
                Section {
                    ProblemCard(message: "Couldn't load the journal: \(error)") {
                        Task { await store.refreshRecent(query: query) }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            if !store.recent.isEmpty {
                Section {
                    ForEach(store.recent) { entry in
                        row(entry)
                    }
                } header: {
                    Eyebrow(text: store.recentQuery.isEmpty ? "Recent days" : "Days that match")
                }
                .anansiRow()
            } else if store.hasLoadedRecent {
                Section {
                    EmptyPage(title: store.recentQuery.isEmpty ? "Nothing written yet" : "No days match",
                              message: store.recentQuery.isEmpty
                                  ? "Days you write, here, on the web or through Claude, are listed here."
                                  : "Try other words.")
                }
                .listRowBackground(Color.clear)
            } else if store.isLoadingRecent {
                Section {
                    HStack { Spacer(); ProgressView("Loading…"); Spacer() }
                }
                .listRowBackground(Color.clear)
            }
        }
        .anansiList()
        .searchable(text: $query, prompt: "Search the journal")
        .refreshable { await store.refreshRecent(query: query) }
        .navigationTitle("Past entries")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .task(id: query) {
            // Wait for a pause in the typing before asking.
            if !query.isEmpty {
                do { try await Task.sleep(for: .seconds(0.4)) } catch { return }
            }
            await store.refreshRecent(query: query)
        }
    }

    @ViewBuilder
    private func row(_ entry: JournalEntry) -> some View {
        if let day = entry.localDay {
            let excerpt = entry.excerpt
            let pictures = entry.pictureCount
            NavigationLink(value: JournalRoute(day: day)) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(Wording.journalDate(day, currentYear: today.year))
                            .font(AN.display(.headline))
                            .foregroundStyle(AN.ink)
                        Spacer()
                        Text(Wording.journalDistance(from: today, to: day).lowercased())
                            .font(AN.mono(.caption2))
                            .foregroundStyle(AN.ink3)
                    }
                    if !excerpt.isEmpty {
                        Text(excerpt).font(AN.text(.footnote)).foregroundStyle(AN.ink3).lineLimit(2)
                    }
                    HStack(spacing: 12) {
                        if entry.highlights.count > 1 {
                            Label("\(entry.highlights.count)", systemImage: "list.bullet")
                                .accessibilityLabel("\(entry.highlights.count) highlights")
                        }
                        if pictures > 0 {
                            Label("\(pictures)", systemImage: "photo").accessibilityLabel(Wording.pictures(pictures))
                        }
                        if !entry.mentions.isEmpty {
                            Label("\(entry.mentions.count)", systemImage: "person.2")
                                .accessibilityLabel(Wording.people(entry.mentions.count))
                        }
                    }
                    .font(AN.mono(.caption2))
                    .foregroundStyle(AN.ink3)
                }
                .padding(.vertical, 2)
            }
        }
    }
}
