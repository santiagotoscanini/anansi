import Foundation

/// Calls Anansi's tools: `POST /api/mcp`, one `tools/call` per request, the bearer from `AuthStore`. A 401 gets
/// one forced refresh and one retry; anything else comes back as an `MCPError`.
final class MCPClient {
    static let shared = MCPClient()

    private let session: URLSession
    private var nextId = 1

    init(session: URLSession = .shared) {
        self.session = session
    }

    private var auth: AuthStore { AuthStore.shared }

    @discardableResult
    func call(_ tool: String, _ arguments: [String: JSONValue] = [:], timeout: TimeInterval = 30) async throws -> MCP.ToolResult {
        guard let server = AnansiSettings.server else { throw MCPError.notSignedIn }
        let body = try MCP.toolCallBody(id: nextId, tool: tool, arguments: arguments)
        nextId += 1

        for attempt in 0..<2 {
            let token = try await auth.validAccessToken(forceRefresh: attempt > 0)
            var request = URLRequest(url: OAuth.mcpURL(server: server), timeoutInterval: timeout)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(MCP.accept, forHTTPHeaderField: "Accept")
            request.httpBody = body

            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.data(for: request)
            } catch {
                throw MCPError.offline(error.localizedDescription)
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            switch MCP.parse(status: status, body: data) {
            case .success(let result):
                return result
            case .failure(.unauthorized) where attempt == 0:
                continue
            case .failure(.unauthorized):
                auth.didLoseAuthorization()
                throw MCPError.unauthorized
            case .failure(let error):
                throw error
            }
        }
        throw MCPError.unauthorized
    }

    func call<T: Decodable>(_ tool: String, _ arguments: [String: JSONValue] = [:], as type: T.Type,
                            timeout: TimeInterval = 30) async throws -> T {
        let result = try await call(tool, arguments, timeout: timeout)
        return try MCP.decode(T.self, from: result)
    }
}

// MARK: The tools the phone uses

extension MCPClient {
    func pulse(day: LocalDay) async throws -> Pulse {
        try await call("get_pulse", ["day": .string(day.string)], as: Pulse.self)
    }

    func weeklySync(day: LocalDay) async throws -> WeeklyRetro {
        try await call("get_weekly_sync", ["day": .string(day.string)], as: WeeklyRetro.self)
    }

    /// Starts the week containing `day` from the default template (or `templateId`). Idempotent.
    func startWeek(day: LocalDay, templateId: String? = nil) async throws {
        var arguments: [String: JSONValue] = ["day": .string(day.string)]
        if let templateId { arguments["templateId"] = .string(templateId) }
        try await call("create_weekly_sync", arguments)
    }

    func addSyncItem(weeklySyncId: String, trackingItemId: String) async throws {
        try await call("add_sync_item", ["weeklySyncId": .string(weeklySyncId), "trackingItemId": .string(trackingItemId)])
    }

    func removeSyncItem(_ weeklySyncItemId: String) async throws {
        try await call("remove_sync_item", ["weeklySyncItemId": .string(weeklySyncItemId)])
    }

    func reorderSyncItems(weeklySyncId: String, orderedIds: [String]) async throws {
        let ordering: [JSONValue] = orderedIds.enumerated().map { index, id in
            ["id": .string(id), "orderIdx": .int(index)]
        }
        try await call("reorder_sync_items", ["weeklySyncId": .string(weeklySyncId), "ordering": .array(ordering)])
    }

    func setSyncItemText(_ weeklySyncItemId: String, text: String) async throws {
        try await call("set_sync_item_text", ["weeklySyncItemId": .string(weeklySyncItemId), "textContent": .string(text)])
    }

    /// Uploads a file (base64 in the JSON body; Anansi takes 10 MB at most).
    @discardableResult
    func uploadAttachment(itemId: String, fileName: String, fileType: String, data: Data) async throws -> SyncAttachment {
        try await call("upload_sync_attachment", [
            "weeklySyncItemId": .string(itemId),
            "fileName": .string(fileName),
            "fileType": .string(fileType),
            "data": .string(data.base64EncodedString()),
        ], as: SyncAttachment.self, timeout: 180)
    }

    func deleteAttachment(_ id: String) async throws {
        try await call("delete_sync_attachment", ["id": .string(id)])
    }

    /// The bytes of an image attachment, or nil when the server sends a note instead (too large, not an image).
    func attachmentImage(_ id: String) async throws -> Data? {
        let result = try await call("get_sync_attachment", ["id": .string(id)], timeout: 90)
        return result.image?.data
    }

    // MARK: Library and default items

    func trackingItems() async throws -> [TrackingItem] {
        try await call("list_tracking_items", as: [TrackingItem].self)
    }

    @discardableResult
    func createTrackingItem(title: String, description: String?, goalId: String?) async throws -> TrackingItem {
        var arguments: [String: JSONValue] = ["title": .string(title)]
        if let description, !description.isEmpty { arguments["description"] = .string(description) }
        if let goalId { arguments["goalId"] = .string(goalId) }
        return try await call("create_tracking_item", arguments, as: TrackingItem.self)
    }

    func updateTrackingItem(id: String, title: String, description: String?, goalId: String?) async throws {
        let trimmed = description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        try await call("update_tracking_item", [
            "id": .string(id),
            "title": .string(title),
            "description": trimmed.isEmpty ? .null : .string(trimmed),
            "goalId": .orNull(goalId),
        ])
    }

    func deleteTrackingItem(_ id: String) async throws {
        try await call("delete_tracking_item", ["id": .string(id)])
    }

    func syncTemplates() async throws -> [SyncTemplate] {
        try await call("list_sync_templates", as: [SyncTemplate].self)
    }

    /// Creates the default template (new weeks start from it).
    func createDefaultTemplate(name: String) async throws -> SyncTemplate {
        try await call("create_sync_template", ["name": .string(name), "isDefault": true], as: SyncTemplate.self)
    }

    func setTemplateItems(templateId: String, trackingItemIds: [String]) async throws {
        let items: [JSONValue] = trackingItemIds.enumerated().map { index, id in
            ["trackingItemId": .string(id), "orderIdx": .int(index)]
        }
        try await call("set_sync_template_items", ["templateId": .string(templateId), "items": .array(items)])
    }

    func goals() async throws -> [GoalSummary] {
        try await call("list_goals", as: [GoalSummary].self)
    }
}
