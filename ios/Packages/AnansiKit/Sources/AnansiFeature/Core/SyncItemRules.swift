import Foundation

// How many pictures a week of a tracking item takes (`photosPerWeek`, 1 to 12; nil is any number). The screens
// only: the server enforces nothing. The web has the same rules in src/lib/sync-item.ts.
nonisolated enum SyncItemRules {
    /// Whether another picture fits this week. Pictures still uploading count.
    static func canAddPicture(limit: Int?, pictures: Int) -> Bool {
        guard let limit else { return true }
        return pictures < limit
    }

    /// How many more fit, or nil for any number.
    static func remaining(limit: Int?, pictures: Int) -> Int? {
        limit.map { max(0, $0 - pictures) }
    }

    /// An item that takes exactly one picture shows one slot, replaced rather than added to.
    static func isSingle(limit: Int?) -> Bool { limit == 1 }
}
