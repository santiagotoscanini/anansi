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
}
