import Foundation

// `WAVFile` against a file on disk: how long a recording lasts, and closing the header of one that was cut off.
// Shared by the phone's `RecordingRecovery` and the Apple Watch's recovery of its own unfinished notes.

public nonisolated enum WAVDisk {
    /// How long the samples in a WAV file last, or nil when it is not a readable WAV.
    public static func seconds(of url: URL) -> TimeInterval? {
        guard let length = size(of: url), let layout = layout(of: url) else { return nil }
        return WAVFile.seconds(layout: layout, fileLength: length)
    }

    public static func size(of url: URL) -> Int? {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path(percentEncoded: false))
        return attributes?[.size] as? Int
    }

    public static func layout(of url: URL) -> WAVFile.Layout? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let header = try? handle.read(upToCount: 4096) else { return nil }
        return WAVFile.layout(header: header)
    }

    /// Writes the real sizes into the header of a recording that never closed it.
    public static func repair(_ url: URL, layout: WAVFile.Layout, fileLength: Int) {
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        for patch in WAVFile.patches(layout: layout, fileLength: fileLength) {
            try? handle.seek(toOffset: UInt64(patch.offset))
            try? handle.write(contentsOf: WAVFile.littleEndian(patch.value))
        }
    }

    /// When the file was started: its creation date, else its last change.
    public static func started(_ url: URL) -> Date {
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path(percentEncoded: false))
        return (attributes?[.creationDate] as? Date) ?? (attributes?[.modificationDate] as? Date) ?? .now
    }

    /// A recording left unfinished, made whole: its header repaired. Answers its length in seconds, or nil when it
    /// holds nothing worth keeping (a header and no samples), in which case the file is deleted. A file that is not
    /// a readable WAV is kept with a length of 0: the server keeps the audio even if it cannot read it.
    public static func recover(_ url: URL) -> TimeInterval? {
        guard let length = size(of: url) else { return nil }
        guard let layout = layout(of: url) else { return 0 }
        let seconds = WAVFile.seconds(layout: layout, fileLength: length)
        if RecordingRules.durationMs(seconds: seconds) == nil {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        repair(url, layout: layout, fileLength: length)
        return seconds
    }
}
