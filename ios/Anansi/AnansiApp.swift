import AppFeature
import SwiftUI

@main
struct AnansiApp: App {
    @UIApplicationDelegateAdaptor(AnansiAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
