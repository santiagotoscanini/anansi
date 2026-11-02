import AuthenticationServices
import SwiftUI

struct ItemRoute: Hashable { var id: String }
struct WeekRoute: Hashable { var weekStart: LocalDay }
struct SetupRoute: Hashable {}

/// Pulse, the home screen: this week's sync to fill (notes and pictures), what's coming, the horizons, and the
/// people who need a decision. Pull down to refresh; the app also asks Anansi when it comes forward and after
/// the outbox lands something.
struct HomeView: View {
    @State private var auth = AuthStore.shared
    @State private var data = SyncData.shared
    @State private var outbox = OutboxStore.shared
    @State private var path = NavigationPath()
    @State private var isShowingSettings = false
    @State private var isStarting = false
    @State private var startError: String?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    if auth.isSignedIn {
                        signedInContent
                    } else {
                        ConnectCard()
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
            .refreshable { await refresh() }
            .anansiScreen()
            .navigationTitle("Pulse")
            .navigationBarTitleDisplayMode(.inline)
            .anansiNavigationBar()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { isShowingSettings = true }
                }
                if auth.isSignedIn {
                    ToolbarItem(placement: .primaryAction) {
                        Menu("More", systemImage: "ellipsis.circle") {
                            Button("Weekly sync", systemImage: "calendar") {
                                path.append(WeekRoute(weekStart: LocalDay.today().weekStart))
                            }
                            Button("Sync setup", systemImage: "slider.horizontal.3") { path.append(SetupRoute()) }
                        }
                    }
                }
            }
            .navigationDestination(for: ItemRoute.self) { route in
                SyncItemView(itemId: route.id)
            }
            .navigationDestination(for: WeekRoute.self) { route in
                WeekView(initialWeek: route.weekStart)
            }
            .navigationDestination(for: SetupRoute.self) { _ in
                SetupView()
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsView()
            }
            .alert("Couldn't start the week", isPresented: .init(get: { startError != nil }, set: { if !$0 { startError = nil } })) {
                Button("OK") {}
            } message: {
                Text(startError ?? "")
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            outbox.kick()
            await refresh()
        }
        .task(id: outbox.landed) {
            // Re-read once the outbox goes quiet, not after every single op.
            guard outbox.landed > 0 else { return }
            do { try await Task.sleep(for: .seconds(1.5)) } catch { return }
            await data.refreshLoaded()
        }
        .onChange(of: auth.phase) { _, phase in
            switch phase {
            case .signedIn:
                outbox.resume()
                Task {
                    await refresh()
                    await auth.loadMe()
                }
            case .signedOut:
                data.clear()
            case .signingIn:
                break
            }
        }
    }

    private func refresh() async {
        guard auth.isSignedIn else { return }
        outbox.kick()
        await data.refreshPulse()
        if auth.me == nil { await auth.loadMe() }
    }

    // MARK: Header

    private var header: some View {
        let today = LocalDay.today()
        let hour = Calendar.current.component(.hour, from: .now)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                WebMark(size: 20)
                Eyebrow(text: "Pulse · \(Wording.weekOf(today.weekStart, currentYear: today.year))")
            }
            Text("\(Wording.greeting(hour: hour)), \(Text("this week.").italic().foregroundStyle(AN.clay))")
                .font(AN.display(.largeTitle))
                .foregroundStyle(AN.ink)
            Text("This week, in one place. Fill what's true.")
                .font(AN.text(.body))
                .italic()
                .foregroundStyle(AN.ink3)
            if let sync = data.pulse?.sync, sync.total > 0 {
                progress(sync)
            }
        }
        .padding(.top, 12)
    }

    private func progress(_ sync: PulseSync) -> some View {
        let filled = sync.items.filter { outbox.outbox.isFilled($0) }.count
        return VStack(alignment: .leading, spacing: 6) {
            ProgressRule(fraction: Double(filled) / Double(max(1, sync.total)))
            HStack {
                Text(Wording.filled(filled, of: sync.total))
                Spacer()
                Text("\(Wording.percent(filled, of: sync.total))%")
            }
            .font(AN.mono(.caption))
            .foregroundStyle(AN.ink3)
        }
        .padding(.top, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Wording.filled(filled, of: sync.total)) this week")
    }

    // MARK: Content

    @ViewBuilder
    private var signedInContent: some View {
        if let error = data.pulseError {
            ProblemCard(message: "Couldn't reach Anansi: \(error)") { Task { await refresh() } }
        }
        OutboxStatusView()
        weekSection
        if let pulse = data.pulse {
            if !pulse.upcoming.isEmpty { UpcomingSection(rows: pulse.upcoming) }
            if !pulse.horizons.isEmpty { HorizonSection(horizons: pulse.horizons) }
            if !pulse.attention.isEmpty { AttentionSection(rows: pulse.attention) }
        }
        footerLinks
    }

    @ViewBuilder
    private var weekSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "The week so far")
            if let pulse = data.pulse {
                if let sync = pulse.sync {
                    if sync.items.isEmpty {
                        EmptyPage(title: "Sync started, no items yet",
                                  message: "Add items in Weekly sync. Default items in Sync setup fill future weeks automatically.")
                            .anansiCard()
                    } else {
                        ForEach(sync.items) { item in
                            SyncItemCard(item: data.items[item.id] ?? item) {
                                path.append(ItemRoute(id: item.id))
                            }
                        }
                    }
                } else {
                    VStack(spacing: 12) {
                        EmptyPage(title: "No sync for this week yet",
                                  message: "Start the week to load your default items, or set them up in Sync setup first.")
                        Button {
                            Task { await startWeek() }
                        } label: {
                            if isStarting { ProgressView().tint(AN.onClay) } else { Text("Start this week") }
                        }
                        .buttonStyle(.anansiPrimary)
                        .disabled(isStarting)
                    }
                    .anansiCard()
                }
            } else if data.isLoadingPulse {
                HStack {
                    Spacer()
                    ProgressView("Loading…").font(AN.text(.subheadline))
                    Spacer()
                }
                .padding(.vertical, 24)
            }
        }
    }

    private var footerLinks: some View {
        HStack(spacing: 10) {
            Button {
                path.append(WeekRoute(weekStart: LocalDay.today().weekStart))
            } label: {
                Label("Weekly sync", systemImage: "calendar").frame(maxWidth: .infinity)
            }
            Button {
                path.append(SetupRoute())
            } label: {
                Label("Sync setup", systemImage: "slider.horizontal.3").frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.anansiOutline)
        .padding(.top, 4)
    }

    private func startWeek() async {
        isStarting = true
        defer { isStarting = false }
        do {
            try await data.startThisWeek()
        } catch {
            startError = error.localizedDescription
        }
    }
}

/// Sign in: shown on Pulse until the phone is connected.
struct ConnectCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WebMark(size: 40)
            Text("Connect this phone").font(AN.display(.title2)).foregroundStyle(AN.ink)
            Text("Sign in to Anansi to fill your weekly sync from here: notes, pictures from the camera or the library, and the default items every week starts with.")
                .font(AN.text(.body))
                .foregroundStyle(AN.ink2)
            SignInButton()
            Text("Server: \(AnansiSettings.server?.host() ?? AnansiSettings.serverString). Change it in Settings.")
                .font(AN.mono(.caption2))
                .foregroundStyle(AN.ink3)
        }
        .anansiCard(padding: 20)
    }
}

/// Runs the OAuth flow in the system browser sheet, showing its error in place.
struct SignInButton: View {
    @State private var auth = AuthStore.shared
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task {
                    await auth.signIn { url in
                        try await webAuthenticationSession.authenticate(using: url,
                                                                        callbackURLScheme: OAuth.callbackScheme,
                                                                        preferredBrowserSession: .shared)
                    }
                }
            } label: {
                if auth.phase == .signingIn {
                    ProgressView().tint(AN.onClay)
                } else {
                    Text("Sign in to Anansi")
                }
            }
            .buttonStyle(.anansiPrimary)
            .disabled(auth.phase == .signingIn)
            if let error = auth.lastError {
                Text(error).font(AN.text(.footnote)).foregroundStyle(AN.rust)
            }
        }
    }
}
