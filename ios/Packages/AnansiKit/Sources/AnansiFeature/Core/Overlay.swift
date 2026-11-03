import Foundation

/// A camera overlay: the outline you draw once (face, chest, side, back) and the camera shows every week, so a
/// recurring picture is framed the same way. Strokes are polylines in coordinates normalized to the camera frame,
/// (0,0) top-left to (1,1) bottom-right, so it fits any screen. Mirrors `overlaySchema` in anansi/src/lib/overlay.ts,
/// limits included; it is stored on the tracking item.
nonisolated struct Overlay: Codable, Hashable, Sendable {
    nonisolated struct Stroke: Codable, Hashable, Sendable {
        /// `[x, y]` pairs, each 0…1.
        var points: [[Double]]
        /// Line width as a fraction of the frame's width.
        var width: Double

        init(points: [OverlayPoint], width: Double) {
            self.points = points.map { [$0.x, $0.y] }
            self.width = width
        }

        var overlayPoints: [OverlayPoint] {
            points.compactMap { pair in pair.count == 2 ? OverlayPoint(x: pair[0], y: pair[1]) : nil }
        }
    }

    var version = 1
    /// The frame's width / height when drawn (3:4 portrait = 0.75).
    var aspect: Double
    /// "front" or "back": which camera the outline was drawn for.
    var camera: String?
    var strokes: [Stroke]

    static let maxPoints = 20_000
    static let maxStrokes = 300
    static let maxPointsPerStroke = 4000
    static let widthRange = 0.001...0.1
    /// The camera frame the app draws and shoots in: 3:4 portrait.
    static let frameAspect = 3.0 / 4.0
    /// Points closer than this (in frame units) to the simplified line are dropped.
    static let tolerance = 0.0015

    init(aspect: Double = Overlay.frameAspect, camera: String? = nil, strokes: [Stroke] = []) {
        self.aspect = aspect
        self.camera = camera
        self.strokes = strokes
    }

    var pointCount: Int { strokes.reduce(0) { $0 + $1.points.count } }
    var isEmpty: Bool { strokes.isEmpty }

    /// Adds a drawn stroke: clamped to the frame, simplified, rounded. Returns false when the overlay is full.
    @discardableResult
    mutating func add(_ raw: [OverlayPoint], width: Double) -> Bool {
        guard strokes.count < Self.maxStrokes else { return false }
        let clamped = raw.map { OverlayPoint(x: min(1, max(0, $0.x)), y: min(1, max(0, $0.y))) }
        var simplified = Self.simplify(clamped, tolerance: Self.tolerance).map(\.rounded)
        if simplified.count > Self.maxPointsPerStroke { simplified = Array(simplified.prefix(Self.maxPointsPerStroke)) }
        guard !simplified.isEmpty, pointCount + simplified.count <= Self.maxPoints else { return false }
        let clampedWidth = min(Self.widthRange.upperBound, max(Self.widthRange.lowerBound, width))
        strokes.append(Stroke(points: simplified, width: (clampedWidth * 10_000).rounded() / 10_000))
        return true
    }

    /// Whether the server will take it (the same bounds as its schema).
    var isValid: Bool {
        version == 1 && (0.2...5).contains(aspect) && strokes.count <= Self.maxStrokes && pointCount <= Self.maxPoints
            && strokes.allSatisfy { stroke in
                !stroke.points.isEmpty && stroke.points.count <= Self.maxPointsPerStroke
                    && Self.widthRange.contains(stroke.width)
                    && stroke.points.allSatisfy { $0.count == 2 && (0...1).contains($0[0]) && (0...1).contains($0[1]) }
            }
    }

    /// Ramer–Douglas–Peucker: drops points that stay within `tolerance` of the line between their neighbours.
    static func simplify(_ points: [OverlayPoint], tolerance: Double) -> [OverlayPoint] {
        guard points.count > 2 else { return points }
        var keep = [Bool](repeating: false, count: points.count)
        keep[0] = true
        keep[points.count - 1] = true
        var stack = [(0, points.count - 1)]
        while let (start, end) = stack.popLast() {
            guard end > start + 1 else { continue }
            var farthest = start
            var distance = 0.0
            for index in (start + 1)..<end {
                let d = points[index].distance(toSegment: points[start], points[end])
                if d > distance {
                    distance = d
                    farthest = index
                }
            }
            if distance > tolerance {
                keep[farthest] = true
                stack.append((start, farthest))
                stack.append((farthest, end))
            }
        }
        return points.indices.filter { keep[$0] }.map { points[$0] }
    }
}

nonisolated struct OverlayPoint: Hashable, Sendable {
    var x: Double
    var y: Double

    /// Four decimals: a tenth of a pixel on any phone, and a small JSON.
    var rounded: OverlayPoint {
        OverlayPoint(x: (x * 10_000).rounded() / 10_000, y: (y * 10_000).rounded() / 10_000)
    }

    func distance(toSegment a: OverlayPoint, _ b: OverlayPoint) -> Double {
        let dx = b.x - a.x
        let dy = b.y - a.y
        let lengthSquared = dx * dx + dy * dy
        guard lengthSquared > 0 else { return ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y)).squareRoot() }
        let t = max(0, min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared))
        let px = a.x + t * dx
        let py = a.y + t * dy
        return ((x - px) * (x - px) + (y - py) * (y - py)).squareRoot()
    }
}
