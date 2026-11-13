import Foundation
import Observation

/// The server's view of the journal: the days the phone has opened, the list of recent entries, and the people
/// who can be mentioned. Text and pictures are written through the outbox (`OutboxStore.setJournal`,
/// `addPicture`), which the views lay over this (`SyncOutbox.overlay(_:day:)`) and which hands each answer back
/// here as it lands.
@Observable
final class JournalStore {
    static let shared = JournalStore()

    /// The days that have an entry, among the days read.
    private(set) var entries: [LocalDay: JournalEntry] = [:]
    /// Days whose answer is in (an entry or none).
    private(set) var loadedDays: Set<LocalDay> = []
    private(set) var loadingDays: Set<LocalDay> = []
    private(set) var dayErrors: [LocalDay: String] = [:]

    /// The list screen: the newest entries, or the ones matching `recentQuery`.
    private(set) var recent: [JournalEntry] = []
    private(set) var recentQuery = ""
    private(set) var recentError: String?
    private(set) var isLoadingRecent = false
    private(set) var hasLoadedRecent = false

    private(set) var people: [PersonRef] = []
    private(set) var peopleError: String?
    private(set) var isLoadingPeople = false

    @ObservationIgnored private var recentRequest = 0

    private var client: APIClient { .shared }

    // MARK: One day

    func refresh(_ day: LocalDay) async {
        guard Connection.shared.isConnected else { return }
        loadingDays.insert(day)
        defer { loadingDays.remove(day) }
        do {
            let entry = try await client.journalEntry(day: day)
            entries[day] = entry
            loadedDays.insert(day)
            dayErrors[day] = nil
        } catch {
            dayErrors[day] = error.localizedDescription
        }
    }

    /// The outbox wrote a day's text: `entry` is the server's answer (nil when the day ended up empty).
    func didWrite(_ day: LocalDay, entry: JournalEntry?) {
        entries[day] = entry
        loadedDays.insert(day)
        dayErrors[day] = nil
        let name = day.string
        if let entry {
            if let index = recent.firstIndex(where: { $0.day == name }) {
                recent[index] = entry
            } else if recentQuery.isEmpty, hasLoadedRecent {
                recent.append(entry)
                recent.sort { $0.day > $1.day }
            }
        } else {
            recent.removeAll { $0.day == name }
        }
    }

    /// The outbox uploaded a picture to a day. An upload starts the day's entry when there was none, so a day
    /// not held yet is read again.
    func didUpload(_ day: LocalDay, attachment: SyncAttachment) {
        if var entry = entries[day] {
            if !entry.attachments.contains(where: { $0.id == attachment.id }) { entry.attachments.append(attachment) }
            didWrite(day, entry: entry)
        } else {
            Task { await refresh(day) }
        }
    }

    /// Deletes a picture or a file from a day, then reads the day again (a day left with nothing is gone).
    func deleteAttachment(_ attachment: SyncAttachment, from day: LocalDay) async throws {
        try await client.deleteAttachment(attachment.id)
        AttachmentCache.shared.forget(attachment.id)
        await refresh(day)
        if entries[day] == nil { recent.removeAll { $0.day == day.string } }
    }

    // MARK: The list

    func refreshRecent(query: String = "") async {
        guard Connection.shared.isConnected else { return }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        recentRequest += 1
        let request = recentRequest
        isLoadingRecent = true
        do {
            let list = try await client.journalEntries(query: trimmed.isEmpty ? nil : trimmed, limit: 60)
            // A slower, older search must not replace a newer one's answer.
            guard request == recentRequest else { return }
            recent = list
            recentQuery = trimmed
            recentError = nil
            hasLoadedRecent = true
        } catch {
            guard request == recentRequest else { return }
            recentError = error.localizedDescription
        }
        isLoadingRecent = false
    }

    // MARK: People

    func loadPeople() async {
        guard Connection.shared.isConnected, !isLoadingPeople else { return }
        isLoadingPeople = true
        defer { isLoadingPeople = false }
        do {
            people = try await client.people()
            peopleError = nil
        } catch {
            peopleError = error.localizedDescription
        }
    }

    /// Signing out: nothing of the old account stays on screen.
    func clear() {
        entries = [:]
        loadedDays = []
        dayErrors = [:]
        recent = []
        recentQuery = ""
        recentError = nil
        hasLoadedRecent = false
        people = []
        peopleError = nil
    }
}
