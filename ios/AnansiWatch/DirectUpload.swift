import CaptureCore
import Foundation
import Observation
import WatchKit

/// The watch's own upload of its notes (`POST /api/v1/captures/voice`, `device=watch`, the note's id as
/// `clientId`), with the key the phone lent. A background `URLSession`: the system carries an upload on with the app
/// suspended, waits for a network when there is none, and wakes the app with the answer. A 2xx means the server has
/// the note, and it leaves the watch. Anything else leaves it where it is: it is tried again later, and the phone has
/// a copy on its way too.
@Observable
final class DirectUpload {
    static let shared = DirectUpload()

    static let identifier = "com.santiagotoscanini.anansi.watchkitapp.upload"

    /// The server stopped accepting the phone's key: no more uploads until the phone lends a new one.
    private(set) var keyRefused = false

    @ObservationIgnored private let delegate = UploadDelegate()
    @ObservationIgnored private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        return URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }()
    @ObservationIgnored private var wakeTasks: [WKURLSessionRefreshBackgroundTask] = []
    @ObservationIgnored private var scanning = false
    @ObservationIgnored private var scanAgain = false
    /// Refused for good this run (a 4xx other than an expired key or a rate limit): the phone's copy is the way.
    @ObservationIgnored private var refused: Set<UUID> = []
    @ObservationIgnored private var retry: Task<Void, Never>?
    @ObservationIgnored private var keyInUse: String?

    /// Starts an upload for every note that has none running.
    func uploadAll() {
        guard let credentials = PhoneLink.shared.credentials, let server = URL(string: credentials.server) else { return }
        if keyInUse != credentials.key {
            keyInUse = credentials.key
            keyRefused = false
        }
        guard !keyRefused else { return }
        guard !scanning else {
            scanAgain = true
            return
        }
        scanning = true
        Task {
            let running = await session.allTasks
            let uploading = Set(running.compactMap { $0.taskDescription.flatMap(UUID.init(uuidString:)) })
            for note in NoteStore.shared.queue.toUpload(uploading: uploading.union(refused)) {
                guard let url = WatchLink.uploadURL(server: server, note: note.info) else { continue }
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("Bearer \(credentials.key)", forHTTPHeaderField: "Authorization")
                request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
                request.timeoutInterval = 600
                let task = session.uploadTask(with: request, fromFile: NoteStore.shared.url(of: note))
                task.taskDescription = note.id.uuidString
                task.resume()
            }
            scanning = false
            if scanAgain {
                scanAgain = false
                uploadAll()
            }
        }
    }

    func finished(_ id: UUID, status: Int?, error: String?) {
        if let status, (200..<300).contains(status) {
            NoteStore.shared.landed([id])
            PhoneLink.shared.tellPhoneLanded([id])
            return
        }
        let message = status.map { "The server answered \($0)." } ?? error ?? "The upload didn't finish."
        NoteStore.shared.failed(id, message: message)
        if status == 401 {
            keyRefused = true
        } else if let status, (400..<500).contains(status), status != 408, status != 429 {
            refused.insert(id)
        } else {
            retry?.cancel()
            retry = Task { [weak self] in
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { return }
                self?.uploadAll()
            }
        }
    }

    // MARK: Being woken

    /// The system woke the app with uploads' answers: the session is rebuilt under its identifier so they arrive,
    /// and the task is completed once they have.
    func attach(_ task: WKURLSessionRefreshBackgroundTask) {
        wakeTasks.append(task)
        _ = session
    }

    func eventsDelivered() {
        let tasks = wakeTasks
        wakeTasks = []
        for task in tasks { task.setTaskCompletedWithSnapshot(false) }
    }
}

/// The session calls this on its own queue; the answers hop to the main actor.
nonisolated final class UploadDelegate: NSObject, URLSessionDataDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard let id = task.taskDescription.flatMap(UUID.init(uuidString:)) else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode
        let message = error?.localizedDescription
        Task { @MainActor in DirectUpload.shared.finished(id, status: status, error: message) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in DirectUpload.shared.eventsDelivered() }
    }
}
