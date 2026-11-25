import CaptureCore
import Foundation
import Testing
@testable import AnansiFeature

/// The Apple Watch's notes on their way: what travels with a file, the acks, the lent key, the watch's own upload,
/// the watch's queue, and the phone's outbox holding a watch note under the watch's id.
struct CoreWatchLinkTests {
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    let id = UUID(uuidString: "5A2B7C1D-0000-4000-8000-000000000001")!
    let other = UUID(uuidString: "5A2B7C1D-0000-4000-8000-000000000002")!

    @Test func aNotesDetailsTravelWithItsFile() {
        let note = WatchLink.NoteInfo(id: id, capturedAt: t0, durationMs: 4200, log: "watch: start")
        #expect(WatchLink.note(fromMetadata: WatchLink.metadata(note)) == note)
        #expect(WatchLink.note(fromMetadata: nil) == nil)
        #expect(WatchLink.note(fromMetadata: ["something": "else"]) == nil)
    }

    @Test func acksSayWhatThePhoneHolds() {
        #expect(WatchLink.ack(fromUserInfo: WatchLink.userInfo(.received([id, other]))) == .received([id, other]))
        #expect(WatchLink.ack(fromUserInfo: WatchLink.userInfo(.landed([id]))) == .landed([id]))
        #expect(WatchLink.ack(fromUserInfo: [:]) == nil)
    }

    @Test func theKeyIsLentOrTakenBack() {
        let credentials = WatchLink.Credentials(server: "https://anansi.example", key: "ank_x")
        #expect(WatchLink.credentials(fromContext: WatchLink.context(credentials)) == .some(credentials))
        // Disconnected on the phone: the watch forgets the key.
        #expect(WatchLink.credentials(fromContext: WatchLink.context(nil)) == .some(nil))
        // A context about something else says nothing about the key.
        #expect(WatchLink.credentials(fromContext: ["other": 1]) == nil)
    }

    @Test func theWatchUploadsLikeThePhoneWithItsDevice() throws {
        let note = WatchLink.NoteInfo(id: id, capturedAt: t0, durationMs: 4200, log: "a+b")
        let url = try #require(WatchLink.uploadURL(server: URL(string: "https://anansi.example")!, note: note))
        #expect(url.path() == "/api/v1/captures/voice")
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        #expect(items.contains(URLQueryItem(name: "clientId", value: id.uuidString)))
        #expect(items.contains(URLQueryItem(name: "device", value: "watch")))
        #expect(items.contains(URLQueryItem(name: "durationMs", value: "4200")))
        #expect(items.contains(URLQueryItem(name: "capturedAt", value: API.instant(t0))))
        // A "+" reaches the server as itself, not a space.
        #expect(url.absoluteString.contains("clientLog=a%2Bb"))
    }

    @Test func thePhoneSaysWhichDeviceRecorded() {
        let mine = API.uploadVoiceCapture(questionId: nil, capturedAt: t0, durationMs: 1000, transcript: nil)
        #expect(mine.query.contains(URLQueryItem(name: "device", value: "iphone")))
        let watch = API.uploadVoiceCapture(questionId: nil, capturedAt: t0, durationMs: 1000, transcript: nil,
                                           device: .watch)
        #expect(watch.query.contains(URLQueryItem(name: "device", value: "watch")))
    }

    // MARK: The watch's queue

    func note(_ id: UUID, at offset: TimeInterval = 0) -> WatchQueue.Note {
        WatchQueue.Note(info: WatchLink.NoteInfo(id: id, capturedAt: t0.addingTimeInterval(offset), durationMs: 1000),
                        file: "\(id.uuidString).wav")
    }

    @Test func aNoteLeavesTheWatchOnlyWhenTheServerHasIt() {
        var queue = WatchQueue()
        queue.add(note(id))
        queue.add(note(id))
        #expect(queue.notes.count == 1)
        queue.received([id])
        #expect(queue.contains(id))
        #expect(queue.toHandOver(inTransfer: []).isEmpty)
        // The phone holding it is no reason not to upload it from the watch too.
        #expect(queue.toUpload(uploading: []).map(\.id) == [id])
        #expect(queue.landed([id]) == ["\(id.uuidString).wav"])
        #expect(queue.isEmpty)
    }

    @Test func aNoteIsHandedOverUntilThePhoneHasIt() {
        var queue = WatchQueue()
        queue.add(note(other, at: 10))
        queue.add(note(id))
        // Oldest first.
        #expect(queue.notes.map(\.id) == [id, other])
        #expect(queue.toHandOver(inTransfer: [id]).map(\.id) == [other])
        #expect(queue.toUpload(uploading: [other]).map(\.id) == [id])
        queue.failed(id, message: "The server answered 503.")
        #expect(queue.notes.first?.lastError == "The server answered 503.")
        #expect(queue.strays(among: ["\(id.uuidString).wav", "lost.wav", "notes.json"]) == ["lost.wav"])
    }

    @Test func theQueueSurvivesBeingSaved() throws {
        var queue = WatchQueue()
        queue.add(note(id))
        queue.received([id])
        let decoded = try JSONDecoder().decode(WatchQueue.self, from: JSONEncoder().encode(queue))
        #expect(decoded == queue)
    }

    // MARK: The phone's outbox

    @Test func thePhoneHoldsAWatchNoteUnderTheWatchsId() {
        var outbox = SyncOutbox()
        let op = OutboxOp(id: id, itemId: OutboxOp.captureItemId(id), itemTitle: "Voice note",
                          kind: .voiceCapture(localFile: "\(id.uuidString).wav", questionId: nil, capturedAt: t0,
                                              durationMs: 1000, byteCount: 10, transcript: nil),
                          queuedAt: t0, device: .watch, clientLog: "watch: start")
        outbox.enqueue(op)
        #expect(outbox.holdsCapture(id))
        #expect(!outbox.holdsCapture(other))
        #expect(outbox.pending.first?.madeOn == .watch)
        // The watch's own upload got there: the phone's copy goes unsent…
        #expect(outbox.dropDelivered(id))
        #expect(!outbox.holdsCapture(id))
        // …unless it is on the wire.
        outbox.enqueue(op)
        outbox.begin(op)
        #expect(!outbox.dropDelivered(id))
        outbox.didSucceed(id)
        outbox.recordCapture(itemId: OutboxOp.captureItemId(id), serverId: "c1")
        #expect(outbox.hasLanded(id))
        #expect(outbox.holdsCapture(id))
    }

    @Test func anOpFromBeforeTheWatchIsThisPhones() throws {
        let op = OutboxOp(itemId: "capture:x", itemTitle: "Voice note", kind: .captureTranscript("hi"), queuedAt: t0)
        var json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(op)) as? [String: Any])
        json.removeValue(forKey: "device")
        json.removeValue(forKey: "clientLog")
        let decoded = try JSONDecoder().decode(OutboxOp.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(decoded.device == nil)
        #expect(decoded.madeOn == .iphone)
    }
}
