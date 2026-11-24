import Foundation

// Voice notes recorded without opening the app (the Action Button, the Control Center control): how long one may
// run and when it counts as recorded. The app side is `BackgroundRecorder.swift`; the Live Activity is
// ios/AnansiWidgets. The server transcribes the recording.

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
