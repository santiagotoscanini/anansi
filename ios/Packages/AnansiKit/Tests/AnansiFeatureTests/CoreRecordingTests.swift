import Foundation
@testable import AnansiFeature
import Testing

struct CoreRecordingTests {
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aRecordingStopsAfterThirtyMinutes() {
        #expect(RecordingRules.endsBy(startedAt: t0) == t0.addingTimeInterval(1800))
        #expect(RecordingRules.remaining(startedAt: t0, now: t0.addingTimeInterval(600)) == 1200)
        #expect(RecordingRules.remaining(startedAt: t0, now: t0.addingTimeInterval(4000)) == 0)
    }

    @Test func aDoublePressRecordsNothing() {
        #expect(RecordingRules.durationMs(seconds: 0.2) == nil)
        #expect(RecordingRules.durationMs(seconds: 0.3) == nil)
        #expect(RecordingRules.durationMs(seconds: 1.2345) == 1235)
    }

    @Test func theQueueKeepsOneEntryPerCapture() {
        var queue = TranscriptionQueue()
        queue.add(captureItemId: "capture:a", file: "a.m4a", at: t0)
        queue.add(captureItemId: "capture:b", file: "b.m4a", at: t0)
        queue.add(captureItemId: "capture:a", file: "a2.m4a", at: t0)
        #expect(queue.items.map(\.captureItemId) == ["capture:b", "capture:a"])
        #expect(queue.files == ["a2.m4a", "b.m4a"])
        queue.finished("capture:b")
        #expect(queue.next?.captureItemId == "capture:a")
        queue.finished("capture:a")
        #expect(queue.isEmpty)
    }

    @Test func aFailingFileGoesToTheBackThenIsDropped() {
        var queue = TranscriptionQueue()
        queue.add(captureItemId: "capture:a", file: "a.m4a", at: t0)
        queue.add(captureItemId: "capture:b", file: "b.m4a", at: t0)
        #expect(queue.failed("capture:a") == false)
        #expect(queue.next?.captureItemId == "capture:b")
        #expect(queue.failed("capture:a") == false)
        #expect(queue.failed("capture:a") == true)
        #expect(queue.items.map(\.captureItemId) == ["capture:b"])
        #expect(queue.failed("capture:missing") == false)
    }

    @Test func theQueueSurvivesARelaunch() throws {
        var queue = TranscriptionQueue()
        queue.add(captureItemId: "capture:a", file: "a.m4a", at: t0)
        _ = queue.failed("capture:a")
        let decoded = try JSONDecoder().decode(TranscriptionQueue.self, from: JSONEncoder().encode(queue))
        #expect(decoded == queue)
        #expect(decoded.next?.attempts == 1)
    }
}
