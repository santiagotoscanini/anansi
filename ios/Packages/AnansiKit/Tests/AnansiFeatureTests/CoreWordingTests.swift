import Foundation
@testable import AnansiFeature
import Testing

struct CoreWordingTests {
    @Test func greetsByHour() {
        #expect(Wording.greeting(hour: 3) == "Up late")
        #expect(Wording.greeting(hour: 9) == "Good morning")
        #expect(Wording.greeting(hour: 12) == "Good afternoon")
        #expect(Wording.greeting(hour: 21) == "Good evening")
    }

    @Test func saysHowFarAway() {
        #expect(Wording.relativeDays(-2) == "2d overdue")
        #expect(Wording.relativeDays(0) == "today")
        #expect(Wording.relativeDays(1) == "tomorrow")
        #expect(Wording.relativeDays(12) == "in 12 days")
    }

    @Test func namesWeeks() {
        let monday = LocalDay(year: 2026, month: 11, day: 2)
        #expect(Wording.weekOf(monday, currentYear: 2026) == "Week of Nov 2")
        #expect(Wording.weekOf(monday, currentYear: 2027) == "Week of Nov 2, 2026")
        #expect(Wording.weekRange(monday) == "Nov 2 – 8")
        #expect(Wording.weekRange(LocalDay(year: 2026, month: 10, day: 26)) == "Oct 26 – Nov 1")
        #expect(Wording.weekDistance(from: LocalDay(year: 2026, month: 11, day: 4), to: monday) == "This week")
        #expect(Wording.weekDistance(from: monday, to: monday.adding(weeks: -1)) == "Last week")
        #expect(Wording.weekDistance(from: monday, to: monday.adding(weeks: -3)) == "3 weeks ago")
    }

    @Test func attentionReasons() {
        #expect(Wording.attention(AttentionReason(kind: "due-soon", daysOverdue: nil, daysUntil: 0, decideBy: nil)) == "Decision due today")
        #expect(Wording.attention(AttentionReason(kind: "due-soon", daysOverdue: nil, daysUntil: 5, decideBy: nil)) == "Decision due in 5d")
        #expect(Wording.attention(AttentionReason(kind: "inbox", daysOverdue: nil, daysUntil: nil, decideBy: nil)) == "In your inbox to process")
    }

    @Test func progressAndSizes() {
        #expect(Wording.filled(3, of: 5) == "3 of 5 filled")
        #expect(Wording.percent(1, of: 3) == 33)
        #expect(Wording.percent(0, of: 0) == 0)
        #expect(Wording.fileSize(1_234_567) == "1.2 MB")
        #expect(Wording.fileSize(340_000) == "340 KB")
    }

    @Test func fitsPicturesUnderTheLongSide() {
        let landscape = ImageSizing.fit(width: 4032, height: 3024)
        #expect(landscape.width == 2048 && landscape.height == 1536)
        let portrait = ImageSizing.fit(width: 3024, height: 4032)
        #expect(portrait.width == 1536 && portrait.height == 2048)
        let small = ImageSizing.fit(width: 800, height: 600)
        #expect(small.width == 800 && small.height == 600)
    }

    @Test func namesPictures() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "UTC"))
        let date = Date(timeIntervalSince1970: 1_793_620_805) // 2026-11-02 12:00:05 UTC
        #expect(ImageSizing.fileName(for: date, calendar: calendar) == "IMG_20261102_120005.jpg")
        #expect(ImageSizing.fileName(for: date, calendar: calendar, index: 1) == "IMG_20261102_120005_2.jpg")
    }
}
