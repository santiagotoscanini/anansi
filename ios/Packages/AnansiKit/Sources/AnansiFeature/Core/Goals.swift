import Foundation

// The Goals screen: `GET /api/v1/goals/board`, every active goal with its tasks, its progress (computed on the
// server by the web's own engine, `src/lib/computation/goal-progress.ts`), importance, values and life chapters.
// The phone ticks tasks (`PATCH /api/v1/tasks/{id}`) and changes nothing else.

nonisolated struct GoalTask: Codable, Hashable, Sendable, Identifiable {
    var id: String
    /// As stored: may hold mention tokens, shown with `MentionText.plain`.
    var title: String
    var description: String?
    var emoji: String?
    var difficulty: Int
    var completed: Bool
    var scheduledAt: String?

    var scheduledDay: LocalDay? {
        guard let scheduledAt, let date = ISODate.parse(scheduledAt) else { return nil }
        return LocalDay(date: date, calendar: .current)
    }
}

nonisolated struct GoalValueTag: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var color: String
}

nonisolated struct GoalChapterTag: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var emoji: String?
    var color: String
    var startDay: String?
    var endDay: String?

    var chapter: LifeChapter {
        LifeChapter(id: id, title: title, emoji: emoji, color: color, startDay: startDay, endDay: endDay)
    }
}

nonisolated struct GoalCard: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var description: String
    var emoji: String?
    var parentId: String?
    /// `Low`, `Medium` or `High`.
    var importance: String
    /// 0…100, the goal's own tasks only.
    var ownProgress: Int
    /// 0…100, with what feeds into it.
    var progress: Int
    var values: [GoalValueTag]
    var chapters: [GoalChapterTag]
    var tasks: [GoalTask]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)
        parentId = try container.decodeIfPresent(String.self, forKey: .parentId)
        importance = try container.decodeIfPresent(String.self, forKey: .importance) ?? "Low"
        ownProgress = try container.decodeIfPresent(Int.self, forKey: .ownProgress) ?? 0
        progress = try container.decodeIfPresent(Int.self, forKey: .progress) ?? 0
        values = try container.decodeIfPresent([GoalValueTag].self, forKey: .values) ?? []
        chapters = try container.decodeIfPresent([GoalChapterTag].self, forKey: .chapters) ?? []
        tasks = try container.decodeIfPresent([GoalTask].self, forKey: .tasks) ?? []
    }

    var openTasks: [GoalTask] { tasks.filter { !$0.completed } }
    var doneTasks: [GoalTask] { tasks.filter(\.completed) }

    /// The goal's emoji when it is a glyph (an uploaded image needs a browser session).
    var glyph: String? { PersonRef.glyph(emoji) }

    /// High first, then by progress, highest first.
    static func ordered(_ goals: [GoalCard]) -> [GoalCard] {
        let rank = ["High": 0, "Medium": 1, "Low": 2]
        return goals.sorted { a, b in
            let ra = rank[a.importance] ?? 3, rb = rank[b.importance] ?? 3
            if ra != rb { return ra < rb }
            if a.progress != b.progress { return a.progress > b.progress }
            return a.title.localizedCaseInsensitiveCompare(b.title) == .orderedAscending
        }
    }
}
