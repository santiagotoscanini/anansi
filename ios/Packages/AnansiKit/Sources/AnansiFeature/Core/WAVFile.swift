import Foundation

// A recording the app did not live to finish (killed, crashed, the phone died) is still a WAV on disk, but its
// header was never closed: the sizes in it say nothing, or less than what is there. `RecordingRecovery` reads the
// header with this, writes the real sizes in, and queues the note like any other. Pure, so it is tested.

nonisolated enum WAVFile {
    /// Where the samples start and how many bytes a second of them takes.
    struct Layout: Equatable, Sendable {
        var dataOffset: Int
        var byteRate: Int
    }

    /// A 4-byte patch: write `value` little-endian at `offset`.
    struct Patch: Equatable, Sendable {
        var offset: Int
        var value: UInt32
    }

    /// Reads the chunks of a RIFF/WAVE header (the first few KB of the file) up to the `data` chunk. Nil when it is
    /// not a WAV, or the header ends before the samples start.
    static func layout(header: Data) -> Layout? {
        let bytes = [UInt8](header)
        guard bytes.count >= 12, ascii(bytes, 0) == "RIFF", ascii(bytes, 8) == "WAVE" else { return nil }
        var position = 12
        var byteRate: Int?
        while position + 8 <= bytes.count {
            let id = ascii(bytes, position)
            let size = Int(uint32(bytes, position + 4))
            let body = position + 8
            if id == "fmt ", body + 12 <= bytes.count {
                byteRate = Int(uint32(bytes, body + 8))
            }
            if id == "data" {
                guard let byteRate, byteRate > 0 else { return nil }
                return Layout(dataOffset: body, byteRate: byteRate)
            }
            // Chunks are padded to an even length.
            position = body + size + (size % 2)
        }
        return nil
    }

    /// The header's two sizes for a file of `fileLength` bytes: the RIFF size and the `data` chunk's.
    static func patches(layout: Layout, fileLength: Int) -> [Patch] {
        let riff = UInt32(clamping: max(0, fileLength - 8))
        let data = UInt32(clamping: max(0, fileLength - layout.dataOffset))
        return [Patch(offset: 4, value: riff), Patch(offset: layout.dataOffset - 4, value: data)]
    }

    /// How long the samples in a file of `fileLength` bytes last, in seconds.
    static func seconds(layout: Layout, fileLength: Int) -> TimeInterval {
        Double(max(0, fileLength - layout.dataOffset)) / Double(layout.byteRate)
    }

    static func littleEndian(_ value: UInt32) -> Data {
        withUnsafeBytes(of: value.littleEndian) { Data($0) }
    }

    private static func ascii(_ bytes: [UInt8], _ at: Int) -> String {
        guard at + 4 <= bytes.count else { return "" }
        return String(decoding: bytes[at..<at + 4], as: UTF8.self)
    }

    private static func uint32(_ bytes: [UInt8], _ at: Int) -> UInt32 {
        guard at + 4 <= bytes.count else { return 0 }
        return UInt32(bytes[at]) | UInt32(bytes[at + 1]) << 8 | UInt32(bytes[at + 2]) << 16 | UInt32(bytes[at + 3]) << 24
    }
}
