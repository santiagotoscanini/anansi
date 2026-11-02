import Foundation
import ImageIO
import Observation
import UIKit
import UniformTypeIdentifiers

/// Attachment pictures, fetched once through `get_sync_attachment` (the `/api/files` URL needs a browser session)
/// and kept on disk by attachment id: an attachment never changes, it is only deleted.
@Observable
final class AttachmentCache {
    static let shared = AttachmentCache()

    private(set) var images: [String: UIImage] = [:]
    /// Attachments the server answered with a note instead of an image (too large, not a picture).
    private(set) var unavailable: Set<String> = []
    @ObservationIgnored private var inFlight: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private let folder: URL

    init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        folder = base.appending(path: "Attachments", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    /// Loads the picture for an attachment if it isn't here yet. Safe to call from every cell.
    func load(_ id: String) {
        guard images[id] == nil, !unavailable.contains(id), inFlight[id] == nil else { return }
        let file = folder.appending(path: id)
        if let data = try? Data(contentsOf: file), let image = UIImage(data: data) {
            images[id] = image
            return
        }
        inFlight[id] = Task {
            defer { inFlight[id] = nil }
            do {
                guard let data = try await MCPClient.shared.attachmentImage(id), let image = UIImage(data: data) else {
                    unavailable.insert(id)
                    return
                }
                try? data.write(to: file, options: .atomic)
                images[id] = image
            } catch {
                // Left unloaded: the next appearance tries again.
            }
        }
    }

    /// A deleted attachment's bytes go too.
    func forget(_ id: String) {
        images[id] = nil
        try? FileManager.default.removeItem(at: folder.appending(path: id))
    }

    func clear() {
        images = [:]
        unavailable = []
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    var diskBytes: Int {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
        return names.reduce(0) { total, name in
            let path = folder.appending(path: name).path(percentEncoded: false)
            let attributes = (try? FileManager.default.attributesOfItem(atPath: path)) ?? [:]
            return total + ((attributes[.size] as? Int) ?? 0)
        }
    }
}

/// Turning whatever the camera or the library hands over (HEIC, PNG, a huge JPEG) into an upright JPEG whose
/// long side is at most `ImageSizing.maxLongSide`, off the main actor.
enum PicturePrep {
    @concurrent
    nonisolated static func jpeg(from data: Data, quality: Double = 0.82) async -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: ImageSizing.maxLongSide,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
