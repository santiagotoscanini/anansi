import Foundation

// Anansi's phone API: `/api/v1/*` on the user's server, `Authorization: Bearer ank_…`, JSON in and out (a file
// upload's body is the file itself). The key is created on the web (Profile → Devices) and reaches the phone as an
// `anansi://connect` link. This file builds the requests and reads the errors; it never touches the network.
// The server side is anansi/src/routes/api.v1.*.ts.

nonisolated enum API {
    /// One request, before the server and the key are added.
    struct Endpoint: Equatable, Sendable {
        var method: String
        var path: String
        var query: [URLQueryItem] = []
        var body: Data?
        var contentType: String?
    }

    /// The full URL of an endpoint on `server` (an origin like `https://anansi.example.com`).
    static func url(server: URL, _ endpoint: Endpoint) -> URL? {
        var parts = URLComponents(url: server.appending(path: endpoint.path), resolvingAgainstBaseURL: false)
        if !endpoint.query.isEmpty { parts?.queryItems = endpoint.query }
        return parts?.url
    }

    /// Accepts `https://host[/path]` (or `http://` for a dev server), trimmed; keeps only the origin.
    static func parseServer(_ string: String) -> URL? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host(), !host.isEmpty
        else { return nil }
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = host
        parts.port = url.port
        return parts.url
    }

    static func isKey(_ string: String) -> Bool {
        let key = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return key.hasPrefix("ank_") && (20...100).contains(key.count)
    }

    static func json<T: Encodable>(_ value: T) -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(value)) ?? Data("{}".utf8)
    }

    private static func get(_ path: String, query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(method: "GET", path: path, query: query)
    }

    private static func send<T: Encodable>(_ method: String, _ path: String, _ body: T) -> Endpoint {
        Endpoint(method: method, path: path, body: json(body), contentType: "application/json")
    }

    private static func bare(_ method: String, _ path: String) -> Endpoint {
        Endpoint(method: method, path: path)
    }

    // MARK: Endpoints

    static func me() -> Endpoint { get("api/v1/me") }

    static func pulse(day: LocalDay) -> Endpoint {
        get("api/v1/pulse", query: [URLQueryItem(name: "day", value: day.string)])
    }

    static func week(day: LocalDay) -> Endpoint { get("api/v1/weeks/\(day.string)") }

    static func startWeek(day: LocalDay, templateId: String? = nil) -> Endpoint {
        send("POST", "api/v1/weeks/\(day.string)", StartWeek(templateId: templateId))
    }

    static func addSyncItem(weeklySyncId: String, trackingItemId: String) -> Endpoint {
        send("POST", "api/v1/syncs/\(weeklySyncId)/items", ["trackingItemId": trackingItemId])
    }

    static func reorderSyncItems(weeklySyncId: String, ids: [String]) -> Endpoint {
        send("PUT", "api/v1/syncs/\(weeklySyncId)/order", ["ids": ids])
    }

    static func setSyncItemText(_ id: String, text: String) -> Endpoint {
        send("PATCH", "api/v1/sync-items/\(id)", ["textContent": text])
    }

    static func removeSyncItem(_ id: String) -> Endpoint { bare("DELETE", "api/v1/sync-items/\(id)") }

    /// The body is the file, sent separately (from disk).
    static func uploadAttachment(syncItemId: String, fileName: String, fileType: String, contentType: String) -> Endpoint {
        Endpoint(method: "POST", path: "api/v1/sync-items/\(syncItemId)/attachments",
                 query: [URLQueryItem(name: "fileName", value: fileName), URLQueryItem(name: "fileType", value: fileType)],
                 contentType: contentType)
    }

    static func attachment(_ id: String) -> Endpoint { get("api/v1/attachments/\(id)") }

    static func deleteAttachment(_ id: String) -> Endpoint { bare("DELETE", "api/v1/attachments/\(id)") }

    static func trackingItems() -> Endpoint { get("api/v1/tracking-items") }

    static func createTrackingItem(title: String, description: String?, goalId: String?) -> Endpoint {
        send("POST", "api/v1/tracking-items", TrackingItemFields(title: title, description: description, goalId: goalId))
    }

    static func updateTrackingItem(_ id: String, title: String, description: String?, goalId: String?) -> Endpoint {
        send("PATCH", "api/v1/tracking-items/\(id)", TrackingItemFields(title: title, description: description, goalId: goalId))
    }

    static func deleteTrackingItem(_ id: String) -> Endpoint { bare("DELETE", "api/v1/tracking-items/\(id)") }

    static func setOverlay(_ id: String, overlay: Overlay) -> Endpoint {
        send("PUT", "api/v1/tracking-items/\(id)/overlay", ["overlay": overlay])
    }

    static func clearOverlay(_ id: String) -> Endpoint { bare("DELETE", "api/v1/tracking-items/\(id)/overlay") }

    static func latestPicture(_ trackingItemId: String, excluding syncItemId: String?) -> Endpoint {
        get("api/v1/tracking-items/\(trackingItemId)/latest-picture",
            query: syncItemId.map { [URLQueryItem(name: "exclude", value: $0)] } ?? [])
    }

    static func templates() -> Endpoint { get("api/v1/templates") }

    static func createTemplate(name: String, isDefault: Bool) -> Endpoint {
        send("POST", "api/v1/templates", NewTemplate(name: name, isDefault: isDefault))
    }

    static func setTemplateItems(_ templateId: String, trackingItemIds: [String]) -> Endpoint {
        send("PUT", "api/v1/templates/\(templateId)/items", ["trackingItemIds": trackingItemIds])
    }

    static func goals() -> Endpoint { get("api/v1/goals") }

    // MARK: Bodies

    struct StartWeek: Encodable {
        var templateId: String?
    }

    struct NewTemplate: Encodable {
        var name: String
        var isDefault: Bool
    }

    /// Title, description and goal; a nil description or goal is sent as `null`, which clears it.
    struct TrackingItemFields: Encodable {
        var title: String
        var description: String?
        var goalId: String?

        enum CodingKeys: String, CodingKey { case title, description, goalId }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(title, forKey: .title)
            let trimmed = description?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let trimmed, !trimmed.isEmpty {
                try container.encode(trimmed, forKey: .description)
            } else {
                try container.encodeNil(forKey: .description)
            }
            if let goalId { try container.encode(goalId, forKey: .goalId) } else { try container.encodeNil(forKey: .goalId) }
        }
    }

    // MARK: Answers

    private struct ErrorBody: Decodable {
        struct Detail: Decodable {
            var code: String
            var message: String
        }

        var error: Detail
    }

    /// The error for a non-2xx answer, from the server's `{ "error": { code, message } }` when it sent one.
    static func error(status: Int, body: Data) -> APIError {
        if let decoded = try? JSONDecoder().decode(ErrorBody.self, from: body) {
            return APIError(status: status, code: decoded.error.code, message: decoded.error.message)
        }
        return APIError(status: status, code: status == 401 ? "UNAUTHORIZED" : "HTTP_\(status)",
                        message: "Anansi answered HTTP \(status).")
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: 200, code: "DECODING", message: "Unexpected answer shape for \(T.self): \(error)")
        }
    }
}

nonisolated struct APIError: Error, Equatable, Sendable, LocalizedError {
    /// HTTP status, or 0 when no answer came back.
    var status: Int
    var code: String
    var message: String

    static let notConnected = APIError(status: 0, code: "NOT_CONNECTED", message: "This phone isn't connected to Anansi yet.")

    static func offline(_ message: String) -> APIError {
        APIError(status: 0, code: "OFFLINE", message: message)
    }

    var errorDescription: String? {
        switch code {
        case "UNAUTHORIZED": "Anansi didn't accept this phone's key. Connect it again from Settings."
        default: message
        }
    }

    var isUnauthorized: Bool { status == 401 }

    /// Whether the same request can work later: the network, a revoked key being replaced, a busy server. A
    /// rejected input or a record that is gone won't.
    var isRetryable: Bool {
        status == 0 || status == 401 || status == 408 || status == 429 || status >= 500
    }
}

/// `anansi://connect?server=…&key=…`, what the web's Devices panel encodes in its QR code.
nonisolated struct ConnectLink: Equatable, Sendable {
    var server: URL
    var key: String

    init(server: URL, key: String) {
        self.server = server
        self.key = key
    }

    init?(_ url: URL) {
        guard url.scheme?.lowercased() == "anansi", url.host()?.lowercased() == "connect",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let serverText = items.first(where: { $0.name == "server" })?.value,
              let server = API.parseServer(serverText),
              let key = items.first(where: { $0.name == "key" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines),
              API.isKey(key)
        else { return nil }
        self.init(server: server, key: key)
    }

    init?(string: String) {
        guard let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        self.init(url)
    }
}
