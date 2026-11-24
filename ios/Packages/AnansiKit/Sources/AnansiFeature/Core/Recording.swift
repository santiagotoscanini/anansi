import Foundation

// Voice notes recorded without opening the app (the Action Button, the Control Center control): how long one may
// run, when it counts as recorded, and the words still to be transcribed once it stopped. The app side is
// `BackgroundRecorder.swift`; the Live Activity is ios/AnansiWidgets.

nonisolated enum RecordingRules {
    /// A recording started from the Action Button stops and is saved after this long.
    static let maxDuration: TimeInterval = 30 * 60

    /// Shorter than this, nothing was recorded (a double press).
    static let minimumDuration: TimeInterval = 0.3

    /// When a recording that started at `startedAt` is stopped for being too long.
    static func endsBy(startedAt: Date) -> Date {
        startedAt.addingTimeInterval(maxDuration)
    }

    /// The time left before the limit, never negative.
    static func remaining(startedAt: Date, now: Date) -> TimeInterval {
        max(0, endsBy(startedAt: startedAt).timeIntervalSince(now))
    }

    /// A recording's length in milliseconds, or nil when it is too short to keep.
    static func durationMs(seconds: TimeInterval) -> Int? {
        seconds > minimumDuration ? Int((seconds * 1000).rounded()) : nil
    }
}

/// Recordings already queued in the outbox whose words are still to be worked out on the phone. Kept on disk: a
/// recording stopped from the Lock Screen is transcribed in the little time the app has in the background, and
/// what did not finish then is finished the next time the app runs.
nonisolated struct TranscriptionQueue: Codable, Equatable, Sendable {
    nonisolated struct Item: Codable, Equatable, Sendable {
        /// The capture's outbox item id (`OutboxOp.captureItemId`), which the words are sent with.
        var captureItemId: String
        /// The copy the transcriber reads, a file name in the queue's folder.
        var file: String
        var queuedAt: Date
        var attempts: Int = 0
    }

    /// After this many failed tries the words are given up on: the recording went without them, and the server
    /// names it "Voice note".
    static let maxAttempts = 3

    private(set) var items: [Item] = []

    init() {}

    var isEmpty: Bool { items.isEmpty }

    mutating func add(captureItemId: String, file: String, at date: Date) {
        items.removeAll { $0.captureItemId == captureItemId }
        items.append(Item(captureItemId: captureItemId, file: file, queuedAt: date))
    }

    /// The oldest one to try next.
    var next: Item? { items.first }

    /// Its words went to the outbox.
    mutating func finished(_ captureItemId: String) {
        items.removeAll { $0.captureItemId == captureItemId }
    }

    /// A try failed. Answers true when it was the last one and the item is dropped.
    @discardableResult
    mutating func failed(_ captureItemId: String) -> Bool {
        guard let index = items.firstIndex(where: { $0.captureItemId == captureItemId }) else { return false }
        items[index].attempts += 1
        guard items[index].attempts >= Self.maxAttempts else {
            // Move it to the back so one bad file does not hold up the rest.
            items.append(items.remove(at: index))
            return false
        }
        items.remove(at: index)
        return true
    }

    /// Every file the queue still needs.
    var files: Set<String> { Set(items.map(\.file)) }
}
