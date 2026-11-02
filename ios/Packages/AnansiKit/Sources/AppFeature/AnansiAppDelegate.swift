import AnansiFeature
import UIKit

/// App-level hooks the SwiftUI lifecycle doesn't cover. Install with `@UIApplicationDelegateAdaptor`.
public final class AnansiAppDelegate: NSObject, UIApplicationDelegate {
    override public init() { super.init() }

    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        AnansiApp.didFinishLaunching()
        return true
    }
}
