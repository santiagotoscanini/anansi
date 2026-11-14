import Observation
import SwiftUI

struct OverTimeRoute: Hashable {
    var trackingItemId: String
    var title: String
}

struct OverTimeListRoute: Hashable {}

/// The item histories the phone has read. A screen opens on the last answer and reads again behind it.
@Observable
final class HistoryStore {
    static let shared = HistoryStore()

    private(set) var histories: [String: ItemHistory] = [:]
    private(set) var errors: [String: String] = [:]

    func load(_ trackingItemId: String) async {
        guard Connection.shared.isConnected else { return }
        do {
            histories[trackingItemId] = try await APIClient.shared.itemHistory(trackingItemId)
            errors[trackingItemId] = nil
        } catch {
            errors[trackingItemId] = error.localizedDescription
        }
    }

    /// Signing out: nothing of the old account stays on screen.
    func clear() {
        histories = [:]
        errors = [:]
    }
}

/// The dark ground pictures sit on, the same in both themes (the web's `STAGE_GROUND`).
private let stageGround = Color(red: 20 / 255, green: 16 / 255, blue: 13 / 255)

private let stageShape = RoundedRectangle(cornerRadius: AN.radiusLarge, style: .continuous)

nonisolated enum OverTimeMode: String, CaseIterable, Identifiable, Sendable {
    case play = "Time-lapse"
    case compare = "Compare"
    case all = "All weeks"

    var id: String { rawValue }
}

nonisolated enum OverTimeSpeed: String, CaseIterable, Identifiable, Sendable {
    case slow = "Slow"
    case normal = "Normal"
    case fast = "Fast"

    var id: String { rawValue }

    /// How long each picture stays up (the web's `SPEED_MS`).
    var interval: Duration {
        switch self {
        case .slow: .milliseconds(1600)
        case .normal: .milliseconds(800)
        case .fast: .milliseconds(350)
        }
    }
}

/// One tracking item over time: every picture it was given, week after week. Three ways to look, like the web:
/// play them as a time-lapse along a timeline that keeps the real distance between weeks, hold two against each
/// other under a divider, or see every week on one sheet with the missed ones marked.
struct OverTimeView: View {
    let trackingItemId: String
    let title: String

    @State private var store = HistoryStore.shared
    @State private var mode: OverTimeMode = .play
    /// The picture on screen; nil until one is picked, which shows the newest.
    @State private var picked: Int?
    @State private var viewing: SyncAttachment?

    private var history: ItemHistory? { store.histories[trackingItemId] }

    var body: some View {
        Group {
            if let history {
                content(history)
            } else if let error = store.errors[trackingItemId] {
                ScrollView {
                    ProblemCard(message: "Couldn't reach Anansi: \(error)") {
                        Task { await store.load(trackingItemId) }
                    }
                    .padding()
                }
            } else {
                ProgressView("Loading…")
                    .font(AN.text(.subheadline))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .anansiScreen()
        .navigationTitle(history?.item.title ?? title)
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .task { await store.load(trackingItemId) }
        .fullScreenCover(item: $viewing) { attachment in
            AttachmentViewer(attachment: attachment)
        }
    }

    private func modes(pictures: Int) -> [OverTimeMode] {
        var modes: [OverTimeMode] = []
        if pictures >= 1 { modes.append(.play) }
        if pictures >= 2 { modes.append(.compare) }
        modes.append(.all)
        return modes
    }

    private func content(_ history: ItemHistory) -> some View {
        let frames = History.frames(history.weeks)
        let available = modes(pictures: frames.count)
        let shown = available.contains(mode) ? mode : (available.first ?? .all)
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Eyebrow(text: "Tracking items · over time")
                    Text(history.item.title).font(AN.display(.largeTitle)).foregroundStyle(AN.ink)
                    if let first = history.weeks.first?.day {
                        Text(Wording.historySummary(weeks: history.weeks.count, pictures: frames.count, first: first))
                            .font(AN.mono(.caption2))
                            .foregroundStyle(AN.ink3)
                    }
                }
                .padding(.top, 8)

                if history.weeks.isEmpty {
                    EmptyPage(title: "Nothing recorded yet",
                              message: "A week shows up here once this item has a note or a picture on its weekly sync.",
                              systemImage: "clock.arrow.circlepath")
                        .anansiCard()
                } else {
                    if available.count > 1 {
                        Picker("View", selection: $mode) {
                            ForEach(available) { option in
                                Text(option.rawValue).tag(option)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    switch shown {
                    case .play:
                        OverTimePlay(title: history.item.title, frames: frames, picked: $picked) { attachment in
                            viewing = attachment
                        }
                    case .compare:
                        OverTimeCompare(title: history.item.title, frames: frames)
                    case .all:
                        OverTimeSheet(weeks: history.weeks, frames: frames) { index in
                            picked = index
                            mode = .play
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .refreshable { await store.load(trackingItemId) }
        // Read every picture once, so the first play does not wait on the network.
        .task(id: frames.map(\.id)) {
            for frame in frames { AttachmentCache.shared.load(frame.id) }
        }
    }
}

/// A picture in the camera's 3:4 frame, on the dark ground. Anything else is letterboxed inside it.
struct HistoryStage: View {
    let attachmentId: String
    let label: String

    @State private var cache = AttachmentCache.shared

    var body: some View {
        ZStack {
            stageGround
            if let image = cache.images[attachmentId] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .accessibilityLabel(label)
            } else if cache.unavailable.contains(attachmentId) {
                Image(systemName: "photo").font(.title).foregroundStyle(Color.white.opacity(0.5))
            } else {
                ProgressView().tint(.white)
            }
        }
        .task(id: attachmentId) { cache.load(attachmentId) }
    }
}

/// What re-arms the time-lapse: each step it takes changes the index, which starts the next wait.
private nonisolated struct PlayTick: Hashable, Sendable {
    var isPlaying: Bool
    var index: Int
    var speed: OverTimeSpeed
}

// MARK: Time-lapse

struct OverTimePlay: View {
    let title: String
    let frames: [HistoryFrame]
    @Binding var picked: Int?
    let onOpen: (SyncAttachment) -> Void

    @State private var isPlaying = false
    @State private var speed: OverTimeSpeed = .normal

    private var last: Int { max(0, frames.count - 1) }
    private var current: Int { min(max(0, picked ?? last), last) }

    var body: some View {
        if frames.indices.contains(current), let first = frames.first?.week {
            let frame = frames[current]
            VStack(alignment: .leading, spacing: 14) {
                HistoryStage(attachmentId: frame.id, label: "\(title), week of \(Wording.fullDay(frame.week))")
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .clipShape(stageShape)
                    .onTapGesture { onOpen(frame.attachment) }
                    // Beside the scroll, not instead of it: a sideways swipe steps, an up or down one still scrolls.
                    .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { value in
                        guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                        step(value.translation.width < 0 ? 1 : -1)
                    })

                VStack(alignment: .leading, spacing: 4) {
                    Eyebrow(text: "\(current + 1) of \(frames.count) · \(Wording.afterFirst(History.weeksBetween(first, frame.week)))")
                    Text("Week of \(Wording.fullDay(frame.week))")
                        .font(AN.display(.title2))
                        .foregroundStyle(AN.ink)
                    if frame.shots > 1 {
                        Text("Picture \(frame.shot) of \(frame.shots) from that week")
                            .font(AN.text(.footnote))
                            .foregroundStyle(AN.ink3)
                    }
                }

                transport

                if frames.count > 1 {
                    HistoryTimeline(positions: History.positions(frames), index: current, first: first,
                                    last: frames[last].week) { index in
                        isPlaying = false
                        picked = index
                    }
                }

                if let note = frame.note, !note.isEmpty {
                    Text(MentionStyle.attributed(note))
                        .font(AN.text(.body))
                        .foregroundStyle(AN.ink)
                        .anansiCard()
                }
            }
            .task(id: PlayTick(isPlaying: isPlaying, index: current, speed: speed)) {
                guard isPlaying else { return }
                do { try await Task.sleep(for: speed.interval) } catch { return }
                if current >= last {
                    isPlaying = false
                } else {
                    picked = current + 1
                }
            }
        }
    }

    private var transport: some View {
        HStack(spacing: 10) {
            Button("Previous picture", systemImage: "chevron.left") { step(-1) }
                .labelStyle(.iconOnly)
                .buttonStyle(.anansiOutline)
                .disabled(current == 0)
            Button {
                if !isPlaying, current >= last { picked = 0 }
                isPlaying.toggle()
            } label: {
                Label(isPlaying ? "Pause" : "Play", systemImage: isPlaying ? "pause.fill" : "play.fill")
            }
            .buttonStyle(.anansiPrimary)
            .disabled(frames.count < 2)
            Button("Next picture", systemImage: "chevron.right") { step(1) }
                .labelStyle(.iconOnly)
                .buttonStyle(.anansiOutline)
                .disabled(current == last)
            Menu {
                Picker("Speed", selection: $speed) {
                    ForEach(OverTimeSpeed.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
            } label: {
                Image(systemName: "speedometer")
                    .foregroundStyle(AN.ink)
                    .frame(width: 44, height: 44)
                    .background(AN.canvas, in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: AN.radius, style: .continuous).stroke(AN.hairline2, lineWidth: 1))
            }
            .accessibilityLabel("Speed")
        }
    }

    private func step(_ delta: Int) {
        isPlaying = false
        picked = min(last, max(0, current + delta))
    }
}

/// The pictures along real time: a mark per picture, placed by its week's date, so a month with four pictures
/// looks full and a month off looks empty. Press or drag anywhere to go to the nearest one.
struct HistoryTimeline: View {
    let positions: [Double]
    let index: Int
    let first: LocalDay
    let last: LocalDay
    let onPick: (Int) -> Void

    private let inset: CGFloat = 8

    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { proxy in
                let width = max(1, proxy.size.width - inset * 2)
                ZStack {
                    Rectangle()
                        .fill(AN.hairline2)
                        .frame(height: 1)
                        .padding(.horizontal, inset)
                    ForEach(Array(positions.enumerated()), id: \.offset) { offset, position in
                        Capsule()
                            .fill(offset == index ? AN.clay : (offset < index ? AN.ink2 : AN.ink4))
                            .frame(width: 3, height: offset == index ? 28 : 12)
                            .position(x: inset + width * position, y: proxy.size.height / 2)
                    }
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    onPick(History.nearest(positions, to: Double((value.location.x - inset) / width)))
                })
            }
            .frame(height: 40)
            HStack {
                Text(Wording.shortDay(first))
                Spacer()
                Text(Wording.shortDay(last))
            }
            .font(AN.mono(.caption2))
            .foregroundStyle(AN.ink3)
        }
        .anansiCard(padding: 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Timeline")
        .accessibilityValue("Picture \(index + 1) of \(positions.count)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onPick(min(positions.count - 1, index + 1))
            case .decrement: onPick(max(0, index - 1))
            @unknown default: break
            }
        }
    }
}

// MARK: Compare

struct OverTimeCompare: View {
    let title: String
    let frames: [HistoryFrame]

    @State private var beforeId: String?
    @State private var afterId: String?
    /// Where the divider stands, 0 (all "after") to 1 (all "before").
    @State private var split: Double = 0.5
    @State private var sideBySide = false

    var body: some View {
        if let before = frames.first(where: { $0.id == beforeId }) ?? frames.first,
           let after = frames.first(where: { $0.id == afterId }) ?? frames.last {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    framePicker("Before", selection: before) { beforeId = $0 }
                    Spacer()
                    framePicker("After", selection: after) { afterId = $0 }
                }

                if sideBySide {
                    HStack(alignment: .top, spacing: 8) {
                        stage(before)
                        stage(after)
                    }
                } else {
                    slider(before, after)
                }

                HStack {
                    Text(Wording.apart(History.weeksBetween(before.week, after.week)))
                        .font(AN.mono(.caption))
                        .foregroundStyle(AN.ink3)
                    Spacer()
                    Picker("Layout", selection: $sideBySide) {
                        Text("Slider").tag(false)
                        Text("Side by side").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                }
            }
        }
    }

    private func label(_ frame: HistoryFrame) -> String {
        frame.shots > 1 ? "\(Wording.fullDay(frame.week)) (\(frame.shot)/\(frame.shots))" : Wording.fullDay(frame.week)
    }

    private func accessibilityName(_ frame: HistoryFrame) -> String {
        "\(title), week of \(Wording.fullDay(frame.week))"
    }

    private func framePicker(_ name: String, selection: HistoryFrame, set: @escaping (String) -> Void) -> some View {
        Menu {
            ForEach(frames) { frame in
                Button {
                    set(frame.id)
                } label: {
                    if frame.id == selection.id {
                        Label(label(frame), systemImage: "checkmark")
                    } else {
                        Text(label(frame))
                    }
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Eyebrow(text: name)
                HStack(spacing: 4) {
                    Text(label(selection)).font(AN.ui(.subheadline).weight(.medium))
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .foregroundStyle(AN.ink)
            }
        }
        .accessibilityLabel("\(name): \(label(selection))")
    }

    private func stage(_ frame: HistoryFrame) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HistoryStage(attachmentId: frame.id, label: accessibilityName(frame))
                .aspectRatio(3.0 / 4.0, contentMode: .fit)
                .clipShape(stageShape)
            Text(Wording.fullDay(frame.week)).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
        }
    }

    private func chip(_ day: LocalDay) -> some View {
        Text(Wording.fullDay(day))
            .font(AN.ui(.caption).weight(.medium))
            .foregroundStyle(Color.white)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Color.black.opacity(0.6), in: Capsule())
    }

    /// Both pictures in one frame: the earlier one covers the left of the divider, the later one the rest.
    private func slider(_ before: HistoryFrame, _ after: HistoryFrame) -> some View {
        GeometryReader { proxy in
            let width = max(1, proxy.size.width)
            ZStack {
                HistoryStage(attachmentId: after.id, label: accessibilityName(after))
                HistoryStage(attachmentId: before.id, label: accessibilityName(before))
                    .mask(alignment: .leading) {
                        Rectangle().frame(width: width * split)
                    }
                Rectangle()
                    .fill(Color.white)
                    .frame(width: 2)
                    .position(x: width * split, y: proxy.size.height / 2)
                Image(systemName: "arrow.left.and.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.black)
                    .frame(width: 40, height: 40)
                    .background(Color.white, in: Circle())
                    .shadow(color: Color.black.opacity(0.35), radius: 5, y: 2)
                    .position(x: width * split, y: proxy.size.height / 2)
                VStack {
                    HStack {
                        chip(before.week)
                        Spacer()
                        chip(after.week)
                    }
                    Spacer()
                }
                .padding(10)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                split = min(1, max(0, Double(value.location.x / width)))
            })
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(stageShape)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Divider between \(Wording.fullDay(before.week)) and \(Wording.fullDay(after.week))")
        .accessibilityValue("\(Int((split * 100).rounded())) percent")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: split = min(1, split + 0.1)
            case .decrement: split = max(0, split - 0.1)
            @unknown default: break
            }
        }
    }
}

// MARK: All weeks

struct OverTimeSheet: View {
    let weeks: [HistoryWeek]
    let frames: [HistoryFrame]
    /// Opens the time-lapse on a frame.
    let onOpen: (Int) -> Void

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 8, alignment: .top)]

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            ForEach(History.sheet(weeks)) { month in
                VStack(alignment: .leading, spacing: 10) {
                    Text(Wording.monthYear(year: month.year, month: month.month))
                        .font(AN.display(.title3))
                        .foregroundStyle(AN.ink)
                    if frames.isEmpty {
                        // An item with notes and no pictures reads as a list.
                        ForEach(month.entries) { entry in
                            noteRow(entry)
                        }
                    } else {
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                            ForEach(month.entries) { entry in
                                tiles(entry)
                            }
                        }
                    }
                }
            }
        }
    }

    private func dayLabel(_ week: HistoryWeek) -> String {
        week.day.map(Wording.shortDay) ?? week.week
    }

    /// What stands in for a week that holds files and no words: their names.
    private func words(_ week: HistoryWeek) -> String {
        if let text = week.textContent, !text.isEmpty { return text }
        return week.attachments.map(\.fileName).joined(separator: ", ")
    }

    private func gapLabel(_ count: Int) -> some View {
        Text(Wording.gap(count))
            .font(AN.mono(.caption2))
            .foregroundStyle(AN.ink4)
            .multilineTextAlignment(.center)
    }

    private var dashed: some View {
        RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous)
            .stroke(AN.hairline2, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
    }

    @ViewBuilder
    private func tiles(_ entry: HistorySheetEntry) -> some View {
        switch entry {
        case .gap(_, let count):
            gapLabel(count)
                .padding(6)
                .frame(maxWidth: .infinity, minHeight: 104)
                .overlay(dashed)
        case .week(let week):
            let images = week.images
            if images.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(MentionText.plain(words(week)))
                        .font(AN.text(.caption))
                        .foregroundStyle(AN.ink2)
                        .lineLimit(6)
                        .padding(8)
                        .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                        .background(AN.vellum, in: RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous))
                    Text(dayLabel(week)).font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                }
            } else {
                ForEach(Array(images.enumerated()), id: \.element.id) { offset, image in
                    Button {
                        if let index = frames.firstIndex(where: { $0.id == image.id }) { onOpen(index) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            AttachmentThumbnail(attachment: image, size: 104)
                            Text(images.count > 1 ? "\(dayLabel(week)) · \(offset + 1)/\(images.count)" : dayLabel(week))
                                .font(AN.mono(.caption2))
                                .foregroundStyle(AN.ink3)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Week of \(dayLabel(week))")
                }
            }
        }
    }

    @ViewBuilder
    private func noteRow(_ entry: HistorySheetEntry) -> some View {
        switch entry {
        case .gap(_, let count):
            gapLabel(count)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .overlay(dashed)
        case .week(let week):
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(dayLabel(week))
                    .font(AN.mono(.caption2))
                    .foregroundStyle(AN.ink3)
                    .frame(width: 52, alignment: .leading)
                Text(MentionStyle.attributed(words(week)))
                    .font(AN.text(.body))
                    .foregroundStyle(AN.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: Picking an item

/// The library, to pick the item to look back at.
struct OverTimeListView: View {
    @State private var library = LibraryStore.shared

    var body: some View {
        List {
            Section {
                ForEach(library.items) { item in
                    NavigationLink(value: OverTimeRoute(trackingItemId: item.id, title: item.title)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title).font(AN.text(.body)).foregroundStyle(AN.ink)
                            Text(library.goalTitle(item.goalId) ?? "Unscoped").font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                        }
                    }
                    .anansiRow()
                }
            } footer: {
                if !library.items.isEmpty {
                    Text("Pick an item to see its pictures and notes week after week.")
                }
            }
        }
        .anansiList()
        .overlay {
            if library.isLoading && !library.hasLoaded {
                ProgressView("Loading…")
            } else if library.hasLoaded && library.items.isEmpty {
                EmptyPage(title: "No tracking items yet", message: "Add one in Sync setup, then fill it on a weekly sync.")
            }
        }
        .refreshable { await library.load() }
        .navigationTitle("Over time")
        .navigationBarTitleDisplayMode(.inline)
        .anansiNavigationBar()
        .task {
            if !library.hasLoaded { await library.load() }
        }
    }
}
