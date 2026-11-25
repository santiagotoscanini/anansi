import CaptureCore
import Foundation
import Observation

/// The watch's notes not yet known to be on the server (`WatchQueue`, CaptureCore), saved to disk after every
/// change: the queue as JSON in Application Support, each note's WAV in `Notes/` beside it. A note leaves, file and
/// all, only when the server has it: the watch's own upload was answered, or the phone said its upload was.
@Observable
final class NoteStore {
    static let shared = NoteStore()

    private(set) var queue = WatchQueue()

    @ObservationIgnored private let base = FileManager.default.urls(for: .applicationSupportDirectory,
                                                                    in: .userDomainMask)[0]
    private var folder: URL { base.appending(path: "Notes", directoryHint: .isDirectory) }
    private var queueURL: URL { base.appending(path: "notes.json") }

    init() {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: queueURL), let saved = try? JSONDecoder().decode(WatchQueue.self, from: data) {
            queue = saved
        }
    }

    func url(of note: WatchQueue.Note) -> URL { folder.appending(path: note.file) }

    /// Moves a finished recording in, saves, and starts both deliveries. A move that fails leaves the file in
    /// `Recordings/`, where the next launch finds it.
    func add(recordingAt source: URL, info: WatchLink.NoteInfo) {
        let name = "\(info.id.uuidString).wav"
        let target = folder.appending(path: name)
        do {
            try? FileManager.default.removeItem(at: target)
            try FileManager.default.moveItem(at: source, to: target)
        } catch {
            return
        }
        queue.add(WatchQueue.Note(info: info, file: name))
        save()
        Delivery.deliver()
    }

    func received(_ ids: [UUID]) {
        queue.received(ids)
        save()
    }

    /// The server has these notes: their files go.
    func landed(_ ids: [UUID]) {
        let files = queue.landed(ids)
        guard !files.isEmpty else { return }
        save()
        for file in files { try? FileManager.default.removeItem(at: folder.appending(path: file)) }
        PhoneLink.shared.cancelTransfers(ids)
    }

    func failed(_ id: UUID, message: String?) {
        queue.failed(id, message: message)
        save()
    }

    /// At launch: notes cut off while recording (still in `Recordings/`, their header never closed) are repaired
    /// and queued; a file in `Notes/` the queue does not name (a crash between the move and the save) is queued too.
    func recoverLeftovers() {
        let fm = FileManager.default
        let recording = WatchRecorder.shared.fileURL
        let unfinished = (try? fm.contentsOfDirectory(atPath: WatchRecorder.folder.path(percentEncoded: false))) ?? []
        for name in unfinished where name.lowercased().hasSuffix(".wav") {
            let url = WatchRecorder.folder.appending(path: name)
            guard url != recording else { continue }
            let started = WAVDisk.started(url)
            guard let seconds = WAVDisk.recover(url) else { continue }
            add(recordingAt: url, info: WatchLink.NoteInfo(
                id: Self.id(fromFile: name), capturedAt: started, durationMs: Int((seconds * 1000).rounded()),
                log: "watch: recovered at launch; the app stopped while it was recording"))
        }
        let kept = (try? fm.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        for name in queue.strays(among: kept) {
            let url = folder.appending(path: name)
            let seconds = WAVDisk.seconds(of: url) ?? 0
            queue.add(WatchQueue.Note(info: WatchLink.NoteInfo(
                id: Self.id(fromFile: name), capturedAt: WAVDisk.started(url),
                durationMs: Int((seconds * 1000).rounded()), log: "watch: found again at launch"), file: name))
            save()
        }
    }

    /// A note's id is its file's name; a file named otherwise gets a new one.
    private static func id(fromFile name: String) -> UUID {
        UUID(uuidString: String(name.dropLast(4))) ?? UUID()
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(queue) else { return }
        try? data.write(to: queueURL, options: .atomic)
    }
}
