import SwiftUI

/// One item of the week on Pulse: its state, title and goal, the notes so far, its pictures, and a quick way to
/// add a picture without opening it.
struct SyncItemCard: View {
    let item: SyncItem
    let open: () -> Void
    @State private var outbox = OutboxStore.shared

    var body: some View {
        let shown = outbox.outbox.overlay(item)
        let pending = outbox.outbox.pendingUploads(for: item.id)
        let filled = outbox.outbox.isFilled(item)
        VStack(alignment: .leading, spacing: 10) {
            Button(action: open) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: filled ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(filled ? AN.moss : AN.ink4)
                            .accessibilityLabel(filled ? "Filled" : "Not filled yet")
                        VStack(alignment: .leading, spacing: 4) {
                            Text(shown.title).font(AN.display(.title3)).foregroundStyle(AN.ink)
                                .multilineTextAlignment(.leading)
                            Tag(text: shown.goalTitle ?? "Unscoped", tone: shown.goalTitle == nil ? .plain : .accent)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AN.ink4)
                    }
                    if let text = shown.textContent?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                        Text(MentionStyle.attributed(text))
                            .font(AN.text(.body))
                            .foregroundStyle(AN.ink2)
                            .lineLimit(4)
                            .multilineTextAlignment(.leading)
                    } else {
                        Text("What happened with this, this week?")
                            .font(AN.text(.body))
                            .italic()
                            .foregroundStyle(AN.ink4)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the item to write notes and add pictures")

            if !shown.attachments.isEmpty || !pending.isEmpty {
                ThumbnailStrip(attachments: shown.attachments, pending: pending)
            }
            HStack {
                if outbox.outbox.pendingText(for: item.id) != nil {
                    Label("Saving", systemImage: "arrow.up.circle").font(AN.mono(.caption2)).foregroundStyle(AN.ink3)
                }
                Spacer()
                AddPictureButton(itemId: item.id, itemTitle: item.title, trackingItemId: item.trackingItemId, compact: true)
            }
        }
        .anansiCard()
    }
}

/// A row of small square pictures: the item's attachments, then the ones still uploading.
struct ThumbnailStrip: View {
    let attachments: [SyncAttachment]
    let pending: [OutboxOp]
    var size: CGFloat = 56

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(attachments) { attachment in
                    AttachmentThumbnail(attachment: attachment, size: size)
                }
                ForEach(pending) { op in
                    PendingThumbnail(op: op, size: size)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(attachments.count + pending.count) attachments")
    }
}

struct AttachmentThumbnail: View {
    let attachment: SyncAttachment
    var size: CGFloat = 56
    @State private var cache = AttachmentCache.shared

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous).fill(AN.vellum)
            if let image = cache.images[attachment.id] {
                Image(uiImage: image).resizable().scaledToFill()
            } else if attachment.isImage, !cache.unavailable.contains(attachment.id) {
                ProgressView().controlSize(.small)
            } else {
                VStack(spacing: 2) {
                    Image(systemName: attachment.isImage ? "photo" : "doc").foregroundStyle(AN.ink3)
                    Text(attachment.fileName).font(AN.mono(.caption2)).lineLimit(1).foregroundStyle(AN.ink3).padding(.horizontal, 2)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous).stroke(AN.hairline2, lineWidth: 1))
        .task(id: attachment.id) {
            if attachment.isImage { cache.load(attachment.id) }
        }
        .accessibilityLabel(attachment.fileName)
    }
}

/// A picture still on the phone, dimmed, with an arrow while it waits to upload.
struct PendingThumbnail: View {
    let op: OutboxOp
    var size: CGFloat = 56
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous).fill(AN.vellum)
            if let image {
                Image(uiImage: image).resizable().scaledToFill().opacity(0.55)
            }
            Image(systemName: "arrow.up.circle.fill")
                .font(.title3)
                .foregroundStyle(AN.onClay, AN.clay)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: AN.radiusSmall, style: .continuous))
        .task(id: op.id) {
            guard let file = op.localFile else { return }
            let url = OutboxStore.shared.fileURL(file)
            image = await Self.thumbnail(url: url, side: size * 3)
        }
        .accessibilityLabel("Uploading picture")
    }

    @concurrent
    nonisolated private static func thumbnail(url: URL, side: CGFloat) async -> UIImage? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)?.preparingThumbnail(of: CGSize(width: side, height: side))
    }
}

/// What the outbox is doing, when it is doing anything: pictures uploading, a backoff, refusals to look at.
struct OutboxStatusView: View {
    @State private var outbox = OutboxStore.shared

    var body: some View {
        let state = outbox.outbox
        if !state.isEmpty || !state.failed.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                if !state.isEmpty {
                    HStack(spacing: 10) {
                        if outbox.isSending { ProgressView().controlSize(.small) } else { Image(systemName: "clock").foregroundStyle(AN.amber) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(state.uploadCount > 0 ? Wording.uploading(state.uploadCount) : "Saving notes")
                                .font(AN.ui(.subheadline).weight(.medium))
                            if let error = state.lastError {
                                Text("Waiting to retry: \(error)").font(AN.text(.footnote)).foregroundStyle(AN.ink3).lineLimit(2)
                            }
                        }
                        Spacer()
                        if state.lastError != nil {
                            Button("Retry now") { outbox.kick() }.buttonStyle(.anansiOutline)
                        }
                    }
                }
                ForEach(state.failed) { failed in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "exclamationmark.circle").foregroundStyle(AN.rust)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(failed.op.isUpload ? "A picture for \(failed.op.itemTitle) wasn't accepted" : "Notes for \(failed.op.itemTitle) weren't accepted")
                                .font(AN.ui(.subheadline).weight(.medium))
                            Text(failed.message).font(AN.text(.footnote)).foregroundStyle(AN.ink3)
                            HStack {
                                Button("Try again") { outbox.retry(failed.id) }
                                Button("Discard", role: .destructive) { outbox.dismiss(failed.id) }
                            }
                            .font(AN.ui(.footnote))
                            .padding(.top, 2)
                        }
                    }
                }
            }
            .anansiRecess()
        }
    }
}

// MARK: Upcoming, horizons, attention

struct UpcomingSection: View {
    let rows: [UpcomingRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "Upcoming", help: "Next bids and important dates, in time order.")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { Divider().overlay(AN.hairline) }
                    UpcomingRowView(row: row)
                }
            }
            .anansiCard(padding: 4)
        }
    }
}

private struct UpcomingRowView: View {
    let row: UpcomingRow

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: row.isDate ? "gift" : "hand.wave")
                .foregroundStyle(row.isDate ? AN.plum : AN.indigo)
                .frame(width: 28, height: 28)
                .background(row.isDate ? AN.plumSoft : AN.indigoSoft, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(AN.text(.body)).foregroundStyle(AN.ink)
                Text(row.person).font(AN.ui(.footnote)).foregroundStyle(AN.ink3)
            }
            Spacer(minLength: 8)
            Text(Wording.relativeDays(row.daysUntil))
                .font(AN.mono(.caption))
                .foregroundStyle(row.daysUntil < 0 ? AN.rust : row.daysUntil <= 1 ? AN.amber : AN.ink3)
        }
        .padding(12)
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        if row.isDate {
            let label = row.label ?? "Important date"
            if let turning = row.turning { return "\(label) · turning \(turning)" }
            return label
        }
        return row.content ?? "Bid"
    }
}

struct HorizonSection: View {
    let horizons: Horizons
    @State private var showYear = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "On the horizon")
            VStack(alignment: .leading, spacing: 14) {
                group("This month", horizons.month)
                group("This quarter", horizons.quarter)
                if !horizons.year.isEmpty {
                    DisclosureGroup(isExpanded: $showYear) {
                        tasks(horizons.year).padding(.top, 6)
                    } label: {
                        Eyebrow(text: "This year · \(horizons.year.count) \(horizons.year.count == 1 ? "task" : "tasks")")
                    }
                    .tint(AN.ink3)
                }
            }
            .anansiCard()
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ list: [HorizonTask]) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: "\(title) · \(list.count) \(list.count == 1 ? "task" : "tasks")")
                tasks(list)
            }
        }
    }

    private func tasks(_ list: [HorizonTask]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(list) { task in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(task.goalEmoji ?? "•").font(.footnote)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(task.plainTitle).font(AN.text(.body)).foregroundStyle(AN.ink)
                        Text(task.goalTitle).font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                    }
                    Spacer(minLength: 8)
                    if let date = ISODate.parse(task.scheduledAt) {
                        Text(date, format: .dateTime.month(.abbreviated).day())
                            .font(AN.mono(.caption))
                            .foregroundStyle(AN.ink3)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

struct AttentionSection: View {
    let rows: [AttentionRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "People needing attention")
            VStack(alignment: .leading, spacing: 10) {
                ForEach(rows) { row in
                    HStack(spacing: 12) {
                        Text(String(row.name.prefix(1)).uppercased())
                            .font(AN.display(.headline))
                            .foregroundStyle(AN.indigo)
                            .frame(width: 32, height: 32)
                            .background(AN.indigoSoft, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.name).font(AN.text(.body)).foregroundStyle(AN.ink)
                            Text(Wording.attention(row.reason))
                                .font(AN.ui(.footnote))
                                .foregroundStyle(row.reason.kind == "overdue" ? AN.rust : AN.ink3)
                        }
                        Spacer()
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .anansiCard()
        }
    }
}
