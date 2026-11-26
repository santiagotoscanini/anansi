import Foundation
import Observation

/// The Life tab's data (`GET /api/v1/life`) and the weeks opened from it. Writes go straight to the server and
/// re-read the whole life: a chapter is small, and the grid must show exactly what the server holds.
@Observable
final class LifeStore {
    static let shared = LifeStore()

    private(set) var life: LifeData?
    private(set) var error: String?
    private(set) var isLoading = false
    private(set) var weeks: [LocalDay: LifeWeek] = [:]
    private(set) var weekErrors: [LocalDay: String] = [:]

    private var client: APIClient { .shared }

    func load() async {
        guard Connection.shared.isConnected else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            life = try await client.life()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func setSettings(birthDate: LocalDay?, lifeExpectancyYears: Int?) async throws {
        life = try await client.setLife(birthDate: birthDate, lifeExpectancyYears: lifeExpectancyYears)
    }

    func save(_ fields: API.ChapterFields, id: String?) async throws {
        if let id {
            try await client.updateChapter(id, fields)
        } else {
            try await client.createChapter(fields)
        }
        weeks = [:]
        await load()
    }

    func delete(_ id: String) async throws {
        try await client.deleteChapter(id)
        weeks = [:]
        await load()
    }

    /// `sunday` is the week's Sunday.
    func loadWeek(_ sunday: LocalDay) async {
        guard Connection.shared.isConnected else { return }
        do {
            weeks[sunday] = try await client.lifeWeek(day: sunday)
            weekErrors[sunday] = nil
        } catch {
            weekErrors[sunday] = error.localizedDescription
        }
    }

    func clear() {
        life = nil
        error = nil
        weeks = [:]
        weekErrors = [:]
    }
}

/// The Goals screen's data (`GET /api/v1/goals/board`). Ticking a task shows at once and rolls back on failure.
@Observable
final class GoalsStore {
    static let shared = GoalsStore()

    private(set) var goals: [GoalCard] = []
    private(set) var hasLoaded = false
    private(set) var error: String?
    private(set) var isLoading = false

    private var client: APIClient { .shared }

    func load() async {
        guard Connection.shared.isConnected else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            goals = try await client.goalBoard()
            hasLoaded = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func goal(_ id: String) -> GoalCard? { goals.first { $0.id == id } }

    func setCompleted(_ task: GoalTask, in goalId: String, completed: Bool) async {
        let before = goals
        patch(task.id, in: goalId, completed: completed)
        do {
            try await client.setTaskCompleted(task.id, completed: completed)
            // Progress is the server's to compute; read it back.
            await load()
        } catch {
            goals = before
            self.error = error.localizedDescription
        }
    }

    private func patch(_ taskId: String, in goalId: String, completed: Bool) {
        guard let g = goals.firstIndex(where: { $0.id == goalId }),
              let t = goals[g].tasks.firstIndex(where: { $0.id == taskId })
        else { return }
        goals[g].tasks[t].completed = completed
    }

    func clear() {
        goals = []
        hasLoaded = false
        error = nil
    }
}
