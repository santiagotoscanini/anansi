import Foundation

/// A calendar day in the user's own time zone, `YYYY-MM-DD`. Anansi names a week by a day the caller supplies
/// (its server runs on UTC, and Sunday night here is already its Monday), so every week the phone asks about is
/// named by one of these, never by an instant.
nonisolated struct LocalDay: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    var year: Int
    var month: Int
    var day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// Parses `YYYY-MM-DD` (a real calendar day only).
    init?(string: String) {
        let parts = string.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month), (1...Self.daysIn(month: month, year: year)).contains(day)
        else { return nil }
        self.init(year: year, month: month, day: day)
    }

    /// The day `date` falls on in `calendar`'s time zone.
    init(date: Date, calendar: Calendar) {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    /// Today where the phone is.
    static func today(now: Date = .now, calendar: Calendar = .current) -> LocalDay {
        LocalDay(date: now, calendar: calendar)
    }

    var string: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    var description: String { string }

    static func < (a: LocalDay, b: LocalDay) -> Bool {
        (a.year, a.month, a.day) < (b.year, b.month, b.day)
    }

    /// Noon of this day in `calendar`'s zone: safe from daylight-saving edges when adding days.
    func date(in calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) ?? .distantPast
    }

    func adding(days: Int) -> LocalDay {
        let calendar = Self.utc
        let moved = calendar.date(byAdding: .day, value: days, to: date(in: calendar)) ?? date(in: calendar)
        return LocalDay(date: moved, calendar: calendar)
    }

    func adding(weeks: Int) -> LocalDay { adding(days: weeks * 7) }

    /// ISO weekday, Monday = 1 … Sunday = 7.
    var isoWeekday: Int {
        let weekday = Self.utc.component(.weekday, from: date(in: Self.utc)) // 1 = Sunday
        return weekday == 1 ? 7 : weekday - 1
    }

    /// The Monday at or before this day: Anansi's week boundary (`weekStartOf`).
    var weekStart: LocalDay { adding(days: 1 - isoWeekday) }

    /// The Sunday that closes this day's week.
    var weekEnd: LocalDay { weekStart.adding(days: 6) }

    /// Whole days from `self` to `other` (positive when `other` is later).
    func days(until other: LocalDay) -> Int {
        let calendar = Self.utc
        return calendar.dateComponents([.day], from: date(in: calendar), to: other.date(in: calendar)).day ?? 0
    }

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }

    private static func daysIn(month: Int, year: Int) -> Int {
        switch month {
        case 2: (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }
}
