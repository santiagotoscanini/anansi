import Foundation

// Anansi's phone contract IS its MCP server: `POST /api/mcp`, JSON-RPC 2.0, one `tools/call` per request,
// `Authorization: Bearer mcp_at_…`. The server is stateless (a fresh transport per request, no session id), so
// there is no `initialize` handshake to keep. A tool answers with one text block holding JSON, or `isError: true`
// and a sentence. This file builds the body and reads the answer; it never touches the network.

nonisolated enum MCP {
    /// The Streamable HTTP transport refuses a POST whose Accept doesn't name both.
    static let accept = "application/json, text/event-stream"

    struct ToolCall: Encodable {
        struct Params: Encodable {
            var name: String
            var arguments: [String: JSONValue]
        }

        var jsonrpc = "2.0"
        var id: Int
        var method = "tools/call"
        var params: Params
    }

    /// The JSON-RPC body for one tool call.
    static func toolCallBody(id: Int, tool: String, arguments: [String: JSONValue]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(ToolCall(id: id, params: .init(name: tool, arguments: arguments)))
    }

    struct Content: Decodable, Sendable, Hashable {
        var type: String
        var text: String?
        /// Base64, for `type: "image"`.
        var data: String?
        var mimeType: String?
    }

    struct Meta: Decodable, Sendable, Hashable {
        /// The service error code (`NOT_FOUND`, `BAD_REQUEST`, …). The name is historical; see anansi's errors.ts.
        var trpcCode: String?

        enum CodingKeys: String, CodingKey { case trpcCode = "trpc_code" }
    }

    struct ToolResult: Decodable, Sendable, Hashable {
        var content: [Content]
        var isError: Bool?
        var meta: Meta?

        enum CodingKeys: String, CodingKey {
            case content, isError
            case meta = "_meta"
        }

        /// The first text block: the JSON payload of a successful call, or the sentence of a failed one.
        var text: String? { content.first(where: { $0.type == "text" })?.text }

        /// The first image block, decoded.
        var image: (data: Data, mimeType: String)? {
            guard let block = content.first(where: { $0.type == "image" }),
                  let base64 = block.data, let data = Data(base64Encoded: base64)
            else { return nil }
            return (data, block.mimeType ?? "image/jpeg")
        }
    }

    private struct RPCError: Decodable {
        var code: Int
        var message: String
    }

    private struct Envelope: Decodable {
        var result: ToolResult?
        var error: RPCError?
    }

    /// Reads one HTTP answer. JSON is what the server sends; an SSE body (`data: {…}` lines) is read too, in case
    /// a future server streams.
    static func parse(status: Int, body: Data) -> Result<ToolResult, MCPError> {
        if status == 401 { return .failure(.unauthorized) }
        if status == 429 { return .failure(.rateLimited) }
        guard let json = jsonPayload(of: body) else {
            return .failure(status >= 400 ? .http(status) : .decoding("The server's answer was not JSON."))
        }
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: json) else {
            return .failure(status >= 400 ? .http(status) : .decoding("The server's answer was not a JSON-RPC response."))
        }
        if let error = envelope.error {
            return .failure(error.code == -32001 ? .unauthorized : .rpc(error.message))
        }
        guard let result = envelope.result else {
            return .failure(status >= 400 ? .http(status) : .decoding("The answer had no result."))
        }
        if result.isError == true {
            return .failure(.tool(result.text ?? "The tool failed.", code: result.meta?.trpcCode))
        }
        return .success(result)
    }

    /// The JSON inside a body: the body itself, or the last `data:` line of an event stream.
    static func jsonPayload(of body: Data) -> Data? {
        guard let first = body.first(where: { !($0 == 0x20 || $0 == 0x0A || $0 == 0x0D || $0 == 0x09) }) else { return nil }
        if first == UInt8(ascii: "{") || first == UInt8(ascii: "[") { return body }
        guard let text = String(data: body, encoding: .utf8) else { return nil }
        let lines = text.split(whereSeparator: \.isNewline).filter { $0.hasPrefix("data:") }
        guard let last = lines.last else { return nil }
        return Data(last.dropFirst(5).trimmingCharacters(in: .whitespaces).utf8)
    }

    /// Decodes a successful call's JSON text into `T`.
    static func decode<T: Decodable>(_ type: T.Type, from result: ToolResult) throws(MCPError) -> T {
        guard let text = result.text else { throw .decoding("The answer had no text.") }
        do {
            return try JSONDecoder().decode(T.self, from: Data(text.utf8))
        } catch {
            throw .decoding("Unexpected answer shape for \(T.self): \(error)")
        }
    }
}

nonisolated enum MCPError: Error, Equatable, Sendable, LocalizedError {
    case notSignedIn
    case unauthorized
    case rateLimited
    case http(Int)
    case offline(String)
    case rpc(String)
    case tool(String, code: String?)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: "Not signed in to Anansi."
        case .unauthorized: "Anansi didn't accept the sign-in. Sign in again in Settings."
        case .rateLimited: "Anansi asked to slow down. Try again in a minute."
        case .http(let status): "Anansi answered HTTP \(status)."
        case .offline(let message): message
        case .rpc(let message): message
        case .tool(let message, _): message
        case .decoding(let message): message
        }
    }

    /// Whether trying the same thing later can work. A rejected input or a missing record won't; the network,
    /// an expired sign-in and the server having a bad moment can.
    var isRetryable: Bool {
        switch self {
        case .notSignedIn, .unauthorized, .rateLimited, .http, .offline: true
        case .rpc, .decoding: false
        case .tool(_, let code):
            // No code means the input failed validation before reaching a service: sending it again won't help.
            switch code {
            case "INTERNAL_SERVER_ERROR", "TOO_MANY_REQUESTS", "UNAUTHORIZED": true
            default: false
            }
        }
    }
}
