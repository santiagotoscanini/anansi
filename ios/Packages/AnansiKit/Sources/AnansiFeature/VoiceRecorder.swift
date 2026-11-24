import AVFoundation
import Foundation
import Observation

/// One recording: microphone to a 16 kHz mono 16-bit WAV in a temporary folder, moved into the outbox only once
/// finished (so the outbox's sweep never sees a file still being written), with the elapsed time and a level for the
/// meter. WAV because the server's Whisper refuses AAC and the server has nothing to convert with (~1.9 MB a minute).
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

    init() {
        let folder = FileManager.default.temporaryDirectory.appending(path: "Recordings", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        fileURL = folder.appending(path: "\(UUID().uuidString).wav")
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
        guard let recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        elapsed = recorder.currentTime
        // -60 dB is silence enough; the meter shows the rest on a 0...1 scale.
        let power = Double(recorder.averagePower(forChannel: 0))
        level = max(0, min(1, (power + 60) / 60))
    }

    /// Stops and answers the recording's length in milliseconds, or nil when nothing was recorded.
    func stop() -> Int? {
        guard let recorder, phase == .recording else { return nil }
        let seconds = recorder.currentTime
        recorder.stop()
        ticker?.cancel()
        self.recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        phase = .finished
        elapsed = seconds
        level = 0
        return RecordingRules.durationMs(seconds: seconds)
    }

    /// Stops and throws the recording away.
    func discard() {
        recorder?.stop()
        ticker?.cancel()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        try? FileManager.default.removeItem(at: fileURL)
        phase = .finished
    }
}

private struct RecorderError: Error, LocalizedError {
    var errorDescription: String? { "The microphone didn't start." }
}
