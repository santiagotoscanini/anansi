import Foundation
import Observation
import UIKit

/// The on-disk queue of notes and pictures on their way to Anansi (`SyncOutbox`), and the loop that sends them,
/// one at a time, in order. It survives the app being closed: the queue is a JSON file and each picture a JPEG
/// next to it. A send that fails for a reason that can pass (offline, the server busy, the sign-in expired)
/// waits and goes again; a refusal for good is kept in `failed` with the server's sentence until dismissed.
@Observable
final class OutboxStore {
    static let shared = OutboxStore()

    private(set) var outbox = SyncOutbox()
    private(set) var isSending = false
    /// Bumped each time an op lands, so screens re-read the server's view.
    private(set) var landed = 0

    @ObservationIgnored private let folder: URL
    @ObservationIgnored private var wakeTask: Task<Void, Never>?
    @ObservationIgnored private let background = BackgroundActivity()

    init(folder: URL? = nil) {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.folder = folder ?? base.appending(path: "Outbox", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: queueURL), let saved = try? JSONDecoder().decode(SyncOutbox.self, from: data) {
            outbox = saved
        }
        outbox.recoverAfterLaunch()
        sweepFiles()
    }

    private var queueURL: URL { folder.appending(path: "queue.json") }

    func fileURL(_ name: String) -> URL { folder.appending(path: name) }

    // MARK: Writing

    /// Queues an item's notes (the latest text replaces any not yet sent).
    func setText(itemId: String, title: String, text: String) {
        outbox.enqueue(OutboxOp(itemId: itemId, itemTitle: title, kind: .setText(text), queuedAt: .now))
        save()
        pump()
    }

    /// Keeps a prepared JPEG on disk and queues its upload.
    func addPicture(itemId: String, title: String, jpeg: Data, fileName: String) throws {
        let local = "\(UUID().uuidString).jpg"
        try jpeg.write(to: fileURL(local), options: .atomic)
        outbox.enqueue(OutboxOp(itemId: itemId, itemTitle: title,
                                kind: .upload(localFile: local, fileName: fileName, fileType: "image", byteCount: jpeg.count),
                                queuedAt: .now))
        save()
        pump()
    }

    func retry(_ id: UUID) {
        outbox.retry(id)
        save()
        pump()
    }

    func dismiss(_ id: UUID) {
        outbox.dismiss(id)
        save()
        sweepFiles()
    }

    // MARK: Sending

    /// Sends what is due (after launch, sign-in, or coming forward).
    func resume() {
        pump()
    }

    /// Skips the current backoff and tries now (pull to refresh, the app coming forward).
    func kick() {
        outbox.nextAttempt = nil
        pump()
    }

    private func pump() {
        guard !isSending, Connection.shared.isConnected else { return }
        guard let op = outbox.next(now: .now) else {
            scheduleWake()
            return
        }
        isSending = true
        outbox.begin(op)
        save()
        background.begin("Anansi uploads")
        Task { await send(op) }
    }

    private func send(_ op: OutboxOp) async {
        do {
            switch op.kind {
            case .setText(let text):
                try await APIClient.shared.setSyncItemText(op.itemId, text: text)
            case .upload(let local, let fileName, let fileType, _):
                let url = fileURL(local)
                guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else {
                    throw OutboxFileMissing()
                }
                try await APIClient.shared.uploadAttachment(itemId: op.itemId, fileName: fileName, fileType: fileType,
                                                            contentType: "image/jpeg", fileURL: url)
            }
            outbox.didSucceed(op.id)
            landed += 1
        } catch is OutboxFileMissing {
            outbox.didFailPermanently(op.id, message: "The picture's file is gone from this phone.")
        } catch let error as APIError where !error.isRetryable {
            outbox.didFailPermanently(op.id, message: error.localizedDescription)
        } catch {
            outbox.didFailRetryably(op.id, message: error.localizedDescription, now: .now)
        }
        save()
        sweepFiles()
        isSending = false
        if outbox.next(now: .now) == nil { background.end() }
        pump()
    }

    private func scheduleWake() {
        wakeTask?.cancel()
        guard let next = outbox.nextAttempt, !outbox.isEmpty else {
            background.end()
            return
        }
        let delay = max(0.5, next.timeIntervalSinceNow)
        wakeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.pump()
        }
    }

    // MARK: Disk

    private func save() {
        guard let data = try? JSONEncoder().encode(outbox) else { return }
        try? data.write(to: queueURL, options: .atomic)
    }

    /// Deletes pictures nothing in the queue points at any more (sent, dismissed).
    private func sweepFiles() {
        let keep = outbox.referencedFiles
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        for name in names where name.hasSuffix(".jpg") && !keep.contains(name) {
            try? FileManager.default.removeItem(at: fileURL(name))
        }
    }
}

private struct OutboxFileMissing: Error {}

/// Keeps the app running briefly in the background while something is being sent.
final class BackgroundActivity {
    private var id: UIBackgroundTaskIdentifier = .invalid

    func begin(_ name: String) {
        guard id == .invalid else { return }
        id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}
