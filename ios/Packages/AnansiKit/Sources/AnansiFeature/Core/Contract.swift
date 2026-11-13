import Foundation

// The shapes Anansi's /api/v1 answers with, as far as the phone reads them. Unknown keys are ignored, so the server
// can grow fields freely; a field the phone needs and the server drops shows up as a decoding error with its name.
// Timestamps stay strings (ISO 8601 from JSON.stringify) and are parsed where they are shown: see `ISODate`.

// MARK: Weekly sync

/// A file on a sync item. `url` is `/api/files/{id}`, which needs a browser session: the phone reads the bytes
/// from `/api/v1/attachments/{id}` instead.
nonisolated struct SyncAttachment: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var fileName: String
    var fileType: String
    var url: String?
    var sizeBytes: Int?
    var createdAt: String?

    var isImage: Bool { fileType == "image" }
}

/// One tracking item on one week, with its notes and files. `id` is the sync item id (what notes and files are
/// written against); `trackingItemId` is the library entry it came from.
nonisolated struct SyncItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var trackingItemId: String
    var title: String
    var description: String?
    var orderIdx: Int
    /// The notes, as stored: a mention is the token `@[Name](person:<id>)`, see `MentionText`.
    var textContent: String?
    var attachments: [SyncAttachment]
    var goalId: String?
    /// Present on Pulse's flat list; the grouped sync names the goal on the group instead.
    var goalTitle: String?
    var createdAt: String?

    /// Answered once it has words or a file (the same rule as Pulse's `isFilled`).
    var isFilled: Bool {
        !(textContent ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }
}

/// The `weekly_sync` row.
nonisolated struct WeeklySyncRow: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var weekDate: String
    var templateId: String?
}

/// A library entry as the retro offers it for "add to this week".
nonisolated struct LibraryEntry: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var goalId: String?
    var goalTitle: String?
}

nonisolated struct SyncGoalGroup: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    /// "Low", "Medium" or "High", from the goal's connection weights.
    var importance: String?
    var items: [SyncItem]
}

/// `GET /api/v1/weeks/{day}`: one week, grouped by goal.
nonisolated struct WeeklyRetro: Codable, Hashable, Sendable {
    var weeklySync: WeeklySyncRow?
    var allTrackingItems: [LibraryEntry]
    var goals: [SyncGoalGroup]
    var unscopedItems: [SyncItem]

    /// Every item in the week's order, whatever goal it sits under (Pulse's `syncItemsOf`).
    var orderedItems: [SyncItem] {
        let flat = goals.flatMap { group in group.items.map { item in
            var item = item
            item.goalTitle = item.goalTitle ?? group.title
            return item
        } } + unscopedItems
        return flat.enumerated().sorted { a, b in
            a.element.orderIdx != b.element.orderIdx ? a.element.orderIdx < b.element.orderIdx : a.offset < b.offset
        }.map(\.element)
    }

    /// Library entries not on this week yet.
    var addable: [LibraryEntry] {
        let on = Set(orderedItems.map(\.trackingItemId))
        return allTrackingItems.filter { !on.contains($0.id) }
    }
}

// MARK: Pulse

nonisolated struct PulseSync: Codable, Hashable, Sendable {
    var id: String
    var filled: Int
    var total: Int
    var progress: Int
    var items: [SyncItem]
}

/// A row of the Upcoming feed: an important date (`kind: "date"`) or a next bid (`kind: "bid"`).
nonisolated struct UpcomingRow: Codable, Hashable, Sendable, Identifiable {
    var kind: String
    var id: String
    var date: String
    var daysUntil: Int
    var person: String
    var label: String?
    var turning: Int?
    var personEmoji: String?
    var content: String?

    var isDate: Bool { kind == "date" }
}

/// A task on a horizon list. `title` is stored text and may name people with tokens, see `MentionText`.
nonisolated struct HorizonTask: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var goalId: String
    var goalTitle: String
    var goalEmoji: String?
    var scheduledAt: String
}

nonisolated struct Horizons: Codable, Hashable, Sendable {
    var month: [HorizonTask]
    var quarter: [HorizonTask]
    var year: [HorizonTask]

    var isEmpty: Bool { month.isEmpty && quarter.isEmpty && year.isEmpty }
}

nonisolated struct AttentionReason: Codable, Hashable, Sendable {
    /// `overdue`, `due-soon`, `exploring-no-date` or `inbox`.
    var kind: String
    var daysOverdue: Int?
    var daysUntil: Int?
    var decideBy: String?
}

nonisolated struct AttentionRow: Codable, Hashable, Sendable, Identifiable {
    var personId: String
    var name: String
    var category: String?
    var reason: AttentionReason

    var id: String { personId }
}

/// `GET /api/v1/pulse`: the daily landing page in one call.
nonisolated struct Pulse: Codable, Hashable, Sendable {
    var day: String
    var weekStartsOn: String
    var sync: PulseSync?
    var upcoming: [UpcomingRow]
    var horizons: Horizons
    var attention: [AttentionRow]
}

// MARK: Library and the default items

/// `GET /api/v1/tracking-items`: a library entry with its place and state.
nonisolated struct TrackingItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String?
    var goalId: String?
    var order: Int?
    var status: String?
    /// The camera outline drawn for this item, if any.
    var overlay: Overlay?
}

/// The newest picture of a tracking item from any week: the camera's "last time" ghost.
nonisolated struct LatestPicture: Codable, Hashable, Sendable {
    var id: String
    var fileName: String
    var weeklySyncItemId: String?
    var weekDate: String?
}

nonisolated struct SyncTemplateItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var trackingItemId: String
    var orderIdx: Int
}

/// `GET /api/v1/templates`. At most one is the default, and the default is what a new week starts with.
nonisolated struct SyncTemplate: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var isDefault: Bool
    var items: [SyncTemplateItem]

    init(id: String, name: String, isDefault: Bool, items: [SyncTemplateItem]) {
        self.id = id
        self.name = name
        self.isDefault = isDefault
        self.items = items
    }

    /// Creating one answers with the bare row, no `items`.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        isDefault = try container.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
        items = try container.decodeIfPresent([SyncTemplateItem].self, forKey: .items) ?? []
    }

    /// Its tracking item ids in order.
    var orderedTrackingItemIds: [String] {
        items.sorted { $0.orderIdx < $1.orderIdx }.map(\.trackingItemId)
    }
}

/// The goal fields the phone shows (a tracking item can point at a goal).
nonisolated struct GoalSummary: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var emoji: String?
}

/// `GET /api/v1/me`.
nonisolated struct Me: Codable, Hashable, Sendable {
    var id: String
    var name: String?
    var email: String?
}

/// `{ success: true }` answers.
nonisolated struct Success: Codable, Hashable, Sendable {
    var success: Bool?
}

// MARK: Journal

/// A person the phone can mention (`GET /api/v1/people`).
nonisolated struct PersonRef: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var emoji: String?

    /// The emoji when it is a glyph the phone can draw.
    var glyph: String? { Self.glyph(emoji) }

    /// A person's emoji can also be an uploaded photo, `/api/files/…`, which needs a browser session: that is no
    /// glyph.
    static func glyph(_ emoji: String?) -> String? {
        guard let trimmed = emoji?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty,
              !trimmed.hasPrefix("/")
        else { return nil }
        return trimmed
    }
}

/// A person one day's entry mentions, with their name as it is now.
nonisolated struct JournalMention: Codable, Hashable, Sendable, Identifiable {
    var personId: String
    var name: String
    var emoji: String?

    var id: String { personId }
    var glyph: String? { PersonRef.glyph(emoji) }
}

/// One day of the journal (`GET /api/v1/journal/{day}`, which answers `null` for a day with nothing written).
/// `content` and `highlights` are stored text: a mention is the token `@[Name](person:<id>)`, see `MentionText`.
nonisolated struct JournalEntry: Codable, Hashable, Sendable, Identifiable {
    var id: String
    /// The user's calendar day, `YYYY-MM-DD`.
    var day: String
    var content: String
    var highlights: [String]
    var mentions: [JournalMention]
    var attachments: [SyncAttachment]
    var createdAt: String?
    var updatedAt: String?

    init(id: String, day: String, content: String = "", highlights: [String] = [], mentions: [JournalMention] = [],
         attachments: [SyncAttachment] = [], createdAt: String? = nil, updatedAt: String? = nil) {
        self.id = id
        self.day = day
        self.content = content
        self.highlights = highlights
        self.mentions = mentions
        self.attachments = attachments
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        day = try container.decode(String.self, forKey: .day)
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        highlights = try container.decodeIfPresent([String].self, forKey: .highlights) ?? []
        mentions = try container.decodeIfPresent([JournalMention].self, forKey: .mentions) ?? []
        attachments = try container.decodeIfPresent([SyncAttachment].self, forKey: .attachments) ?? []
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    var localDay: LocalDay? { LocalDay(string: String(day.prefix(10))) }

    var hasText: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !highlights.isEmpty
    }

    /// Nothing written and nothing attached: the server keeps no such entry.
    var isBlank: Bool { !hasText && attachments.isEmpty }

    var pictureCount: Int { attachments.filter(\.isImage).count }
}

nonisolated extension JournalEntry {
    /// Person id to current name, for the people this entry mentions.
    var names: [String: String] {
        Dictionary(mentions.map { ($0.personId, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    /// One line that stands for the day in a list: its first highlight, else the first line of the prose, with
    /// mentions as plain names. Empty when the day only has pictures.
    var excerpt: String {
        let names = self.names
        if let first = highlights.first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return MentionText.plain(first, names: names).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let prose = MentionText.plain(content, names: names)
        let line = prose.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first(where: { !$0.isEmpty })
        return line ?? ""
    }
}

// MARK: Dates

nonisolated enum ISODate {
    /// Parses `2026-11-02T12:00:00.000Z` (with or without fractional seconds) or a bare `2026-11-02`.
    static func parse(_ string: String) -> Date? {
        if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(string) { return date }
        if let date = try? Date.ISO8601FormatStyle().parse(string) { return date }
        if let day = LocalDay(string: String(string.prefix(10))) {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
            return day.date(in: calendar)
        }
        return nil
    }
}
