import Observation
import SwiftUI

/// The library of tracking items and the default template ("default items"): what every new week starts with.
/// The web keeps one default per user and hides the rest of the template machinery; so does the phone.
@Observable
final class SetupStore {
    static let shared = SetupStore()

    private(set) var items: [TrackingItem] = []
    private(set) var templates: [SyncTemplate] = []
    private(set) var goals: [GoalSummary] = []
    private(set) var error: String?
    private(set) var isLoading = false
    private(set) var hasLoaded = false

    private var client: MCPClient { .shared }

    var defaultTemplate: SyncTemplate? { templates.first(where: \.isDefault) }

    /// Default items in order, leaving out any no longer in the active library.
    var defaultItems: [TrackingItem] {
        (defaultTemplate?.orderedTrackingItemIds ?? []).compactMap { id in items.first(where: { $0.id == id }) }
    }

    var notInDefaults: [TrackingItem] {
        let defaults = Set(defaultItems.map(\.id))
        return items.filter { !defaults.contains($0.id) }
    }

    func isDefault(_ item: TrackingItem) -> Bool {
        defaultTemplate?.items.contains(where: { $0.trackingItemId == item.id }) ?? false
    }

    func goalTitle(_ goalId: String?) -> String? {
        guard let goalId else { return nil }
        return goals.first(where: { $0.id == goalId })?.title
    }

    func load() async {
        guard AuthStore.shared.isSignedIn else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let items = client.trackingItems()
            async let templates = client.syncTemplates()
            async let goals = client.goals()
            let (loadedItems, loadedTemplates, loadedGoals) = try await (items, templates, goals)
            self.items = loadedItems
            self.templates = loadedTemplates
            self.goals = loadedGoals
            error = nil
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Default items

    /// Replaces the default items (creating the default template the first time).
    func setDefaults(_ ids: [String]) async throws {
        let template: SyncTemplate
        if let existing = defaultTemplate {
            template = existing
        } else {
            template = try await client.createDefaultTemplate(name: "Default")
        }
        try await client.setTemplateItems(templateId: template.id, trackingItemIds: ids)
        templates = try await client.syncTemplates()
    }

    func addToDefaults(_ item: TrackingItem) async throws {
        try await setDefaults(defaultItems.map(\.id) + [item.id])
    }

    func removeFromDefaults(_ item: TrackingItem) async throws {
        try await setDefaults(defaultItems.map(\.id).filter { $0 != item.id })
    }

    func moveDefaults(from: IndexSet, to: Int) async throws {
        var ids = defaultItems.map(\.id)
        ids.move(fromOffsets: from, toOffset: to)
        try await setDefaults(ids)
    }

    // MARK: Library

    @discardableResult
    func create(title: String, description: String?, goalId: String?) async throws -> TrackingItem {
        let created = try await client.createTrackingItem(title: title, description: description, goalId: goalId)
        await load()
        return created
    }

    func update(_ item: TrackingItem, title: String, description: String?, goalId: String?) async throws {
        try await client.updateTrackingItem(id: item.id, title: title, description: description, goalId: goalId)
        await load()
    }

    func delete(_ item: TrackingItem) async throws {
        try await client.deleteTrackingItem(item.id)
        await load()
    }
}

struct SetupView: View {
    @State private var store = SetupStore.shared
    @State private var isOrdering = false
    @State private var editing: TrackingItem?
    @State private var isCreating = false
    @State private var toDelete: TrackingItem?
    @State private var actionError: String?
    @State private var busy = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow(text: "Sync · setup")
                    Text("The \(Text("questions").italic().foregroundStyle(AN.clay)) you ask yourself.")
                        .font(AN.display(.largeTitle))
                        .foregroundStyle(AN.ink)
                    Text("Your library of prompts. Each new weekly sync fills itself from the default items. Add and retire them as you change.")
                        .font(AN.text(.subheadline))
                        .italic()
                        .foregroundStyle(AN.ink3)
                }
            }
            .listRowBackground(Color.clear)

            if let error = store.error {
                Section {
                    ProblemCard(message: error) { Task { await store.load() } }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            defaultsSection
            librarySection
        }
        .environment(\.editMode, .constant(isOrdering ? .active : .inactive))
        .anansiList()
        .disabled(busy)
        .overlay {
            if store.isLoading && !store.hasLoaded { ProgressView("Loading…") }
        }
        .refreshable { await store.load() }
        .navigationTitle("Sync setup")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New item", systemImage: "plus") { isCreating = true }
            }
        }
        .task { await store.load() }
        .sheet(isPresented: $isCreating) {
            TrackingItemEditor(item: nil)
        }
        .sheet(item: $editing) { item in
            TrackingItemEditor(item: item)
        }
        .confirmationDialog("Delete \"\(toDelete?.title ?? "")\"?",
                            isPresented: .init(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }),
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let item = toDelete { run { try await store.delete(item) } }
                toDelete = nil
            }
        } message: {
            Text("An item that past weeks used is archived instead, so those weeks keep it.")
        }
        .alert("Something went wrong", isPresented: .init(get: { actionError != nil }, set: { if !$0 { actionError = nil } })) {
            Button("OK") {}
        } message: {
            Text(actionError ?? "")
        }
    }

    private var defaultsSection: some View {
        Section {
            if store.defaultItems.isEmpty, store.hasLoaded {
                Text("No default items yet. New weeks start empty.")
                    .font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
            }
            ForEach(store.defaultItems) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(AN.text(.body)).foregroundStyle(AN.ink)
                    Text(store.goalTitle(item.goalId) ?? "Unscoped").font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                }
                .swipeActions {
                    Button("Remove", systemImage: "minus.circle", role: .destructive) {
                        run { try await store.removeFromDefaults(item) }
                    }
                }
            }
            .onMove { from, to in run { try await store.moveDefaults(from: from, to: to) } }
            if !store.notInDefaults.isEmpty, !isOrdering {
                Menu {
                    ForEach(store.notInDefaults) { item in
                        Button(item.title) { run { try await store.addToDefaults(item) } }
                    }
                } label: {
                    Label("Add a default item", systemImage: "plus.circle")
                }
            }
        } header: {
            HStack {
                Eyebrow(text: "Default items")
                Spacer()
                if store.defaultItems.count > 1 {
                    Button(isOrdering ? "Done" : "Reorder") { withAnimation { isOrdering.toggle() } }
                        .font(AN.ui(.footnote))
                        .textCase(nil)
                }
            }
        } footer: {
            Text("Every new week starts with these, in this order. Weeks already started keep what they have; change those in Weekly sync.")
                .font(AN.text(.footnote))
        }
        .anansiRow()
    }

    private var librarySection: some View {
        Section {
            if store.items.isEmpty, store.hasLoaded {
                Text("No tracking items yet. Tap + to add one.")
                    .font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
            }
            ForEach(store.items) { item in
                Button {
                    editing = item
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(AN.text(.body)).foregroundStyle(AN.ink)
                            if let description = item.description, !description.isEmpty {
                                Text(description).font(AN.text(.footnote)).foregroundStyle(AN.ink3).lineLimit(2)
                            }
                            Text(store.goalTitle(item.goalId) ?? "Unscoped").font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                        }
                        Spacer()
                        if store.isDefault(item) { Tag(text: "Default", tone: .accent) }
                    }
                }
                .swipeActions {
                    Button("Delete", systemImage: "trash", role: .destructive) { toDelete = item }
                }
            }
        } header: {
            Eyebrow(text: "Library")
        }
        .anansiRow()
    }

    private func run(_ action: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            do {
                try await action()
            } catch {
                actionError = error.localizedDescription
            }
        }
    }
}

/// Create or edit a tracking item: title, an optional description, and the goal it tracks (or none).
struct TrackingItemEditor: View {
    let item: TrackingItem?
    var afterCreate: ((TrackingItem) async throws -> Void)?

    @State private var store = SetupStore.shared
    @State private var title = ""
    @State private var description = ""
    @State private var goalId: String?
    @State private var isSaving = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    init(item: TrackingItem?, afterCreate: ((TrackingItem) async throws -> Void)? = nil) {
        self.item = item
        self.afterCreate = afterCreate
        _title = State(initialValue: item?.title ?? "")
        _description = State(initialValue: item?.description ?? "")
        _goalId = State(initialValue: item?.goalId)
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title (e.g., Sleep, Journaling, Time with mom)", text: $title)
                        .font(AN.text(.body))
                    TextField("Optional description", text: $description, axis: .vertical)
                        .font(AN.text(.body))
                        .lineLimit(2...6)
                }
                .anansiRow()
                Section {
                    Picker("Goal", selection: $goalId) {
                        Text("Unscoped (no goal)").tag(String?.none)
                        ForEach(store.goals) { goal in
                            Text([goal.emoji, goal.title].compactMap { $0 }.joined(separator: " ")).tag(Optional(goal.id))
                        }
                    }
                } footer: {
                    Text("An item can track a goal, or stand on its own.")
                }
                .anansiRow()
                if let error {
                    Section { Text(error).foregroundStyle(AN.rust) }.anansiRow()
                }
            }
            .anansiList()
            .navigationTitle(item == nil ? "New item" : "Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button(item == nil ? "Create" : "Save") { Task { await save() } }
                            .disabled(trimmedTitle.isEmpty)
                    }
                }
            }
            .task {
                if store.goals.isEmpty { await store.load() }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let item {
                try await store.update(item, title: trimmedTitle, description: text.isEmpty ? nil : text, goalId: goalId)
            } else {
                let created = try await store.create(title: trimmedTitle, description: text.isEmpty ? nil : text, goalId: goalId)
                try await afterCreate?(created)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
