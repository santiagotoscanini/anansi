import SwiftUI
import WidgetKit

// The watch face's way in: a complication (and Smart Stack widget) that opens the Apple Watch app at
// `anansiwatch://record`, which starts a voice note at once (or stops the one being recorded). It only draws: it
// reads nothing and holds no state.

@main
struct AnansiWatchWidgets: WidgetBundle {
    var body: some Widget {
        RecordComplication()
    }
}

struct RecordComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.santiagotoscanini.anansi.record", provider: RecordProvider()) { _ in
            RecordComplicationView()
                .widgetURL(URL(string: "anansiwatch://record"))
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Record a thought")
        .description("Records a voice note for Anansi.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}

struct RecordEntry: TimelineEntry {
    var date: Date
}

struct RecordProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecordEntry { RecordEntry(date: .now) }

    func getSnapshot(in context: Context, completion: @escaping (RecordEntry) -> Void) {
        completion(RecordEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecordEntry>) -> Void) {
        completion(Timeline(entries: [RecordEntry(date: .now)], policy: .never))
    }
}

struct RecordComplicationView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.circle.fill")
                    .font(.title2)
                VStack(alignment: .leading) {
                    Text("Anansi").font(.headline)
                    Text("Record a thought").font(.caption)
                }
                Spacer(minLength: 0)
            }
        case .accessoryInline:
            Label("Record a thought", systemImage: "mic")
        case .accessoryCorner:
            Image(systemName: "mic.fill")
                .font(.title3)
                .widgetLabel("Record")
        default:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic.fill")
                    .font(.title2)
            }
        }
    }
}
