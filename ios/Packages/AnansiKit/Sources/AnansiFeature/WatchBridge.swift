import Foundation
import WatchConnectivity

/// The phone's end of the link to the Apple Watch app (the design is in `WatchLink`, CaptureCore). It receives the
/// watch's voice notes and puts them in the outbox under the watch's id, with `device = watch`; it lends the watch
/// this phone's key so the watch can upload on its own; and it tells the watch, through `transferUserInfo` (queued
/// and delivered by the system), when it holds a note and when the server has it. The watch deletes a note only
/// after that second word, or its own upload's answer.
///
/// A received file must be moved before the delegate call returns (the system deletes it then), so `stage` runs on
/// WatchConnectivity's queue: the note's details are written first, then the file is moved next to them, in
/// `Application Support/FromWatch/`. `queueStaged` then hands each to the outbox on the main actor; it also runs at
/// launch, for anything a crash left between the two.
final class WatchBridge {
    static let shared = WatchBridge()

    private let delegate = WatchSessionDelegate()
    /// Acks said before the session was up; sent once it is.
    private var waiting: [WatchLink.Ack] = []

    private static let landedKey = "anansi.watch.landed"
    /// How many landed ids are kept, to say again on every activation (a lost word costs nothing then).
    private static let landedMemory = 200

    nonisolated static var staging: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "FromWatch", directoryHint: .isDirectory)
    }

    func start() {
        try? FileManager.default.createDirectory(at: Self.staging, withIntermediateDirectories: true)
        queueStaged()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = delegate
        WCSession.default.activate()
    }

    /// The session is up: the watch gets the key and hears again what this phone holds and what landed.
    func didActivate() {
        shareCredentials()
        let held = (OutboxStore.shared.outbox.pending + OutboxStore.shared.outbox.failed.map(\.op))
            .filter { $0.device == .watch }
            .map(\.id)
        if !held.isEmpty { send(.received(held)) }
        let landed = landedIds
        if !landed.isEmpty { send(.landed(landed)) }
        let queued = waiting
        waiting = []
        queued.forEach(send)
    }

    /// Lends the watch this phone's link to Anansi, or tells it there is none.
    func shareCredentials() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        let credentials = Connection.shared.credentials.map {
            WatchLink.Credentials(server: $0.server.absoluteString, key: $0.key)
        }
        do {
            try session.updateApplicationContext(WatchLink.context(credentials))
        } catch {
            RecordingLog.shared.note("watch: could not share the key: \(error.localizedDescription)")
        }
    }

    /// The server has this watch note (from this phone's outbox).
    func didLand(_ id: UUID) {
        remember(landed: id)
        send(.landed([id]))
    }

    /// The watch's own upload delivered this note: this phone's copy goes unsent.
    func watchDelivered(_ ids: [UUID]) {
        for id in ids {
            OutboxStore.shared.dropDelivered(id)
            remember(landed: id)
            try? FileManager.default.removeItem(at: Self.staging.appending(path: "\(id.uuidString).json"))
            try? FileManager.default.removeItem(at: Self.staging.appending(path: "\(id.uuidString).wav"))
        }
    }

    private func send(_ ack: WatchLink.Ack) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            waiting.append(ack)
            return
        }
        WCSession.default.transferUserInfo(WatchLink.userInfo(ack))
    }

    private var landedIds: [UUID] {
        (UserDefaults.standard.stringArray(forKey: Self.landedKey) ?? []).compactMap(UUID.init(uuidString:))
    }

    private func remember(landed id: UUID) {
        var ids = UserDefaults.standard.stringArray(forKey: Self.landedKey) ?? []
        ids.removeAll { $0 == id.uuidString }
        ids.append(id.uuidString)
        UserDefaults.standard.set(Array(ids.suffix(Self.landedMemory)), forKey: Self.landedKey)
    }

    // MARK: Receiving

    /// Keeps a file the watch sent (on WatchConnectivity's queue, before the system deletes it). A file without
    /// readable details is kept too, under a new id, dated when it arrived: a note is never thrown away here.
    nonisolated static func stage(fileAt source: URL, metadata: [String: Any]?) {
        let fm = FileManager.default
        try? fm.createDirectory(at: staging, withIntermediateDirectories: true)
        let note = WatchLink.note(fromMetadata: metadata)
            ?? WatchLink.NoteInfo(id: UUID(), capturedAt: .now,
                                  durationMs: Int(((WAVDisk.seconds(of: source) ?? 0) * 1000).rounded()),
                                  log: "phone: the watch's details for this note were unreadable")
        let wav = staging.appending(path: "\(note.id.uuidString).wav")
        let details = staging.appending(path: "\(note.id.uuidString).json")
        do {
            // The details first: a file is never left here without them.
            try JSONEncoder().encode(note).write(to: details, options: .atomic)
            try? fm.removeItem(at: wav)
            try fm.moveItem(at: source, to: wav)
        } catch {
            // Not kept: the watch was told nothing, so it hands the note over again.
            try? fm.removeItem(at: details)
        }
    }

    /// Puts each staged note in the outbox (once: a note the outbox already has is only acknowledged again).
    func queueStaged() {
        let fm = FileManager.default
        let names = (try? fm.contentsOfDirectory(atPath: Self.staging.path(percentEncoded: false))) ?? []
        for name in names where name.hasSuffix(".json") {
            let details = Self.staging.appending(path: name)
            guard let data = try? Data(contentsOf: details),
                  let note = try? JSONDecoder().decode(WatchLink.NoteInfo.self, from: data)
            else {
                try? fm.removeItem(at: details)
                continue
            }
            let wav = Self.staging.appending(path: "\(note.id.uuidString).wav")
            if OutboxStore.shared.holdsCapture(note.id) {
                try? fm.removeItem(at: wav)
                try? fm.removeItem(at: details)
                send(OutboxStore.shared.hasLanded(note.id) ? .landed([note.id]) : .received([note.id]))
                continue
            }
            guard fm.fileExists(atPath: wav.path(percentEncoded: false)) else {
                try? fm.removeItem(at: details)
                continue
            }
            do {
                _ = try OutboxStore.shared.addVoiceCapture(recordingAt: wav, questionId: nil, capturedAt: note.capturedAt,
                                                       durationMs: note.durationMs, id: note.id, device: .watch,
                                                       clientLog: note.log)
                try? fm.removeItem(at: details)
                RecordingLog.shared.note("watch: note \(note.id.uuidString.prefix(8)) queued")
                send(.received([note.id]))
            } catch {
                // Left staged: the next launch, or the next note, tries again.
                RecordingLog.shared.note("watch: could not queue a note: \(error.localizedDescription)")
            }
        }
    }
}

/// WatchConnectivity calls this on its own queue; everything that touches the app hops to the main actor.
nonisolated final class WatchSessionDelegate: NSObject, WCSessionDelegate, Sendable {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
                 error: (any Error)?) {
        guard activationState == .activated else { return }
        Task { @MainActor in WatchBridge.shared.didActivate() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Switching to another watch: the session is activated again for it.
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in WatchBridge.shared.shareCredentials() }
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        WatchBridge.stage(fileAt: file.fileURL, metadata: file.metadata)
        Task { @MainActor in WatchBridge.shared.queueStaged() }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard case .landed(let ids) = WatchLink.ack(fromUserInfo: userInfo) else { return }
        Task { @MainActor in WatchBridge.shared.watchDelivered(ids) }
    }
}
