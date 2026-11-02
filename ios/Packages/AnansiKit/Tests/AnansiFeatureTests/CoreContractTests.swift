import Foundation
@testable import AnansiFeature
import Testing

/// Payloads shaped like anansi's `get_pulse` / `get_weekly_sync` / `list_sync_templates` answers
/// (src/server/services/pulse.ts, weekly-sync.ts, sync-templates.ts), extra fields included.
struct CoreContractTests {
    static let item = #"{"id":"si1","trackingItemId":"ti1","title":"Sleep","description":null,"orderIdx":1,"textContent":"7h most nights","attachments":[{"id":"at1","fileName":"IMG_1.jpg","fileType":"image","url":"/api/files/f1","sizeBytes":120000,"createdAt":"2026-11-02T10:00:00.000Z"}],"goalId":"g1","createdAt":"2026-11-02T09:00:00.000Z"}"#

    @Test func decodesPulse() throws {
        let json = #"""
        {"day":"2026-11-02","weekStartsOn":"2026-11-02",
         "sync":{"id":"ws1","filled":1,"total":2,"progress":50,"items":[\#(Self.item.replacingOccurrences(of: "\"goalId\":\"g1\"", with: "\"goalId\":\"g1\",\"goalTitle\":\"Health\"")),
           {"id":"si2","trackingItemId":"ti2","title":"Journaling","description":"Daily","orderIdx":0,"textContent":null,"attachments":[],"goalId":null,"createdAt":"2026-11-02T09:00:00.000Z","goalTitle":null}]},
         "upcoming":[{"kind":"date","id":"date:d1","date":"2026-11-10T00:00:00.000Z","daysUntil":8,"person":"Mom","label":"Birthday","turning":60},
                     {"kind":"bid","id":"bid:b1","date":"2026-11-03T15:00:00.000Z","daysUntil":1,"person":"Ana","personEmoji":null,"content":"Call her"}],
         "horizons":{"month":[{"id":"t1","title":"Book flights","goalId":"g2","goalTitle":"Travel","scheduledAt":"2026-11-20T00:00:00.000Z"}],"quarter":[],"year":[]},
         "attention":[{"personId":"p1","name":"Leo","category":"exploring","reason":{"kind":"overdue","daysOverdue":3,"decideBy":"2026-10-30T00:00:00.000Z"}}]}
        """#
        let pulse = try JSONDecoder().decode(Pulse.self, from: Data(json.utf8))
        #expect(pulse.sync?.items.count == 2)
        #expect(pulse.sync?.items.first?.goalTitle == "Health")
        #expect(pulse.sync?.items.first?.isFilled == true)
        #expect(pulse.sync?.items.last?.isFilled == false)
        #expect(pulse.upcoming.first?.isDate == true)
        #expect(pulse.upcoming.first?.turning == 60)
        #expect(pulse.upcoming.last?.content == "Call her")
        #expect(pulse.horizons.month.first?.goalEmoji == nil)
        #expect(Wording.attention(pulse.attention[0].reason) == "Decision overdue · 3d")
    }

    @Test func decodesANotStartedWeek() throws {
        let json = #"{"weeklySync":null,"allTrackingItems":[{"id":"ti1","title":"Sleep","description":null,"goalId":null,"goalTitle":null}],"goals":[],"unscopedItems":[]}"#
        let retro = try JSONDecoder().decode(WeeklyRetro.self, from: Data(json.utf8))
        #expect(retro.weeklySync == nil)
        #expect(retro.addable.map(\.id) == ["ti1"])
    }

    @Test func ordersAWeekAcrossGoals() throws {
        let json = #"""
        {"weeklySync":{"id":"ws1","userId":"u","weekDate":"2026-11-02T03:00:00.000Z","templateId":null,"createdAt":"x","updatedAt":"x"},
         "allTrackingItems":[{"id":"ti1","title":"Sleep","description":null,"goalId":"g1","goalTitle":"Health"},
                             {"id":"ti2","title":"Journaling","description":null,"goalId":null,"goalTitle":null},
                             {"id":"ti3","title":"Run","description":null,"goalId":"g1","goalTitle":"Health"}],
         "goals":[{"id":"g1","title":"Health","description":null,"importance":"High","items":[\#(Self.item)]}],
         "unscopedItems":[{"id":"si2","trackingItemId":"ti2","title":"Journaling","description":null,"orderIdx":0,"textContent":null,"attachments":[],"goalId":null,"createdAt":"2026-11-02T09:00:00.000Z"}]}
        """#
        let retro = try JSONDecoder().decode(WeeklyRetro.self, from: Data(json.utf8))
        #expect(retro.orderedItems.map(\.id) == ["si2", "si1"])
        #expect(retro.orderedItems.last?.goalTitle == "Health")
        #expect(retro.goals.first?.importance == "High")
        #expect(retro.addable.map(\.id) == ["ti3"])
    }

    @Test func decodesTemplatesWithAndWithoutItems() throws {
        let list = #"[{"id":"tp1","userId":"u","name":"Default","isDefault":true,"items":[{"id":"x2","templateId":"tp1","trackingItemId":"ti2","orderIdx":1},{"id":"x1","templateId":"tp1","trackingItemId":"ti1","orderIdx":0}]}]"#
        let templates = try JSONDecoder().decode([SyncTemplate].self, from: Data(list.utf8))
        #expect(templates.first?.orderedTrackingItemIds == ["ti1", "ti2"])
        let created = #"{"id":"tp2","userId":"u","name":"Default","isDefault":true,"createdAt":"x"}"#
        let template = try JSONDecoder().decode(SyncTemplate.self, from: Data(created.utf8))
        #expect(template.items.isEmpty)
        #expect(template.isDefault)
    }

    @Test func parsesServerDates() {
        #expect(ISODate.parse("2026-11-02T12:00:00.000Z") == Date(timeIntervalSince1970: 1_793_620_800))
        #expect(ISODate.parse("2026-11-02T12:00:00Z") == Date(timeIntervalSince1970: 1_793_620_800))
        #expect(ISODate.parse("nope") == nil)
    }
}
