import SwiftUI

/// One item of a week: write the notes (saved as you type, through the outbox; a person is `@Name`, typed or
/// picked, and the server links it), add pictures, look at and delete what is attached. Reads the newest copy of
/// the item from `SyncData`, so it can be opened from Pulse or from any week.
struct SyncItemView: View {
    let itemId: String

    @State private var data = SyncData.shared
    @State private var outbox = OutboxStore.shared
    @State private var text = ""
    @State private var loadedText = false
    @State private var lastQueued: String?
    @State private var saveTask: Task<Void, Never>?
    @State private var viewing: SyncAttachment?
    @State private var toDelete: SyncAttachment?
    @State private var deleteError: String?
    @State private var isPicking = false
    @FocusState private var editorFocused: Bool

    private var item: SyncItem? {
        data.items[itemId].map { outbox.outbox.overlay($0) }
    }

    var body: some View {
        Group {
            if let item {
                content(item)
            } else {
                EmptyPage(title: "Item not found", message: "It was removed from this week.", systemImage: "questionmark.circle")
            }
        }
        .anansiScreen()
        .navigationTitle(item?.title ?? "Item")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            if let item {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(value: OverTimeRoute(trackingItemId: item.trackingItemId, title: item.title)) {
                        Label("Over time", systemImage: "clock.arrow.circlepath")
                    }
                }
            }
            if editorFocused {
                ToolbarItem(placement: .keyboard) {
                    HStack {
                        Spacer()
                        Button("Done") { editorFocused = false }
                    }
                }
            }
        }
        .task(id: data.items[itemId] == nil) {
            guard !loadedText, let item else { return }
            // Stored notes carry tokens; the editor holds `@Name`, which is also the form unsent notes are in.
            text = item.editableNotes
            lastQueued = text
            loadedText = true
        }
        .onChange(of: text) { _, newValue in
            guard loadedText, newValue != lastQueued else { return }
            saveTask?.cancel()
            saveTask = Task {
                do { try await Task.sleep(for: .seconds(0.8)) } catch { return }
                queueText()
            }
        }
        .onDisappear {
            saveTask?.cancel()
            queueText()
        }
        .sheet(isPresented: $isPicking) {
            PeoplePicker { person in
                text = MentionText.appendingMention(to: text, name: person.name)
            }
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

    private func content(_ item: SyncItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(text: item.goalTitle ?? "Unscoped")
                    Text(item.title).font(AN.display(.largeTitle)).foregroundStyle(AN.ink)
                    if let description = item.description, !description.isEmpty {
                        Text(description).font(AN.text(.body)).italic().foregroundStyle(AN.ink3)
                    }
                }
                .padding(.top, 8)

                notes(item)
                pictures(item)
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func notes(_ item: SyncItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Eyebrow(text: "Notes")
                Spacer()
                Text(saveState).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
            }
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("What happened with this, this week?")
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
                    .focused($editorFocused)
                    .frame(minHeight: 160)
            }
            .anansiCard(padding: 10)
            Button {
                isPicking = true
            } label: {
                Label("Mention someone", systemImage: "at")
            }
            .buttonStyle(.anansiOutline)
        }
    }

    private var saveState: String {
        if text != lastQueued { return "editing" }
        if outbox.outbox.pendingText(for: itemId) != nil {
            return outbox.outbox.lastError == nil ? "saving" : "saved on this phone, waiting to send"
        }
        if outbox.outbox.failed.contains(where: { $0.op.itemId == itemId && !$0.op.isUpload }) {
            return "not accepted, see Pulse"
        }
        return "saved"
    }

    private func pictures(_ item: SyncItem) -> some View {
        let pending = outbox.outbox.pendingUploads(for: itemId)
        let images = item.attachments.filter(\.isImage)
        let files = item.attachments.filter { !$0.isImage }
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
            AddPictureButton(itemId: itemId, itemTitle: item.title, trackingItemId: item.trackingItemId)

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

    private func queueText() {
        guard loadedText, text != lastQueued, let item = data.items[itemId] else { return }
        lastQueued = text
        outbox.setText(itemId: itemId, title: item.title, text: text)
    }

    private func delete(_ attachment: SyncAttachment) async {
        do {
            try await APIClient.shared.deleteAttachment(attachment.id)
            AttachmentCache.shared.forget(attachment.id)
            await data.refreshLoaded()
        } catch {
            deleteError = error.localizedDescription
        }
    }
}

/// A picture, full screen, pinch to zoom.
struct AttachmentViewer: View {
    let attachment: SyncAttachment
    @State private var cache = AttachmentCache.shared
    @State private var scale: CGFloat = 1
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let image = cache.images[attachment.id] {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .gesture(MagnifyGesture()
                            .onChanged { scale = max(1, min(5, $0.magnification)) }
                            .onEnded { _ in withAnimation(.snappy) { scale = 1 } })
                        .accessibilityLabel(attachment.fileName)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .navigationTitle(attachment.fileName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
                if let image = cache.images[attachment.id] {
                    ToolbarItem(placement: .bottomBar) {
                        ShareLink(item: Image(uiImage: image), preview: SharePreview(attachment.fileName, image: Image(uiImage: image)))
                    }
                }
            }
            .task { cache.load(attachment.id) }
        }
    }
}
