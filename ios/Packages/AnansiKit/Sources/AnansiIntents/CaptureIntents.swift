import AnansiActivity
import AnansiFeature
import AppIntents
import Foundation

// "Capture a thought", "Add to an open question", "Record a thought" and "Record in Anansi": what the Action
// Button, Siri, Spotlight and Shortcuts run. The App Shortcuts (phrases) are declared in the app target (Anansi/AnansiShortcuts.swift),
// which lists these intents through `AppFeatureIntents` → `AnansiIntentsPackage`.
//
// This target keeps Swift's default (nonisolated) isolation on purpose: the system builds and reads intents off
// the main thread, and `@Parameter` properties cannot be marked `nonisolated` one by one. Everything the intents
// do in the app goes through `CaptureActions` (AnansiFeature), on the main actor, with plain values crossing.

/// Lets the app target's App Intents metadata include the intents declared in this package.
public struct AnansiIntentsPackage: AppIntentsPackage {
    public static var includedPackages: [any AppIntentsPackage.Type] { [AnansiActivityIntents.self] }
}

// MARK: The open question parameter

public struct OpenQuestionEntity: AppEntity {
    public static let typeDisplayRepresentation: TypeDisplayRepresentation = "Open question"
    public static let defaultQuery = OpenQuestionQuery()

    public var id: String
    public var question: String
    public var summary: String?

    init(_ choice: OpenQuestionChoice) {
        id = choice.id
        question = choice.question
        summary = choice.summary
    }

    public var displayRepresentation: DisplayRepresentation {
        if let summary, !summary.isEmpty {
            DisplayRepresentation(title: "\(question)", subtitle: "\(summary)")
        } else {
            DisplayRepresentation(title: "\(question)")
        }
    }
}

/// The user's open questions, from Anansi (`/api/v1/open-questions`), or the last ones read when it can't answer.
public struct OpenQuestionQuery: EntityStringQuery {
    public init() {}

    private func all() async -> [OpenQuestionEntity] {
        await CaptureActions.openQuestions().map(OpenQuestionEntity.init)
    }

    public func entities(for identifiers: [OpenQuestionEntity.ID]) async throws -> [OpenQuestionEntity] {
        let wanted = Set(identifiers)
        return await all().filter { wanted.contains($0.id) }
    }

    public func suggestedEntities() async throws -> [OpenQuestionEntity] {
        await all()
    }

    public func entities(matching string: String) async throws -> [OpenQuestionEntity] {
        let needle = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return await all() }
        return await all().filter { $0.question.localizedStandardContains(needle) }
    }
}

enum CaptureIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notConnected

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notConnected: "This iPhone isn't connected to Anansi yet. Open Anansi and connect it first."
        }
    }
}

private func save(_ text: String, question: OpenQuestionEntity?) async throws -> String {
    do {
        return try await CaptureActions.capture(text: text, questionId: question?.id, questionTitle: question?.question)
    } catch CaptureFailure.notConnected {
        throw CaptureIntentError.notConnected
    }
}

// MARK: Intents

public struct CaptureThoughtIntent: AppIntent {
    public static let title: LocalizedStringResource = "Capture a thought"
    public static let description = IntentDescription(
        "Drop a thought, an idea, a to-do or a question into Anansi. It goes to your TickTick inbox, or to an open question when you pick one.")
    public static let supportedModes: IntentModes = .background

    @Parameter(title: "Thought", inputOptions: String.IntentInputOptions(multiline: true),
               requestValueDialog: "What's on your mind?")
    public var text: String

    @Parameter(title: "Open question")
    public var question: OpenQuestionEntity?

    public init() {}

    public static var parameterSummary: some ParameterSummary {
        Summary("Capture \(\.$text) for \(\.$question)")
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let thought = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !thought.isEmpty else { throw $text.needsValueError("What's on your mind?") }
        let said = try await save(thought, question: question)
        return .result(dialog: "\(said)")
    }
}

public struct AddToQuestionIntent: AppIntent {
    public static let title: LocalizedStringResource = "Add to an open question"
    public static let description = IntentDescription("Add a dated note to one of your open questions in Anansi.")
    public static let supportedModes: IntentModes = .background

    @Parameter(title: "Open question", requestValueDialog: "Which question?")
    public var question: OpenQuestionEntity

    @Parameter(title: "Thought", inputOptions: String.IntentInputOptions(multiline: true),
               requestValueDialog: "What do you want to add?")
    public var text: String

    public init() {}

    public static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) to \(\.$question)")
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let thought = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !thought.isEmpty else { throw $text.needsValueError("What do you want to add?") }
        let said = try await save(thought, question: question)
        return .result(dialog: "\(said)")
    }
}

/// The Action Button's "Record a thought": starts recording at once without opening the app, under a Live
/// Activity (Lock Screen and Dynamic Island) with the time and a Stop button; pressed again, it stops and saves.
/// When the system won't let it record from the background (the microphone not yet allowed, Live Activities off),
/// it opens Anansi's recorder instead.
public struct RecordThoughtIntent: AudioRecordingIntent, LiveActivityIntent {
    public static let title: LocalizedStringResource = "Record a thought"
    public static let description = IntentDescription(
        "Record a voice note without opening Anansi; run it again to stop. The note is transcribed on this iPhone and kept with its audio.")
    public static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    public static let supportedModes: IntentModes = [.background, .foreground(.dynamic)]

    @Parameter(title: "Open question")
    public var question: OpenQuestionEntity?

    public init() {}

    public func perform() async throws -> some IntentResult {
        do {
            _ = try await CaptureActions.toggleRecording(questionId: question?.id, questionTitle: question?.question)
        } catch RecordingStartFailure.notConnected {
            throw CaptureIntentError.notConnected
        } catch {
            try await continueInForeground(alwaysConfirm: false)
            await CaptureActions.record(questionId: question?.id, questionTitle: question?.question)
        }
        return .result()
    }
}

/// "Record in Anansi": opens the app straight into its recorder, which records at once.
public struct OpenRecorderIntent: AppIntent {
    public static let title: LocalizedStringResource = "Record in Anansi"
    public static let description = IntentDescription(
        "Open Anansi straight into a voice recorder. The note is transcribed on this iPhone and kept with its audio.")
    public static let supportedModes: IntentModes = .foreground(.immediate)

    @Parameter(title: "Open question")
    public var question: OpenQuestionEntity?

    public init() {}

    public func perform() async throws -> some IntentResult {
        await CaptureActions.record(questionId: question?.id, questionTitle: question?.question)
        return .result()
    }
}
