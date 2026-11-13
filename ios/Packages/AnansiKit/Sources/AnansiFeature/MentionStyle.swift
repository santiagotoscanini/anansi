import SwiftUI

/// Text that names people, for the screen: a mention (the stored token `@[Name](person:<id>)`) drawn as a tinted,
/// bold `@Name`. `names` is person id to current name, for texts that come with one (a journal entry's
/// `mentions`); without it the name stored in the token is shown, which the server keeps current.
enum MentionStyle {
    static func attributed(_ text: String, names: [String: String] = [:]) -> AttributedString {
        let tint: Color = AN.clayDeep
        var out = AttributedString()
        for segment in MentionText.segments(text) {
            switch segment {
            case .text(let run):
                out.append(AttributedString(run))
            case .mention(let personId, let label):
                var piece = AttributedString("@" + (names[personId] ?? label))
                piece.foregroundColor = tint
                piece.inlinePresentationIntent = .stronglyEmphasized
                out.append(piece)
            }
        }
        return out
    }
}
