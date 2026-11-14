import Foundation

// One tracking item over time: `GET /api/v1/tracking-items/{id}/history` and the rules of the Over time screen.
// What a frame is, where a week sits on the timeline, which weeks are missing. The web has the same rules in
// anansi/src/lib/over-time.ts; keep the two in step.

/// The item and every week that recorded something for it (notes or files), oldest first.
nonisolated struct ItemHistory: Codable, Hashable, Sendable {
    var item: HistoryItem
    var weeks: [HistoryWeek]
}

nonisolated struct HistoryItem: Codable, Hashable, Sendable {
    var id: String
    var title: String
    var description: String?
    var goalId: String?
    /// True when the item was archived or deleted from the library; its weeks are still here.
    var archived: Bool?
}

nonisolated struct HistoryWeek: Codable, Hashable, Sendable, Identifiable {
    var syncItemId: String
    /// The week's Monday, `YYYY-MM-DD`.
    var week: String
    var textContent: String?
    var attachments: [SyncAttachment]

    var id: String { syncItemId }
    var day: LocalDay? { LocalDay(string: week) }
    var images: [SyncAttachment] { attachments.filter(\.isImage) }
}

/// One picture of the item, in the order it is played.
nonisolated struct HistoryFrame: Hashable, Sendable, Identifiable {
    var attachment: SyncAttachment
    var week: LocalDay
    /// That week's notes, shown under the picture.
    var note: String?
    /// 1-based place among the week's pictures, and how many it has.
    var shot: Int
    var shots: Int

    var id: String { attachment.id }
}

/// A row of the "all weeks" sheet: a week that recorded something, or a run of weeks that did not.
nonisolated enum HistorySheetEntry: Hashable, Sendable, Identifiable {
    case week(HistoryWeek)
    case gap(from: LocalDay, weeks: Int)

    var id: String {
        switch self {
        case .week(let week): week.syncItemId
        case .gap(let from, _): "gap-\(from.string)"
        }
    }
}

nonisolated struct HistorySheetMonth: Hashable, Sendable, Identifiable {
    var year: Int
    var month: Int
    var entries: [HistorySheetEntry]

    var id: String { String(format: "%04d-%02d", year, month) }
}

nonisolated enum History {
    /// Every picture, oldest week first, a week's pictures in the order they were added. A week whose day
    /// cannot be read is left out.
    static func frames(_ weeks: [HistoryWeek]) -> [HistoryFrame] {
        weeks.flatMap { week -> [HistoryFrame] in
            guard let day = week.day else { return [] }
            let images = week.images
            return images.enumerated().map { index, image in
                HistoryFrame(attachment: image, week: day, note: week.textContent, shot: index + 1, shots: images.count)
            }
        }
    }

    /// Whole weeks from one Monday to another (negative when `to` is earlier).
    static func weeksBetween(_ from: LocalDay, _ to: LocalDay) -> Int {
        Int((Double(from.days(until: to)) / 7).rounded())
    }

    /// Where a day sits between the first and the last, 0 to 1. One week alone sits in the middle.
    static func position(of day: LocalDay, first: LocalDay, last: LocalDay) -> Double {
        let span = first.days(until: last)
        guard span > 0 else { return 0.5 }
        return min(1, max(0, Double(first.days(until: day)) / Double(span)))
    }

    /// Each frame's place on the timeline. Pictures of one week share a place.
    static func positions(_ frames: [HistoryFrame]) -> [Double] {
        guard let first = frames.first?.week, let last = frames.last?.week else { return [] }
        return frames.map { position(of: $0.week, first: first, last: last) }
    }

    /// The frame closest to a point on the timeline (0 to 1). Of equals, the earlier.
    static func nearest(_ positions: [Double], to point: Double) -> Int {
        var best = 0
        var distance = Double.infinity
        for (index, position) in positions.enumerated() {
            let d = abs(position - point)
            if d < distance {
                best = index
                distance = d
            }
        }
        return best
    }

    /// The weeks as a sheet: grouped by the month of their Monday, with the weeks that recorded nothing in
    /// between folded into one gap each. A gap sits in the month of its first missing week.
    static func sheet(_ weeks: [HistoryWeek]) -> [HistorySheetMonth] {
        var months: [HistorySheetMonth] = []
        func add(_ entry: HistorySheetEntry, on day: LocalDay) {
            if let last = months.indices.last, months[last].year == day.year, months[last].month == day.month {
                months[last].entries.append(entry)
            } else {
                months.append(HistorySheetMonth(year: day.year, month: day.month, entries: [entry]))
            }
        }
        var previous: LocalDay?
        for week in weeks {
            guard let day = week.day else { continue }
            if let previous {
                let missing = weeksBetween(previous, day) - 1
                if missing > 0 {
                    let from = previous.adding(weeks: 1)
                    add(.gap(from: from, weeks: missing), on: from)
                }
            }
            add(.week(week), on: day)
            previous = day
        }
        return months
    }
}
