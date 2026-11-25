import SwiftUI
import WatchKit

// The Apple Watch app: one screen with one button that records a voice note and sends it to Anansi. Started from
// the watch face (the complication, AnansiWatchWidgets), the Ultra's Action Button (the "Record a thought"
// shortcut), Siri, or the app itself; a second press stops it. How a note reaches the server without ever being
// lost is `WatchLink` (CaptureCore): the watch uploads it itself and hands it to the phone, and deletes it only once
// the server has it.

@main
struct AnansiWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RecordView()
        }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        // Notes a crash or a dead battery cut off are made whole and queued before anything records.
        NoteStore.shared.recoverLeftovers()
        PhoneLink.shared.start()
        DirectUpload.shared.uploadAll()
    }

    func applicationDidBecomeActive() {
        WatchRecorder.shared.becameActive()
        Delivery.deliver()
    }

    /// The system wakes the app for its uploads' answers and for the phone's messages; each task is completed once
    /// its work is done (or the system takes the app's time away).
    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            switch task {
            case let upload as WKURLSessionRefreshBackgroundTask:
                DirectUpload.shared.attach(upload)
            case let link as WKWatchConnectivityRefreshBackgroundTask:
                PhoneLink.shared.attach(link)
            default:
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}

/// Both ways a note travels, started together.
enum Delivery {
    static func deliver() {
        PhoneLink.shared.handOver()
        DirectUpload.shared.uploadAll()
    }
}
