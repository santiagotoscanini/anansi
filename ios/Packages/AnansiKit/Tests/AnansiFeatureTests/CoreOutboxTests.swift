import Foundation
@testable import AnansiFeature
import Testing

struct CoreOutboxTests {
    let t0 = Date(timeIntervalSince1970: 1_000_000)

    func text(_ item: String, _ value: String) -> OutboxOp {
        OutboxOp(itemId: item, itemTitle: "Item \(item)", kind: .setText(value), queuedAt: t0)
    }

    func upload(_ item: String, _ file: String) -> OutboxOp {
        OutboxOp(itemId: item, itemTitle: "Item \(item)",
                 kind: .upload(localFile: file, fileName: "IMG.jpg", fileType: "image", byteCount: 10), queuedAt: t0)
    }

    @Test func newTextReplacesUnsentTextForTheSameItem() {
        var outbox = SyncOutbox()
        outbox.enqueue(text("a", "one"))
        outbox.enqueue(text("b", "other"))
        outbox.enqueue(text("a", "two"))
        #expect(outbox.pending.count == 2)
        #expect(outbox.pendingText(for: "a") == "two")
        #expect(outbox.pending.last?.itemId == "a")
    }

    @Test func textOnTheWireIsNeverMergedInto() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(text("a", "one"))
        let first = try #require(outbox.next(now: t0))
        outbox.begin(first)
        outbox.enqueue(text("a", "two"))
        #expect(outbox.pending.count == 2)
        #expect(outbox.next(now: t0) == nil) // one at a time
        outbox.didSucceed(first.id)
        #expect(outbox.next(now: t0)?.kind == .setText("two"))
    }

    @Test func uploadsAreNeverCoalesced() {
        var outbox = SyncOutbox()
        outbox.enqueue(upload("a", "1.jpg"))
        outbox.enqueue(upload("a", "2.jpg"))
        outbox.enqueue(text("a", "hi"))
        #expect(outbox.uploadCount == 2)
        #expect(outbox.pendingUploads(for: "a").map(\.localFile) == ["1.jpg", "2.jpg"])
        #expect(outbox.referencedFiles == ["1.jpg", "2.jpg"])
    }

    @Test func retryableFailuresBackOff() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(upload("a", "1.jpg"))
        let op = try #require(outbox.next(now: t0))
        outbox.begin(op)
        outbox.didFailRetryably(op.id, message: "offline", now: t0)
        #expect(outbox.lastError == "offline")
        #expect(outbox.next(now: t0.addingTimeInterval(1)) == nil)
        #expect(outbox.next(now: t0.addingTimeInterval(2))?.id == op.id)
        outbox.begin(op)
        outbox.didFailRetryably(op.id, message: "offline", now: t0)
        #expect(outbox.next(now: t0.addingTimeInterval(3)) == nil)
        #expect(outbox.next(now: t0.addingTimeInterval(4))?.id == op.id)
        #expect(SyncOutbox.backoff(attempts: 30) == 300)
    }

    @Test func somethingNewCutsTheBackoffShort() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(text("a", "one"))
        let op = try #require(outbox.next(now: t0))
        outbox.begin(op)
        outbox.didFailRetryably(op.id, message: "offline", now: t0)
        outbox.enqueue(text("b", "x"))
        #expect(outbox.next(now: t0)?.id == op.id)
    }

    @Test func permanentFailuresMoveAsideAndCanComeBack() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(upload("gone", "1.jpg"))
        outbox.enqueue(text("b", "x"))
        let op = try #require(outbox.next(now: t0))
        outbox.begin(op)
        outbox.didFailPermanently(op.id, message: "That record doesn't exist")
        #expect(outbox.failed.map(\.id) == [op.id])
        #expect(outbox.next(now: t0)?.itemId == "b")
        #expect(outbox.referencedFiles == ["1.jpg"]) // kept until dismissed
        outbox.retry(op.id)
        #expect(outbox.failed.isEmpty)
        #expect(outbox.pending.last?.id == op.id)
        outbox.didFailPermanently(op.id, message: "again")
        outbox.dismiss(op.id)
        #expect(outbox.referencedFiles.isEmpty)
    }

    @Test func overlaysPendingTextAndUploads() {
        var outbox = SyncOutbox()
        let item = SyncItem(id: "a", trackingItemId: "t", title: "Sleep", description: nil, orderIdx: 0,
                            textContent: nil, attachments: [], goalId: nil, goalTitle: nil, createdAt: nil)
        #expect(!outbox.isFilled(item))
        outbox.enqueue(upload("a", "1.jpg"))
        #expect(outbox.isFilled(item))
        outbox.enqueue(text("a", "  "))
        #expect(outbox.overlay(item).textContent == "  ")
    }

    @Test func survivesARestart() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(text("a", "one"))
        let op = try #require(outbox.next(now: t0))
        outbox.begin(op)
        let data = try JSONEncoder().encode(outbox)
        var restored = try JSONDecoder().decode(SyncOutbox.self, from: data)
        #expect(restored.next(now: t0) == nil)
        restored.recoverAfterLaunch()
        #expect(restored.next(now: t0)?.id == op.id)
    }
}
