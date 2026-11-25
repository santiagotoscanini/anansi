import Foundation

/// The Apple Watch's notes not yet known to be on the server, persisted by the watch app after every change. A note
/// leaves only on a `landed` (its own upload answered, or the phone said so); until then its file stays on the
/// watch, whatever else happens. Pure, so it is tested (see `WatchLink` for the two ways a note travels).
public nonisolated struct WatchQueue: Codable, Hashable, Sendable {
    public struct Note: Codable, Hashable, Sendable, Identifiable {
        public var info: WatchLink.NoteInfo
        /// The file's name in the watch's notes folder.
        public var file: String
        /// The phone said the note is in its outbox: no need to hand it over again.
        public var phoneHasIt = false
        /// Why the watch's own upload last failed, for the screen.
        public var lastError: String?

        public var id: UUID { info.id }

        public init(info: WatchLink.NoteInfo, file: String) {
            self.info = info
            self.file = file
        }
    }

    public private(set) var notes: [Note] = []

    public init() {}

    public var isEmpty: Bool { notes.isEmpty }

    public func contains(_ id: UUID) -> Bool { notes.contains { $0.id == id } }

    /// Adds a finished note (once: a note already there is left as it is).
    public mutating func add(_ note: Note) {
        guard !contains(note.id) else { return }
        notes.append(note)
        notes.sort { $0.info.capturedAt < $1.info.capturedAt }
    }

    public mutating func received(_ ids: [UUID]) {
        for index in notes.indices where ids.contains(notes[index].id) {
            notes[index].phoneHasIt = true
        }
    }

    /// The server has these: they leave the queue. Answers their files, for the caller to delete.
    @discardableResult
    public mutating func landed(_ ids: [UUID]) -> [String] {
        let gone = notes.filter { ids.contains($0.id) }
        notes.removeAll { ids.contains($0.id) }
        return gone.map(\.file)
    }

    public mutating func failed(_ id: UUID, message: String?) {
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return }
        notes[index].lastError = message
    }

    /// The notes to hand to the phone: those it has not said it holds, and that are not on their way already.
    public func toHandOver(inTransfer: Set<UUID>) -> [Note] {
        notes.filter { !$0.phoneHasIt && !inTransfer.contains($0.id) }
    }

    /// The notes to upload from the watch: every one not being uploaded already (the phone holding one is no
    /// reason to wait: the server keeps one capture per id).
    public func toUpload(uploading: Set<UUID>) -> [Note] {
        notes.filter { !uploading.contains($0.id) }
    }

    /// Files in the notes folder that the queue does not name: left by a crash between writing a note and saving
    /// the queue. The caller adds them back.
    public func strays(among files: [String]) -> [String] {
        let known = Set(notes.map(\.file))
        return files.filter { $0.lowercased().hasSuffix(".wav") && !known.contains($0) }
    }
}
