import AnansiFeature
import SwiftUI

/// The app's root: Anansi, directly. One product, no tab bar.
public struct RootView: View {
    public init() {}

    public var body: some View {
        AnansiApp.rootView
    }
}

#Preview {
    RootView()
}
