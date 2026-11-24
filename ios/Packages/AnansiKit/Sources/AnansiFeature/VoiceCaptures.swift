import Foundation
import Observation

/// A finished recording, handed over: the outbox takes the file, and the transcriber reads a copy of its own,
/// since the outbox deletes its file as soon as the upload lands. Shared by the in-app recorder (`RecorderView`)
/// and the one the Action Button starts (`BackgroundRecorder`).
enum VoiceCaptures {
    /// Queues the recording (moving the file into the outbox). Answers the capture's item id, and a copy for the
    /// transcriber, nil when the copy could not be made.
    static func queue(recordingAt url: URL, questionId: String?, capturedAt: Date,
                      durationMs: Int) throws -> (itemId: String, copy: URL?) {
        let copy = url.deletingPathExtension().appendingPathExtension("transcribe.m4a")
        try? FileManager.default.removeItem(at: copy)
        let copied = (try? FileManager.default.copyItem(at: url, to: copy)) != nil
        do {
            let itemId = try OutboxStore.shared.addVoiceCapture(recordingAt: url, questionId: questionId,
                                                                capturedAt: capturedAt, durationMs: durationMs)
            return (itemId, copied ? copy : nil)
        } catch {
            try? FileManager.default.removeItem(at: copy)
            throw error
        }
    }
}

/// The words of recordings stopped away from the app, worked out on the phone after the fact (`TranscriptionQueue`
/// on disk, with its copies beside it) and sent after their recordings through the outbox. Runs one at a time; what
/// the background time did not cover is finished at the next launch or when the app comes forward.
@Observable
final class TranscriptionStore {
    static let shared = TranscriptionStore()

    @ObservationIgnored private var queue = TranscriptionQueue()
    @ObservationIgnored private let folder: URL
    @ObservationIgnored private var running = false
    @ObservationIgnored private let background = BackgroundActivity()

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        folder = base.appending(path: "Transcriptions", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: queueURL),
           let saved = try? JSONDecoder().decode(TranscriptionQueue.self, from: data) {
            queue = saved
        }
        sweep()
    }

    private var queueURL: URL { folder.appending(path: "queue.json") }

    /// Takes the transcriber's copy of a queued recording and starts on it.
    func add(captureItemId: String, copy: URL) {
        let name = "\(UUID().uuidString).m4a"
        do {
            try FileManager.default.moveItem(at: copy, to: folder.appending(path: name))
        } catch {
            try? FileManager.default.removeItem(at: copy)
            return
        }
        queue.add(captureItemId: captureItemId, file: name, at: .now)
        save()
        runPending()
    }

    /// Transcribes whatever is waiting, oldest first.
    func runPending() {
        guard !running, !queue.isEmpty else { return }
        running = true
        background.begin("Transcribe voice notes")
        Task {
            while let item = queue.next {
                let file = folder.appending(path: item.file)
                do {
                    let words = try await OnDeviceTranscriber.transcribe(file)
                    OutboxStore.shared.setTranscript(captureItemId: item.captureItemId,
                                                     transcript: words.trimmingCharacters(in: .whitespacesAndNewlines))
                    queue.finished(item.captureItemId)
                    try? FileManager.default.removeItem(at: file)
                } catch {
                    if queue.failed(item.captureItemId) { try? FileManager.default.removeItem(at: file) }
                    save()
                    // A failure that is about the moment (no time left in the background, the model still
                    // installing) is better tried on the next run than in a tight loop now.
                    break
                }
                save()
            }
            running = false
            background.end()
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(queue) { try? data.write(to: queueURL, options: .atomic) }
    }

    /// Deletes copies nothing in the queue points at (a crash between the move and the save).
    private func sweep() {
        let keep = queue.files
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        for name in names where name.hasSuffix(".m4a") && !keep.contains(name) {
            try? FileManager.default.removeItem(at: folder.appending(path: name))
        }
    }
}
