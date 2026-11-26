import SwiftUI

/// The app's root: a tab bar with Pulse first (the most used, and where the app opens), then Life, Goals, Journal
/// and the Inbox. Each tab keeps its own navigation; every screen can push any of the app's routes
/// (`anansiDestinations`).
///
/// The recorder takes the whole screen while it is open (the Action Button, Siri, the mic buttons), instead of
/// being presented over it: a presentation fails silently when another sheet is already up somewhere, which left
/// the Action Button opening the app without recording. The tabs and their navigation come back after.
struct MainTabs: View {
    enum Pane: Hashable { case pulse, life, goals, journal, inbox }

    @State private var captures = CaptureStore.shared
    @State private var connection = Connection.shared
    @State private var pane: Pane = .pulse
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if let request = captures.recording {
            RecorderView(request: request)
                .id(request.id)
        } else {
            tabs
        }
    }

    private var tabs: some View {
        TabView(selection: $pane) {
            SwiftUI.Tab("Pulse", systemImage: "waveform.path.ecg", value: Pane.pulse) {
                HomeView()
            }
            SwiftUI.Tab("Life", systemImage: "hourglass", value: Pane.life) {
                TabStack { LifeScreen() }
            }
            SwiftUI.Tab("Goals", systemImage: "target", value: Pane.goals) {
                TabStack { GoalsScreen() }
            }
            SwiftUI.Tab("Journal", systemImage: "book.closed", value: Pane.journal) {
                TabStack { JournalDayView(initialDay: LocalDay.today()) }
            }
            SwiftUI.Tab("Inbox", systemImage: "tray", value: Pane.inbox) {
                TabStack { InboxView() }
            }
        }
        .tint(AN.clay)
        .tabBarMinimizeBehavior(.onScrollDown)
        .task(id: scenePhase) {
            guard scenePhase == .active, connection.isConnected else { return }
            // Pulse refreshes itself; the other tabs' data is read again when the app comes forward.
            async let life: Void = LifeStore.shared.load()
            async let goals: Void = GoalsStore.shared.load()
            _ = await (life, goals)
        }
        .onChange(of: connection.isConnected) { _, connected in
            if !connected {
                LifeStore.shared.clear()
                GoalsStore.shared.clear()
            }
        }
    }
}

/// A tab's navigation, with every route the app knows, and the connect card in place of the screen until the
/// phone is connected.
private struct TabStack<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @State private var connection = Connection.shared

    var body: some View {
        NavigationStack {
            Group {
                if connection.isConnected {
                    content()
                } else {
                    ScrollView {
                        ConnectCard().padding()
                    }
                    .anansiScreen()
                }
            }
            .anansiDestinations()
        }
    }
}

extension View {
    /// Every screen the app can push, so a link works whichever tab it is in.
    func anansiDestinations() -> some View {
        self
            .navigationDestination(for: ItemRoute.self) { route in SyncItemView(itemId: route.id) }
            .navigationDestination(for: WeekRoute.self) { route in WeekView(initialWeek: route.weekStart) }
            .navigationDestination(for: JournalRoute.self) { route in JournalDayView(initialDay: route.day) }
            .navigationDestination(for: JournalListRoute.self) { _ in JournalListView() }
            .navigationDestination(for: InboxRoute.self) { _ in InboxView() }
            .navigationDestination(for: SetupRoute.self) { _ in SetupView() }
            .navigationDestination(for: OverTimeListRoute.self) { _ in OverTimeListView() }
            .navigationDestination(for: OverTimeRoute.self) { route in
                OverTimeView(trackingItemId: route.trackingItemId, title: route.title)
            }
            .navigationDestination(for: GoalRoute.self) { route in GoalDetailView(goalId: route.id) }
    }
}
