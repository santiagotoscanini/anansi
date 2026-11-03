import Foundation
@testable import AnansiFeature
import Testing

struct CoreOverlayTests {
    @Test func dropsPointsOnAStraightLine() {
        let line = (0...100).map { OverlayPoint(x: Double($0) / 100, y: 0.5) }
        let simplified = Overlay.simplify(line, tolerance: 0.001)
        #expect(simplified == [OverlayPoint(x: 0, y: 0.5), OverlayPoint(x: 1, y: 0.5)])
    }

    @Test func keepsCorners() {
        let corner = [OverlayPoint(x: 0, y: 0), OverlayPoint(x: 0.25, y: 0), OverlayPoint(x: 0.5, y: 0),
                      OverlayPoint(x: 0.5, y: 0.25), OverlayPoint(x: 0.5, y: 0.5)]
        #expect(Overlay.simplify(corner, tolerance: 0.001) == [corner[0], corner[2], corner[4]])
    }

    @Test func addsAClampedRoundedStroke() {
        var overlay = Overlay(camera: "front")
        let added = overlay.add([OverlayPoint(x: -0.2, y: 0.123456), OverlayPoint(x: 1.4, y: 0.123456)], width: 0.5)
        #expect(added)
        #expect(overlay.strokes.count == 1)
        #expect(overlay.strokes[0].points == [[0, 0.1235], [1, 0.1235]])
        #expect(overlay.strokes[0].width == 0.1)
        #expect(overlay.isValid)
    }

    @Test func refusesWhatTheServerWouldRefuse() {
        var overlay = Overlay()
        let addedEmpty = overlay.add([], width: 0.006)
        #expect(!addedEmpty)
        let zigzag = (0..<4000).map { OverlayPoint(x: Double($0 % 2), y: Double($0) / 4000) }
        for _ in 0..<5 { overlay.add(zigzag, width: 0.006) }
        #expect(overlay.pointCount <= Overlay.maxPoints)
        let addedPastTheLimit = overlay.add(zigzag, width: 0.006)
        #expect(!addedPastTheLimit)
        #expect(overlay.isValid)
    }

    @Test func encodesLikeTheServerSchema() throws {
        var overlay = Overlay(camera: "back")
        overlay.add([OverlayPoint(x: 0.1, y: 0.2), OverlayPoint(x: 0.3, y: 0.9)], width: 0.006)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json = String(decoding: try encoder.encode(overlay), as: UTF8.self)
        #expect(json == #"{"aspect":0.75,"camera":"back","strokes":[{"points":[[0.1,0.2],[0.3,0.9]],"width":0.006}],"version":1}"#)
        #expect(try JSONDecoder().decode(Overlay.self, from: Data(json.utf8)) == overlay)
    }
}
