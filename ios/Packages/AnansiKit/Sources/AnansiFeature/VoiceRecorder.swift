import AVFoundation
import Foundation
import Observation
import Speech

/// One recording: microphone to an AAC `.m4a` in a temporary folder (moved into the outbox only once finished, so
/// the outbox's sweep never sees a file still being written), with the elapsed time and a level for the meter.
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
        fileURL = folder.appending(path: "\(UUID().uuidString).m4a")
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
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
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

/// Speech to text on this iPhone (SpeechAnalyzer + SpeechTranscriber): nothing leaves the phone to be transcribed.
/// It runs off the main actor; only the file's URL goes in and only the text comes out.
nonisolated enum OnDeviceTranscriber {
    /// The user's preferred language when the transcriber has it, else English.
    @concurrent static func locale() async -> Locale {
        for identifier in Locale.preferredLanguages {
            if let match = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier)) {
                return match
            }
        }
        return await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US"))
            ?? Locale(identifier: "en-US")
    }

    /// The words in a recording, installing the language's model first when the phone doesn't have it yet.
    @concurrent static func transcribe(_ url: URL) async throws -> String {
        let transcriber = SpeechTranscriber(locale: await locale(), transcriptionOptions: [], reportingOptions: [],
                                            attributeOptions: [])
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
        let file = try AVAudioFile(forReading: url)
        // Starts analysing the whole file at once and finishes when it ends, so the results end too.
        let analyzer = try await SpeechAnalyzer(inputAudioFile: file, modules: [transcriber], finishAfterFile: true)
        var parts: [String] = []
        for try await result in transcriber.results {
            let words = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
            if !words.isEmpty { parts.append(words) }
        }
        withExtendedLifetime(analyzer) {}
        return parts.joined(separator: " ")
    }
}
