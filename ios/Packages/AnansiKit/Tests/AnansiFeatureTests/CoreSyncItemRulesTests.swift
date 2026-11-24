import Foundation
@testable import AnansiFeature
import Testing

struct CoreSyncItemRulesTests {
    @Test func aPictureFitsUntilTheWeekIsFull() {
        #expect(SyncItemRules.canAddPicture(limit: nil, pictures: 40))
        #expect(SyncItemRules.canAddPicture(limit: 1, pictures: 0))
        #expect(!SyncItemRules.canAddPicture(limit: 1, pictures: 1))
        #expect(SyncItemRules.canAddPicture(limit: 3, pictures: 2))
        #expect(!SyncItemRules.canAddPicture(limit: 3, pictures: 4))
    }

    @Test func remainingAndSingle() {
        #expect(SyncItemRules.remaining(limit: nil, pictures: 3) == nil)
        #expect(SyncItemRules.remaining(limit: 3, pictures: 1) == 2)
        #expect(SyncItemRules.remaining(limit: 2, pictures: 5) == 0)
        #expect(SyncItemRules.isSingle(limit: 1))
        #expect(!SyncItemRules.isSingle(limit: 2))
        #expect(!SyncItemRules.isSingle(limit: nil))
    }

    @Test func aSyncItemDecodesWithAndWithoutTheNewFields() throws {
        let old = #"{"id":"a","trackingItemId":"t","title":"T","orderIdx":0,"attachments":[]}"#
        let item = try JSONDecoder().decode(SyncItem.self, from: Data(old.utf8))
        #expect(item.blocks == nil && item.photosPerWeek == nil)
        #expect(!item.isFilled)
        let new = #"{"id":"a","trackingItemId":"t","title":"T","orderIdx":0,"attachments":[],"photosPerWeek":1,"healthMetric":"sleep","blocks":[{"id":"b","title":"Transcript","content":"Hi","orderIdx":0,"updatedAt":"2026-11-24T00:00:00Z"}]}"#
        let filled = try JSONDecoder().decode(SyncItem.self, from: Data(new.utf8))
        #expect(filled.photosPerWeek == 1)
        #expect(filled.blocks?.first?.title == "Transcript")
        #expect(filled.isFilled)
    }
}
