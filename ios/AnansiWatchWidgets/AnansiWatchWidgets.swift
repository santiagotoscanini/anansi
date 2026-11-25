import AppIntents
import SwiftUI
import WatchActivity
import WidgetKit

// The watch's ways in, which only draw (they read nothing and hold no state):
// - the control, for the Ultra's Action Button (watch Settings → Action Button → Control → Record a thought) and the
//   watch's Control Center: it runs `ToggleWatchRecordingIntent`, which opens the app recording (or stops it);
// - the complication (and Smart Stack widget), which opens the app at `anansiwatch://record`, to the same effect.

@main
struct AnansiWatchWidgets: WidgetBundle {
    var body: some Widget {
        RecordComplication()
        RecordWatchControl()
    }
}

/// Lets this extension's App Intents metadata include the intent its control runs.
struct AnansiWatchWidgetsIntents: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [WatchActivityIntents.self] }
}

struct RecordWatchControl: ControlWidget {
    static let kind = "com.santiagotoscanini.anansi.watch.record-thought"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: ToggleWatchRecordingIntent()) {
                Label("Record a thought", systemImage: "mic.fill")
            }
        }
        .displayName("Record a thought")
        .description("Record a voice note for your Anansi inbox. Press again to stop and send it.")
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
