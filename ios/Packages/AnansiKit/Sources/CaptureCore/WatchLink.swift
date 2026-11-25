import Foundation

// The Apple Watch's voice notes on their way to Anansi. A note recorded on the watch goes two ways at once, and is
// deleted from the watch only once the server is known to have it:
//
// 1. The watch uploads it itself (`POST /api/v1/captures/voice`, with the phone's key, which the phone hands it in
//    WatchConnectivity's application context).
// 2. The watch hands the file to the phone (`WCSession.transferFile`, which the system delivers even with either app
//    closed); the phone puts it in its outbox, which keeps it until the server has it.
//
// Both send the note's id as `clientId`, so whichever lands second gets the capture the first made, never a second
// one. The phone answers with `Ack`s (`transferUserInfo`, queued and delivered by the system like the file): first
// that it holds the note, then that the server does. The watch tells the phone when its own upload landed, so the
// phone can drop its copy unsent. Pure, so it is tested; the two sides are `WatchBridge` (phone) and the watch app.

/// The device a capture was made on, as the server names it (`captures.device`).
public enum CaptureDevice: String, Codable, Hashable, Sendable {
    case iphone
    case watch
}

public nonisolated enum WatchLink {
    /// What travels with a note's file (its transfer metadata) and in the watch's own queue.
    public struct NoteInfo: Codable, Hashable, Sendable {
        /// The note's id: its file name, and `clientId` on the server.
        public var id: UUID
        public var capturedAt: Date
        public var durationMs: Int
        /// The watch's recording log for this note (steps and states, never words): `clientLog` on the server.
        public var log: String?

        public init(id: UUID, capturedAt: Date, durationMs: Int, log: String? = nil) {
            self.id = id
            self.capturedAt = capturedAt
            self.durationMs = durationMs
            self.log = log
        }
    }

    private static let noteKey = "anansi.note"

    /// A file transfer's metadata (property-list values only, hence the note as JSON data).
    public static func metadata(_ note: NoteInfo) -> [String: Any] {
        guard let data = try? JSONEncoder().encode(note) else { return [:] }
        return [noteKey: data]
    }

    public static func note(fromMetadata metadata: [String: Any]?) -> NoteInfo? {
        guard let data = metadata?[noteKey] as? Data else { return nil }
        return try? JSONDecoder().decode(NoteInfo.self, from: data)
    }

    // MARK: Acknowledgements

    /// The phone to the watch: `received` once the note is in the phone's outbox (the watch stops handing it over),
    /// `landed` once the server has it (the watch deletes it). The watch sends `landed` to the phone too, for a note
    /// its own upload delivered.
    public enum Ack: Equatable, Sendable {
        case received([UUID])
        case landed([UUID])
    }

    private static let receivedKey = "anansi.received"
    private static let landedKey = "anansi.landed"

    public static func userInfo(_ ack: Ack) -> [String: Any] {
        switch ack {
        case .received(let ids): [receivedKey: ids.map(\.uuidString)]
        case .landed(let ids): [landedKey: ids.map(\.uuidString)]
        }
    }

    public static func ack(fromUserInfo info: [String: Any]) -> Ack? {
        if let ids = info[landedKey] as? [String] { return .landed(ids.compactMap(UUID.init(uuidString:))) }
        if let ids = info[receivedKey] as? [String] { return .received(ids.compactMap(UUID.init(uuidString:))) }
        return nil
    }

    // MARK: The key

    /// The phone's link to Anansi, lent to the watch so it can upload on its own.
    public struct Credentials: Codable, Hashable, Sendable {
        public var server: String
        public var key: String

        public init(server: String, key: String) {
            self.server = server
            self.key = key
        }
    }

    private static let serverKey = "anansi.server"
    private static let keyKey = "anansi.key"
    private static let signedOutKey = "anansi.signedOut"

    /// The application context the phone keeps current: its key, or that it has none (disconnected, revoked).
    public static func context(_ credentials: Credentials?) -> [String: Any] {
        guard let credentials else { return [signedOutKey: true] }
        return [serverKey: credentials.server, keyKey: credentials.key]
    }

    /// What a context says: `.some(nil)` when the phone has no key any more, nil when it says nothing about it.
    public static func credentials(fromContext context: [String: Any]) -> Credentials?? {
        if let server = context[serverKey] as? String, let key = context[keyKey] as? String {
            return .some(Credentials(server: server, key: key))
        }
        if context[signedOutKey] as? Bool == true { return .some(nil) }
        return nil
    }

    // MARK: The watch's own upload

    /// The voice-note upload for a note made on the watch: the same route and fields the phone's outbox sends,
    /// with `device=watch`. The body is the WAV.
    public static func uploadURL(server: URL, note: NoteInfo) -> URL? {
        var components = URLComponents(url: server.appending(path: "api/v1/captures/voice"),
                                       resolvingAgainstBaseURL: false)
        var query = [
            URLQueryItem(name: "capturedAt", value: instant(note.capturedAt)),
            URLQueryItem(name: "durationMs", value: String(max(0, note.durationMs))),
            URLQueryItem(name: "fileName", value: "Voice note.wav"),
            URLQueryItem(name: "clientId", value: note.id.uuidString),
            URLQueryItem(name: "device", value: CaptureDevice.watch.rawValue),
        ]
        if let log = note.log, !log.isEmpty {
            query.append(URLQueryItem(name: "clientLog", value: String(log.suffix(maxLog))))
        }
        components?.queryItems = query
        // `+` is a space in a query string to the server: spell it out, as the phone's API client does.
        if let encoded = components?.percentEncodedQuery {
            components?.percentEncodedQuery = encoded.replacingOccurrences(of: "+", with: "%2B")
        }
        return components?.url
    }

    /// The server keeps at most this much of a note's log.
    public static let maxLog = 8000

    /// The moment a capture was made, as the server reads it (ISO 8601, UTC, with milliseconds).
    public static func instant(_ date: Date) -> String {
        Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date)
    }
}
