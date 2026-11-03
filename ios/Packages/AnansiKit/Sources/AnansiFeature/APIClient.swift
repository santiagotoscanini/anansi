import Foundation

/// Sends `API.Endpoint`s to the connected server with the device key. A 401 marks the key as revoked
/// (`Connection.didLoseAuthorization`); every other failure comes back as an `APIError`.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    private func makeRequest(_ endpoint: API.Endpoint, server: URL, key: String, timeout: TimeInterval) throws -> URLRequest {
        guard let url = API.url(server: server, endpoint) else { throw APIError(status: 0, code: "BAD_URL", message: "Bad request URL.") }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = endpoint.method
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType = endpoint.contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        request.httpBody = endpoint.body
        return request
    }

    private func check(_ data: Data, _ response: URLResponse, usingSavedKey: Bool) throws -> Data {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let error = API.error(status: status, body: data)
            if error.isUnauthorized, usingSavedKey { Connection.shared.didLoseAuthorization() }
            throw error
        }
        return data
    }

    /// The answer's body. `server`/`key` override the saved connection (used to check a key before keeping it).
    @discardableResult
    func data(_ endpoint: API.Endpoint, server: URL? = nil, key: String? = nil, timeout: TimeInterval = 30) async throws -> Data {
        let usingSavedKey = key == nil
        guard let target = server ?? Connection.shared.credentials?.server,
              let token = key ?? Connection.shared.credentials?.key
        else { throw APIError.notConnected }
        let request = try makeRequest(endpoint, server: target, key: token, timeout: timeout)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.offline(error.localizedDescription)
        }
        return try check(data, response, usingSavedKey: usingSavedKey)
    }

    func call<T: Decodable>(_ endpoint: API.Endpoint, as type: T.Type, server: URL? = nil, key: String? = nil,
                            timeout: TimeInterval = 30) async throws -> T {
        let body = try await data(endpoint, server: server, key: key, timeout: timeout)
        return try API.decode(T.self, from: body)
    }

    /// Sends a file from disk as the request body.
    func upload(_ endpoint: API.Endpoint, fileURL: URL, timeout: TimeInterval = 180) async throws -> Data {
        guard let credentials = Connection.shared.credentials else { throw APIError.notConnected }
        let request = try makeRequest(endpoint, server: credentials.server, key: credentials.key, timeout: timeout)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.upload(for: request, fromFile: fileURL)
        } catch {
            throw APIError.offline(error.localizedDescription)
        }
        return try check(data, response, usingSavedKey: true)
    }
}

// MARK: What the screens use

extension APIClient {
    func pulse(day: LocalDay) async throws -> Pulse {
        try await call(API.pulse(day: day), as: Pulse.self)
    }

    func weeklySync(day: LocalDay) async throws -> WeeklyRetro {
        try await call(API.week(day: day), as: WeeklyRetro.self)
    }

    func startWeek(day: LocalDay, templateId: String? = nil) async throws {
        try await data(API.startWeek(day: day, templateId: templateId))
    }

    func addSyncItem(weeklySyncId: String, trackingItemId: String) async throws {
        try await data(API.addSyncItem(weeklySyncId: weeklySyncId, trackingItemId: trackingItemId))
    }

    func removeSyncItem(_ id: String) async throws {
        try await data(API.removeSyncItem(id))
    }

    func reorderSyncItems(weeklySyncId: String, orderedIds: [String]) async throws {
        try await data(API.reorderSyncItems(weeklySyncId: weeklySyncId, ids: orderedIds))
    }

    func setSyncItemText(_ id: String, text: String) async throws {
        try await data(API.setSyncItemText(id, text: text))
    }

    @discardableResult
    func uploadAttachment(itemId: String, fileName: String, fileType: String, contentType: String, fileURL: URL) async throws -> SyncAttachment {
        let body = try await upload(API.uploadAttachment(syncItemId: itemId, fileName: fileName, fileType: fileType,
                                                         contentType: contentType), fileURL: fileURL)
        return try API.decode(SyncAttachment.self, from: body)
    }

    func deleteAttachment(_ id: String) async throws {
        try await data(API.deleteAttachment(id))
    }

    /// An attachment's bytes.
    func attachmentData(_ id: String) async throws -> Data {
        try await data(API.attachment(id), timeout: 90)
    }

    func trackingItems() async throws -> [TrackingItem] {
        try await call(API.trackingItems(), as: [TrackingItem].self)
    }

    @discardableResult
    func createTrackingItem(title: String, description: String?, goalId: String?) async throws -> TrackingItem {
        try await call(API.createTrackingItem(title: title, description: description, goalId: goalId), as: TrackingItem.self)
    }

    func updateTrackingItem(id: String, title: String, description: String?, goalId: String?) async throws {
        try await data(API.updateTrackingItem(id, title: title, description: description, goalId: goalId))
    }

    func deleteTrackingItem(_ id: String) async throws {
        try await data(API.deleteTrackingItem(id))
    }

    @discardableResult
    func setOverlay(_ trackingItemId: String, overlay: Overlay?) async throws -> TrackingItem {
        if let overlay {
            return try await call(API.setOverlay(trackingItemId, overlay: overlay), as: TrackingItem.self)
        }
        return try await call(API.clearOverlay(trackingItemId), as: TrackingItem.self)
    }

    func latestPicture(_ trackingItemId: String, excluding syncItemId: String?) async throws -> LatestPicture? {
        try await call(API.latestPicture(trackingItemId, excluding: syncItemId), as: LatestPicture?.self)
    }

    func syncTemplates() async throws -> [SyncTemplate] {
        try await call(API.templates(), as: [SyncTemplate].self)
    }

    func createDefaultTemplate(name: String) async throws -> SyncTemplate {
        try await call(API.createTemplate(name: name, isDefault: true), as: SyncTemplate.self)
    }

    func setTemplateItems(templateId: String, trackingItemIds: [String]) async throws {
        try await data(API.setTemplateItems(templateId, trackingItemIds: trackingItemIds))
    }

    func goals() async throws -> [GoalSummary] {
        try await call(API.goals(), as: [GoalSummary].self)
    }
}
