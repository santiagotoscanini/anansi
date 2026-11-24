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

    /// Queues a write to one day of the journal: the fields that are set replace what the day holds (and what an
    /// unsent write for that day was going to set).
    func setJournal(day: LocalDay, content: String? = nil, highlights: [String]? = nil) {
        guard content != nil || highlights != nil else { return }
        outbox.enqueue(OutboxOp(itemId: OutboxOp.journalItemId(day), itemTitle: Wording.journalTitle(day),
                                kind: .setJournal(content: content, highlights: highlights), queuedAt: .now))
        save()
        pump()
    }

    /// Keeps a prepared JPEG on disk and queues its upload. `replacing` names a picture to delete once it lands.
    func addPicture(itemId: String, title: String, jpeg: Data, fileName: String, replacing: String? = nil) throws {
        let local = "\(UUID().uuidString).jpg"
        try jpeg.write(to: fileURL(local), options: .atomic)
        outbox.enqueue(OutboxOp(itemId: itemId, itemTitle: title,
                                kind: .upload(localFile: local, fileName: fileName, fileType: "image", byteCount: jpeg.count),
                                queuedAt: .now, replaces: replacing))
        save()
        pump()
    }

    // MARK: Captures

    /// Queues a typed thought for the Inbox. Answers the capture's item id.
    @discardableResult
    func capture(text: String, questionId: String?, at date: Date = .now) -> String {
        let id = UUID()
        let itemId = OutboxOp.captureItemId(id)
        outbox.enqueue(OutboxOp(id: id, itemId: itemId, itemTitle: CaptureRules.title(text),
                                kind: .capture(text: text, questionId: questionId, capturedAt: date), queuedAt: .now))
        save()
        pump()
        return itemId
    }

    /// Moves a finished recording (a WAV) into the outbox folder and queues its upload. Answers the capture's item id.
    /// The server transcribes it.
    func addVoiceCapture(recordingAt source: URL, questionId: String?, capturedAt: Date, durationMs: Int) throws -> String {
        let id = UUID()
        let local = "\(id.uuidString).wav"
        let target = fileURL(local)
        try? FileManager.default.removeItem(at: target)
        try FileManager.default.moveItem(at: source, to: target)
        let bytes = (try? FileManager.default.attributesOfItem(atPath: target.path(percentEncoded: false))[.size] as? Int) ?? 0
        let itemId = OutboxOp.captureItemId(id)
        outbox.enqueue(OutboxOp(id: id, itemId: itemId, itemTitle: "Voice note",
                                kind: .voiceCapture(localFile: local, questionId: questionId, capturedAt: capturedAt,
                                                    durationMs: durationMs, byteCount: bytes, transcript: nil),
                                queuedAt: .now))
        save()
        pump()
        return itemId
    }

    /// Waits until nothing of this capture is left in the queue, or the time is up. Answers whether it went.
    func waitUntilSent(_ itemId: String, timeout: Duration) async -> Bool {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        while clock.now < deadline {
            if !outbox.pending.contains(where: { $0.itemId == itemId }) {
                return !outbox.failed.contains(where: { $0.op.itemId == itemId })
            }
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return false }
        }
        return false
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
                if let day = op.journalDay {
                    let attachment = try await APIClient.shared.uploadJournalAttachment(
                        day: day, fileName: fileName, fileType: fileType, contentType: "image/jpeg", fileURL: url)
                    JournalStore.shared.didUpload(day, attachment: attachment)
                } else {
                    try await APIClient.shared.uploadAttachment(itemId: op.itemId, fileName: fileName, fileType: fileType,
                                                                contentType: "image/jpeg", fileURL: url)
                    // The new picture is in: the one it replaces goes. Best effort, since the upload already
                    // succeeded; one left behind is just a second picture.
                    if let old = op.replaces {
                        try? await APIClient.shared.deleteAttachment(old)
                        AttachmentCache.shared.forget(old)
                    }
                }
            case .capture(let text, let questionId, let capturedAt):
                let capture = try await APIClient.shared.createCapture(text: text, questionId: questionId,
                                                                      capturedAt: capturedAt, clientId: op.id.uuidString)
                outbox.recordCapture(itemId: op.itemId, serverId: capture.id)
                CaptureStore.shared.didLand(capture)
            case .voiceCapture(let local, let questionId, let capturedAt, let durationMs, _, let transcript):
                let url = fileURL(local)
                guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else {
                    throw OutboxFileMissing()
                }
                let capture = try await APIClient.shared.uploadVoiceCapture(
                    fileURL: url, questionId: questionId, capturedAt: capturedAt, durationMs: durationMs,
                    transcript: transcript, clientId: op.id.uuidString)
                outbox.recordCapture(itemId: op.itemId, serverId: capture.id)
                CaptureStore.shared.didLand(capture)
            case .captureTranscript(let transcript):
                guard let serverId = outbox.serverCaptureId(op.itemId) else {
                    throw APIError(status: 400, code: "NO_CAPTURE",
                                   message: "The voice note these words belong to never reached Anansi.")
                }
                let capture = try await APIClient.shared.setCaptureTranscript(serverId, transcript: transcript)
                CaptureStore.shared.didLand(capture)
            case .setJournal(let content, let highlights):
                guard let day = op.journalDay else {
                    throw APIError(status: 400, code: "BAD_DAY", message: "This journal entry has no day.")
                }
                let entry = try await APIClient.shared.writeJournal(day: day, content: content, highlights: highlights)
                JournalStore.shared.didWrite(day, entry: entry)
            }
            outbox.didSucceed(op.id)
            landed += 1
        } catch is OutboxFileMissing {
            outbox.didFailPermanently(op.id, message: op.isVoiceCapture ? "The recording is gone from this phone."
                                                                         : "The picture's file is gone from this phone.")
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
        // Something still to send: ask the system for a chance to send it if the app is not around by then.
        if !outbox.pending.isEmpty { OutboxBackground.schedule() }
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

    /// Deletes pictures and recordings nothing in the queue points at any more (sent, dismissed). A recording in
    /// progress is not here yet: it is moved in only once it is finished (`addVoiceCapture`).
    private func sweepFiles() {
        let keep = outbox.referencedFiles
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        for name in names where (name.hasSuffix(".jpg") || name.hasSuffix(".wav") || name.hasSuffix(".m4a")) && !keep.contains(name) {
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
