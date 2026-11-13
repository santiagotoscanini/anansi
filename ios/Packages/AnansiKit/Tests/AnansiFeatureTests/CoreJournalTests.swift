import Foundation
@testable import AnansiFeature
import Testing

/// The mention grammar (the cases of anansi/src/lib/mentions.test.ts that apply to the phone, which only reads
/// tokens and never writes them) on journal text, sync notes and task titles, and the journal's contract, its
/// endpoints and its place in the outbox.
struct CoreJournalTests {
    static let sofia = "sofia0000000000000000001"
    static let ana = "ana000000000000000000001"
    static let anaMaria = "anamaria0000000000000001"
    static let names = [sofia: "Sofia", ana: "Ana", anaMaria: "Ana María"]

    static func token(_ name: String, _ id: String) -> String { "@[\(name)](person:\(id))" }

    let day = LocalDay(year: 2026, month: 11, day: 12)

    // MARK: Text

    @Test func aTokenBecomesANameInTheEditor() {
        let stored = "Dinner with \(Self.token("Sofia", Self.sofia)) and \(Self.token("Ana María", Self.anaMaria))."
        #expect(MentionText.mentionedIds(stored) == [Self.sofia, Self.anaMaria])
        #expect(MentionText.editable(stored, names: Self.names) == "Dinner with @Sofia and @Ana María.")
        #expect(MentionText.plain(stored, names: Self.names) == "Dinner with Sofia and Ana María.")
    }

    @Test func aRenamedPersonShowsTheCurrentName() {
        let stored = "@[Sofi](person:sofia0000000000000000001) called"
        #expect(MentionText.editable(stored, names: Self.names) == "@Sofia called")
        // Someone the entry's mentions no longer name keeps the name that was stored.
        #expect(MentionText.editable(stored, names: [:]) == "@Sofi called")
        #expect(MentionText.editable(stored) == "@Sofi called")
    }

    @Test func segmentsAlternateTextAndMentions() {
        #expect(MentionText.segments("a \(Self.token("Ana", Self.ana)) b") == [
            .text("a "),
            .mention(personId: Self.ana, label: "Ana"),
            .text(" b"),
        ])
        #expect(MentionText.segments("") == [])
        #expect(MentionText.segments("plain @Ana, a@b.c") == [.text("plain @Ana, a@b.c")])
        #expect(MentionText.segments(Self.token("Ana", Self.ana) + Self.token("Sofia", Self.sofia)) == [
            .mention(personId: Self.ana, label: "Ana"),
            .mention(personId: Self.sofia, label: "Sofia"),
        ])
    }

    @Test func mentionsAreCountedOnce() {
        let text = "\(Self.token("Ana", Self.ana)) and \(Self.token("Sofia", Self.sofia)) and \(Self.token("Anita", Self.ana))"
        #expect(MentionText.mentionedIds(text) == [Self.ana, Self.sofia])
    }

    @Test func whatIsNotATokenStaysText() {
        // An id too short, uppercase in the id, a line break in the name, an empty name, no id at all.
        for text in ["@[Ana](person:abc)", "@[Ana](person:ABCDEFGH)", "@[An\na](person:abcdefgh)", "@[](person:abcdefgh)",
                     "@[Ana]", "@[Ana](person:abcdefgh", "@[Ana] (person:abcdefgh)"] {
            #expect(MentionText.segments(text) == [.text(text)])
            #expect(MentionText.editable(text, names: Self.names) == text)
        }
        // The shortest id that links.
        #expect(MentionText.mentionedIds("@[Ana](person:abc123)") == ["abc123"])
    }

    @Test func aNameThatCouldBreakTheTextIsMadeSafe() {
        #expect(MentionText.editable(Self.token("X", Self.ana), names: [Self.ana: "A]b"]) == "@A b")
        #expect(MentionText.appendingMention(to: "", name: "Sofia") == "@Sofia ")
        #expect(MentionText.appendingMention(to: "Dinner with", name: "Sofia") == "Dinner with @Sofia ")
        #expect(MentionText.appendingMention(to: "Dinner with ", name: "Ana María") == "Dinner with @Ana María ")
    }

    // MARK: Sync notes and task titles

    static func item(_ text: String?) -> SyncItem {
        SyncItem(id: "a", trackingItemId: "t", title: "Sleep", description: nil, orderIdx: 0,
                 textContent: text, attachments: [], goalId: nil, goalTitle: nil, createdAt: nil)
    }

    @Test func storedNotesOpenInTheEditorAsNames() {
        // No `mentions` list comes with a sync item: the name in the token is the one shown.
        let stored = Self.item("Ran with \(Self.token("Sofia", Self.sofia)).\n@Ana too")
        #expect(stored.editableNotes == "Ran with @Sofia.\n@Ana too")
        #expect(Self.item(nil).editableNotes == "")
        #expect(stored.isFilled)
    }

    @Test func unsentNotesAndTheStoredOnesAreTheSameTextInTheEditor() {
        // What the phone typed and queued is `@Name`; what the server stored from it is a token. Opening the
        // editor on either gives the same text, so nothing reads as a change until the user types.
        let typed = "Ran with @Sofia."
        let stored = Self.item("Ran with \(Self.token("Sofia", Self.sofia)).")
        var outbox = SyncOutbox()
        #expect(outbox.overlay(stored).editableNotes == typed)
        outbox.enqueue(OutboxOp(itemId: "a", itemTitle: "Sleep", kind: .setText(typed), queuedAt: Date(timeIntervalSince1970: 0)))
        #expect(outbox.overlay(stored).textContent == typed)
        #expect(outbox.overlay(stored).editableNotes == typed)
    }

    @Test func aTaskTitleReadsWithoutTokens() {
        let task = HorizonTask(id: "t1", title: "Call \(Self.token("Ana María", Self.anaMaria)) about flights", goalId: "g",
                               goalTitle: "Travel", goalEmoji: nil, scheduledAt: "2026-11-20T00:00:00.000Z")
        #expect(task.plainTitle == "Call Ana María about flights")
    }

    // MARK: Contract

    static let entry = #"""
    {"id":"je1","day":"2026-11-12","userId":"u",
     "content":"Dinner with @[Sofia](person:abc123def456) at home.\nLate night.",
     "highlights":["Ran 5k","Call with @[Ana](person:def456abc123)"],
     "mentions":[{"personId":"abc123def456","name":"Sofía","emoji":"🌻"},{"personId":"def456abc123","name":"Ana","emoji":"/api/files/f9"}],
     "attachments":[{"id":"at1","fileName":"IMG_1.jpg","fileType":"image","url":"/api/files/f1","sizeBytes":123,"createdAt":"2026-11-12T20:00:00.000Z"},
                    {"id":"at2","fileName":"notes.pdf","fileType":"document","url":"/api/files/f2","sizeBytes":null,"createdAt":"2026-11-12T20:01:00.000Z"}],
     "createdAt":"2026-11-12T19:00:00.000Z","updatedAt":"2026-11-12T20:01:00.000Z"}
    """#

    @Test func decodesAnEntry() throws {
        let entry = try JSONDecoder().decode(JournalEntry.self, from: Data(Self.entry.utf8))
        #expect(entry.localDay == day)
        #expect(entry.highlights.count == 2)
        #expect(entry.mentions.map(\.name) == ["Sofía", "Ana"])
        #expect(entry.mentions[0].glyph == "🌻")
        #expect(entry.mentions[1].glyph == nil) // an uploaded photo, not a glyph
        #expect(entry.attachments[1].sizeBytes == nil)
        #expect(entry.pictureCount == 1)
        #expect(!entry.isBlank)
        // The entry's mentions carry the current name: the stored "Sofia" reads "Sofía".
        #expect(MentionText.editable(entry.content, names: entry.names) == "Dinner with @Sofía at home.\nLate night.")
        #expect(entry.excerpt == "Ran 5k")
        var prose = entry
        prose.highlights = []
        #expect(prose.excerpt == "Dinner with Sofía at home.")
    }

    @Test func decodesADayWithNothingWritten() throws {
        let none = try API.decode(JournalEntry?.self, from: Data("null".utf8))
        #expect(none == nil)
        let some = try API.decode(JournalEntry?.self, from: Data(Self.entry.utf8))
        #expect(some?.id == "je1")
        let list = try API.decode([JournalEntry].self, from: Data("[\(Self.entry)]".utf8))
        #expect(list.count == 1)
    }

    @Test func decodesPeople() throws {
        let json = #"[{"id":"p1","name":"Ana","emoji":null},{"id":"p2","name":"Sofia","emoji":"🌻"}]"#
        let people = try JSONDecoder().decode([PersonRef].self, from: Data(json.utf8))
        #expect(people.map(\.name) == ["Ana", "Sofia"])
        #expect(people[0].glyph == nil)
        #expect(people[1].glyph == "🌻")
    }

    // MARK: Endpoints

    let server = URL(string: "https://anansi.example.com")!

    func url(_ endpoint: API.Endpoint) -> String { API.url(server: server, endpoint)?.absoluteString ?? "" }
    func body(_ endpoint: API.Endpoint) -> String { String(decoding: endpoint.body ?? Data(), as: UTF8.self) }

    @Test func buildsJournalRequests() {
        #expect(url(API.journal(day: day)) == "https://anansi.example.com/api/v1/journal/2026-11-12")
        #expect(API.journal(day: day).method == "GET")

        let both = API.writeJournal(day: day, content: "Dinner with @Sofia", highlights: ["Ran 5k"])
        #expect(both.method == "PUT")
        #expect(url(both) == "https://anansi.example.com/api/v1/journal/2026-11-12")
        #expect(body(both) == #"{"content":"Dinner with @Sofia","highlights":["Ran 5k"]}"#)
        // A field that isn't set is left out, so the server keeps what the day holds.
        #expect(body(API.writeJournal(day: day, content: nil, highlights: [])) == #"{"highlights":[]}"#)
        #expect(body(API.writeJournal(day: day, content: "", highlights: nil)) == #"{"content":""}"#)

        #expect(API.deleteJournal(day: day).method == "DELETE")
        #expect(url(API.journalList()) == "https://anansi.example.com/api/v1/journal")
        #expect(url(API.journalList(from: day.adding(days: -7), to: day, personId: "p1", query: "dinner sofia", limit: 60))
            == "https://anansi.example.com/api/v1/journal?from=2026-11-05&to=2026-11-12&personId=p1&q=dinner%20sofia&limit=60")
        #expect(url(API.people()) == "https://anansi.example.com/api/v1/people")

        let upload = API.uploadJournalAttachment(day: day, fileName: "IMG 1.jpg", fileType: "image", contentType: "image/jpeg")
        #expect(upload.method == "POST")
        #expect(upload.body == nil)
        #expect(url(upload) == "https://anansi.example.com/api/v1/journal/2026-11-12/attachments?fileName=IMG%201.jpg&fileType=image")
    }

    // MARK: Outbox

    let t0 = Date(timeIntervalSince1970: 1_000_000)

    func write(content: String? = nil, highlights: [String]? = nil) -> OutboxOp {
        OutboxOp(itemId: OutboxOp.journalItemId(day), itemTitle: "Journal, Nov 12",
                 kind: .setJournal(content: content, highlights: highlights), queuedAt: t0)
    }

    @Test func aJournalOpKnowsItsDay() {
        #expect(OutboxOp.journalItemId(day) == "journal:2026-11-12")
        #expect(write(content: "x").journalDay == day)
        #expect(OutboxOp(itemId: "si1", itemTitle: "Sleep", kind: .setText("x"), queuedAt: t0).journalDay == nil)
    }

    @Test func unsentJournalWritesMergeFieldByField() {
        var outbox = SyncOutbox()
        outbox.enqueue(write(content: "one"))
        outbox.enqueue(write(highlights: ["a"]))
        outbox.enqueue(write(content: "two"))
        #expect(outbox.pending.count == 1)
        #expect(outbox.pending.first?.kind == .setJournal(content: "two", highlights: ["a"]))
        #expect(outbox.pendingJournal(for: day) == JournalEdit(content: "two", highlights: ["a"]))
        #expect(outbox.pendingJournal(for: day.adding(days: -1)).isEmpty)
        // Another day's write is its own op, and a sync item's notes are untouched.
        outbox.enqueue(OutboxOp(itemId: OutboxOp.journalItemId(day.adding(days: -1)), itemTitle: "Journal, Nov 11",
                                kind: .setJournal(content: "yesterday", highlights: nil), queuedAt: t0))
        outbox.enqueue(OutboxOp(itemId: "si1", itemTitle: "Sleep", kind: .setText("7h"), queuedAt: t0))
        #expect(outbox.pending.count == 3)
    }

    @Test func aJournalWriteOnTheWireIsNeverMergedInto() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(write(content: "one", highlights: ["a"]))
        let first = try #require(outbox.next(now: t0))
        outbox.begin(first)
        outbox.enqueue(write(content: "two"))
        #expect(outbox.pending.count == 2)
        #expect(outbox.pending.last?.kind == .setJournal(content: "two", highlights: nil))
        #expect(outbox.pendingJournal(for: day) == JournalEdit(content: "two", highlights: ["a"]))
        outbox.didSucceed(first.id)
        #expect(outbox.pendingJournal(for: day) == JournalEdit(content: "two", highlights: nil))
    }

    @Test func laysUnsentTextOverTheDay() throws {
        var outbox = SyncOutbox()
        let entry = try JSONDecoder().decode(JournalEntry.self, from: Data(Self.entry.utf8))
        #expect(outbox.overlay(entry, day: day) == entry)
        #expect(outbox.overlay(nil, day: day) == nil)
        outbox.enqueue(write(highlights: ["Ran 10k"]))
        let shown = try #require(outbox.overlay(entry, day: day))
        #expect(shown.highlights == ["Ran 10k"])
        #expect(shown.content == entry.content)
        #expect(shown.attachments == entry.attachments)
        // A day the server has nothing for shows what was typed.
        let fresh = try #require(outbox.overlay(nil, day: day))
        #expect(fresh.day == "2026-11-12")
        #expect(fresh.highlights == ["Ran 10k"])
        #expect(fresh.content.isEmpty)
    }

    @Test func journalOpsSurviveARestart() throws {
        var outbox = SyncOutbox()
        outbox.enqueue(write(content: "one"))
        outbox.enqueue(OutboxOp(itemId: OutboxOp.journalItemId(day), itemTitle: "Journal, Nov 12",
                                kind: .upload(localFile: "1.jpg", fileName: "IMG.jpg", fileType: "image", byteCount: 10),
                                queuedAt: t0))
        let restored = try JSONDecoder().decode(SyncOutbox.self, from: JSONEncoder().encode(outbox))
        #expect(restored == outbox)
        #expect(restored.pendingUploads(for: OutboxOp.journalItemId(day)).count == 1)
        #expect(restored.pendingJournal(for: day).content == "one")
    }

    // MARK: Wording

    @Test func namesJournalDays() {
        #expect(Wording.journalDate(day, currentYear: 2026) == "Thursday, Nov 12")
        #expect(Wording.journalDate(day, currentYear: 2027) == "Thursday, Nov 12, 2026")
        #expect(Wording.journalDistance(from: day, to: day) == "Today")
        #expect(Wording.journalDistance(from: day, to: day.adding(days: -1)) == "Yesterday")
        #expect(Wording.journalDistance(from: day, to: day.adding(days: -12)) == "12 days ago")
        #expect(Wording.journalTitle(day) == "Journal, Nov 12")
        #expect(Wording.pictures(1) == "1 picture")
        #expect(Wording.people(3) == "3 people")
    }
}
