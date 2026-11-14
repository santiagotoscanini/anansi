import Foundation

/// The app's sentences, in the web app's voice (anansi/src/i18n/locales/en.json, `pulse.*` and `weeklySync.*`).
nonisolated enum Wording {
    /// "Good morning", by the phone's hour, with the web's cut-offs.
    static func greeting(hour: Int) -> String {
        if hour < 5 { return "Up late" }
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    /// "today", "tomorrow", "in 3 days", "2d overdue".
    static func relativeDays(_ days: Int) -> String {
        switch days {
        case ..<0: "\(-days)d overdue"
        case 0: "today"
        case 1: "tomorrow"
        default: "in \(days) days"
        }
    }

    static func attention(_ reason: AttentionReason) -> String {
        switch reason.kind {
        case "overdue": "Decision overdue · \(reason.daysOverdue ?? 0)d"
        case "due-soon":
            switch reason.daysUntil ?? 0 {
            case 0: "Decision due today"
            case 1: "Decision due tomorrow"
            case let days: "Decision due in \(days)d"
            }
        case "exploring-no-date": "Exploring · no decide-by yet"
        case "inbox": "In your inbox to process"
        default: reason.kind
        }
    }

    /// "3 of 5 filled".
    static func filled(_ filled: Int, of total: Int) -> String {
        "\(filled) of \(total) filled"
    }

    /// Whole percent, 0 for an empty week.
    static func percent(_ filled: Int, of total: Int) -> Int {
        total == 0 ? 0 : Int((Double(filled) / Double(total) * 100).rounded())
    }

    static let monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                             "October", "November", "December"]

    static func shortMonth(_ month: Int) -> String {
        String(monthNames[max(0, min(11, month - 1))].prefix(3))
    }

    /// "Nov 2".
    static func shortDay(_ day: LocalDay) -> String {
        "\(shortMonth(day.month)) \(day.day)"
    }

    /// "Week of Nov 2", or with the year when it isn't `currentYear`.
    static func weekOf(_ weekStart: LocalDay, currentYear: Int) -> String {
        weekStart.year == currentYear ? "Week of \(shortDay(weekStart))" : "Week of \(shortDay(weekStart)), \(weekStart.year)"
    }

    /// "Nov 2 – 8" or "Oct 27 – Nov 2".
    static func weekRange(_ weekStart: LocalDay) -> String {
        let end = weekStart.adding(days: 6)
        return end.month == weekStart.month
            ? "\(shortDay(weekStart)) – \(end.day)"
            : "\(shortDay(weekStart)) – \(shortDay(end))"
    }

    /// "This week", "Last week", "Next week", "3 weeks ago", "In 2 weeks".
    static func weekDistance(from current: LocalDay, to other: LocalDay) -> String {
        let weeks = current.weekStart.days(until: other.weekStart) / 7
        switch weeks {
        case 0: return "This week"
        case -1: return "Last week"
        case 1: return "Next week"
        case ..<0: return "\(-weeks) weeks ago"
        default: return "In \(weeks) weeks"
        }
    }

    /// "1.2 MB", "340 KB".
    static func fileSize(_ bytes: Int) -> String {
        if bytes >= 1_000_000 { return String(format: "%.1f MB", Double(bytes) / 1_000_000) }
        if bytes >= 1000 { return "\(bytes / 1000) KB" }
        return "\(bytes) B"
    }

    /// "Uploading 2 pictures".
    static func uploading(_ count: Int) -> String {
        count == 1 ? "Uploading 1 picture" : "Uploading \(count) pictures"
    }

    // MARK: Journal

    static let weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    static func weekday(_ day: LocalDay) -> String {
        weekdayNames[max(0, min(6, day.isoWeekday - 1))]
    }

    /// "Thursday, Nov 12", or with the year when it isn't `currentYear`.
    static func journalDate(_ day: LocalDay, currentYear: Int) -> String {
        let date = "\(weekday(day)), \(shortDay(day))"
        return day.year == currentYear ? date : "\(date), \(day.year)"
    }

    /// "Today", "Yesterday", "3 days ago" (and "In 2 days" for a day still to come).
    static func journalDistance(from today: LocalDay, to day: LocalDay) -> String {
        let days = day.days(until: today)
        switch days {
        case 0: return "Today"
        case 1: return "Yesterday"
        case -1: return "Tomorrow"
        case ..<0: return "In \(-days) days"
        default: return "\(days) days ago"
        }
    }

    /// How a journal day is named where the outbox reports on it: "Journal, Nov 12".
    static func journalTitle(_ day: LocalDay) -> String {
        "Journal, \(shortDay(day))"
    }

    /// "1 picture", "3 pictures".
    static func pictures(_ count: Int) -> String {
        count == 1 ? "1 picture" : "\(count) pictures"
    }

    /// "1 person", "3 people".
    static func people(_ count: Int) -> String {
        count == 1 ? "1 person" : "\(count) people"
    }

    // MARK: Over time

    /// "Nov 9, 2026".
    static func fullDay(_ day: LocalDay) -> String {
        "\(shortDay(day)), \(day.year)"
    }

    /// "November 2026".
    static func monthYear(year: Int, month: Int) -> String {
        "\(monthNames[max(0, min(11, month - 1))]) \(year)"
    }

    /// "1 week", "3 weeks".
    static func weeks(_ count: Int) -> String {
        count == 1 ? "1 week" : "\(count) weeks"
    }

    /// Where a picture stands from the first one: "the first one", "3 weeks after the first".
    static func afterFirst(_ weeks: Int) -> String {
        weeks <= 0 ? "the first one" : "\(Wording.weeks(weeks)) after the first"
    }

    /// How far apart two pictures are: "the same week", "13 weeks apart".
    static func apart(_ weeks: Int) -> String {
        weeks == 0 ? "the same week" : "\(Wording.weeks(abs(weeks))) apart"
    }

    /// "3 weeks without an entry".
    static func gap(_ weeks: Int) -> String {
        "\(Wording.weeks(weeks)) without an entry"
    }

    /// The line under an item's title: "10 weeks · 11 pictures · since Aug 10, 2026".
    static func historySummary(weeks: Int, pictures: Int, first: LocalDay) -> String {
        var parts = [Wording.weeks(weeks)]
        if pictures > 0 { parts.append(Wording.pictures(pictures)) }
        parts.append("since \(fullDay(first))")
        return parts.joined(separator: " · ")
    }
}

/// The journal's limits (`src/server/services/journal.ts`).
nonisolated enum JournalLimits {
    static let contentCharacters = 50000
    static let highlightCharacters = 500
    static let highlights = 50
}

/// Picture sizing before upload: Anansi takes 10 MB at most and the screens never show more than a phone's width.
nonisolated enum ImageSizing {
    /// The long side pictures are scaled down to.
    static let maxLongSide = 2048
    /// Anansi's per-file limit (`MAX_UPLOAD_BYTES`).
    static let maxUploadBytes = 10 * 1024 * 1024

    /// `width × height` scaled so the long side is at most `maxLongSide`, aspect kept, never scaled up.
    static func fit(width: Int, height: Int, maxLongSide: Int = maxLongSide) -> (width: Int, height: Int) {
        let long = max(width, height)
        guard long > maxLongSide, width > 0, height > 0 else { return (width, height) }
        let scale = Double(maxLongSide) / Double(long)
        return (max(1, Int((Double(width) * scale).rounded())), max(1, Int((Double(height) * scale).rounded())))
    }

    /// A file name for a picture taken on `date`: `IMG_20261102_143005.jpg`.
    static func fileName(for date: Date, calendar: Calendar, index: Int = 0) -> String {
        let p = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let stamp = String(format: "%04d%02d%02d_%02d%02d%02d", p.year ?? 0, p.month ?? 0, p.day ?? 0,
                           p.hour ?? 0, p.minute ?? 0, p.second ?? 0)
        return index == 0 ? "IMG_\(stamp).jpg" : "IMG_\(stamp)_\(index + 1).jpg"
    }
}
