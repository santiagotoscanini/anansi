import Foundation
@testable import AnansiFeature
import Testing

struct CoreLocalDayTests {
    @Test func parsesAndFormats() {
        #expect(LocalDay(string: "2026-11-02") == LocalDay(year: 2026, month: 11, day: 2))
        #expect(LocalDay(year: 2026, month: 3, day: 7).string == "2026-03-07")
        #expect(LocalDay(string: "2026-02-30") == nil)
        #expect(LocalDay(string: "2026-13-01") == nil)
        #expect(LocalDay(string: "26-11-02") == nil)
        #expect(LocalDay(string: "2024-02-29") != nil)
        #expect(LocalDay(string: "2025-02-29") == nil)
    }

    @Test func weekStartsOnSunday() throws {
        let sunday = try #require(LocalDay(string: "2026-11-22"))
        #expect(sunday.isoWeekday == 7)
        #expect(sunday.weekStart == sunday)
        #expect(LocalDay(string: "2026-11-23")?.weekStart == sunday) // Monday walks back one day
        #expect(LocalDay(string: "2026-11-28")?.weekStart == sunday) // Saturday closes the week
        #expect(LocalDay(string: "2026-11-21")?.weekStart == LocalDay(string: "2026-11-15"))
        #expect(LocalDay(string: "2026-11-19")?.weekStart != sunday) // a Thursday and the Sunday after are two weeks
        #expect(sunday.weekEnd == LocalDay(string: "2026-11-28"))
    }

    @Test func movesAcrossMonthsAndYears() {
        let day = LocalDay(year: 2026, month: 12, day: 29)
        #expect(day.adding(days: 5) == LocalDay(year: 2027, month: 1, day: 3))
        #expect(day.adding(weeks: -1) == LocalDay(year: 2026, month: 12, day: 22))
        #expect(LocalDay(year: 2026, month: 3, day: 1).adding(days: -1) == LocalDay(year: 2026, month: 2, day: 28))
        #expect(day.days(until: LocalDay(year: 2027, month: 1, day: 5)) == 7)
    }

    @Test func todayFollowsTheCalendarsZone() throws {
        // 2026-11-02T02:00Z is still Sunday Nov 1 in Montevideo (UTC-3): the server must hear Sunday's week.
        let instant = try #require(ISODate.parse("2026-11-02T02:00:00.000Z"))
        var montevideo = Calendar(identifier: .gregorian)
        montevideo.timeZone = try #require(TimeZone(identifier: "America/Montevideo"))
        let local = LocalDay(date: instant, calendar: montevideo)
        #expect(local == LocalDay(year: 2026, month: 11, day: 1))
        #expect(local.weekStart == LocalDay(year: 2026, month: 10, day: 26))
    }

    @Test func orders() {
        #expect(LocalDay(year: 2026, month: 1, day: 31) < LocalDay(year: 2026, month: 2, day: 1))
        #expect(LocalDay(year: 2025, month: 12, day: 31) < LocalDay(year: 2026, month: 1, day: 1))
    }
}
