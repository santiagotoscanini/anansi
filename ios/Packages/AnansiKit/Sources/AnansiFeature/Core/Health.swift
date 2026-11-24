import Foundation

// Apple Health, as the phone sends it: one row per calendar day of daily totals, never raw samples. The phone reads
// HealthKit (HealthSync.swift), builds these, and sends the last days again on every run (`PUT
// /api/v1/health/days`), so a late sample (a watch that synced in the morning) corrects the day it belongs to. The
// server keeps what the latest send says for a day. Its side is src/lib/health.ts (the same fields) and
// src/routes/api.v1.health.days.ts.

/// One day of Health data. A nil field means Health had nothing for it that day.
nonisolated struct HealthDay: Codable, Equatable, Sendable {
    var day: String
    // Sleep: the night that ended on this day.
    var sleepMinutes: Int?
    /// ISO 8601 instants, as strings so the JSON does not depend on an encoder's date strategy.
    var bedtime: String?
    var wakeTime: String?
    // Activity
    var steps: Int?
    var activeEnergyKcal: Int?
    var exerciseMinutes: Int?
    var workouts: [Workout]?
    // Body: the last reading of the day.
    var weightKg: Double?
    var bodyFatPercent: Double?
    // Heart: the day's average.
    var restingHeartRate: Double?
    var hrvMs: Double?

    struct Workout: Codable, Equatable, Sendable {
        var type: String
        var minutes: Int
        var energyKcal: Int?
    }

    init(day: LocalDay) { self.day = day.string }

    var isEmpty: Bool {
        sleepMinutes == nil && steps == nil && activeEnergyKcal == nil && exerciseMinutes == nil
            && (workouts ?? []).isEmpty && weightKg == nil && bodyFatPercent == nil && restingHeartRate == nil
            && hrvMs == nil
    }
}

nonisolated enum HealthMath {
    struct Interval: Equatable, Sendable {
        var start: Date
        var end: Date
    }

    struct Night: Equatable, Sendable {
        var minutes: Int
        var bedtime: Date
        var wake: Date
    }

    /// A gap shorter than this between two stretches of sleep keeps them one night (waking up at 3 am is not two
    /// nights); a longer one starts another sleep, such as an afternoon nap.
    static let nightGap: TimeInterval = 3 * 3600

    /// The nights in a set of asleep intervals, keyed by the day each ended on (the day you woke up). Several
    /// sources (phone, watch, a sleep app) overlap, so overlapping intervals are merged before minutes are counted.
    /// A day with more than one sleep (a night and a nap) counts them all; its bedtime is the earliest start and its
    /// wake time the latest end.
    static func nights(asleep: [Interval], calendar: Calendar) -> [LocalDay: Night] {
        let sorted = asleep.filter { $0.end > $0.start }.sorted { $0.start < $1.start }
        var merged: [Interval] = []
        for interval in sorted {
            if let last = merged.last, interval.start <= last.end {
                merged[merged.count - 1].end = max(last.end, interval.end)
            } else {
                merged.append(interval)
            }
        }
        // Sleeps: merged stretches joined across short wakes.
        var sleeps: [(asleep: TimeInterval, start: Date, end: Date)] = []
        for stretch in merged {
            let length = stretch.end.timeIntervalSince(stretch.start)
            if let last = sleeps.last, stretch.start.timeIntervalSince(last.end) < nightGap {
                sleeps[sleeps.count - 1] = (last.asleep + length, last.start, stretch.end)
            } else {
                sleeps.append((length, stretch.start, stretch.end))
            }
        }
        var out: [LocalDay: Night] = [:]
        for sleep in sleeps {
            let day = LocalDay(date: sleep.end, calendar: calendar)
            let minutes = Int((sleep.asleep / 60).rounded())
            if let night = out[day] {
                out[day] = Night(minutes: night.minutes + minutes, bedtime: min(night.bedtime, sleep.start),
                                 wake: max(night.wake, sleep.end))
            } else {
                out[day] = Night(minutes: minutes, bedtime: sleep.start, wake: sleep.end)
            }
        }
        return out
    }

    /// The days to send on a run: the last `count` days up to `today`, oldest first.
    static func recentDays(count: Int, today: LocalDay) -> [LocalDay] {
        (0..<max(count, 1)).reversed().map { today.adding(days: -$0) }
    }

    static func iso(_ date: Date) -> String {
        date.formatted(.iso8601)
    }
}
