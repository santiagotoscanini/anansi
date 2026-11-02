import Foundation
@testable import AnansiFeature
import Testing

struct CoreMCPTests {
    @Test func buildsAToolCall() throws {
        let body = try MCP.toolCallBody(id: 7, tool: "set_sync_item_text",
                                        arguments: ["weeklySyncItemId": "si_1", "textContent": "Slept well"])
        let json = String(decoding: body, as: UTF8.self)
        #expect(json == #"{"id":7,"jsonrpc":"2.0","method":"tools/call","params":{"arguments":{"textContent":"Slept well","weeklySyncItemId":"si_1"},"name":"set_sync_item_text"}}"#)
    }

    @Test func encodesNestedArguments() throws {
        let ordering: [JSONValue] = [["id": "a", "orderIdx": 0], ["id": "b", "orderIdx": 1]]
        let body = try MCP.toolCallBody(id: 1, tool: "reorder_sync_items",
                                        arguments: ["weeklySyncId": "ws", "ordering": .array(ordering), "goalId": .null, "isDefault": true])
        let json = String(decoding: body, as: UTF8.self)
        #expect(json.contains(#""ordering":[{"id":"a","orderIdx":0},{"id":"b","orderIdx":1}]"#))
        #expect(json.contains(#""goalId":null"#))
        #expect(json.contains(#""isDefault":true"#))
    }

    @Test func readsASuccessfulResult() throws {
        let body = Data(#"{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"id\":\"u1\",\"name\":\"Santi\",\"email\":\"s@x\"}"}]}}"#.utf8)
        let result = try MCP.parse(status: 200, body: body).get()
        let me = try MCP.decode(Me.self, from: result)
        #expect(me == Me(id: "u1", name: "Santi", email: "s@x"))
    }

    @Test func readsAToolError() {
        let body = Data(#"{"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[{"type":"text","text":"That record doesn't exist (or doesn't belong to you)."}],"_meta":{"trpc_code":"NOT_FOUND"}}}"#.utf8)
        let error = MCP.parse(status: 200, body: body)
        #expect(error == .failure(.tool("That record doesn't exist (or doesn't belong to you).", code: "NOT_FOUND")))
        if case .failure(let failure) = error { #expect(!failure.isRetryable) }
    }

    @Test func classifiesFailures() {
        #expect(MCP.parse(status: 401, body: Data()) == .failure(.unauthorized))
        #expect(MCP.parse(status: 429, body: Data()) == .failure(.rateLimited))
        #expect(MCP.parse(status: 502, body: Data("<html>".utf8)) == .failure(.http(502)))
        let unauthorizedRPC = Data(#"{"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized — connect via OAuth"},"id":null}"#.utf8)
        #expect(MCP.parse(status: 200, body: unauthorizedRPC) == .failure(.unauthorized))
        #expect(MCPError.offline("x").isRetryable)
        #expect(MCPError.tool("busy", code: "INTERNAL_SERVER_ERROR").isRetryable)
        #expect(!MCPError.tool("Invalid input", code: nil).isRetryable)
        #expect(!MCPError.tool("bad", code: "BAD_REQUEST").isRetryable)
    }

    @Test func readsAnEventStreamBody() throws {
        let sse = Data("event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"{}\"}]}}\n\n".utf8)
        let result = try MCP.parse(status: 200, body: sse).get()
        #expect(result.text == "{}")
    }

    @Test func readsAnImageBlock() throws {
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        let body = Data(#"{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"image","data":"\#(png.base64EncodedString())","mimeType":"image/png"},{"type":"text","text":"a.png"}]}}"#.utf8)
        let result = try MCP.parse(status: 200, body: body).get()
        #expect(result.image?.data == png)
        #expect(result.image?.mimeType == "image/png")
    }
}
