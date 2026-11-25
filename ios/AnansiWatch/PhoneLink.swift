import CaptureCore
import Foundation
import Observation
import Security
import WatchConnectivity
import WatchKit

/// The watch's end of the link to the phone (`WatchLink`, CaptureCore): it hands every note to the phone
/// (`transferFile`, which the system delivers in its own time, with either app closed), hears the phone say it holds
/// a note and that the server has it, and keeps the phone's key (lent in the application context) in the watch's
/// Keychain for `DirectUpload`.
@Observable
final class PhoneLink {
    static let shared = PhoneLink()

    /// The phone's link to Anansi, when it has lent one.
    private(set) var credentials: WatchLink.Credentials?
    private(set) var isActivated = false

    @ObservationIgnored private let delegate = PhoneSessionDelegate()
    @ObservationIgnored private var wakeTasks: [WKWatchConnectivityRefreshBackgroundTask] = []
    @ObservationIgnored private var retry: Task<Void, Never>?

    init() {
        credentials = WatchKeychain.read()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = delegate
        WCSession.default.activate()
    }

    func didActivate() {
        isActivated = true
        apply(context: WCSession.default.receivedApplicationContext)
        handOver()
        finishWakeTasksIfDone()
    }

    /// Hands the phone each note it has not said it holds and that is not on its way already.
    func handOver() {
        guard isActivated else { return }
        let session = WCSession.default
        let inTransfer = Set(session.outstandingFileTransfers.compactMap { WatchLink.note(fromMetadata: $0.file.metadata)?.id })
        for note in NoteStore.shared.queue.toHandOver(inTransfer: inTransfer) {
            session.transferFile(NoteStore.shared.url(of: note), metadata: WatchLink.metadata(note.info))
        }
    }

    /// A note the server has needs no transfer any more.
    func cancelTransfers(_ ids: [UUID]) {
        guard isActivated else { return }
        for transfer in WCSession.default.outstandingFileTransfers {
            if let id = WatchLink.note(fromMetadata: transfer.file.metadata)?.id, ids.contains(id) { transfer.cancel() }
        }
    }

    /// The watch's own upload delivered these: the phone can drop its copies unsent.
    func tellPhoneLanded(_ ids: [UUID]) {
        guard isActivated, !ids.isEmpty else { return }
        WCSession.default.transferUserInfo(WatchLink.userInfo(.landed(ids)))
    }

    func apply(context: [String: Any]) {
        guard let said = WatchLink.credentials(fromContext: context) else { return }
        apply(said)
    }

    /// The phone's key, or `nil` when it has none any more.
    func apply(_ said: WatchLink.Credentials?) {
        guard said != credentials else { return }
        credentials = said
        if let said { WatchKeychain.save(said) } else { WatchKeychain.delete() }
        DirectUpload.shared.uploadAll()
    }

    func didReceive(_ ack: WatchLink.Ack) {
        switch ack {
        case .received(let ids): NoteStore.shared.received(ids)
        case .landed(let ids): NoteStore.shared.landed(ids)
        }
        finishWakeTasksIfDone()
    }

    /// A transfer that failed is tried again in a while (and at every launch and every new note).
    func transferFailed() {
        retry?.cancel()
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            self?.handOver()
        }
    }

    // MARK: Being woken

    /// The system woke the app for the phone's messages: done once nothing more is waiting to arrive.
    func attach(_ task: WKWatchConnectivityRefreshBackgroundTask) {
        wakeTasks.append(task)
        if !isActivated { start() }
        finishWakeTasksIfDone()
        Task { [weak self] in
            // Never hold the system's time for long.
            try? await Task.sleep(for: .seconds(15))
            self?.finishWakeTasks()
        }
    }

    private func finishWakeTasksIfDone() {
        guard isActivated, !WCSession.default.hasContentPending else { return }
        finishWakeTasks()
    }

    private func finishWakeTasks() {
        let tasks = wakeTasks
        wakeTasks = []
        for task in tasks { task.setTaskCompletedWithSnapshot(false) }
    }
}

/// WatchConnectivity calls this on its own queue; everything that touches the app hops to the main actor.
nonisolated final class PhoneSessionDelegate: NSObject, WCSessionDelegate, Sendable {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
                 error: (any Error)?) {
        guard activationState == .activated else { return }
        Task { @MainActor in PhoneLink.shared.didActivate() }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let said = WatchLink.credentials(fromContext: applicationContext) else { return }
        Task { @MainActor in PhoneLink.shared.apply(said) }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let ack = WatchLink.ack(fromUserInfo: userInfo) else { return }
        Task { @MainActor in PhoneLink.shared.didReceive(ack) }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: (any Error)?) {
        guard error != nil else { return }
        Task { @MainActor in PhoneLink.shared.transferFailed() }
    }
}

/// The phone's key, kept in the watch's Keychain (readable after the first unlock, so an upload the system resumes
/// in the background can still sign itself).
enum WatchKeychain {
    private static var query: [String: Any] { [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.santiagotoscanini.anansi.watch",
        kSecAttrAccount as String: "credentials",
    ] }

    static func read() -> WatchLink.Credentials? {
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(WatchLink.Credentials.self, from: data)
    }

    static func save(_ credentials: WatchLink.Credentials) {
        guard let data = try? JSONEncoder().encode(credentials) else { return }
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        guard status == errSecItemNotFound else { return }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
