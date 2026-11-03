import SwiftUI

/// The weekly sync, one week at a time: grouped by goal as on the web, back and forth between weeks, start a
/// week from the default items, add an item from the library, take one off this week, change the order.
struct WeekView: View {
    @State private var week: LocalDay
    @State private var data = SyncData.shared
    @State private var outbox = OutboxStore.shared
    @State private var isAdding = false
    @State private var isReordering = false
    @State private var isStarting = false
    @State private var toRemove: SyncItem?
    @State private var actionError: String?

    init(initialWeek: LocalDay) {
        _week = State(initialValue: initialWeek.weekStart)
    }

    private var today: LocalDay { .today() }
    private var retro: WeeklyRetro? { data.weeks[week] }

    var body: some View {
        List {
            Section {
                header
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))

            if let error = data.weekErrors[week] {
                Section {
                    ProblemCard(message: "Couldn't load this week: \(error)") { Task { await data.refreshWeek(week) } }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let retro {
                if retro.weeklySync == nil {
                    Section { notStarted }
                        .listRowBackground(Color.clear)
                } else if retro.orderedItems.isEmpty {
                    Section {
                        EmptyPage(title: "No items on this sync yet",
                                  message: "Add tracking items with +, or set default items in Sync setup.")
                    }
                    .listRowBackground(Color.clear)
                } else if isReordering {
                    Section {
                        ForEach(retro.orderedItems) { item in
                            Text(item.title).font(AN.text(.body))
                        }
                        .onMove { from, to in move(retro.orderedItems, from: from, to: to) }
                    } header: {
                        Eyebrow(text: "Drag to set this week's order")
                    }
                    .anansiRow()
                } else {
                    ForEach(retro.goals) { group in
                        Section {
                            ForEach(group.items) { row($0) }
                        } header: {
                            goalHeader(group.title, importance: group.importance)
                        }
                        .anansiRow()
                    }
                    if !retro.unscopedItems.isEmpty {
                        Section {
                            ForEach(retro.unscopedItems) { row($0) }
                        } header: {
                            goalHeader("Unscoped", importance: nil)
                        }
                        .anansiRow()
                    }
                }
            } else if data.loadingWeeks.contains(week) {
                Section {
                    HStack { Spacer(); ProgressView("Loading…"); Spacer() }
                }
                .listRowBackground(Color.clear)
            }
        }
        .environment(\.editMode, .constant(isReordering ? .active : .inactive))
        .anansiList()
        .refreshable {
            outbox.kick()
            await data.refreshWeek(week)
        }
        .navigationTitle("Weekly sync")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            if retro?.weeklySync != nil, !(retro?.orderedItems.isEmpty ?? true) {
                ToolbarItem(placement: .secondaryAction) {
                    Button(isReordering ? "Done ordering" : "Change order", systemImage: "arrow.up.arrow.down") {
                        withAnimation { isReordering.toggle() }
                    }
                }
            }
            if retro?.weeklySync != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add item", systemImage: "plus") { isAdding = true }
                }
            }
        }
        .task(id: week) { await data.refreshWeek(week) }
        .sheet(isPresented: $isAdding) {
            AddToWeekSheet(week: week)
        }
        .confirmationDialog("Remove \"\(toRemove?.title ?? "")\" from this sync?",
                            isPresented: .init(get: { toRemove != nil }, set: { if !$0 { toRemove = nil } }),
                            titleVisibility: .visible) {
            Button("Remove from this week", role: .destructive) {
                if let item = toRemove { Task { await remove(item) } }
                toRemove = nil
            }
        } message: {
            Text("Its notes and pictures for this week are deleted. It stays in your library.")
        }
        .alert("Something went wrong", isPresented: .init(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") {}
        } message: {
            Text(actionError ?? "")
        }
    }

    // MARK: Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Sync · weekly retrospective")
            Text("The weekly \(Text("sync.").italic().foregroundStyle(AN.clay))")
                .font(AN.display(.largeTitle))
                .foregroundStyle(AN.ink)
            HStack(spacing: 12) {
                Button("Previous week", systemImage: "chevron.left") { week = week.adding(weeks: -1) }
                    .labelStyle(.iconOnly)
                VStack(spacing: 2) {
                    Text(Wording.weekOf(week, currentYear: today.year)).font(AN.display(.title3)).foregroundStyle(AN.ink)
                    Text("\(Wording.weekRange(week)) · \(Wording.weekDistance(from: today, to: week))")
                        .font(AN.mono(.caption2))
                        .foregroundStyle(week == today.weekStart ? AN.clay : AN.ink3)
                }
                .frame(maxWidth: .infinity)
                Button("Next week", systemImage: "chevron.right") { week = week.adding(weeks: 1) }
                    .labelStyle(.iconOnly)
                    .disabled(week >= today.weekStart)
            }
            .font(.title3)
            .padding(.vertical, 6)
            .buttonStyle(.borderless)
            if let retro, retro.weeklySync != nil {
                let items = retro.orderedItems
                let filled = items.filter { outbox.outbox.isFilled($0) }.count
                if !items.isEmpty {
                    ProgressRule(fraction: Double(filled) / Double(items.count))
                    Text(Wording.filled(filled, of: items.count)).font(AN.mono(.caption)).foregroundStyle(AN.ink3)
                }
            }
            if week != today.weekStart {
                Button("Back to this week") { week = today.weekStart }
                    .font(AN.ui(.footnote))
                    .buttonStyle(.borderless)
            }
        }
    }

    private var notStarted: some View {
        VStack(spacing: 12) {
            EmptyPage(title: "No sync for this week",
                      message: "Start a weekly sync to track your goal progress for this week. It starts with your default items.")
            Button {
                Task { await start() }
            } label: {
                if isStarting { ProgressView().tint(AN.onClay) } else { Text("Start weekly sync") }
            }
            .buttonStyle(.anansiPrimary)
            .disabled(isStarting)
        }
        .padding(.vertical, 4)
    }

    private func goalHeader(_ title: String, importance: String?) -> some View {
        HStack {
            Text(title).font(AN.display(.headline)).foregroundStyle(AN.ink2).textCase(nil)
            Spacer()
            if let importance {
                Tag(text: importance, tone: importance == "High" ? .accent : importance == "Medium" ? .warn : .plain)
            }
        }
    }

    private func row(_ item: SyncItem) -> some View {
        let shown = outbox.outbox.overlay(item)
        let filled = outbox.outbox.isFilled(item)
        let pictures = item.attachments.count + outbox.outbox.pendingUploads(for: item.id).count
        return NavigationLink(value: ItemRoute(id: item.id)) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: filled ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(filled ? AN.moss : AN.ink4)
                VStack(alignment: .leading, spacing: 3) {
                    Text(shown.title).font(AN.text(.body)).foregroundStyle(AN.ink)
                    if let text = shown.textContent?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                        Text(text).font(AN.text(.footnote)).foregroundStyle(AN.ink3).lineLimit(2)
                    }
                    if pictures > 0 {
                        Label("\(pictures)", systemImage: "photo").font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                    }
                }
            }
            .padding(.vertical, 2)
        }
        .swipeActions {
            Button("Remove", systemImage: "minus.circle", role: .destructive) { toRemove = item }
        }
    }

    // MARK: Actions

    private func start() async {
        isStarting = true
        defer { isStarting = false }
        do {
            try await data.startWeek(week)
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func remove(_ item: SyncItem) async {
        do {
            try await data.remove(item, from: week)
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func move(_ items: [SyncItem], from: IndexSet, to: Int) {
        var ids = items.map(\.id)
        ids.move(fromOffsets: from, toOffset: to)
        Task {
            do {
                try await data.reorder(week, orderedIds: ids)
            } catch {
                actionError = error.localizedDescription
            }
        }
    }
}

/// Adds library items to one week (only that week; the defaults are in Sync setup), or a new item made here.
struct AddToWeekSheet: View {
    let week: LocalDay
    @State private var data = SyncData.shared
    @State private var adding: Set<String> = []
    @State private var error: String?
    @State private var isCreating = false
    @Environment(\.dismiss) private var dismiss

    private var addable: [LibraryEntry] { data.weeks[week]?.addable ?? [] }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Pulls from your tracking-items library. Items added here only affect this week.")
                        .font(AN.text(.footnote))
                        .foregroundStyle(AN.ink3)
                        .listRowBackground(Color.clear)
                }
                if let error {
                    Section { Text(error).foregroundStyle(AN.rust) }.anansiRow()
                }
                Section {
                    if addable.isEmpty {
                        Text("Nothing to add: every library item is on this week.")
                            .font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
                    }
                    ForEach(addable) { entry in
                        Button {
                            Task { await add(entry) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.title).font(AN.text(.body)).foregroundStyle(AN.ink)
                                    Text(entry.goalTitle ?? "Unscoped").font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                                }
                                Spacer()
                                if adding.contains(entry.id) {
                                    ProgressView()
                                } else {
                                    Image(systemName: "plus.circle").foregroundStyle(AN.clay)
                                }
                            }
                        }
                        .disabled(adding.contains(entry.id))
                    }
                } header: {
                    Eyebrow(text: "Library")
                }
                .anansiRow()
                Section {
                    Button("New tracking item", systemImage: "square.and.pencil") { isCreating = true }
                }
                .anansiRow()
            }
            .anansiList()
            .navigationTitle("Add to this sync")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $isCreating) {
                TrackingItemEditor(item: nil) { created in
                    guard let syncId = data.weeks[week]?.weeklySync?.id else { return }
                    try await APIClient.shared.addSyncItem(weeklySyncId: syncId, trackingItemId: created.id)
                    await data.refreshWeek(week)
                    if week == LocalDay.today().weekStart { await data.refreshPulse() }
                }
            }
        }
    }

    private func add(_ entry: LibraryEntry) async {
        adding.insert(entry.id)
        defer { adding.remove(entry.id) }
        do {
            try await data.add(entry, to: week)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
