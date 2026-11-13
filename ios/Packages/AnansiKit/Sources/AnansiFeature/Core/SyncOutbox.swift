import Foundation

// What the phone has written but Anansi hasn't confirmed: notes and pictures for sync items. Pure value logic:
// coalescing, the order things go out in, backoff, and the optimistic view the screens show on top of the
// server's answer. The store around it persists it to disk after every change and sends one op at a time.
//
// Notes are ABSOLUTE (`set_sync_item_text` replaces), so sending the latest text again is harmless and only the
// last unsent text for an item matters. Uploads are not idempotent on the server: an upload whose answer was
// lost may land twice, which is the lesser evil next to losing a picture.

nonisolated struct OutboxOp: Codable, Hashable, Sendable, Identifiable {
    enum Kind: Codable, Hashable, Sendable {
        /// Replace an item's notes.
        case setText(String)
        /// Upload a file kept on disk under the outbox folder by `localFile` name.
        case upload(localFile: String, fileName: String, fileType: String, byteCount: Int)
        /// Write one day of the journal. A nil field is left as the day holds it.
        case setJournal(content: String?, highlights: [String]?)
    }

    var id: UUID
    /// The sync item (`weeklySyncItemId`) the op writes to, or `journal:YYYY-MM-DD` for a day of the journal
    /// (`journalItemId`): a journal day's text and pictures ride the same queue as a sync item's.
    var itemId: String
    /// The item's title when queued, so a failure can say which item it was.
    var itemTitle: String
    var kind: Kind
    var queuedAt: Date

    init(id: UUID = UUID(), itemId: String, itemTitle: String, kind: Kind, queuedAt: Date) {
        self.id = id
        self.itemId = itemId
        self.itemTitle = itemTitle
        self.kind = kind
        self.queuedAt = queuedAt
    }

    var isUpload: Bool {
        if case .upload = kind { return true }
        return false
    }

    var localFile: String? {
        if case .upload(let file, _, _, _) = kind { return file }
        return nil
    }

    // MARK: The journal

    private static let journalPrefix = "journal:"

    /// The `itemId` of ops that write to a day of the journal.
    static func journalItemId(_ day: LocalDay) -> String { journalPrefix + day.string }

    /// The journal day this op writes to, or nil for a sync item's op.
    var journalDay: LocalDay? {
        guard itemId.hasPrefix(Self.journalPrefix) else { return nil }
        return LocalDay(string: String(itemId.dropFirst(Self.journalPrefix.count)))
    }

    var isJournalText: Bool {
        if case .setJournal = kind { return true }
        return false
    }
}

/// What the outbox still has to write to one journal day: the fields that are set replace the server's.
nonisolated struct JournalEdit: Hashable, Sendable {
    var content: String?
    var highlights: [String]?

    var isEmpty: Bool { content == nil && highlights == nil }
}

/// An op that Anansi refused for good (the item was removed from the week, the file was rejected…).
nonisolated struct FailedOp: Codable, Hashable, Sendable, Identifiable {
    var op: OutboxOp
    var message: String
    var id: UUID { op.id }
}

nonisolated struct SyncOutbox: Codable, Hashable, Sendable {
    var pending: [OutboxOp] = []
    var failed: [FailedOp] = []
    /// The op on the wire now, if any. It is never merged into.
    var inFlight: UUID?
    var attempts = 0
    var nextAttempt: Date?
    var lastError: String?

    init() {}

    var isEmpty: Bool { pending.isEmpty }
    var uploadCount: Int { pending.filter(\.isUpload).count }

    /// Queues an op. New text for an item replaces text for it that hasn't gone out yet.
    mutating func enqueue(_ op: OutboxOp) {
        var op = op
        if case .setJournal(var content, var highlights) = op.kind {
            // A journal write carries only the fields that changed, so the unsent one it replaces hands over the
            // fields the new one doesn't set (the newest unsent value of each wins).
            for existing in pending.reversed() where existing.id != inFlight && existing.itemId == op.itemId {
                if case .setJournal(let oldContent, let oldHighlights) = existing.kind {
                    content = content ?? oldContent
                    highlights = highlights ?? oldHighlights
                }
            }
            pending.removeAll { $0.id != inFlight && $0.itemId == op.itemId && $0.isJournalText }
            op.kind = .setJournal(content: content, highlights: highlights)
        }
        if case .setText = op.kind {
            pending.removeAll { existing in
                guard existing.id != inFlight, existing.itemId == op.itemId else { return false }
                if case .setText = existing.kind { return true }
                return false
            }
        }
        pending.append(op)
        // Something new to say is worth trying now, even in the middle of a backoff.
        if inFlight == nil { nextAttempt = nil }
    }

    /// The op to send now, if nothing is in flight and the backoff is over.
    func next(now: Date) -> OutboxOp? {
        guard inFlight == nil, let first = pending.first else { return nil }
        if let nextAttempt, now < nextAttempt { return nil }
        return first
    }

    mutating func begin(_ op: OutboxOp) {
        inFlight = op.id
    }

    mutating func didSucceed(_ id: UUID) {
        pending.removeAll { $0.id == id }
        if inFlight == id { inFlight = nil }
        attempts = 0
        nextAttempt = nil
        lastError = nil
    }

    /// A failure worth retrying: the op stays at the front and waits out a backoff (2 s, 4 s … 5 min).
    mutating func didFailRetryably(_ id: UUID, message: String, now: Date) {
        if inFlight == id { inFlight = nil }
        attempts += 1
        lastError = message
        nextAttempt = now.addingTimeInterval(Self.backoff(attempts: attempts))
    }

    /// A refusal for good: the op moves to `failed`, and the queue carries on.
    mutating func didFailPermanently(_ id: UUID, message: String) {
        if inFlight == id { inFlight = nil }
        if let index = pending.firstIndex(where: { $0.id == id }) {
            failed.append(FailedOp(op: pending.remove(at: index), message: message))
        }
        attempts = 0
        nextAttempt = nil
        lastError = nil
    }

    /// Puts a failed op back at the end of the queue.
    mutating func retry(_ id: UUID) {
        guard let index = failed.firstIndex(where: { $0.id == id }) else { return }
        enqueue(failed.remove(at: index).op)
    }

    mutating func dismiss(_ id: UUID) {
        failed.removeAll { $0.id == id }
    }

    /// After an app restart nothing is on the wire any more.
    mutating func recoverAfterLaunch() {
        inFlight = nil
        nextAttempt = nil
    }

    static func backoff(attempts: Int) -> TimeInterval {
        min(300, pow(2, Double(max(1, min(attempts, 9)))))
    }

    // MARK: The optimistic view

    /// The notes to show for an item: the newest unsent text, else nil (show the server's).
    func pendingText(for itemId: String) -> String? {
        for op in pending.reversed() where op.itemId == itemId {
            if case .setText(let text) = op.kind { return text }
        }
        return nil
    }

    /// Pictures still on their way for an item, oldest first.
    func pendingUploads(for itemId: String) -> [OutboxOp] {
        pending.filter { $0.itemId == itemId && $0.isUpload }
    }

    /// Files the outbox still needs on disk; anything else in the folder can go.
    var referencedFiles: Set<String> {
        Set((pending + failed.map(\.op)).compactMap(\.localFile))
    }

    /// An item with the outbox laid over it, as the screens show it.
    func overlay(_ item: SyncItem) -> SyncItem {
        var item = item
        if let text = pendingText(for: item.id) { item.textContent = text }
        return item
    }

    /// Whether an item counts as answered once the outbox has gone out.
    func isFilled(_ item: SyncItem) -> Bool {
        overlay(item).isFilled || !pendingUploads(for: item.id).isEmpty
    }

    // MARK: The journal's optimistic view

    /// What is still to be written to a journal day: for each field, its newest unsent value.
    func pendingJournal(for day: LocalDay) -> JournalEdit {
        let itemId = OutboxOp.journalItemId(day)
        var edit = JournalEdit()
        for op in pending where op.itemId == itemId {
            if case .setJournal(let content, let highlights) = op.kind {
                if let content { edit.content = content }
                if let highlights { edit.highlights = highlights }
            }
        }
        return edit
    }

    /// A journal day with the outbox laid over it, as the screens show it. Text not sent yet has its mentions as
    /// the plain `@Name` the user typed; the server links them when it lands.
    func overlay(_ entry: JournalEntry?, day: LocalDay) -> JournalEntry? {
        let edit = pendingJournal(for: day)
        guard !edit.isEmpty else { return entry }
        var shown = entry ?? JournalEntry(id: "", day: day.string)
        if let content = edit.content { shown.content = content }
        if let highlights = edit.highlights { shown.highlights = highlights }
        return shown
    }
}
