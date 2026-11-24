import ActivityKit
import AnansiActivity
import AppIntents
import SwiftUI
import WidgetKit

/// The voice note being recorded: shown on the Lock Screen and in the Dynamic Island for the whole recording (the
/// system stops a background recording that has none), with the time and a Stop button.
struct RecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecordingActivityAttributes.self) { context in
            LockScreenRecording(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(Palette.clay)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.state.saved ? "Saved" : "Recording")
                    } icon: {
                        Image(systemName: context.state.saved ? "checkmark.circle.fill" : "mic.fill")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(context.state.saved ? Palette.moss : Palette.clayBright)
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedTime(state: context.state)
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 12) {
                        Text(subtitle(context.attributes))
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if !context.state.saved { StopButton(tint: Palette.clayBright) }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: context.state.saved ? "checkmark" : "mic.fill")
                    .foregroundStyle(context.state.saved ? Palette.moss : Palette.clayBright)
            } compactTrailing: {
                ElapsedTime(state: context.state)
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Palette.clayBright)
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: context.state.saved ? "checkmark" : "mic.fill")
                    .foregroundStyle(context.state.saved ? Palette.moss : Palette.clayBright)
            }
            .keylineTint(Palette.clayBright)
        }
    }
}

private func subtitle(_ attributes: RecordingActivityAttributes) -> String {
    if let question = attributes.questionTitle, !question.isEmpty { return "For “\(question)”" }
    return "A voice note for your Anansi inbox"
}

/// The time since the recording started, counted by the system (no updates needed). Stops at the limit.
private struct ElapsedTime: View {
    let state: RecordingActivityAttributes.ContentState

    var body: some View {
        if state.saved {
            Text("Saved")
        } else {
            Text(timerInterval: state.startedAt...max(state.startedAt, state.endsBy), countsDown: false,
                 showsHours: false)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct StopButton: View {
    let tint: Color

    var body: some View {
        Button(intent: StopRecordingIntent()) {
            Label("Stop", systemImage: "stop.fill")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
        .accessibilityLabel("Stop recording")
    }
}

private struct LockScreenRecording: View {
    let attributes: RecordingActivityAttributes
    let state: RecordingActivityAttributes.ContentState
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let dark = scheme == .dark
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(state.saved ? Palette.moss : Palette.clay)
                Image(systemName: state.saved ? "checkmark" : "mic.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Palette.onClay)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.saved ? "Saved to Anansi" : "Recording a thought")
                    .font(.headline)
                    .foregroundStyle(dark ? Palette.inkDark : Palette.ink)
                Text(subtitle(attributes))
                    .font(.footnote)
                    .foregroundStyle(dark ? Palette.ink3Dark : Palette.ink3)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if !state.saved {
                VStack(alignment: .trailing, spacing: 6) {
                    ElapsedTime(state: state)
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(dark ? Palette.inkDark : Palette.ink)
                        .frame(maxWidth: 80, alignment: .trailing)
                    StopButton(tint: Palette.clay)
                }
            }
        }
        .padding(16)
        .background(dark ? Palette.paperDark : Palette.paper)
    }
}
