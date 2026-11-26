import SwiftUI

struct GoalRoute: Hashable { var id: String }

/// Goals: every active goal with its progress (the web's engine, computed on the server), most important first.
/// A goal opens its tasks, which can be ticked from here; everything else is edited on the web.
struct GoalsScreen: View {
    @State private var store = GoalsStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        WebMark(size: 20)
                        Eyebrow(text: "Goals")
                    }
                    Text("What you're \(Text("working toward").italic().foregroundStyle(AN.clay))")
                        .font(AN.display(.largeTitle))
                        .foregroundStyle(AN.ink)
                }
                .padding(.top, 12)

                if let error = store.error {
                    ProblemCard(message: "Couldn't reach Anansi: \(error)") { Task { await store.load() } }
                }
                if !store.hasLoaded && store.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                } else if store.hasLoaded && store.goals.isEmpty {
                    EmptyPage(title: "No goals yet", message: "Goals are made on the web, in Objectives.").anansiCard()
                } else {
                    let ordered = GoalCard.ordered(store.goals)
                    ForEach(["High", "Medium", "Low"], id: \.self) { level in
                        let list = ordered.filter { $0.importance == level }
                        if !list.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Eyebrow(text: "\(level) importance · \(list.count)")
                                ForEach(list) { goal in
                                    NavigationLink(value: GoalRoute(id: goal.id)) { GoalRow(goal: goal) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .refreshable { await store.load() }
        .anansiScreen()
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .task { if !store.hasLoaded { await store.load() } }
    }
}

struct GoalRow: View {
    let goal: GoalCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if let glyph = goal.glyph { Text(glyph).font(.title3) }
                Text(goal.title).font(AN.display(.title3)).foregroundStyle(AN.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Text("\(goal.progress)%").font(AN.mono(.callout)).foregroundStyle(AN.ink2)
            }
            ProgressRule(fraction: Double(goal.progress) / 100)
            HStack(spacing: 8) {
                if !goal.tasks.isEmpty {
                    Text("\(goal.doneTasks.count) of \(goal.tasks.count) tasks").font(AN.mono(.caption)).foregroundStyle(AN.ink3)
                }
                ForEach(goal.chapters.prefix(2)) { chapter in
                    HStack(spacing: 4) {
                        Circle().fill(ChapterBadge.color(chapter.color)).frame(width: 6, height: 6)
                        Text(chapter.title).lineLimit(1)
                    }
                    .font(AN.mono(.caption2))
                    .foregroundStyle(AN.ink3)
                }
                Spacer(minLength: 0)
            }
        }
        .anansiCard()
    }
}

/// One goal: why, how far, which values and chapters, and its tasks to tick.
struct GoalDetailView: View {
    let goalId: String
    @State private var store = GoalsStore.shared
    @State private var showsDone = false

    var body: some View {
        ScrollView {
            if let goal = store.goal(goalId) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow(text: "\(goal.importance) importance")
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            if let glyph = goal.glyph { Text(glyph).font(.largeTitle) }
                            Text(goal.title).font(AN.display(.largeTitle)).foregroundStyle(AN.ink)
                        }
                        if !goal.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(goal.description).font(AN.text(.body)).foregroundStyle(AN.ink2)
                        }
                    }
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 6) {
                        ProgressRule(fraction: Double(goal.progress) / 100)
                        HStack {
                            Text("\(goal.progress)% overall")
                            Spacer()
                            Text("\(goal.ownProgress)% of its own tasks")
                        }
                        .font(AN.mono(.caption))
                        .foregroundStyle(AN.ink3)
                    }

                    if !goal.values.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(goal.values) { value in
                                    HStack(spacing: 5) {
                                        Circle().fill(ChapterBadge.color(value.color)).frame(width: 7, height: 7)
                                        Text(value.name)
                                    }
                                    .font(AN.ui(.footnote))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(AN.vellum, in: Capsule())
                                }
                            }
                        }
                    }

                    if !goal.chapters.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeading(title: "In your life")
                            ForEach(goal.chapters) { tag in
                                HStack(spacing: 10) {
                                    ChapterBadge(chapter: tag.chapter, size: 28)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(tag.title).font(AN.ui(.subheadline).weight(.medium)).foregroundStyle(AN.ink)
                                        Text(LifeRules.spanText(tag.chapter)).font(AN.mono(.caption)).foregroundStyle(AN.ink3)
                                    }
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        SectionHeading(title: "Tasks", count: goal.openTasks.count)
                        if goal.tasks.isEmpty {
                            Text("No tasks yet.").font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
                        }
                        ForEach(goal.openTasks) { task in
                            TaskRow(task: task) { Task { await store.setCompleted(task, in: goal.id, completed: true) } }
                        }
                        if !goal.doneTasks.isEmpty {
                            Button(showsDone ? "Hide done" : "Show \(goal.doneTasks.count) done") { showsDone.toggle() }
                                .font(AN.ui(.footnote))
                                .padding(.top, 6)
                            if showsDone {
                                ForEach(goal.doneTasks) { task in
                                    TaskRow(task: task) { Task { await store.setCompleted(task, in: goal.id, completed: false) } }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            } else {
                EmptyPage(title: "This goal isn't here", message: "It may have been archived on the web.")
            }
        }
        .refreshable { await store.load() }
        .anansiScreen()
        .navigationTitle("Goal")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
    }
}

struct TaskRow: View {
    let task: GoalTask
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Button(action: toggle) {
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(task.completed ? AN.moss : AN.ink4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.completed ? "Mark as not done" : "Mark as done")
            VStack(alignment: .leading, spacing: 2) {
                Text([PersonRef.glyph(task.emoji), MentionText.plain(task.title)].compactMap { $0 }.joined(separator: " "))
                    .font(AN.ui(.body))
                    .strikethrough(task.completed)
                    .foregroundStyle(task.completed ? AN.ink3 : AN.ink)
                if let day = task.scheduledDay {
                    Text(day.date(in: .current).formatted(.dateTime.day().month(.abbreviated).year()))
                        .font(AN.mono(.caption))
                        .foregroundStyle(day < LocalDay.today() && !task.completed ? AN.rust : AN.ink3)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .sensoryFeedback(.success, trigger: task.completed) { _, new in new }
    }
}
