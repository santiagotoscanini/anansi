import AVFoundation
import Foundation
import Observation

/// One recording: microphone to a 16 kHz mono 16-bit WAV in `Recordings/` (Application Support, never purged by the
/// system), moved into the outbox only once finished (so the outbox's sweep never sees a file still being written),
/// with the elapsed time and a level for the meter. A file still in `Recordings/` when the app next starts is a
/// recording that never finished (the app was killed, the phone died): `RecordingRecovery` queues it then. An
/// interruption (a call, Siri, another app taking the microphone) pauses the recorder; `onInterrupted` lets the
/// owner stop and keep what was recorded. WAV because the server's Whisper refuses AAC and the server has nothing to convert with (~1.9 MB a minute).
/// Everything here runs on the main actor; AVAudioRecorder is driven from it and polled for its meter.
@Observable
final class VoiceRecorder {
    enum Phase: Equatable {
        case idle
        case recording
        case finished
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var elapsed: TimeInterval = 0
    /// 0...1, from the recorder's average power.
    private(set) var level: Double = 0

    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored let fileURL: URL
    /// Called once when the system stops the recording under it (an interruption, an encoding error).
    @ObservationIgnored var onInterrupted: (() -> Void)?

    /// Where recordings are written while they run.
    static var folder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "Recordings", directoryHint: .isDirectory)
    }

    init() {
        try? FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
        fileURL = Self.folder.appending(path: "\(UUID().uuidString).wav")
    }

    func start() async {
        guard phase == .idle else { return }
        guard await AVAudioApplication.requestRecordPermission() else {
            phase = .failed("Anansi can't use the microphone. Allow it in Settings → Privacy & Security → Microphone.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
            ]
            let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record() else { throw RecorderError() }
            self.recorder = recorder
            phase = .recording
            ticker = Task { [weak self] in
                while !Task.isCancelled {
                    self?.poll()
                    try? await Task.sleep(for: .milliseconds(60))
                }
            }
        } catch {
            phase = .failed("The recording couldn't start: \(error.localizedDescription)")
        }
    }

    private func poll() {
        guard let recorder, phase == .recording else { return }
        guard recorder.isRecording else {
            // The system stopped it under us. Said once; the owner stops and keeps it.
            if let interrupted = onInterrupted {
                onInterrupted = nil
                interrupted()
            }
            return
        }
        recorder.updateMeters()
        elapsed = recorder.currentTime
        // -60 dB is silence enough; the meter shows the rest on a 0...1 scale.
        let power = Double(recorder.averagePower(forChannel: 0))
        level = max(0, min(1, (power + 60) / 60))
    }

    /// Stops and answers the recording's length in milliseconds, or nil when nothing was recorded (and the file is
    /// gone). The length is the longest of what the recorder says, what was last seen while it ran, and what the
    /// file holds: after an interruption the recorder says 0, and the file is what counts.
    func stop() -> Int? {
        guard let recorder, phase == .recording else { return nil }
        let running = recorder.isRecording ? recorder.currentTime : 0
        recorder.stop()
        ticker?.cancel()
        onInterrupted = nil
        self.recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let seconds = max(running, elapsed, RecordingRecovery.seconds(of: fileURL) ?? 0)
        phase = .finished
        elapsed = seconds
        level = 0
        guard let durationMs = RecordingRules.durationMs(seconds: seconds) else {
            try? FileManager.default.removeItem(at: fileURL)
            return nil
        }
        return durationMs
    }

    /// Stops and throws the recording away.
    func discard() {
        recorder?.stop()
        ticker?.cancel()
        onInterrupted = nil
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        try? FileManager.default.removeItem(at: fileURL)
        phase = .finished
    }
}

private struct RecorderError: Error, LocalizedError {
    var errorDescription: String? { "The microphone didn't start." }
}
