import Foundation
import Observation

/// The server's view of Pulse and of the weeks the phone has opened, plus an index of every sync item seen, so
/// an item's screen always shows the newest copy whichever list it was opened from. The outbox is laid over all
/// of it by the views (`OutboxStore.shared.outbox.overlay`).
@Observable
final class SyncData {
    static let shared = SyncData()

    private(set) var pulse: Pulse?
    private(set) var pulseError: String?
    private(set) var isLoadingPulse = false
    /// The day Pulse was last asked for (it moves at midnight).
    private(set) var pulseDay: LocalDay?

    private(set) var weeks: [LocalDay: WeeklyRetro] = [:]
    private(set) var weekErrors: [LocalDay: String] = [:]
    private(set) var loadingWeeks: Set<LocalDay> = []

    /// Every sync item by id, newest copy.
    private(set) var items: [String: SyncItem] = [:]

    private var client: APIClient { .shared }

    // MARK: Pulse

    func refreshPulse(today: LocalDay = .today()) async {
        guard Connection.shared.isConnected else { return }
        isLoadingPulse = true
        defer { isLoadingPulse = false }
        do {
            let pulse = try await client.pulse(day: today)
            self.pulse = pulse
            pulseDay = today
            pulseError = nil
            index(pulse.sync?.items ?? [])
        } catch {
            pulseError = error.localizedDescription
        }
    }

    /// Starts this week from the default items, then reloads Pulse.
    func startThisWeek(today: LocalDay = .today()) async throws {
        try await client.startWeek(day: today)
        await refreshPulse(today: today)
        await refreshWeek(today.weekStart)
    }

    // MARK: Weeks

    /// `weekStart` must be a Monday (`LocalDay.weekStart`).
    func refreshWeek(_ weekStart: LocalDay) async {
        guard Connection.shared.isConnected else { return }
        loadingWeeks.insert(weekStart)
        defer { loadingWeeks.remove(weekStart) }
        do {
            let retro = try await client.weeklySync(day: weekStart)
            weeks[weekStart] = retro
            weekErrors[weekStart] = nil
            index(retro.orderedItems)
        } catch {
            weekErrors[weekStart] = error.localizedDescription
        }
    }

    func startWeek(_ weekStart: LocalDay) async throws {
        try await client.startWeek(day: weekStart)
        await refreshWeek(weekStart)
        if weekStart == LocalDay.today().weekStart { await refreshPulse() }
    }

    func add(_ entry: LibraryEntry, to weekStart: LocalDay) async throws {
        guard let syncId = weeks[weekStart]?.weeklySync?.id else { return }
        try await client.addSyncItem(weeklySyncId: syncId, trackingItemId: entry.id)
        await refreshAfterChange(weekStart)
    }

    func remove(_ item: SyncItem, from weekStart: LocalDay) async throws {
        try await client.removeSyncItem(item.id)
        items[item.id] = nil
        await refreshAfterChange(weekStart)
    }

    /// Optimistic reorder: the list moves now, the server is told, and the week reloads either way.
    func reorder(_ weekStart: LocalDay, orderedIds: [String]) async throws {
        guard let syncId = weeks[weekStart]?.weeklySync?.id else { return }
        if var retro = weeks[weekStart] {
            let position = Dictionary(uniqueKeysWithValues: orderedIds.enumerated().map { ($1, $0) })
            func renumber(_ list: [SyncItem]) -> [SyncItem] {
                list.map { item in
                    var item = item
                    item.orderIdx = position[item.id] ?? item.orderIdx
                    return item
                }
            }
            retro.unscopedItems = renumber(retro.unscopedItems)
            retro.goals = retro.goals.map { group in
                var group = group
                group.items = renumber(group.items)
                return group
            }
            weeks[weekStart] = retro
        }
        defer { Task { await refreshAfterChange(weekStart) } }
        try await client.reorderSyncItems(weeklySyncId: syncId, orderedIds: orderedIds)
    }

    private func refreshAfterChange(_ weekStart: LocalDay) async {
        await refreshWeek(weekStart)
        if weekStart == LocalDay.today().weekStart { await refreshPulse() }
    }

    /// After the outbox lands something: re-read what is on screen.
    func refreshLoaded() async {
        await refreshPulse()
        for week in weeks.keys { await refreshWeek(week) }
    }

    /// Signing out: nothing of the old account stays on screen.
    func clear() {
        pulse = nil
        pulseError = nil
        weeks = [:]
        weekErrors = [:]
        items = [:]
    }

    private func index(_ list: [SyncItem]) {
        for item in list {
            var item = item
            // Pulse names the goal on the item; keep it when a grouped copy arrives without it.
            if item.goalTitle == nil { item.goalTitle = items[item.id]?.goalTitle }
            items[item.id] = item
        }
    }
}
