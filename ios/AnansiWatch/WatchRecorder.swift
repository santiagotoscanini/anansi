import AVFoundation
import CaptureCore
import Foundation
import Observation
import WatchKit

/// One voice note at a time, from the watch's microphone to a 16 kHz mono 16-bit WAV (what the server's Whisper
/// takes, the same as the phone records) in `Application Support/Recordings/`, moved into `NoteStore` once stopped.
/// A file still in `Recordings/` when the app starts is a note cut off (the app killed, the battery gone):
/// `NoteStore.recoverLeftovers` keeps it. It stops on a second press, on an interruption (a call, Siri: what was
/// recorded is kept), or at the 30-minute limit. The app keeps recording with the screen off (background audio).
@Observable
final class WatchRecorder {
    static let shared = WatchRecorder()

    enum Phase: Equatable {
        case idle
        case recording
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var startedAt: Date?
    /// 0...1, from the recorder's average power, for the button's ring.
    private(set) var level: Double = 0

    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private(set) var fileURL: URL?
    @ObservationIgnored private var noteId: UUID?
    @ObservationIgnored private var ticker: Task<Void, Never>?
    @ObservationIgnored private var log = NoteLog()
    @ObservationIgnored private var elapsed: TimeInterval = 0
    @ObservationIgnored private var stoppedSince: Date?
    @ObservationIgnored private var lastLogged = Date.distantPast
    /// Asked to start before the app was in front (a launch from the complication or a shortcut).
    @ObservationIgnored private var startWhenActive: String?
    @ObservationIgnored private var starting = false

    static var folder: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "Recordings", directoryHint: .isDirectory)
    }

    var isRecording: Bool { phase == .recording }

    /// Starts a note, or stops the one being recorded: every way in (the button, the complication, the Action
    /// Button's shortcut, Siri) does the same.
    func toggle(from origin: String) async {
        if isRecording {
            stop(reason: origin)
            return
        }
        // Already on its way (starting, or waiting for the app to come forward).
        guard !starting, startWhenActive == nil else { return }
        await start(from: origin)
    }

    func start(from origin: String) async {
        guard !isRecording, !starting else { return }
        log = NoteLog()
        log.note("start (\(origin)), app \(Self.appState)")
        // The microphone starts only for an app in front; one just launched gets there in a moment.
        guard WKApplication.shared().applicationState == .active else {
            startWhenActive = origin
            log.note("waiting for the app to come forward")
            return
        }
        starting = true
        defer { starting = false }
        guard await AVAudioApplication.requestRecordPermission() else {
            log.note("no microphone permission")
            phase = .failed("Anansi can't use the microphone. Allow it in the watch's Settings → Privacy & Security → Microphone.")
            return
        }
        try? FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
        let id = UUID()
        let url = Self.folder.appending(path: "\(id.uuidString).wav")
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            log.note("session active")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
            ]
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record() else { throw RecorderError() }
            log.note("recorder started")
            self.recorder = recorder
            fileURL = url
            noteId = id
            startedAt = .now
            elapsed = 0
            stoppedSince = nil
            phase = .recording
            WKInterfaceDevice.current().play(.start)
            ticker = Task { [weak self] in
                while !Task.isCancelled {
                    self?.poll()
                    try? await Task.sleep(for: .milliseconds(100))
                }
            }
        } catch {
            log.note("could not start: \(error.localizedDescription)")
            try? AVAudioSession.sharedInstance().setActive(false)
            try? FileManager.default.removeItem(at: url)
            phase = .failed("The recording couldn't start: \(error.localizedDescription)")
            WKInterfaceDevice.current().play(.failure)
        }
    }

    /// The app came forward: a start that was waiting for it goes now.
    func becameActive() {
        guard let origin = startWhenActive else { return }
        startWhenActive = nil
        Task { await start(from: origin) }
    }

    private func poll() {
        guard let recorder, isRecording else { return }
        guard recorder.isRecording else {
            // The system stopped it under us (a call, Siri). A moment's blip is not that: it has to last a second.
            let since = stoppedSince ?? .now
            if stoppedSince == nil {
                stoppedSince = since
                log.note("recorder not recording, app \(Self.appState)")
            }
            if Date.now.timeIntervalSince(since) >= 1 { stop(reason: "interrupted") }
            return
        }
        stoppedSince = nil
        recorder.updateMeters()
        elapsed = recorder.currentTime
        level = max(0, min(1, (Double(recorder.averagePower(forChannel: 0)) + 60) / 60))
        if Date.now.timeIntervalSince(lastLogged) >= 5 {
            lastLogged = .now
            log.note(String(format: "recording %.0fs, app %@", elapsed, Self.appState))
        }
        if let startedAt, RecordingRules.remaining(startedAt: startedAt, now: .now) == 0 {
            stop(reason: "the 30-minute limit")
        }
    }

    /// Stops and keeps the note (a note too short to hold anything, a double press, is dropped).
    func stop(reason: String) {
        guard let recorder, let fileURL, let noteId, isRecording else { return }
        let running = recorder.isRecording ? recorder.currentTime : 0
        recorder.stop()
        ticker?.cancel()
        self.recorder = nil
        self.fileURL = nil
        self.noteId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        // After an interruption the recorder says 0: the file is what counts.
        let seconds = max(running, elapsed, WAVDisk.seconds(of: fileURL) ?? 0)
        log.note(String(format: "stopped (%@) after %.1fs, app %@", reason, seconds, Self.appState))
        phase = .idle
        level = 0
        let captured = startedAt ?? .now
        startedAt = nil
        WKInterfaceDevice.current().play(.stop)
        guard let durationMs = RecordingRules.durationMs(seconds: seconds) else {
            try? FileManager.default.removeItem(at: fileURL)
            return
        }
        NoteStore.shared.add(recordingAt: fileURL,
                             info: WatchLink.NoteInfo(id: noteId, capturedAt: captured, durationMs: durationMs,
                                                      log: log.text))
    }

    func dismissFailure() {
        if case .failed = phase { phase = .idle }
    }

    private static var appState: String {
        switch WKApplication.shared().applicationState {
        case .active: "active"
        case .inactive: "inactive"
        case .background: "background"
        @unknown default: "unknown"
        }
    }
}

private struct RecorderError: Error, LocalizedError {
    var errorDescription: String? { "The microphone didn't start." }
}

/// A note's recording log: its steps and the app's state, never its words. It goes with the note as `clientLog`, so
/// how a recording from the wrist went can be read on the server.
struct NoteLog {
    private var lines: [String] = []

    mutating func note(_ text: String) {
        lines.append("\(Date.now.formatted(.iso8601.time(includingFractionalSeconds: true))) watch: \(text)")
    }

    var text: String { lines.joined(separator: "\n") }
}
