import Foundation
@testable import AnansiFeature
import Testing

struct CoreHealthTests {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires") ?? .gmt
        return c
    }

    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute)) ?? .distantPast
    }

    @Test func aNightBelongsToTheDayYouWokeUp() throws {
        let nights = HealthMath.nights(asleep: [.init(start: at(23, 23, 30), end: at(24, 7, 0))], calendar: calendar)
        let night = try #require(nights[LocalDay(year: 2026, month: 11, day: 24)])
        #expect(night.minutes == 450)
        #expect(night.bedtime == at(23, 23, 30))
        #expect(night.wake == at(24, 7, 0))
        #expect(nights[LocalDay(year: 2026, month: 11, day: 23)] == nil)
    }

    @Test func overlappingSourcesCountOnce() throws {
        // The watch and a sleep app both recorded the same night.
        let nights = HealthMath.nights(asleep: [
            .init(start: at(23, 23, 0), end: at(24, 3, 0)),
            .init(start: at(24, 1, 0), end: at(24, 6, 0)),
            .init(start: at(23, 23, 30), end: at(24, 5, 0)),
        ], calendar: calendar)
        #expect(try #require(nights[LocalDay(year: 2026, month: 11, day: 24)]).minutes == 7 * 60)
    }

    @Test func aShortWakeKeepsOneNightAndItsGapIsNotSleep() throws {
        let nights = HealthMath.nights(asleep: [
            .init(start: at(23, 23, 0), end: at(24, 3, 0)),
            .init(start: at(24, 3, 30), end: at(24, 7, 0)),
        ], calendar: calendar)
        let night = try #require(nights[LocalDay(year: 2026, month: 11, day: 24)])
        #expect(night.minutes == 4 * 60 + 210)
        #expect(night.bedtime == at(23, 23, 0))
        #expect(night.wake == at(24, 7, 0))
    }

    @Test func aNapAddsToTheDay() throws {
        let nights = HealthMath.nights(asleep: [
            .init(start: at(23, 23, 0), end: at(24, 7, 0)),
            .init(start: at(24, 15, 0), end: at(24, 15, 30)),
        ], calendar: calendar)
        let day = try #require(nights[LocalDay(year: 2026, month: 11, day: 24)])
        #expect(day.minutes == 8 * 60 + 30)
        #expect(day.wake == at(24, 15, 30))
    }

    @Test func recentDaysEndToday() {
        let today = LocalDay(year: 2026, month: 11, day: 2)
        let days = HealthMath.recentDays(count: 3, today: today)
        #expect(days == [LocalDay(year: 2026, month: 10, day: 31), LocalDay(year: 2026, month: 11, day: 1), today])
    }

    @Test func aDayWithNothingIsEmptyAndEncodesItsFieldsByName() throws {
        var day = HealthDay(day: LocalDay(year: 2026, month: 11, day: 24))
        #expect(day.isEmpty)
        day.steps = 8000
        day.workouts = [.init(type: "running", minutes: 30, energyKcal: 310)]
        #expect(!day.isEmpty)
        let json = try #require(String(data: API.json(day), encoding: .utf8))
        #expect(json.contains("\"day\":\"2026-11-24\""))
        #expect(json.contains("\"steps\":8000"))
        #expect(!json.contains("sleepMinutes"))
    }
}
