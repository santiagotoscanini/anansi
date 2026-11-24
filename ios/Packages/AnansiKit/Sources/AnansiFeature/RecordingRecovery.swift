import Foundation

/// Recordings that never finished. A voice note is written to `VoiceRecorder.folder` while it runs and moved into the
/// outbox when it stops; one still there when the app starts was cut off (the app killed or crashed, the phone out of
/// battery) and would otherwise be lost. At launch, before anything can record, each is repaired (its WAV header
/// never got its sizes, `WAVFile`) and queued like any other voice note, dated when it was started. Builds before
/// this one recorded into the temporary folder, which is looked at too.
enum RecordingRecovery {
    /// Queues every recording left behind. Answers how many were kept.
    @discardableResult
    static func recoverLeftovers() -> Int {
        let legacy = FileManager.default.temporaryDirectory.appending(path: "Recordings", directoryHint: .isDirectory)
        var kept = 0
        for folder in [VoiceRecorder.folder, legacy] {
            let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
            for name in names where name.lowercased().hasSuffix(".wav") {
                if recover(folder.appending(path: name)) { kept += 1 }
            }
        }
        return kept
    }

    /// How long the samples in a WAV file last, or nil when it is not a readable WAV.
    static func seconds(of url: URL) -> TimeInterval? {
        guard let length = size(of: url), let layout = layout(of: url) else { return nil }
        return WAVFile.seconds(layout: layout, fileLength: length)
    }

    private static func recover(_ url: URL) -> Bool {
        guard let length = size(of: url) else { return false }
        let layout = layout(of: url)
        let seconds = layout.map { WAVFile.seconds(layout: $0, fileLength: length) } ?? 0
        // Nothing recorded (a double press, a header and no samples): nothing to keep.
        if layout != nil, RecordingRules.durationMs(seconds: seconds) == nil {
            try? FileManager.default.removeItem(at: url)
            return false
        }
        if let layout { repair(url, layout: layout, fileLength: length) }
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path(percentEncoded: false))
        let started = (attributes?[.creationDate] as? Date) ?? (attributes?[.modificationDate] as? Date) ?? .now
        do {
            // A file that is not a readable WAV still goes: the server keeps the audio even if it cannot read it.
            try VoiceCaptures.queue(recordingAt: url, questionId: nil, capturedAt: started,
                                    durationMs: Int((seconds * 1000).rounded()))
            return true
        } catch {
            // Left where it is: the next launch tries again.
            return false
        }
    }

    private static func size(of url: URL) -> Int? {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path(percentEncoded: false))
        return attributes?[.size] as? Int
    }

    private static func layout(of url: URL) -> WAVFile.Layout? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let header = try? handle.read(upToCount: 4096) else { return nil }
        return WAVFile.layout(header: header)
    }

    private static func repair(_ url: URL, layout: WAVFile.Layout, fileLength: Int) {
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        for patch in WAVFile.patches(layout: layout, fileLength: fileLength) {
            try? handle.seek(toOffset: UInt64(patch.offset))
            try? handle.write(contentsOf: WAVFile.littleEndian(patch.value))
        }
    }
}
