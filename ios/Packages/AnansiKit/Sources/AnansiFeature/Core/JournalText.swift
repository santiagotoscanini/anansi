import Foundation

// The journal's text grammar: how an entry names a person. The server's copy is anansi/src/lib/journal.ts.
//
// Stored text carries a mention as a token, `@[Name](person:<id>)`. The id is what links; the name is there so the
// raw text still reads. The phone never writes tokens: it shows them as `@Name` (the person's current name when
// the entry's `mentions` knows the id, the stored one otherwise), lets the user edit that, and sends the plain
// text back. The server links `@Name` to the person of that name on every write.

nonisolated enum JournalText {
    /// A run of an entry's text: plain words, or a person.
    enum Segment: Hashable, Sendable {
        case text(String)
        case mention(personId: String, label: String)
    }

    private struct Token {
        var label: String
        var personId: String
        /// The index just past the token's closing parenthesis.
        var end: String.Index
    }

    /// The text cut into plain runs and mentions, for rendering.
    static func segments(_ text: String) -> [Segment] {
        var out: [Segment] = []
        var plain = ""
        var index = text.startIndex
        while index < text.endIndex {
            if text[index] == "@", let found = token(in: text, at: index) {
                if !plain.isEmpty {
                    out.append(.text(plain))
                    plain = ""
                }
                out.append(.mention(personId: found.personId, label: found.label))
                index = found.end
            } else {
                plain.append(text[index])
                index = text.index(after: index)
            }
        }
        if !plain.isEmpty { out.append(.text(plain)) }
        return out
    }

    /// The people a text mentions, each once, in order of first appearance.
    static func mentionedIds(_ text: String) -> [String] {
        var ids: [String] = []
        for segment in segments(text) {
            if case .mention(let personId, _) = segment, !ids.contains(personId) { ids.append(personId) }
        }
        return ids
    }

    /// The text as a person edits it: every token shown as `@Name`. `names` is person id to current name.
    static func editable(_ text: String, names: [String: String] = [:]) -> String {
        rendered(text, names: names, prefix: "@")
    }

    /// The text with mentions as bare names, for excerpts.
    static func plain(_ text: String, names: [String: String] = [:]) -> String {
        rendered(text, names: names, prefix: "")
    }

    /// `text` with `@Name ` added at the end, set off by a space when the text doesn't end with one.
    static func appendingMention(to text: String, name: String) -> String {
        let mention = "@\(safeLabel(name)) "
        guard let last = text.last else { return mention }
        return last.isWhitespace ? text + mention : text + " " + mention
    }

    private static func rendered(_ text: String, names: [String: String], prefix: String) -> String {
        var out = ""
        for segment in segments(text) {
            switch segment {
            case .text(let run):
                out += run
            case .mention(let personId, let label):
                out += prefix + safeLabel(names[personId] ?? label)
            }
        }
        return out
    }

    /// A name as it can sit inside a token: no `]`, no line break.
    private static func safeLabel(_ name: String) -> String {
        let cleaned = String(name.map { (character: Character) -> Character in
            character == "]" || character.isNewline ? " " : character
        })
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "?" : cleaned
    }

    /// Reads `@[Name](person:<id>)` starting at the `@` at `start`: a name of 1 to 200 characters with no `]` or
    /// line break, and an id of 6 to 64 lowercase letters and digits.
    private static func token(in text: String, at start: String.Index) -> Token? {
        var index = text.index(after: start)
        guard index < text.endIndex, text[index] == "[" else { return nil }
        index = text.index(after: index)

        var label = ""
        var labelLength = 0
        while index < text.endIndex, text[index] != "]" {
            guard !text[index].isNewline, labelLength < 200 else { return nil }
            label.append(text[index])
            labelLength += 1
            index = text.index(after: index)
        }
        guard index < text.endIndex, labelLength > 0 else { return nil }
        index = text.index(after: index)

        for expected in "(person:" {
            guard index < text.endIndex, text[index] == expected else { return nil }
            index = text.index(after: index)
        }

        var personId = ""
        var idLength = 0
        while index < text.endIndex, isIdCharacter(text[index]) {
            guard idLength < 64 else { return nil }
            personId.append(text[index])
            idLength += 1
            index = text.index(after: index)
        }
        guard idLength >= 6, index < text.endIndex, text[index] == ")" else { return nil }
        return Token(label: label, personId: personId, end: text.index(after: index))
    }

    private static func isIdCharacter(_ character: Character) -> Bool {
        guard let ascii = character.asciiValue else { return false }
        return (97...122).contains(ascii) || (48...57).contains(ascii)
    }
}

nonisolated extension JournalEntry {
    /// Person id to current name, for the people this entry mentions.
    var names: [String: String] {
        Dictionary(mentions.map { ($0.personId, $0.name) }, uniquingKeysWith: { first, _ in first })
    }

    /// One line that stands for the day in a list: its first highlight, else the first line of the prose, with
    /// mentions as plain names. Empty when the day only has pictures.
    var excerpt: String {
        let names = self.names
        if let first = highlights.first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return JournalText.plain(first, names: names).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let prose = JournalText.plain(content, names: names)
        let line = prose.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first(where: { !$0.isEmpty })
        return line ?? ""
    }
}
