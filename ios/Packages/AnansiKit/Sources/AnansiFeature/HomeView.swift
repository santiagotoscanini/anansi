import SwiftUI

struct ItemRoute: Hashable { var id: String }
struct WeekRoute: Hashable { var weekStart: LocalDay }
struct SetupRoute: Hashable {}

/// Pulse, the home screen: this week's sync to fill (notes and pictures), what's coming, the horizons, and the
/// people who need a decision. Pull down to refresh; the app also asks Anansi when it comes forward and after
/// the outbox lands something.
struct HomeView: View {
    @State private var connection = Connection.shared
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
                    if connection.isConnected {
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
                if connection.isConnected {
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
        .onChange(of: connection.isConnected) { _, connected in
            if connected {
                outbox.resume()
                Task { await refresh() }
            } else {
                data.clear()
            }
        }
        .onOpenURL { url in
            guard let link = ConnectLink(url) else { return }
            Task { await connection.connect(link) }
        }
    }

    private func refresh() async {
        guard connection.isConnected else { return }
        outbox.kick()
        await data.refreshPulse()
        await LibraryStore.shared.load()
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

/// Shown on Pulse until the phone is connected (or when its key was revoked).
struct ConnectCard: View {
    @State private var connection = Connection.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WebMark(size: 40)
            Text("Connect this phone").font(AN.display(.title2)).foregroundStyle(AN.ink)
            Text("On Anansi on the web, open your profile, then Devices, and create a key for this phone. Scan its QR code here (or with the iPhone camera), or open its link on the phone.")
                .font(AN.text(.body))
                .foregroundStyle(AN.ink2)
            ConnectButtons()
        }
        .anansiCard(padding: 20)
    }
}

/// "Scan the QR code" and "Enter a key", with the connection's error in place.
struct ConnectButtons: View {
    @State private var connection = Connection.shared
    @State private var isScanning = false
    @State private var isEntering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                isScanning = true
            } label: {
                if connection.isConnecting {
                    ProgressView().tint(AN.onClay)
                } else {
                    Label("Scan the QR code", systemImage: "qrcode.viewfinder")
                }
            }
            .buttonStyle(.anansiPrimary)
            .disabled(connection.isConnecting)
            Button("Enter a key instead") { isEntering = true }
                .buttonStyle(.anansiOutline)
            if let error = connection.lastError {
                Text(error).font(AN.text(.footnote)).foregroundStyle(AN.rust)
            }
        }
        .fullScreenCover(isPresented: $isScanning) {
            QRScannerView { link in
                isScanning = false
                Task { await connection.connect(link) }
            } onCancel: {
                isScanning = false
            }
        }
        .sheet(isPresented: $isEntering) {
            EnterKeyView()
        }
    }
}

/// Server and key typed or pasted by hand.
struct EnterKeyView: View {
    @State private var connection = Connection.shared
    @State private var server = Connection.shared.server?.absoluteString ?? Connection.defaultServer
    @State private var key = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://anansi.example.com", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Eyebrow(text: "Server")
                }
                .anansiRow()
                Section {
                    TextField("ank_…", text: $key)
                        .font(AN.mono(.body))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    // PasteButton reads the clipboard only when tapped, so iOS doesn't ask on every redraw.
                    PasteButton(payloadType: String.self) { strings in
                        if let first = strings.first { key = first.trimmingCharacters(in: .whitespacesAndNewlines) }
                    }
                } header: {
                    Eyebrow(text: "Key")
                } footer: {
                    Text("Create it on the web: your profile, then Devices. It is shown once.")
                }
                .anansiRow()
                if let error = connection.lastError {
                    Section { Text(error).foregroundStyle(AN.rust) }.anansiRow()
                }
            }
            .anansiList()
            .navigationTitle("Connect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if connection.isConnecting {
                        ProgressView()
                    } else {
                        Button("Connect") {
                            Task {
                                guard let url = API.parseServer(server) else { return }
                                if await connection.connect(server: url, key: key) { dismiss() }
                            }
                        }
                        .disabled(API.parseServer(server) == nil || !API.isKey(key))
                    }
                }
            }
        }
    }
}
