import SwiftUI

/// The app's one product. The app target embeds `AnansiApp.rootView` and forwards launch.
public enum AnansiApp {
    /// Pulse: this week's sync to fill, what's coming, what needs attention.
    public static var rootView: some View { HomeView() }

    /// Starts sending whatever the outbox kept from the last run (notes and pictures not yet confirmed).
    public static func didFinishLaunching() {
        OutboxStore.shared.resume()
    }
}
