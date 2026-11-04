@preconcurrency import AVFoundation
import SwiftUI
import UIKit

/// The capture session behind the pose camera: one wide-angle camera (front or back), a photo output, everything on
/// one serial queue. Pictures are portrait and, with the front camera, mirrored exactly as previewed, so the
/// outline, the ghost of last time and the saved picture all share one frame.
nonisolated final class CaptureEngine: NSObject, @unchecked Sendable, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "anansi.camera")
    private let output = AVCapturePhotoOutput()
    private var input: AVCaptureDeviceInput?
    private var pending: CheckedContinuation<Data?, Never>?

    static func requestAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    /// Switches to the camera at `position` (configuring the session the first time). False when there is none.
    func use(_ position: AVCaptureDevice.Position) async -> Bool {
        await withCheckedContinuation { continuation in
            queue.async { continuation.resume(returning: self.configure(position)) }
        }
    }

    private func configure(_ position: AVCaptureDevice.Position) -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.photo) { session.sessionPreset = .photo }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let newInput = try? AVCaptureDeviceInput(device: device)
        else { return false }
        if let input { session.removeInput(input) }
        guard session.canAddInput(newInput) else {
            if let input { session.addInput(input) }
            return false
        }
        session.addInput(newInput)
        input = newInput
        if !session.outputs.contains(output), session.canAddOutput(output) { session.addOutput(output) }
        if let connection = output.connection(with: .video) {
            if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = position == .front
            }
        }
        return true
    }

    func start() {
        queue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    func stop() {
        queue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    /// Takes a picture: JPEG data, or nil when the camera failed.
    func capture() async -> Data? {
        await withCheckedContinuation { continuation in
            queue.async {
                guard self.pending == nil, self.session.isRunning else {
                    continuation.resume(returning: nil)
                    return
                }
                self.pending = continuation
                let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                self.output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = error == nil ? photo.fileDataRepresentation() : nil
        queue.async {
            self.pending?.resume(returning: data)
            self.pending = nil
        }
    }
}

/// The live preview, filling its frame (aspect fill, which for the 3:4 frame is the whole picture).
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.backgroundColor = .black
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        if let connection = view.previewLayer.connection, connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }
}

/// An overlay's strokes drawn into a frame of any size (coordinates are 0…1 of the frame).
struct OverlayStrokes: View {
    let strokes: [Overlay.Stroke]
    var current: [OverlayPoint] = []
    var currentWidth: Double = 0.006
    var color: Color = .white

    var body: some View {
        // The renderer can run off the main thread (see `Color(light:dark:)`): plain values only, never `self`.
        let strokes = self.strokes
        let current = self.current
        let currentWidth = self.currentWidth
        let color = self.color
        Canvas { @Sendable context, size in
            func path(_ points: [OverlayPoint]) -> Path {
                var path = Path()
                guard let first = points.first else { return path }
                path.move(to: CGPoint(x: first.x * size.width, y: first.y * size.height))
                if points.count == 1 {
                    path.addLine(to: CGPoint(x: first.x * size.width + 0.1, y: first.y * size.height))
                }
                for point in points.dropFirst() {
                    path.addLine(to: CGPoint(x: point.x * size.width, y: point.y * size.height))
                }
                return path
            }
            func draw(_ points: [OverlayPoint], width: Double) {
                let lineWidth = max(1, width * size.width)
                let style = StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
                // A dark halo under the line keeps it visible on light and dark backgrounds alike.
                context.stroke(path(points), with: .color(.black.opacity(0.45)),
                               style: StrokeStyle(lineWidth: lineWidth + 3, lineCap: .round, lineJoin: .round))
                context.stroke(path(points), with: .color(color), style: style)
            }
            for stroke in strokes { draw(stroke.overlayPoints, width: stroke.width) }
            if !current.isEmpty { draw(current, width: currentWidth) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
