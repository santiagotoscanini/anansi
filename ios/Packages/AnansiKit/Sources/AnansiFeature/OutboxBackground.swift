import BackgroundTasks
import Foundation
import Network

/// Getting the outbox out when the app is not in front. A thought captured offline waits on disk (`OutboxStore`);
/// without this it would go only the next time the app ran. Three things wake the queue:
///   - the network coming back while the app is still alive (`NWPathMonitor`);
///   - an app refresh the system grants now and then (`BGAppRefreshTask`, about every 15 minutes at the earliest);
///   - a processing task the system runs once there is a network (`BGProcessingTask`, `requiresNetworkConnectivity`).
/// Both tasks are asked for whenever something is left in the queue, and each sends until the queue is empty or the
/// system takes the time back. The identifiers are listed in `BGTaskSchedulerPermittedIdentifiers` (Info.plist).
enum OutboxBackground {
    static let refreshId = "com.santiagotoscanini.anansi.outbox.refresh"
    static let processingId = "com.santiagotoscanini.anansi.outbox.send"

    private static let monitor = NWPathMonitor()

    /// At launch, before it finishes (the system requires the handlers by then).
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { @Sendable task in
            run(TaskBox(task: task))
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: processingId, using: nil) { @Sendable task in
            run(TaskBox(task: task))
        }
        monitor.pathUpdateHandler = { @Sendable path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in OutboxStore.shared.kick() }
        }
        monitor.start(queue: DispatchQueue(label: "anansi.outbox.network"))
    }

    /// Asks the system for a chance to send later. Cheap, and replaces an earlier request with the same id.
    static func schedule() {
        let refresh = BGAppRefreshTaskRequest(identifier: refreshId)
        refresh.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        // The answer only says whether the system took it; nothing to do either way.
        BGTaskScheduler.shared.submitTaskRequest(refresh) { @Sendable _ in }
        let processing = BGProcessingTaskRequest(identifier: processingId)
        processing.requiresNetworkConnectivity = true
        processing.requiresExternalPower = false
        BGTaskScheduler.shared.submitTaskRequest(processing) { @Sendable _ in }
    }

    /// Sends until the queue is empty or the system says stop, then asks again if anything is left.
    nonisolated private static func run(_ box: TaskBox) {
        let work = Task { @MainActor in
            let store = OutboxStore.shared
            store.kick()
            while !store.outbox.pending.isEmpty, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                // Past a backoff: try again rather than wait it out in the little time there is.
                if !store.isSending { store.kick() }
            }
            let done = store.outbox.pending.isEmpty
            if !done { schedule() }
            box.task.setTaskCompleted(success: done)
        }
        box.task.expirationHandler = { @Sendable in work.cancel() }
    }
}

/// A `BGTask` carried into the main actor's task (it is not Sendable; it is only completed once, from there).
private nonisolated struct TaskBox: @unchecked Sendable {
    let task: BGTask
}
