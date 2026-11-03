import Foundation
@testable import AnansiFeature
import Testing

struct CoreAPITests {
    let server = URL(string: "https://anansi.example.com")!

    func url(_ endpoint: API.Endpoint) -> String { API.url(server: server, endpoint)?.absoluteString ?? "" }
    func body(_ endpoint: API.Endpoint) -> String { String(decoding: endpoint.body ?? Data(), as: UTF8.self) }

    @Test func keepsOnlyTheOrigin() {
        #expect(API.parseServer(" https://anansi.example.com/app/pulse ")?.absoluteString == "https://anansi.example.com")
        #expect(API.parseServer("http://localhost:5173")?.absoluteString == "http://localhost:5173")
        #expect(API.parseServer("anansi.example.com") == nil)
    }

    @Test func buildsReads() {
        let day = LocalDay(year: 2026, month: 11, day: 3)
        #expect(url(API.pulse(day: day)) == "https://anansi.example.com/api/v1/pulse?day=2026-11-03")
        #expect(url(API.week(day: day)) == "https://anansi.example.com/api/v1/weeks/2026-11-03")
        #expect(API.week(day: day).method == "GET")
        #expect(url(API.latestPicture("ti1", excluding: "si9")) == "https://anansi.example.com/api/v1/tracking-items/ti1/latest-picture?exclude=si9")
        #expect(url(API.latestPicture("ti1", excluding: nil)) == "https://anansi.example.com/api/v1/tracking-items/ti1/latest-picture")
    }

    @Test func buildsWrites() {
        let text = API.setSyncItemText("si1", text: "Slept 7h")
        #expect(text.method == "PATCH")
        #expect(url(text) == "https://anansi.example.com/api/v1/sync-items/si1")
        #expect(body(text) == #"{"textContent":"Slept 7h"}"#)
        #expect(text.contentType == "application/json")

        let order = API.reorderSyncItems(weeklySyncId: "ws1", ids: ["b", "a"])
        #expect(order.method == "PUT")
        #expect(body(order) == #"{"ids":["b","a"]}"#)

        #expect(body(API.startWeek(day: LocalDay(year: 2026, month: 11, day: 2))) == "{}")
        #expect(body(API.createTemplate(name: "Default", isDefault: true)) == #"{"isDefault":true,"name":"Default"}"#)
        #expect(body(API.setTemplateItems("tp", trackingItemIds: ["x"])) == #"{"trackingItemIds":["x"]}"#)
    }

    @Test func clearsDescriptionAndGoalWithNull() {
        let update = API.updateTrackingItem("ti1", title: "Face", description: "  ", goalId: nil)
        #expect(body(update) == #"{"description":null,"goalId":null,"title":"Face"}"#)
        let create = API.createTrackingItem(title: "Back", description: "Morning", goalId: "g1")
        #expect(body(create) == #"{"description":"Morning","goalId":"g1","title":"Back"}"#)
    }

    @Test func uploadsTheFileAsTheBody() {
        let upload = API.uploadAttachment(syncItemId: "si1", fileName: "IMG 1.jpg", fileType: "image", contentType: "image/jpeg")
        #expect(upload.method == "POST")
        #expect(upload.body == nil)
        #expect(upload.contentType == "image/jpeg")
        #expect(url(upload) == "https://anansi.example.com/api/v1/sync-items/si1/attachments?fileName=IMG%201.jpg&fileType=image")
    }

    @Test func readsErrors() {
        let body = Data(#"{"error":{"code":"NOT_FOUND","message":"Sync item not found or access denied"}}"#.utf8)
        let error = API.error(status: 404, body: body)
        #expect(error == APIError(status: 404, code: "NOT_FOUND", message: "Sync item not found or access denied"))
        #expect(!error.isRetryable)
        #expect(API.error(status: 502, body: Data("<html>".utf8)).isRetryable)
        #expect(API.error(status: 401, body: Data()).isUnauthorized)
        #expect(APIError.offline("The Internet connection appears to be offline.").isRetryable)
        #expect(!API.error(status: 400, body: Data()).isRetryable)
    }

    @Test func readsConnectLinks() throws {
        let link = try #require(ConnectLink(string: "anansi://connect?server=https%3A%2F%2Fanansi.example.com&key=ank_abcdefghijklmnopqrstuvwxyz0123456789"))
        #expect(link.server.absoluteString == "https://anansi.example.com")
        #expect(link.key == "ank_abcdefghijklmnopqrstuvwxyz0123456789")
        #expect(ConnectLink(string: "anansi://connect?server=https%3A%2F%2Fa.b&key=mcp_at_xyz0123456789012345") == nil)
        #expect(ConnectLink(string: "https://evil.example/connect?server=x&key=ank_abcdefghijklmnopqrstuvwxyz") == nil)
        #expect(ConnectLink(string: "anansi://connect?key=ank_abcdefghijklmnopqrstuvwxyz") == nil)
    }

    @Test func decodesTrackingItemsWithOverlays() throws {
        let json = #"[{"id":"ti1","userId":"u","goalId":null,"title":"Face","description":null,"order":0,"status":"active","deletedAt":null,"overlay":{"version":1,"aspect":0.75,"camera":"front","strokes":[{"points":[[0.5,0.1],[0.5,0.2]],"width":0.006}]},"createdAt":"x","updatedAt":"x"},{"id":"ti2","goalId":null,"title":"Sleep","description":null,"order":1,"status":"active","overlay":null}]"#
        let items = try JSONDecoder().decode([TrackingItem].self, from: Data(json.utf8))
        #expect(items[0].overlay?.camera == "front")
        #expect(items[0].overlay?.strokes.first?.overlayPoints == [OverlayPoint(x: 0.5, y: 0.1), OverlayPoint(x: 0.5, y: 0.2)])
        #expect(items[1].overlay == nil)
        let none = try JSONDecoder().decode(LatestPicture?.self, from: Data("null".utf8))
        #expect(none == nil)
    }
}
