import AVFoundation
import Foundation
import SwiftUI
import UIKit

/// What happened around each recording, step by step, so a recording that misbehaves on the phone (nothing shown on
/// the Lock Screen, a silent note) can be understood from the server. A few hundred short lines in a file next to
/// the outbox; the lines not yet sent ride along with the next voice note (`clientLog` on the upload) and are kept
/// with it on the server (`captures.device_log`). Nothing in it is the note itself: steps, states and levels only.
final class RecordingLog {
    static let shared = RecordingLog()

    private let url: URL
    private var lines: [String]
    /// How many of `lines` (from the start) already went to the server.
    private var sent: Int
    private static let keep = 300
    /// What one upload carries at most (it travels in the URL).
    static let maxUpload = 6000

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        url = base.appending(path: "recording-log.txt")
        let saved = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        var all = saved.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        // The first line is how many were sent.
        sent = all.first.flatMap { Int($0.dropFirst("#sent ".count)) } ?? 0
        if all.first?.hasPrefix("#sent ") == true { all.removeFirst() }
        lines = all
        sent = min(sent, lines.count)
    }

    /// Notes one step. `what` is short and has no personal content.
    func note(_ what: String) {
        let stamp = Self.stamp.string(from: .now)
        let state = switch UIApplication.shared.applicationState {
        case .active: "fg"
        case .inactive: "in"
        case .background: "bg"
        @unknown default: "?"
        }
        let locked = UIApplication.shared.isProtectedDataAvailable ? "" : " locked"
        lines.append("\(stamp) [\(state)\(locked)] \(what.prefix(160))")
        if lines.count > Self.keep {
            let drop = lines.count - Self.keep
            lines.removeFirst(drop)
            sent = max(0, sent - drop)
        }
        save()
    }

    /// The microphone's side of things, in one line.
    func noteAudio(_ what: String) {
        let session = AVAudioSession.sharedInstance()
        let permission = switch AVAudioApplication.shared.recordPermission {
        case .granted: "granted"
        case .denied: "denied"
        case .undetermined: "undetermined"
        @unknown default: "?"
        }
        note("\(what) · mic \(permission), input \(session.isInputAvailable ? "yes" : "no"), category \(session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: "")), other audio \(session.isOtherAudioPlaying ? "yes" : "no")")
    }

    /// The lines not yet sent, newest kept when they are too many for one upload; nil when there are none.
    func unsent() -> (text: String, upTo: Int)? {
        guard sent < lines.count else { return nil }
        var picked: [String] = []
        var size = 0
        for line in lines[sent...].reversed() {
            if size + line.count + 1 > Self.maxUpload { break }
            picked.insert(line, at: 0)
            size += line.count + 1
        }
        return (picked.joined(separator: "\n"), lines.count)
    }

    /// The newest lines, newest last, for the screen.
    func recent(_ count: Int = 150) -> [String] { Array(lines.suffix(count)) }

    /// The server has the lines up to `upTo`.
    func markSent(upTo: Int) {
        sent = max(sent, min(upTo, lines.count))
        save()
    }

    private func save() {
        let text = (["#sent \(sent)"] + lines).joined(separator: "\n")
        try? text.write(to: url, atomically: true, encoding: .utf8)
    }

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        return f
    }()
}

/// The app's comings and goings and the audio session's interruptions, into the recording log: what decides whether
/// a recording in the background keeps going.
enum AppLifecycleLog {
    private static var tokens: [NSObjectProtocol] = []

    static func start() {
        guard tokens.isEmpty else { return }
        let center = NotificationCenter.default
        let plain: [(Notification.Name, String)] = [
            (UIApplication.didEnterBackgroundNotification, "app went to the background"),
            (UIApplication.willEnterForegroundNotification, "app coming to the front"),
            (UIApplication.willTerminateNotification, "app terminating"),
            (UIApplication.protectedDataWillBecomeUnavailableNotification, "phone locking"),
            (UIApplication.protectedDataDidBecomeAvailableNotification, "phone unlocked"),
            (AVAudioSession.mediaServicesWereResetNotification, "audio services reset"),
        ]
        for (name, what) in plain {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { @Sendable _ in
                MainActor.assumeIsolated { RecordingLog.shared.note(what) }
            })
        }
        tokens.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil,
                                         queue: .main) { @Sendable note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
                .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
            let reason = (note.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt) ?? 0
            let what = "audio interruption \(type == .began ? "began" : type == .ended ? "ended" : "?"), reason \(reason)"
            MainActor.assumeIsolated { RecordingLog.shared.note(what) }
        })
        tokens.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil,
                                         queue: .main) { @Sendable note in
            let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
            MainActor.assumeIsolated { RecordingLog.shared.note("audio route changed, reason \(reason)") }
        })
    }
}

/// Settings → Recording log: the newest lines, with a way to copy them all.
struct RecordingLogView: View {
    @State private var lines = RecordingLog.shared.recent()

    var body: some View {
        List {
            ForEach(Array(lines.enumerated().reversed()), id: \.offset) { _, line in
                Text(line)
                    .font(AN.mono(.caption2))
                    .foregroundStyle(AN.ink2)
                    .textSelection(.enabled)
            }
        }
        .navigationTitle("Recording log")
        .toolbar {
            Button("Copy") { UIPasteboard.general.string = lines.joined(separator: "\n") }
        }
        .refreshable { lines = RecordingLog.shared.recent() }
    }
}
