import Foundation
@testable import AnansiFeature
import Testing

struct CoreCaptureTests {
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    func capture(status: String = "new", kind: String = "text", text: String? = "x", noteId: String? = nil,
                 question: String? = nil, task: String? = nil, error: String? = nil) -> Capture {
        Capture(id: "c1", kind: kind, text: text, durationMs: nil, questionId: question == nil ? nil : "q1",
                question: question, noteId: noteId, tickTickTaskId: task, status: status, routeError: error,
                source: "phone", capturedAt: "2026-11-24T10:00:00.000Z")
    }

    // The same cases as anansi/src/lib/captures.test.ts.
    @Test func titleIsTheFirstLineWithSomethingOnIt() {
        #expect(CaptureRules.title("Buy milk") == "Buy milk")
        #expect(CaptureRules.title("\n\n  Call mom about Sunday  \nand the cake") == "Call mom about Sunday")
        #expect(CaptureRules.title("   ") == "")
        #expect(CaptureRules.title("Line one\r\nline two") == "Line one")
    }

    @Test func aLongTitleIsCutWithAnEllipsis() {
        let title = CaptureRules.title(String(repeating: "a", count: 200))
        #expect(title.count == CaptureRules.titleMax)
        #expect(title.hasSuffix("…"))
    }

    @Test func onlyWhatIsNewsIsSaidUnderACapture() {
        #expect(CaptureRules.note(.tickTick(list: "Inbox", state: .open)) == nil)
        #expect(CaptureRules.note(.tickTick(list: "Inbox", state: .done)) == nil)
        #expect(CaptureRules.note(.question("Why?")) == "→ question: Why?")
        #expect(CaptureRules.cardLine(capture(status: "routed", task: "t"), time: "14:05") == "14:05")
        var done = capture(status: "routed", task: "t")
        done.tickTickState = "done"
        #expect(CaptureRules.cardLine(done, time: "14:05") == "Done in TickTick")
    }

    @Test func capturesAreGroupedByTheDayTheyWereMade() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Montevideo")!
        var a = capture(), b = capture(), c = capture()
        a.capturedAt = "2026-11-26T20:00:00.000Z" // 17:00 on the 26th
        b.capturedAt = "2026-11-26T02:00:00.000Z" // 23:00 on the 25th
        c.capturedAt = "2026-11-25T12:00:00.000Z"
        let groups = CaptureRules.byDay([a, b, c], calendar: calendar)
        #expect(groups.map(\.day) == [LocalDay(year: 2026, month: 11, day: 26), LocalDay(year: 2026, month: 11, day: 25)])
        #expect(groups.map(\.captures.count) == [1, 2])
        let today = LocalDay(year: 2026, month: 11, day: 26)
        #expect(CaptureRules.dayTitle(today, today: today, calendar: calendar) == "Today")
        #expect(CaptureRules.dayTitle(today.adding(days: -1), today: today, calendar: calendar) == "Yesterday")
    }

    @Test func whereACaptureWasMade() {
        var c = capture()
        #expect(CaptureRules.origin(c) == .iphone)
        c.device = "watch"
        #expect(CaptureRules.origin(c) == .watch)
        c.source = "web"
        #expect(CaptureRules.origin(c) == .web)
        c.source = "mcp"
        #expect(CaptureRules.origin(c) == .claude)
    }

    @Test func decodesWhatBecameOfTheTickTickTask() throws {
        let json = """
        {"id":"c1","kind":"text","text":"x","questionId":null,"noteId":null,"tickTickTaskId":"t1",
         "tickTickListName":"Loose threads","tickTickState":"deleted","status":"routed","routeError":null,
         "capturedAt":"2026-11-24T10:00:00.000Z"}
        """
        let decoded = try JSONDecoder().decode(Capture.self, from: Data(json.utf8))
        #expect(CaptureRules.destination(decoded) == .tickTick(list: "Loose threads", state: .deleted))
    }

    @Test func whereACaptureWent() {
        #expect(CaptureRules.destination(capture()) == .kept)
        #expect(CaptureRules.destination(capture(status: "routed", noteId: "n", question: "Why?")) == .question("Why?"))
        #expect(CaptureRules.destination(capture(status: "routed", task: "t")) == .tickTick(list: nil, state: .open))
        #expect(CaptureRules.destination(capture(error: "boom")) == .failed("boom"))
        #expect(CaptureRules.destination(capture(kind: "voice", text: nil)) == .transcribing)
        #expect(CaptureRules.destination(capture(kind: "voice", text: "")) == .kept)
        #expect(CaptureRules.destination(capture(status: "archived", task: "t")) == .archived)
        #expect(CaptureRules.label(.tickTick(list: nil, state: .open)) == "→ TickTick · Inbox")
        #expect(CaptureRules.label(.tickTick(list: "Loose threads", state: .done)) == "Done in TickTick · Loose threads")
        #expect(CaptureRules.label(.tickTick(list: "Inbox", state: .deleted)) == "Deleted in TickTick")
        #expect(CaptureRules.isSettled(.tickTick(list: nil, state: .done)))
        #expect(!CaptureRules.isSettled(.tickTick(list: nil, state: .open)))
        #expect(CaptureRules.label(.question("Why do I want to be a dad?")) == "→ question: Why do I want to be a dad?")
    }

    @Test func theConfirmationNamesTheQuestion() {
        #expect(CaptureRules.confirmation(question: nil) == "Saved to your inbox.")
        #expect(CaptureRules.confirmation(question: "Why do I want to be a dad?") == "Added to “Why do I want to be a dad?”.")
        #expect(CaptureRules.duration(seconds: 42.9) == "0:42")
        #expect(CaptureRules.duration(seconds: 725) == "12:05")
    }

    @Test func aCaptureDecodesFromTheServer() throws {
        let json = """
        {"id":"c1","kind":"voice","text":null,"durationMs":4200,"questionId":null,"question":null,"noteId":null,
         "tickTickTaskId":null,"status":"new","routeError":null,"routedAt":null,"source":"phone",
         "capturedAt":"2026-11-24T08:00:00.000Z","createdAt":"2026-11-24T08:00:01.000Z","audioUrl":"/api/files/f1"}
        """
        let decoded = try JSONDecoder().decode(Capture.self, from: Data(json.utf8))
        #expect(decoded.isVoice)
        #expect(decoded.text == nil)
        #expect(CaptureRules.destination(decoded) == .transcribing)
    }

    // MARK: The outbox

    func voice(_ id: UUID = UUID()) -> OutboxOp {
        OutboxOp(id: id, itemId: OutboxOp.captureItemId(id), itemTitle: "Voice note",
                 kind: .voiceCapture(localFile: "\(id.uuidString).m4a", questionId: nil, capturedAt: t0, durationMs: 4200,
                                     byteCount: 100, transcript: nil),
                 queuedAt: t0)
    }

    func transcriptOf(_ op: OutboxOp?) -> String? {
        guard let op, case .voiceCapture(_, _, _, _, _, let transcript) = op.kind else { return nil }
        return transcript
    }

    @Test func wordsRideWithARecordingStillWaiting() {
        var outbox = SyncOutbox()
        let op = voice()
        outbox.enqueue(op)
        outbox.setTranscript(captureItemId: op.itemId, title: "Hello", transcript: "Hello there", now: t0)
        #expect(outbox.pending.count == 1)
        #expect(transcriptOf(outbox.pending.first) == "Hello there")
        #expect(outbox.referencedFiles.contains("\(op.id.uuidString).m4a"))
    }

    @Test func wordsForARecordingOnTheWireGoAfterIt() throws {
        var outbox = SyncOutbox()
        let op = voice()
        outbox.enqueue(op)
        let first = try #require(outbox.next(now: t0))
        outbox.begin(first)
        outbox.setTranscript(captureItemId: op.itemId, title: "Hi", transcript: "Hi", now: t0)
        #expect(outbox.pending.count == 2)
        #expect(outbox.pending.last?.kind == .captureTranscript("Hi"))
        outbox.recordCapture(itemId: op.itemId, serverId: "srv1")
        outbox.didSucceed(first.id)
        #expect(outbox.serverCaptureId(op.itemId) == "srv1")
        #expect(outbox.next(now: t0)?.kind == .captureTranscript("Hi"))
        // Newer words replace the unsent ones.
        outbox.setTranscript(captureItemId: op.itemId, title: "Hi again", transcript: "Hi again", now: t0)
        #expect(outbox.pending.count == 1)
        #expect(outbox.pending.first?.kind == .captureTranscript("Hi again"))
        #expect(outbox.pendingCaptures.isEmpty)
    }

    @Test func aRetriedRecordingTakesTheWordsWaitingForIt() throws {
        var outbox = SyncOutbox()
        let op = voice()
        outbox.enqueue(op)
        let first = try #require(outbox.next(now: t0))
        outbox.begin(first)
        outbox.setTranscript(captureItemId: op.itemId, title: "Words", transcript: "Words", now: t0)
        outbox.didFailPermanently(first.id, message: "Refused")
        outbox.retry(first.id)
        #expect(outbox.pending.count == 1)
        #expect(transcriptOf(outbox.pending.first) == "Words")
    }

    @Test func onlyTheLatestCaptureIdsAreKept() {
        var outbox = SyncOutbox()
        for index in 0..<(SyncOutbox.captureMemory + 5) {
            outbox.recordCapture(itemId: "capture:\(index)", serverId: "s\(index)")
        }
        #expect(outbox.captureIds?.count == SyncOutbox.captureMemory)
        #expect(outbox.serverCaptureId("capture:0") == nil)
        #expect(outbox.serverCaptureId("capture:\(SyncOutbox.captureMemory + 4)") == "s\(SyncOutbox.captureMemory + 4)")
    }

    @Test func captureOpsRoundTripAndOldQueuesStillDecode() throws {
        var outbox = SyncOutbox()
        let id = UUID()
        outbox.enqueue(OutboxOp(id: id, itemId: OutboxOp.captureItemId(id), itemTitle: "Buy milk",
                                kind: .capture(text: "Buy milk", questionId: "q1", capturedAt: t0), queuedAt: t0))
        outbox.enqueue(voice())
        outbox.recordCapture(itemId: "capture:x", serverId: "s")
        let data = try JSONEncoder().encode(outbox)
        let back = try JSONDecoder().decode(SyncOutbox.self, from: data)
        #expect(back == outbox)
        #expect(back.pendingCaptures.count == 2)

        // A queue saved before captures existed has no `captureIds`.
        var old = SyncOutbox()
        old.enqueue(OutboxOp(itemId: "a", itemTitle: "A", kind: .setText("hello"), queuedAt: t0))
        var json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(old)) as? [String: Any])
        json.removeValue(forKey: "captureIds")
        let decodedOld = try JSONDecoder().decode(SyncOutbox.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(decodedOld.pending.count == 1)
        #expect(decodedOld.captureIds == nil)
    }

    @Test func theVoiceUploadCarriesShortWordsOnly() {
        let short = API.uploadVoiceCapture(questionId: "q1", capturedAt: t0, durationMs: 4200, transcript: "Hello")
        #expect(short.path == "api/v1/captures/voice")
        #expect(short.query.contains(URLQueryItem(name: "transcript", value: "Hello")))
        #expect(short.query.contains(URLQueryItem(name: "questionId", value: "q1")))
        #expect(short.query.contains(URLQueryItem(name: "durationMs", value: "4200")))
        let long = API.uploadVoiceCapture(questionId: nil, capturedAt: t0, durationMs: 1, transcript:
            String(repeating: "a", count: API.transcriptInQueryMax + 1))
        #expect(!long.query.contains(where: { $0.name == "transcript" }))
        #expect(!long.query.contains(where: { $0.name == "questionId" }))
        #expect(API.instant(Date(timeIntervalSince1970: 0)) == "1970-01-01T00:00:00.000Z")
    }

    // MARK: Server transcription (the web's transcriptView, anansi/src/lib/captures.test.ts)

    func voice(text: String?, status: String?, attempts: Int? = nil, error: String? = nil) -> Capture {
        var c = capture(kind: "voice", text: text)
        c.transcriptStatus = status
        c.transcribeAttempts = attempts
        c.transcribeError = error
        return c
    }

    @Test func theWordsShowWhatTheServerWrote() {
        #expect(CaptureRules.words(voice(text: "Hi", status: "done")) == .text("Hi"))
        #expect(CaptureRules.words(voice(text: "", status: "done")) == .empty)
        #expect(CaptureRules.words(voice(text: nil, status: "pending")) == .transcribing(retrying: false))
        #expect(CaptureRules.words(voice(text: nil, status: "pending", attempts: 2, error: "503"))
            == .transcribing(retrying: true))
        #expect(CaptureRules.words(voice(text: nil, status: "failed", attempts: 1, error: "bad audio"))
            == .failed("bad audio"))
        // A server from before server transcription sends no status: still "Transcribing…".
        #expect(CaptureRules.words(voice(text: nil, status: nil)) == .transcribing(retrying: false))
        #expect(voice(text: nil, status: "pending").isTranscribing)
        #expect(!voice(text: nil, status: "failed").isTranscribing)
        #expect(!voice(text: "Hi", status: "done").isTranscribing)
    }

    @Test func aRefusedVoiceNoteIsKeptNotWaiting() {
        #expect(CaptureRules.destination(voice(text: nil, status: "pending")) == .transcribing)
        #expect(CaptureRules.destination(voice(text: nil, status: "failed")) == .kept)
    }

    @Test func aCaptureDecodesWithItsTranscriptStatus() throws {
        let json = """
        {"id":"c1","kind":"voice","text":null,"durationMs":4200,"status":"new","source":"phone",
         "capturedAt":"2026-11-24T08:00:00.000Z","transcriptStatus":"failed","transcribeAttempts":1,
         "transcribeError":"The transcriber refused this audio (400: Invalid request)","transcriptSource":null}
        """
        let decoded = try JSONDecoder().decode(Capture.self, from: Data(json.utf8))
        #expect(CaptureRules.words(decoded) == .failed("The transcriber refused this audio (400: Invalid request)"))
    }

    @Test func recordingsGoAsWavAndOldOnesAsM4a() {
        let wav = API.uploadVoiceCapture(questionId: nil, capturedAt: t0, durationMs: 1000, transcript: nil,
                                         localFile: "A1B2.wav")
        #expect(wav.contentType == "audio/wav")
        #expect(wav.query.contains(URLQueryItem(name: "fileName", value: "Voice note.wav")))
        #expect(!wav.query.contains(where: { $0.name == "transcript" }))
        let old = API.uploadVoiceCapture(questionId: nil, capturedAt: t0, durationMs: 1000, transcript: nil,
                                         localFile: "A1B2.m4a")
        #expect(old.contentType == "audio/mp4")
        #expect(old.query.contains(URLQueryItem(name: "fileName", value: "Voice note.m4a")))
    }
}
