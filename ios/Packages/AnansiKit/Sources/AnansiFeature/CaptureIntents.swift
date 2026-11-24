import AppIntents
import Foundation

// "Capture a thought", "Add to an open question" and "Record a thought": what the Action Button, Siri, Spotlight
// and Shortcuts run. The App Shortcuts (phrases) are declared in the app target (Anansi/AnansiShortcuts.swift),
// which lists this package's intents through `AppFeatureIntents` → `AnansiFeatureIntents`.
//
// The intents are `nonisolated` values (the system builds and reads them off the main thread); `perform` hops to
// the main actor, where the outbox and the stores live, and only plain values cross.

/// Lets the app target's App Intents metadata include the intents declared in this package.
public struct AnansiFeatureIntents: AppIntentsPackage {}

// MARK: The open question parameter

public nonisolated struct OpenQuestionEntity: AppEntity {
    public static let typeDisplayRepresentation: TypeDisplayRepresentation = "Open question"
    public static let defaultQuery = OpenQuestionQuery()

    public var id: String
    public var question: String
    var summary: String?

    init(_ ref: OpenQuestionRef) {
        id = ref.id
        question = ref.question
        summary = ref.summary
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
public nonisolated struct OpenQuestionQuery: EntityStringQuery {
    public init() {}

    private func all() async -> [OpenQuestionEntity] {
        await CaptureStore.shared.loadQuestions().map(OpenQuestionEntity.init)
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

nonisolated enum CaptureIntentError: Error, CustomLocalizedStringResourceConvertible {
    case notConnected

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notConnected: "This iPhone isn't connected to Anansi yet. Open Anansi and connect it first."
        }
    }
}

/// Queues the thought in the outbox (so it goes later when offline) and gives it a few seconds to go now.
@MainActor
private func saveThought(_ text: String, question: OpenQuestionEntity?) async throws -> String {
    guard Connection.shared.isConnected else { throw CaptureIntentError.notConnected }
    let itemId = OutboxStore.shared.capture(text: text, questionId: question?.id)
    _ = await OutboxStore.shared.waitUntilSent(itemId, timeout: .seconds(6))
    return CaptureRules.confirmation(question: question?.question)
}

// MARK: Intents

public nonisolated struct CaptureThoughtIntent: AppIntent {
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

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let thought = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !thought.isEmpty else { throw $text.needsValueError("What's on your mind?") }
        let said = try await saveThought(thought, question: question)
        return .result(dialog: "\(said)")
    }
}

public nonisolated struct AddToQuestionIntent: AppIntent {
    public static let title: LocalizedStringResource = "Add to an open question"
    public static let description = IntentDescription(
        "Add a dated note to one of your open questions in Anansi.")
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

    @MainActor
    public func perform() async throws -> some IntentResult & ProvidesDialog {
        let thought = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !thought.isEmpty else { throw $text.needsValueError("What do you want to add?") }
        let said = try await saveThought(thought, question: question)
        return .result(dialog: "\(said)")
    }
}

public nonisolated struct RecordThoughtIntent: AppIntent {
    public static let title: LocalizedStringResource = "Record a thought"
    public static let description = IntentDescription(
        "Open Anansi straight into a voice recorder. The note is transcribed on this iPhone and kept with its audio.")
    public static let supportedModes: IntentModes = .foreground(.immediate)

    @Parameter(title: "Open question")
    public var question: OpenQuestionEntity?

    public init() {}

    @MainActor
    public func perform() async throws -> some IntentResult {
        CaptureStore.shared.recording = RecordRequest(questionId: question?.id, questionTitle: question?.question)
        return .result()
    }
}
