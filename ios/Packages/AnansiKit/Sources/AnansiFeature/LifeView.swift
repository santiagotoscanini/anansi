import SwiftUI


/// What the chapter editor opens on.
enum ChapterDraft: Identifiable, Hashable {
    case new(start: LocalDay?, end: LocalDay?)
    case edit(LifeChapter)

    var id: String {
        switch self {
        case let .new(start, end): "new-\(start?.string ?? "")-\(end?.string ?? "")"
        case let .edit(chapter): chapter.id
        }
    }
}

/// The Life tab: a life in weeks (one row per year of age), the chapters on it, and the views that pick a few of
/// them. The web's Life tab, `src/components/life/`; the rules are `Core/Life.swift`.
struct LifeScreen: View {
    @State private var store = LifeStore.shared
    @State private var viewId: String?
    @State private var draft: ChapterDraft?
    @State private var isShowingSettings = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let life = store.life {
                    if let birth = life.birth {
                        content(life, birth: birth)
                    } else {
                        header(stats: nil)
                        BirthCard(years: life.lifeExpectancyYears)
                    }
                } else if let error = store.error {
                    header(stats: nil)
                    ProblemCard(message: "Couldn't reach Anansi: \(error)") { Task { await store.load() } }
                } else {
                    header(stats: nil)
                    HStack { Spacer(); ProgressView("Loading…").font(AN.text(.subheadline)); Spacer() }
                        .padding(.vertical, 40)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .refreshable { await store.load() }
        .anansiScreen()
        .navigationTitle("Life")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .toolbar {
            if store.life?.birth != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Your life", systemImage: "slider.horizontal.3") { isShowingSettings = true }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("New chapter", systemImage: "plus") { draft = .new(start: nil, end: nil) }
                }
            }
        }
        .sheet(item: $draft) { draft in
            if let life = store.life {
                ChapterEditor(life: life, draft: draft, defaultViewId: viewId)
            }
        }
        .sheet(isPresented: $isShowingSettings) {
            if let life = store.life { LifeSettingsSheet(life: life) }
        }
        .task {
            if store.life == nil { await store.load() }
        }
    }

    private func header(stats: (age: Int, lived: Int, ahead: Int, percent: Int)?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                WebMark(size: 20)
                Eyebrow(text: "Life")
            }
            Text("Your life in \(Text("weeks").italic().foregroundStyle(AN.clay))")
                .font(AN.display(.largeTitle))
                .foregroundStyle(AN.ink)
            if let stats {
                Text("Age \(stats.age) · \(stats.lived.formatted()) weeks lived · \(stats.ahead.formatted()) ahead")
                    .font(AN.text(.body)).italic().foregroundStyle(AN.ink3)
                ProgressRule(fraction: Double(stats.percent) / 100).padding(.top, 4)
                Text("\(stats.percent)% of the way").font(AN.mono(.caption)).foregroundStyle(AN.ink3)
            } else {
                Text("Every week you have lived and every week still ahead, and what you give them to.")
                    .font(AN.text(.body)).italic().foregroundStyle(AN.ink3)
            }
        }
        .padding(.top, 12)
    }

    @ViewBuilder
    private func content(_ life: LifeData, birth: LocalDay) -> some View {
        let today = LocalDay.today()
        let years = life.lifeExpectancyYears
        let rows = LifeRules.rows(birth: birth, years: years)
        let thisWeek = today.weekStart
        let total = rows.reduce(0) { $0 + $1.weeks.count }
        let lived = rows.reduce(0) { sum, row in sum + row.weeks.filter { $0 < thisWeek }.count }
        let view = life.views.first { $0.id == viewId }
        let shown = view.map { v in life.chapters.filter { v.chapterIds.contains($0.id) } } ?? life.chapters

        header(stats: (LifeRules.age(birth: birth, on: today), lived, max(0, total - lived),
                       Int((Double(lived) / Double(max(1, total)) * 100).rounded())))
        viewsBar(life)
        LifeGrid(life: life, rows: rows, chapters: shown, today: today)
        legend
        ChapterList(life: life, birth: birth, chapters: shown, today: today, inView: view != nil) { chapter in
            draft = .edit(chapter)
        } suggest: {
            draft = .new(start: nil, end: nil)
        }
    }

    private func viewsBar(_ life: LifeData) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                pill("All chapters", count: life.chapters.count, active: viewId == nil) { viewId = nil }
                ForEach(life.views) { v in
                    pill([v.emoji, v.name].compactMap { $0 }.joined(separator: " "), count: v.chapterIds.count,
                         active: viewId == v.id) { viewId = v.id }
                }
            }
        }
    }

    private func pill(_ title: String, count: Int, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                Text("\(count)").opacity(0.6)
            }
            .font(AN.ui(.subheadline))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .foregroundStyle(active ? AN.paper : AN.ink2)
            .background(active ? AN.ink : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(active ? Color.clear : AN.hairline2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem(AN.ink.opacity(0.22), stroke: nil, "Lived")
            legendItem(AN.clay, stroke: nil, "This week")
            legendItem(.clear, stroke: AN.ink.opacity(0.25), "Ahead")
            HStack(spacing: 4) {
                Circle().fill(AN.ink.opacity(0.7)).frame(width: 5, height: 5)
                Text("Journal or sync")
            }
        }
        .font(AN.mono(.caption2))
        .foregroundStyle(AN.ink3)
    }

    private func legendItem(_ fill: Color, stroke: Color?, _ label: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(fill)
                .overlay(RoundedRectangle(cornerRadius: 2).stroke(stroke ?? .clear, lineWidth: 1))
                .frame(width: 9, height: 9)
            Text(label)
        }
    }
}

// MARK: The grid

/// One SVG-like canvas of weeks. The renderer runs off the main thread, so it draws only plain values computed
/// here (`Paint`), never `self`. A tap opens that week.
struct LifeGrid: View {
    let life: LifeData
    let rows: [LifeRow]
    let chapters: [LifeChapter]
    let today: LocalDay

    static let cell: CGFloat = 10
    static let step: CGFloat = 13
    static let left: CGFloat = 24
    static let top: CGFloat = 2
    static let decadeGap: CGFloat = 8
    static let cols = 53

    static func rowY(_ r: Int) -> CGFloat { top + CGFloat(r) * step + CGFloat(r / 10) * decadeGap }

    nonisolated struct Cell: Sendable {
        var x: CGFloat
        var y: CGFloat
        var fill: Color
        var stroke: Color?
        var dot: CGFloat
        var dotColor: Color
    }

    nonisolated struct GridLabel: Sendable {
        var text: String
        var y: CGFloat
        var strong: Bool
    }

    var body: some View {
        let width = Self.left + CGFloat(Self.cols) * Self.step + 4
        let height = Self.rowY(max(0, rows.count - 1)) + Self.step + Self.top
        let cells = paint()
        let labels = rows.filter { $0.age % 5 == 0 }.map {
            GridLabel(text: String($0.age), y: Self.rowY($0.age) + Self.cell / 2, strong: $0.age % 10 == 0)
        }
        let labelColor = AN.ink4
        let strongColor = AN.ink3
        let cellSize = Self.cell
        let leftEdge = Self.left
        GeometryReader { proxy in
            let k = proxy.size.width / width
            Canvas { @Sendable context, _ in
                for label in labels {
                    let text = Text(label.text)
                        .font(.system(size: 7 * k * 1.6, design: .monospaced))
                        .foregroundStyle(label.strong ? strongColor : labelColor)
                    context.draw(text, at: CGPoint(x: (leftEdge - 6) * k, y: label.y * k), anchor: .trailing)
                }
                let radius = 2.5 * k
                for c in cells {
                    let rect = CGRect(x: c.x * k, y: c.y * k, width: cellSize * k, height: cellSize * k)
                    let path = Path(roundedRect: rect, cornerRadius: radius)
                    context.fill(path, with: .color(c.fill))
                    if let stroke = c.stroke {
                        context.stroke(path, with: .color(stroke), lineWidth: max(0.5, 0.8 * k))
                    }
                    if c.dot > 0 {
                        let r = c.dot * k
                        context.fill(Path(ellipseIn: CGRect(x: rect.midX - r, y: rect.midY - r, width: 2 * r, height: 2 * r)),
                                     with: .color(c.dotColor))
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { location in
                if let sunday = hit(CGPoint(x: location.x / k, y: location.y / k)) {
                    openWeek(sunday)
                }
            }
        }
        .aspectRatio(width / height, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your life in weeks")
        .navigationDestination(item: $openedWeek) { sunday in
            LifeWeekView(sunday: sunday)
        }
    }

    @State private var openedWeek: LocalDay?

    private func openWeek(_ sunday: LocalDay) { openedWeek = sunday }

    private func hit(_ point: CGPoint) -> LocalDay? {
        let slack = (Self.step - Self.cell) / 2
        let col = Int(((point.x - Self.left + slack) / Self.step).rounded(.down))
        guard col >= 0, col < Self.cols else { return nil }
        for (r, row) in rows.enumerated() {
            let y = Self.rowY(r)
            if point.y >= y - slack, point.y < y + Self.cell + slack {
                return col < row.weeks.count ? row.weeks[col] : nil
            }
        }
        return nil
    }

    private func paint() -> [Cell] {
        guard let birth = life.birth else { return [] }
        let byId = Dictionary(chapters.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let covering = LifeRules.weekChapters(chapters, birth: birth, years: life.lifeExpectancyYears)
        let thisWeek = today.weekStart
        let past = AN.ink.opacity(0.22)
        let ahead = AN.ink.opacity(0.2)
        let now = AN.clay
        let dotOff = AN.ink.opacity(0.75)
        let dotOn = AN.paper.opacity(0.9)
        var colors: [String: Color] = [:]
        for chapter in chapters {
            if let rgb = LifeRules.rgb(chapter.color) { colors[chapter.id] = Color(red: rgb.red, green: rgb.green, blue: rgb.blue) }
        }
        var out: [Cell] = []
        out.reserveCapacity(rows.count * 53)
        for (r, row) in rows.enumerated() {
            let y = Self.rowY(r)
            for (c, sunday) in row.weeks.enumerated() {
                let x = Self.left + CGFloat(c) * Self.step
                let isPast = sunday < thisWeek
                let isNow = sunday == thisWeek
                let top = covering[sunday]?.first.flatMap { byId[$0] }
                let color = top.flatMap { colors[$0.id] }
                let amount = (isPast || isNow) ? (life.record(sunday)?.amount ?? 0) : 0
                let dot: CGFloat = amount > 0 ? min(1.3 + CGFloat(amount) * 0.28, 3.1) : 0
                let cell: Cell
                if isNow {
                    cell = Cell(x: x, y: y, fill: now, stroke: nil, dot: dot, dotColor: dotOn)
                } else if let color {
                    cell = isPast
                        ? Cell(x: x, y: y, fill: color.opacity(0.92), stroke: nil, dot: dot, dotColor: dotOn)
                        : Cell(x: x, y: y, fill: color.opacity(0.16), stroke: color.opacity(0.5), dot: 0, dotColor: dotOn)
                } else {
                    cell = isPast
                        ? Cell(x: x, y: y, fill: past, stroke: nil, dot: dot, dotColor: dotOff)
                        : Cell(x: x, y: y, fill: .clear, stroke: ahead, dot: 0, dotColor: dotOff)
                }
                out.append(cell)
            }
        }
        return out
    }
}

// MARK: The chapters

struct ChapterList: View {
    let life: LifeData
    let birth: LocalDay
    let chapters: [LifeChapter]
    let today: LocalDay
    let inView: Bool
    let open: (LifeChapter) -> Void
    let suggest: () -> Void

    var body: some View {
        if chapters.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(inView ? "This view has no chapters yet." : "Chapters are the periods of your life, behind you or ahead: a school, a city, a job, a family. They can overlap.")
                    .font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
                if !inView {
                    Button("Add the first chapter", systemImage: "plus", action: suggest).buttonStyle(.anansiOutline)
                    Text("Or tell Claude about your life and it can fill the chapters in for you.")
                        .font(AN.text(.footnote)).foregroundStyle(AN.ink4)
                }
            }
            .anansiCard()
        } else {
            let grouped = Dictionary(grouping: chapters) { chapter -> LifeRules.Tense in
                LifeRules.range(chapter, birth: birth, years: life.lifeExpectancyYears)
                    .map { LifeRules.tense($0, today: today) } ?? .past
            }
            VStack(alignment: .leading, spacing: 18) {
                section("Now", grouped[.now] ?? [])
                section("Ahead", grouped[.future] ?? [])
                section("Behind", Array((grouped[.past] ?? []).reversed()))
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ list: [LifeChapter]) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "\(title) · \(list.count)")
                ForEach(list) { chapter in
                    Button { open(chapter) } label: { row(chapter) }
                        .buttonStyle(.plain)
                    if chapter.id != list.last?.id { Divider().overlay(AN.hairline) }
                }
            }
        }
    }

    private func row(_ chapter: LifeChapter) -> some View {
        let range = LifeRules.range(chapter, birth: birth, years: life.lifeExpectancyYears)
        return HStack(spacing: 12) {
            ChapterBadge(chapter: chapter, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(chapter.title).font(AN.ui(.body).weight(.medium)).foregroundStyle(AN.ink)
                Text([LifeRules.spanText(chapter), range.map(LifeRules.lengthText)].compactMap { $0 }.joined(separator: " · "))
                    .font(AN.mono(.caption)).foregroundStyle(AN.ink3)
                if !chapter.goalIds.isEmpty {
                    Text(chapter.goalIds.count == 1 ? "1 goal" : "\(chapter.goalIds.count) goals")
                        .font(AN.mono(.caption2)).foregroundStyle(AN.ink4)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AN.ink4)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}

/// A chapter's emoji on a wash of its colour, or a dot of its colour.
struct ChapterBadge: View {
    let chapter: LifeChapter
    var size: CGFloat = 30

    var body: some View {
        let color = Self.color(chapter.color)
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).fill(color.opacity(0.22))
            if let emoji = PersonRef.glyph(chapter.emoji) {
                Text(emoji).font(.system(size: size * 0.5))
            } else {
                Circle().fill(color).frame(width: size * 0.32, height: size * 0.32)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    static func color(_ hex: String) -> Color {
        guard let rgb = LifeRules.rgb(hex) else { return AN.clay }
        return Color(red: rgb.red, green: rgb.green, blue: rgb.blue)
    }
}

// MARK: Birth date

/// The first visit: a life in weeks starts at the birth date.
struct BirthCard: View {
    let years: Int
    @State private var birth = Calendar.current.date(byAdding: .year, value: -30, to: .now) ?? .now
    @State private var lifeYears = 80
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("When were you born?").font(AN.display(.title2)).foregroundStyle(AN.ink)
            Text("Say how many years you plan on too; you can change it any time.")
                .font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
            DatePicker("Born", selection: $birth, in: ...Date.now, displayedComponents: .date)
            Stepper("\(lifeYears) years", value: $lifeYears, in: 1...130)
            if let error { Text(error).font(AN.text(.footnote)).foregroundStyle(AN.rust) }
            Button {
                Task { await save() }
            } label: {
                if isSaving { ProgressView().tint(AN.onClay) } else { Text("Draw my weeks") }
            }
            .buttonStyle(.anansiPrimary)
            .disabled(isSaving)
        }
        .anansiCard(padding: 20)
        .onAppear { lifeYears = years }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await LifeStore.shared.setSettings(birthDate: LocalDay(date: birth, calendar: .current),
                                                   lifeExpectancyYears: lifeYears)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct LifeSettingsSheet: View {
    let life: LifeData
    @State private var birth = Date.now
    @State private var years = 80
    @State private var isSaving = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Born", selection: $birth, in: ...Date.now, displayedComponents: .date)
                    Stepper("\(years) years", value: $years, in: 1...130)
                } footer: {
                    Text("How many years you plan on. The grid ends there.")
                }
                .anansiRow()
                if let error { Section { Text(error).foregroundStyle(AN.rust) }.anansiRow() }
            }
            .anansiList()
            .navigationTitle("Your life")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving { ProgressView() } else { Button("Save") { Task { await save() } } }
                }
            }
        }
        .onAppear {
            years = life.lifeExpectancyYears
            if let day = life.birth { birth = day.date(in: .current) }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await LifeStore.shared.setSettings(birthDate: LocalDay(date: birth, calendar: .current), lifeExpectancyYears: years)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: One week

/// One week of a life: its chapters, its pictures, its journal days and its sync notes.
struct LifeWeekView: View {
    let sunday: LocalDay
    @State private var store = LifeStore.shared
    @State private var draft: ChapterDraft?

    var body: some View {
        let week = store.weeks[sunday]
        let today = LocalDay.today()
        let isFuture = sunday > today.weekStart
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    if let birth = store.life?.birth {
                        Eyebrow(text: "Age \(max(0, LifeRules.age(birth: birth, on: sunday.weekEnd)))")
                    }
                    Text(Self.range(sunday)).font(AN.display(.title)).foregroundStyle(AN.ink)
                }
                .padding(.top, 12)

                if let week, !week.chapters.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(week.chapters) { chapter in
                                HStack(spacing: 6) {
                                    ChapterBadge(chapter: chapter, size: 20)
                                    Text(chapter.title).font(AN.ui(.footnote))
                                }
                                .padding(.leading, 4)
                                .padding(.trailing, 10)
                                .padding(.vertical, 4)
                                .background(ChapterBadge.color(chapter.color).opacity(0.14), in: Capsule())
                            }
                        }
                    }
                }

                if isFuture {
                    VStack(spacing: 10) {
                        Text("This week hasn't happened yet.").font(AN.text(.body)).italic().foregroundStyle(AN.ink2)
                        Button("Start a chapter here", systemImage: "plus") { draft = .new(start: sunday, end: nil) }
                            .buttonStyle(.anansiOutline)
                    }
                    .frame(maxWidth: .infinity)
                    .anansiCard()
                } else if let week {
                    if week.journal.isEmpty, (week.sync?.items ?? []).isEmpty, week.pictures.isEmpty {
                        Text("Nothing recorded this week.").font(AN.text(.body)).italic().foregroundStyle(AN.ink3)
                    }
                    if !week.pictures.isEmpty {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                            ForEach(week.pictures.prefix(12)) { picture in
                                AttachmentThumbnail(attachment: picture.attachment, size: 108)
                            }
                        }
                    }
                    if !week.journal.isEmpty { journal(week.journal) }
                    if let sync = week.sync, !sync.items.isEmpty { syncNotes(sync) }
                } else if let error = store.weekErrors[sunday] {
                    ProblemCard(message: error) { Task { await store.loadWeek(sunday) } }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .anansiScreen()
        .navigationTitle("Week")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .task { await store.loadWeek(sunday) }
        .sheet(item: $draft) { draft in
            if let life = store.life { ChapterEditor(life: life, draft: draft, defaultViewId: nil) }
        }
    }

    private func journal(_ days: [LifeWeek.Day]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(title: "Journal", count: days.count)
            ForEach(days) { day in
                if let local = day.localDay {
                    NavigationLink(value: JournalRoute(day: local)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(Self.weekday(local)).font(AN.ui(.footnote).weight(.medium)).foregroundStyle(AN.ink2)
                            ForEach(Array(day.highlights.prefix(3).enumerated()), id: \.offset) { _, highlight in
                                Text("· \(MentionText.plain(highlight))").font(AN.ui(.subheadline)).foregroundStyle(AN.ink)
                            }
                            let prose = MentionText.plain(day.content).trimmingCharacters(in: .whitespacesAndNewlines)
                            if !prose.isEmpty {
                                Text(prose).font(AN.text(.subheadline)).foregroundStyle(AN.ink2).lineLimit(3)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                        .anansiCard(padding: 12)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func syncNotes(_ sync: LifeWeek.Sync) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionHeading(title: "Weekly sync", count: sync.items.count)
                Spacer()
                NavigationLink(value: WeekRoute(weekStart: sunday)) {
                    Label("Open", systemImage: "arrow.up.right").font(AN.ui(.footnote))
                }
            }
            ForEach(Array(sync.items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title).font(AN.ui(.subheadline).weight(.medium)).foregroundStyle(AN.ink)
                    if let text = item.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                        Text(MentionText.plain(text)).font(AN.text(.subheadline)).foregroundStyle(AN.ink2).lineLimit(4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .anansiCard(padding: 12)
            }
        }
    }

    static func range(_ sunday: LocalDay) -> String {
        let calendar = Calendar.current
        let start = sunday.date(in: calendar)
        let end = sunday.weekEnd.date(in: calendar)
        return "\(start.formatted(.dateTime.day().month(.abbreviated))) · \(end.formatted(.dateTime.day().month(.abbreviated).year()))"
    }

    static func weekday(_ day: LocalDay) -> String {
        day.date(in: .current).formatted(.dateTime.weekday(.wide).day())
    }
}

// MARK: The editor

/// A chapter's name, colour, when (open at either end: since birth, until the end), its goals, views and notes.
struct ChapterEditor: View {
    let life: LifeData
    let draft: ChapterDraft
    let defaultViewId: String?

    @State private var title = ""
    @State private var emoji = ""
    @State private var color = LifeRules.colors[0]
    @State private var notes = ""
    @State private var sinceBirth = true
    @State private var untilEnd = true
    @State private var start = Date.now
    @State private var end = Date.now
    @State private var goalIds: Set<String> = []
    @State private var viewIds: Set<String> = []
    @State private var isSaving = false
    @State private var isConfirmingDelete = false
    @State private var error: String?
    @State private var goals = GoalsStore.shared
    @Environment(\.dismiss) private var dismiss

    private var chapter: LifeChapter? {
        if case let .edit(chapter) = draft { return chapter }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name this chapter", text: $title).font(AN.display(.title3))
                    TextField("Emoji", text: $emoji)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(LifeRules.colors, id: \.self) { hex in
                                let swatch = ChapterBadge.color(hex)
                                Button { color = hex } label: {
                                    Circle().fill(swatch).frame(width: 26, height: 26)
                                        .overlay(Circle().stroke(AN.ink, lineWidth: hex == color ? 2 : 0).padding(-3))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Colour \(hex)")
                                .accessibilityAddTraits(hex == color ? .isSelected : [])
                            }
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 3)
                    }
                }
                .anansiRow()

                Section {
                    Toggle("Since birth", isOn: $sinceBirth)
                    if !sinceBirth { DatePicker("From", selection: $start, displayedComponents: .date) }
                    Toggle("Until the end", isOn: $untilEnd)
                    if !untilEnd { DatePicker("To", selection: $end, displayedComponents: .date) }
                } header: {
                    Eyebrow(text: "When")
                } footer: {
                    Text(summary)
                }
                .anansiRow()

                if !goals.goals.isEmpty {
                    Section {
                        ForEach(GoalCard.ordered(goals.goals)) { goal in
                            Button {
                                if goalIds.contains(goal.id) { goalIds.remove(goal.id) } else { goalIds.insert(goal.id) }
                            } label: {
                                HStack {
                                    Text([goal.glyph, goal.title].compactMap { $0 }.joined(separator: " ")).foregroundStyle(AN.ink)
                                    Spacer()
                                    if goalIds.contains(goal.id) { Image(systemName: "checkmark").foregroundStyle(AN.clay) }
                                }
                            }
                        }
                    } header: {
                        Eyebrow(text: "Goals for this chapter")
                    }
                    .anansiRow()
                }

                if !life.views.isEmpty {
                    Section {
                        ForEach(life.views) { view in
                            Toggle(view.name, isOn: Binding(
                                get: { viewIds.contains(view.id) },
                                set: { on in if on { viewIds.insert(view.id) } else { viewIds.remove(view.id) } }
                            ))
                        }
                    } header: {
                        Eyebrow(text: "Views")
                    }
                    .anansiRow()
                }

                Section {
                    TextField("What this chapter is about", text: $notes, axis: .vertical).lineLimit(3...8)
                } header: {
                    Eyebrow(text: "Notes")
                }
                .anansiRow()

                if let error { Section { Text(error).foregroundStyle(AN.rust) }.anansiRow() }

                if chapter != nil {
                    Section {
                        Button("Delete chapter", role: .destructive) { isConfirmingDelete = true }
                    }
                    .anansiRow()
                }
            }
            .anansiList()
            .navigationTitle(chapter == nil ? "New chapter" : "Chapter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isBackwards)
                    }
                }
            }
            .confirmationDialog("Delete this chapter? Its goals stay.", isPresented: $isConfirmingDelete,
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) { Task { await delete() } }
            }
        }
        .onAppear(perform: fill)
        .task { if !goals.hasLoaded { await goals.load() } }
    }

    private var startDay: LocalDay? { sinceBirth ? nil : LocalDay(date: start, calendar: .current) }
    private var endDay: LocalDay? { untilEnd ? nil : LocalDay(date: end, calendar: .current) }

    private var isBackwards: Bool {
        if let startDay, let endDay { return endDay < startDay }
        return false
    }

    private var summary: String {
        guard let birth = life.birth else { return "" }
        let probe = LifeChapter(id: "probe", title: "", color: color, startDay: startDay?.string, endDay: endDay?.string)
        guard let range = LifeRules.range(probe, birth: birth, years: life.lifeExpectancyYears) else {
            return "The end comes before the start."
        }
        let from = max(0, LifeRules.age(birth: birth, on: range.lowerBound))
        let to = max(0, LifeRules.age(birth: birth, on: range.upperBound))
        return "Age \(from) to \(to) · \(LifeRules.lengthText(range)) · \(LifeRules.weekCount(range).formatted()) weeks"
    }

    private func fill() {
        let calendar = Calendar.current
        switch draft {
        case let .edit(chapter):
            title = chapter.title
            emoji = chapter.emoji ?? ""
            color = chapter.color
            notes = chapter.notes ?? ""
            if let s = chapter.start { sinceBirth = false; start = s.date(in: calendar) }
            if let e = chapter.end { untilEnd = false; end = e.date(in: calendar) }
            goalIds = Set(chapter.goalIds)
            viewIds = Set(life.views.filter { $0.chapterIds.contains(chapter.id) }.map(\.id))
        case let .new(s, e):
            color = LifeRules.nextColor(used: life.chapters.map(\.color))
            if let s { sinceBirth = false; start = s.date(in: calendar) }
            if let e { untilEnd = false; end = e.date(in: calendar) }
            if let defaultViewId { viewIds = [defaultViewId] }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let fields = API.ChapterFields(title: title.trimmingCharacters(in: .whitespacesAndNewlines), emoji: emoji,
                                       color: color, notes: notes, startDay: startDay, endDay: endDay,
                                       goalIds: Array(goalIds), viewIds: Array(viewIds))
        do {
            try await LifeStore.shared.save(fields, id: chapter?.id)
            await GoalsStore.shared.load()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let chapter else { return }
        do {
            try await LifeStore.shared.delete(chapter.id)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
