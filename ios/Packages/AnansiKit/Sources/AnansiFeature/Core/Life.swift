import Foundation

// The Life tab: a life as a grid of weeks, and the chapters on it. The contract of `/api/v1/life`, and the rules
// the grid follows, the same as the web's `src/lib/life.ts` (with the same test cases): one row per year of age
// starting at the birthday; row `r` holds the weeks whose Sunday is on or after the Sunday of the week of the r-th
// birthday and before that of the next (52 cells, now and then 53). A chapter's null start is the birth, a null
// end the end of the expected life. The shortest chapter on a week gives it its colour.

// MARK: Contract

/// What one week recorded (`weeks` in `GET /api/v1/life`, keyed by its Sunday).
nonisolated struct LifeWeekRecord: Codable, Hashable, Sendable {
    var sync: Int
    var journal: Int
    var pictures: Int

    var amount: Int { sync + journal }
}

nonisolated struct LifeChapter: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var emoji: String?
    var color: String
    var notes: String?
    /// `YYYY-MM-DD`, or nil for "since birth".
    var startDay: String?
    /// `YYYY-MM-DD`, or nil for "until the end".
    var endDay: String?
    var goalIds: [String]

    init(id: String, title: String, emoji: String? = nil, color: String, notes: String? = nil, startDay: String? = nil,
         endDay: String? = nil, goalIds: [String] = []) {
        self.id = id
        self.title = title
        self.emoji = emoji
        self.color = color
        self.notes = notes
        self.startDay = startDay
        self.endDay = endDay
        self.goalIds = goalIds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)
        color = try container.decode(String.self, forKey: .color)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        startDay = try container.decodeIfPresent(String.self, forKey: .startDay)
        endDay = try container.decodeIfPresent(String.self, forKey: .endDay)
        goalIds = try container.decodeIfPresent([String].self, forKey: .goalIds) ?? []
    }

    var start: LocalDay? { startDay.flatMap { LocalDay(string: String($0.prefix(10))) } }
    var end: LocalDay? { endDay.flatMap { LocalDay(string: String($0.prefix(10))) } }
}

nonisolated struct LifeViewDef: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var emoji: String?
    var chapterIds: [String]
}

/// `GET /api/v1/life`.
nonisolated struct LifeData: Codable, Hashable, Sendable {
    var birthDate: String?
    var lifeExpectancyYears: Int
    var chapters: [LifeChapter]
    var views: [LifeViewDef]
    var weeks: [String: LifeWeekRecord]

    init(birthDate: String?, lifeExpectancyYears: Int = 80, chapters: [LifeChapter] = [], views: [LifeViewDef] = [],
         weeks: [String: LifeWeekRecord] = [:]) {
        self.birthDate = birthDate
        self.lifeExpectancyYears = lifeExpectancyYears
        self.chapters = chapters
        self.views = views
        self.weeks = weeks
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        birthDate = try container.decodeIfPresent(String.self, forKey: .birthDate)
        lifeExpectancyYears = try container.decodeIfPresent(Int.self, forKey: .lifeExpectancyYears) ?? 80
        chapters = try container.decodeIfPresent([LifeChapter].self, forKey: .chapters) ?? []
        views = try container.decodeIfPresent([LifeViewDef].self, forKey: .views) ?? []
        weeks = try container.decodeIfPresent([String: LifeWeekRecord].self, forKey: .weeks) ?? [:]
    }

    var birth: LocalDay? { birthDate.flatMap { LocalDay(string: String($0.prefix(10))) } }

    func record(_ sunday: LocalDay) -> LifeWeekRecord? { weeks[sunday.string] }
}

/// `GET /api/v1/life/weeks/{day}`: one week of a life.
nonisolated struct LifeWeek: Codable, Hashable, Sendable {
    nonisolated struct Day: Codable, Hashable, Sendable, Identifiable {
        var day: String
        var highlights: [String]
        var content: String
        var pictures: Int

        var id: String { day }
        var localDay: LocalDay? { LocalDay(string: String(day.prefix(10))) }
    }

    nonisolated struct SyncNote: Codable, Hashable, Sendable {
        var title: String
        var text: String?
        var pictures: Int
    }

    nonisolated struct Sync: Codable, Hashable, Sendable {
        var id: String
        var items: [SyncNote]
    }

    nonisolated struct Picture: Codable, Hashable, Sendable, Identifiable {
        var id: String
        var fileName: String

        /// As an attachment, so the phone's picture cache reads it from `/api/v1/attachments/{id}`.
        var attachment: SyncAttachment {
            SyncAttachment(id: id, fileName: fileName, fileType: "image", url: nil, sizeBytes: nil, createdAt: nil)
        }
    }

    var sunday: String
    var saturday: String
    var chapters: [LifeChapter]
    var journal: [Day]
    var sync: Sync?
    var pictures: [Picture]
}

// MARK: Rules

nonisolated struct LifeRow: Hashable, Sendable {
    var age: Int
    var birthday: LocalDay
    /// The Sundays of the row's weeks, in order.
    var weeks: [LocalDay]
}

nonisolated enum LifeRules {
    static let colors = ["#c2673f", "#6f8f4e", "#56689e", "#d29a3a", "#9c5a7c", "#3f8a86",
                         "#b5483a", "#7c6aa8", "#8a7a52", "#4a7fb0", "#c07a8e", "#5e6b5a"]

    /// The same day `n` years later; 29 February becomes 28 February in a common year.
    static func addYears(_ day: LocalDay, _ n: Int) -> LocalDay {
        let year = day.year + n
        return LocalDay(year: year, month: day.month, day: min(day.day, LocalDay.daysIn(month: day.month, year: year)))
    }

    /// Age in whole years on a day.
    static func age(birth: LocalDay, on day: LocalDay) -> Int {
        var age = day.year - birth.year
        if addYears(birth, age) > day { age -= 1 }
        return age
    }

    /// The last day of the expected life: the day before the birthday it ends on.
    static func lastDay(birth: LocalDay, years: Int) -> LocalDay { addYears(birth, years).adding(days: -1) }

    static func rows(birth: LocalDay, years: Int) -> [LifeRow] {
        (0..<max(0, years)).map { age in
            let birthday = addYears(birth, age)
            let to = addYears(birth, age + 1).weekStart
            var weeks: [LocalDay] = []
            var s = birthday.weekStart
            while s < to {
                weeks.append(s)
                s = s.adding(weeks: 1)
            }
            return LifeRow(age: age, birthday: birthday, weeks: weeks)
        }
    }

    /// A chapter's real first and last day, with the open ends filled in.
    static func range(_ chapter: LifeChapter, birth: LocalDay, years: Int) -> ClosedRange<LocalDay>? {
        let start = chapter.start ?? birth
        let end = chapter.end ?? lastDay(birth: birth, years: years)
        return start <= end ? start...end : nil
    }

    /// How many weeks a range touches.
    static func weekCount(_ range: ClosedRange<LocalDay>) -> Int {
        range.lowerBound.weekStart.days(until: range.upperBound.weekStart) / 7 + 1
    }

    enum Tense: String, Sendable { case past, now, future }

    static func tense(_ range: ClosedRange<LocalDay>, today: LocalDay) -> Tense {
        if range.upperBound < today { return .past }
        if range.lowerBound > today { return .future }
        return .now
    }

    /// For every week some chapter touches, its chapters, most specific first: the shortest wins the colour, ties
    /// go to the one that started later.
    static func weekChapters(_ chapters: [LifeChapter], birth: LocalDay, years: Int) -> [LocalDay: [String]] {
        let ranged = chapters.compactMap { chapter -> (id: String, range: ClosedRange<LocalDay>, weeks: Int)? in
            guard let range = range(chapter, birth: birth, years: years) else { return nil }
            return (chapter.id, range, weekCount(range))
        }
        .sorted { a, b in a.weeks != b.weeks ? a.weeks < b.weeks : a.range.lowerBound > b.range.lowerBound }
        var map: [LocalDay: [String]] = [:]
        for chapter in ranged {
            var s = chapter.range.lowerBound.weekStart
            while s <= chapter.range.upperBound {
                map[s, default: []].append(chapter.id)
                s = s.adding(weeks: 1)
            }
        }
        return map
    }

    /// Whole years and leftover months a range spans.
    static func length(_ range: ClosedRange<LocalDay>) -> (years: Int, months: Int) {
        let end = range.upperBound.adding(days: 1)
        var months = (end.year - range.lowerBound.year) * 12 + (end.month - range.lowerBound.month)
        if end.day < range.lowerBound.day { months -= 1 }
        months = max(0, months)
        return (months / 12, months % 12)
    }

    /// "6 years", "4 months": the longest unit that fits.
    static func lengthText(_ range: ClosedRange<LocalDay>) -> String {
        let (years, months) = length(range)
        if years > 0 { return years == 1 ? "1 year" : "\(years) years" }
        let m = max(1, months)
        return m == 1 ? "1 month" : "\(m) months"
    }

    /// The first colour no chapter uses yet, else the next in turn.
    static func nextColor(used: [String]) -> String {
        let taken = Set(used.map { $0.lowercased() })
        return colors.first { !taken.contains($0) } ?? colors[used.count % colors.count]
    }

    /// `#rrggbb` as three 0…1 components, or nil.
    static func rgb(_ hex: String) -> (red: Double, green: Double, blue: Double)? {
        var text = hex.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        return (Double((value >> 16) & 0xFF) / 255, Double((value >> 8) & 0xFF) / 255, Double(value & 0xFF) / 255)
    }

    /// "2005 → 2011", "Birth → Aug 2027", "Sep 2027 → the end".
    static func spanText(_ chapter: LifeChapter, locale: Locale = .current) -> String {
        func month(_ day: LocalDay) -> String {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
            let date = day.date(in: calendar)
            var style = Date.FormatStyle(date: .omitted, time: .omitted).month(.abbreviated).year()
            style.timeZone = calendar.timeZone
            return date.formatted(style.locale(locale))
        }
        let from: String
        if let start = chapter.start {
            from = start.month == 1 && start.day == 1 ? String(start.year) : month(start)
        } else {
            from = "Birth"
        }
        let to: String
        if let end = chapter.end {
            to = end.month == 12 && end.day == 31 ? String(end.year) : month(end)
        } else {
            to = "the end"
        }
        return "\(from) → \(to)"
    }
}
