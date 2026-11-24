import Foundation
import Testing
@testable import AnansiFeature

/// A header like the recorder writes: RIFF, WAVE, fmt (16 kHz mono 16-bit), an optional padding chunk, data.
private func header(riffSize: UInt32 = 0, dataSize: UInt32 = 0, filler: Int = 0) -> Data {
    var d = Data("RIFF".utf8) + WAVFile.littleEndian(riffSize) + Data("WAVE".utf8)
    d += Data("fmt ".utf8) + WAVFile.littleEndian(16)
    d += Data([1, 0, 1, 0]) + WAVFile.littleEndian(16_000) + WAVFile.littleEndian(32_000) + Data([2, 0, 16, 0])
    if filler > 0 {
        d += Data("FLLR".utf8) + WAVFile.littleEndian(UInt32(filler)) + Data(count: filler + filler % 2)
    }
    d += Data("data".utf8) + WAVFile.littleEndian(dataSize)
    return d
}

@Suite struct CoreWAVFileTests {
    @Test func findsWhereTheSamplesStart() {
        #expect(WAVFile.layout(header: header()) == WAVFile.Layout(dataOffset: 44, byteRate: 32_000))
        // A padding chunk before the samples (what Core Audio writes) moves them.
        #expect(WAVFile.layout(header: header(filler: 3))?.dataOffset == 44 + 8 + 4)
    }

    @Test func refusesWhatIsNotAWAV() {
        #expect(WAVFile.layout(header: Data()) == nil)
        #expect(WAVFile.layout(header: Data("ID3 something else".utf8)) == nil)
        // Cut before the data chunk: the header was never written whole.
        #expect(WAVFile.layout(header: header().prefix(30)) == nil)
    }

    @Test func anUnclosedHeaderGetsTheFileSizes() {
        let layout = WAVFile.Layout(dataOffset: 44, byteRate: 32_000)
        let length = 44 + 64_000
        #expect(WAVFile.patches(layout: layout, fileLength: length) == [
            WAVFile.Patch(offset: 4, value: UInt32(length - 8)),
            WAVFile.Patch(offset: 40, value: 64_000),
        ])
        #expect(WAVFile.seconds(layout: layout, fileLength: length) == 2)
        #expect(WAVFile.seconds(layout: layout, fileLength: 10) == 0)
    }
}
