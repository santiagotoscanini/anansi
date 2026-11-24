import Foundation
import HealthKit
import Observation

/// Apple Health → Anansi. Off until turned on in Settings (which asks for read access to sleep, activity, body and
/// heart). Then the last days' totals (Core/Health.swift) go to the server: when turned on (a month), when the app
/// launches or comes back, and when HealthKit wakes the app in the background with new samples (at most hourly),
/// never more often than every two hours. Nothing is written to Health.
@Observable
final class HealthSync {
    static let shared = HealthSync()

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private(set) var isEnabled: Bool
    private(set) var lastSent: Date?
    private(set) var lastError: String?
    private(set) var isSending = false

    @ObservationIgnored private let reader = HealthReader()
    @ObservationIgnored private var observing = false

    private static let enabledKey = "health.enabled"
    private static let lastSentKey = "health.lastSent"
    static let firstSendDays = 30
    static let resendDays = 7
    private static let minInterval: TimeInterval = 2 * 3600

    init() {
        isEnabled = UserDefaults.standard.bool(forKey: Self.enabledKey)
        lastSent = UserDefaults.standard.object(forKey: Self.lastSentKey) as? Date
    }

    /// Asks for access, then sends the last month.
    func enable() async {
        guard Self.isAvailable else { return }
        do {
            try await reader.requestAccess()
        } catch {
            lastError = error.localizedDescription
            return
        }
        isEnabled = true
        UserDefaults.standard.set(true, forKey: Self.enabledKey)
        startObserving()
        await send(days: Self.firstSendDays)
    }

    func disable() {
        isEnabled = false
        UserDefaults.standard.set(false, forKey: Self.enabledKey)
        observing = false
        let reader = reader
        Task { await reader.stopBackgroundDelivery() }
    }

    /// At launch: listen for new samples again (HealthKit only wakes an app that registers on every launch).
    func start() {
        guard isEnabled, Self.isAvailable else { return }
        startObserving()
        Task { await sendIfDue() }
    }

    func sendIfDue() async {
        guard isEnabled else { return }
        if let lastSent, Date.now.timeIntervalSince(lastSent) < Self.minInterval { return }
        await send(days: Self.resendDays)
    }

    func send(days count: Int) async {
        guard isEnabled, !isSending, Connection.shared.isConnected else { return }
        isSending = true
        defer { isSending = false }
        do {
            let days = try await reader.read(days: HealthMath.recentDays(count: count, today: .today()))
            let worth = days.filter { !$0.isEmpty }
            if !worth.isEmpty { try await APIClient.shared.data(API.sendHealthDays(worth), timeout: 60) }
            let now = Date.now
            lastSent = now
            UserDefaults.standard.set(now, forKey: Self.lastSentKey)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func startObserving() {
        guard !observing else { return }
        observing = true
        let reader = reader
        Task { await reader.observe() }
    }
}

/// The HealthKit side, off the main actor: HealthKit calls back on its own queues, and its results never cross to
/// the main actor (only `HealthDay`s do).
nonisolated final class HealthReader: @unchecked Sendable {
    private let store = HKHealthStore()

    // Computed, not stored: HealthKit's types are not all Sendable, and a static stored one would not compile.
    private static var quantities: [HKQuantityTypeIdentifier] {
        [.stepCount, .activeEnergyBurned, .appleExerciseTime, .bodyMass, .bodyFatPercentage, .restingHeartRate,
         .heartRateVariabilitySDNN]
    }

    /// The samples whose arrival wakes the app: the day's movement, the night, a weigh-in.
    private static var watched: [HKSampleType] {
        [HKQuantityType(.stepCount), HKCategoryType(.sleepAnalysis), HKQuantityType(.bodyMass), HKObjectType.workoutType()]
    }

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>(Self.quantities.map { HKQuantityType($0) })
        types.insert(HKCategoryType(.sleepAnalysis))
        types.insert(HKObjectType.workoutType())
        return types
    }

    @concurrent func requestAccess() async throws {
        try await store.requestAuthorization(toShare: Set<HKSampleType>(), read: readTypes)
    }

    @concurrent func stopBackgroundDelivery() async {
        try? await store.disableAllBackgroundDelivery()
    }

    @concurrent func observe() async {
        for type in Self.watched {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                let done = Completion(call: completion)
                guard error == nil else {
                    done.call()
                    return
                }
                Task { @MainActor in
                    await HealthSync.shared.sendIfDue()
                    done.call()
                }
            }
            store.execute(query)
            try? await store.enableBackgroundDelivery(for: type, frequency: .hourly)
        }
    }

    /// Each of `days` (oldest first), from the start of the first to now.
    @concurrent func read(days: [LocalDay]) async throws -> [HealthDay] {
        let calendar = Calendar.current
        guard let first = days.first else { return [] }
        let start = calendar.startOfDay(for: first.date(in: calendar))
        let end = Date.now
        var out = Dictionary(uniqueKeysWithValues: days.map { ($0, HealthDay(day: $0)) })
        let range = HKQuery.predicateForSamples(withStart: start, end: end)

        func daily(_ id: HKQuantityTypeIdentifier, _ options: HKStatisticsOptions) async throws -> [(LocalDay, HKStatistics)] {
            let descriptor = HKStatisticsCollectionQueryDescriptor(
                predicate: .quantitySample(type: HKQuantityType(id), predicate: range),
                options: options,
                anchorDate: start,
                intervalComponents: DateComponents(day: 1)
            )
            let collection = try await descriptor.result(for: store)
            return collection.statistics().map { (LocalDay(date: $0.startDate, calendar: calendar), $0) }
        }

        let perMinute = HKUnit.count().unitDivided(by: .minute())
        for (day, s) in try await daily(.stepCount, .cumulativeSum) {
            out[day]?.steps = s.sumQuantity().map { Int($0.doubleValue(for: .count()).rounded()) }
        }
        for (day, s) in try await daily(.activeEnergyBurned, .cumulativeSum) {
            out[day]?.activeEnergyKcal = s.sumQuantity().map { Int($0.doubleValue(for: .kilocalorie()).rounded()) }
        }
        for (day, s) in try await daily(.appleExerciseTime, .cumulativeSum) {
            out[day]?.exerciseMinutes = s.sumQuantity().map { Int($0.doubleValue(for: .minute()).rounded()) }
        }
        for (day, s) in try await daily(.bodyMass, .mostRecent) {
            out[day]?.weightKg = s.mostRecentQuantity().map { Self.round($0.doubleValue(for: .gramUnit(with: .kilo)), 1) }
        }
        for (day, s) in try await daily(.bodyFatPercentage, .mostRecent) {
            out[day]?.bodyFatPercent = s.mostRecentQuantity().map { Self.round($0.doubleValue(for: .percent()) * 100, 1) }
        }
        for (day, s) in try await daily(.restingHeartRate, .discreteAverage) {
            out[day]?.restingHeartRate = s.averageQuantity().map { Self.round($0.doubleValue(for: perMinute), 0) }
        }
        for (day, s) in try await daily(.heartRateVariabilitySDNN, .discreteAverage) {
            out[day]?.hrvMs = s.averageQuantity().map { Self.round($0.doubleValue(for: .secondUnit(with: .milli)), 0) }
        }

        // Sleep: from the evening before the first day, so its night is whole.
        let sleepRange = HKQuery.predicateForSamples(withStart: start.addingTimeInterval(-86_400), end: end)
        let sleep = try await HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: sleepRange)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        ).result(for: store)
        let asleepValues = Set(HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue))
        let asleep = sleep.filter { asleepValues.contains($0.value) }.map { HealthMath.Interval(start: $0.startDate, end: $0.endDate) }
        for (day, night) in HealthMath.nights(asleep: asleep, calendar: calendar) where out[day] != nil {
            out[day]?.sleepMinutes = night.minutes
            out[day]?.bedtime = HealthMath.iso(night.bedtime)
            out[day]?.wakeTime = HealthMath.iso(night.wake)
        }

        let workouts = try await HKSampleQueryDescriptor(
            predicates: [.workout(range)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        ).result(for: store)
        for workout in workouts {
            let day = LocalDay(date: workout.startDate, calendar: calendar)
            guard out[day] != nil else { continue }
            let energy = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()
            let entry = HealthDay.Workout(
                type: Self.name(workout.workoutActivityType),
                minutes: Int((workout.duration / 60).rounded()),
                energyKcal: energy.map { Int($0.doubleValue(for: .kilocalorie()).rounded()) }
            )
            let earlier = out[day]?.workouts ?? []
            out[day]?.workouts = earlier + [entry]
        }

        return days.compactMap { out[$0] }
    }

    private static func round(_ value: Double, _ places: Int) -> Double {
        let factor = pow(10, Double(places))
        return (value * factor).rounded() / factor
    }

    private static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "running"
        case .walking: "walking"
        case .hiking: "hiking"
        case .cycling: "cycling"
        case .swimming: "swimming"
        case .rowing: "rowing"
        case .elliptical: "elliptical"
        case .yoga: "yoga"
        case .pilates: "pilates"
        case .functionalStrengthTraining, .traditionalStrengthTraining: "strength"
        case .highIntensityIntervalTraining: "hiit"
        case .coreTraining: "core"
        case .soccer: "soccer"
        case .tennis: "tennis"
        case .climbing: "climbing"
        case .boxing, .kickboxing, .martialArts: "combat"
        case .socialDance, .cardioDance: "dance"
        case .mindAndBody: "mind and body"
        default: "other"
        }
    }
}

/// HealthKit's "done with this update" callback, carried into the task that does the work.
private nonisolated struct Completion: @unchecked Sendable {
    let call: () -> Void
}
