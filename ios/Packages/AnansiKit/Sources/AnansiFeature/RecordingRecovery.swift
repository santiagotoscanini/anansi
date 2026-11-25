import Foundation

/// Recordings that never finished. A voice note is written to `VoiceRecorder.folder` while it runs and moved into the
/// outbox when it stops; one still there when the app starts was cut off (the app killed or crashed, the phone out of
/// battery) and would otherwise be lost. At launch, before anything can record, each is repaired (its WAV header
/// never got its sizes, `WAVDisk.recover`) and queued like any other voice note, dated when it was started. Builds
/// before this one recorded into the temporary folder, which is looked at too.
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
    static func seconds(of url: URL) -> TimeInterval? { WAVDisk.seconds(of: url) }

    private static func recover(_ url: URL) -> Bool {
        let started = WAVDisk.started(url)
        guard let seconds = WAVDisk.recover(url) else { return false }
        do {
            try VoiceCaptures.queue(recordingAt: url, questionId: nil, capturedAt: started,
                                    durationMs: Int((seconds * 1000).rounded()))
            return true
        } catch {
            // Left where it is: the next launch tries again.
            return false
        }
    }
}
