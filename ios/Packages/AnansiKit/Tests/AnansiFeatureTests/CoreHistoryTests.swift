import Foundation
@testable import AnansiFeature
import Testing

/// One item over time: the contract of `/api/v1/tracking-items/{id}/history` and the screen's rules, with the
/// cases of anansi/src/lib/over-time.test.ts.
struct CoreHistoryTests {
    static func image(_ id: String) -> SyncAttachment {
        SyncAttachment(id: id, fileName: "\(id).jpg", fileType: "image", url: "/api/files/\(id)", sizeBytes: nil, createdAt: nil)
    }

    static func week(_ day: String, _ attachments: [SyncAttachment], _ text: String? = nil) -> HistoryWeek {
        HistoryWeek(syncItemId: "si-\(day)", week: day, textContent: text, attachments: attachments)
    }

    static let document = SyncAttachment(id: "doc", fileName: "doc.pdf", fileType: "document", url: nil, sizeBytes: nil,
                                         createdAt: nil)

    static let weeks = [
        week("2026-03-02", [image("a")], "First one"),
        week("2026-03-09", [image("b"), document, image("c")]),
        week("2026-03-16", [], "Notes only"),
        week("2026-04-13", [image("d")]),
    ]

    static func day(_ string: String) -> LocalDay { LocalDay(string: string) ?? LocalDay(year: 1970, month: 1, day: 1) }

    @Test func buildsTheRead() {
        let server = URL(string: "https://anansi.example.com")!
        let endpoint = API.itemHistory("ti1")
        #expect(endpoint.method == "GET")
        #expect(API.url(server: server, endpoint)?.absoluteString == "https://anansi.example.com/api/v1/tracking-items/ti1/history")
    }

    @Test func decodesTheAnswer() throws {
        let body = Data("""
        {"item":{"id":"ti1","title":"Face","description":null,"goalId":null,"archived":false},
         "weeks":[{"syncItemId":"si1","week":"2026-11-09","textContent":"Best week so far.",
                   "attachments":[{"id":"at1","fileName":"face.jpg","fileType":"image","url":"/api/files/f1",
                                   "sizeBytes":120000,"createdAt":"2026-11-10T12:00:00.000Z"}]},
                  {"syncItemId":"si0","week":"2026-11-02","textContent":null,"attachments":[]}]}
        """.utf8)
        let history = try API.decode(ItemHistory.self, from: body)
        #expect(history.item.title == "Face")
        #expect(history.item.archived == false)
        #expect(history.weeks.count == 2)
        #expect(history.weeks[0].day == LocalDay(year: 2026, month: 11, day: 9))
        #expect(history.weeks[0].images.map(\.id) == ["at1"])
        #expect(history.weeks[1].textContent == nil)
    }

    @Test func framesAreThePicturesOldestFirstNumberedWithinTheirWeek() {
        let frames = History.frames(Self.weeks)
        #expect(frames.map(\.id) == ["a", "b", "c", "d"])
        #expect(frames.map(\.week.string) == ["2026-03-02", "2026-03-09", "2026-03-09", "2026-04-13"])
        #expect(frames.map(\.shot) == [1, 1, 2, 1])
        #expect(frames.map(\.shots) == [1, 2, 2, 1])
        #expect(frames.first?.note == "First one")
    }

    @Test func weeksAreCountedBetweenMondays() {
        #expect(History.weeksBetween(Self.day("2026-03-02"), Self.day("2026-04-13")) == 6)
        #expect(History.weeksBetween(Self.day("2026-04-13"), Self.day("2026-03-02")) == -6)
        #expect(History.weeksBetween(Self.day("2026-12-28"), Self.day("2027-01-04")) == 1)
    }

    @Test func aWeekSitsOnTheTimelineByItsDate() {
        let first = Self.day("2026-03-02")
        let last = Self.day("2026-04-13")
        #expect(History.position(of: first, first: first, last: last) == 0)
        #expect(History.position(of: last, first: first, last: last) == 1)
        #expect(History.position(of: Self.day("2026-03-23"), first: first, last: last) == 0.5)
        #expect(History.position(of: first, first: first, last: first) == 0.5)
        #expect(History.positions(History.frames(Self.weeks)) == [0, 1.0 / 6, 1.0 / 6, 1])
        #expect(History.positions([]).isEmpty)
    }

    @Test func aPointOnTheTimelinePicksTheClosestFrame() {
        let positions = History.positions(History.frames(Self.weeks))
        #expect(History.nearest(positions, to: 0.05) == 0)
        #expect(History.nearest(positions, to: 0.2) == 1)
        #expect(History.nearest(positions, to: 0.9) == 3)
        #expect(History.nearest(positions, to: 2) == 3)
    }

    @Test func theSheetGroupsWeeksByMonthAndFoldsTheMissingOnesIntoAGap() {
        let sheet = History.sheet(Self.weeks)
        #expect(sheet.map(\.id) == ["2026-03", "2026-04"])
        #expect(sheet[0].entries.map(\.id) == ["si-2026-03-02", "si-2026-03-09", "si-2026-03-16", "gap-2026-03-23"])
        #expect(sheet[0].entries.last == .gap(from: Self.day("2026-03-23"), weeks: 3))
        #expect(sheet[1].entries.map(\.id) == ["si-2026-04-13"])
        #expect(History.sheet([]).isEmpty)
    }

    @Test func saysHowFarApart() {
        #expect(Wording.afterFirst(0) == "the first one")
        #expect(Wording.afterFirst(1) == "1 week after the first")
        #expect(Wording.afterFirst(13) == "13 weeks after the first")
        #expect(Wording.apart(0) == "the same week")
        #expect(Wording.apart(-6) == "6 weeks apart")
        #expect(Wording.gap(3) == "3 weeks without an entry")
        #expect(Wording.fullDay(Self.day("2026-11-09")) == "Nov 9, 2026")
        #expect(Wording.monthYear(year: 2026, month: 3) == "March 2026")
        #expect(Wording.historySummary(weeks: 10, pictures: 11, first: Self.day("2026-08-10")) == "10 weeks · 11 pictures · since Aug 10, 2026")
        #expect(Wording.historySummary(weeks: 1, pictures: 0, first: Self.day("2026-08-10")) == "1 week · since Aug 10, 2026")
    }
}
