@preconcurrency import AVFoundation
import SwiftUI

/// Where a picture goes: one item of one week.
struct PictureTarget: Equatable {
    /// The sync item (`weeklySyncItemId`) the picture is attached to.
    var itemId: String
    var itemTitle: String
}

/// The pose camera: a 3:4 live preview with the item's outline drawn over it and, optionally, last time's picture
/// faded underneath, so a recurring picture (face, chest, side, back) is framed the same way every week. A
/// self-timer and the front/back switch make it usable alone; "Draw outline" turns the same screen into the
/// outline editor, drawing with a finger straight over the live camera.
///
/// With no `target` it only edits the outline (opened from Sync setup).
struct PoseCameraView: View {
    let trackingItemId: String
    let title: String
    var target: PictureTarget?
    var startDrawing = false

    @State private var library = LibraryStore.shared
    @State private var cache = AttachmentCache.shared
    @State private var engine = CaptureEngine()
    @State private var position: AVCaptureDevice.Position = .back
    @State private var cameraReady = false
    @State private var cameraDenied = false

    @State private var showOutline = true
    @State private var showGhost = true
    @State private var ghostOpacity = 0.35
    @State private var ghostId: String?
    @State private var timer = 0
    @State private var countdown: Int?
    @State private var captured: Data?
    @State private var isSaving = false
    @State private var error: String?

    @State private var isDrawing = false
    @State private var draft = Overlay()
    @State private var stroke: [OverlayPoint] = []
    @State private var lineWidth = 0.006

    @Environment(\.dismiss) private var dismiss

    private var overlay: Overlay? { library.overlay(for: trackingItemId) }

    private struct LineWidth {
        var width: Double
        var name: String
    }

    private static let widths = [LineWidth(width: 0.003, name: "Thin"), LineWidth(width: 0.006, name: "Medium"),
                                 LineWidth(width: 0.012, name: "Thick")]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 12) {
                topBar
                frame
                Spacer(minLength: 0)
                if isDrawing { drawingControls } else if captured != nil { reviewControls } else { shootingControls }
            }
            .padding(.bottom, 12)
            if let countdown {
                Text("\(countdown)")
                    .font(.system(size: 120, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(radius: 8)
                    .contentTransition(.numericText(countsDown: true))
                    .accessibilityLabel("\(countdown) seconds")
            }
        }
        .preferredColorScheme(.dark)
        .tint(AN.clay)
        .task { await setUp() }
        .onDisappear { engine.stop() }
        .alert("Something went wrong", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: {
            Text(error ?? "")
        }
    }

    // MARK: Pieces

    private var topBar: some View {
        HStack(spacing: 16) {
            Button("Close", systemImage: "xmark") {
                if isDrawing && target != nil { isDrawing = false } else { dismiss() }
            }
            .labelStyle(.iconOnly)
            VStack(spacing: 2) {
                Text(title).font(AN.display(.headline))
                Text(isDrawing ? "Draw the outline to line up with" : (target == nil ? "Camera outline" : "Line up and shoot"))
                    .font(AN.mono(.caption2))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
            Button("Switch camera", systemImage: "arrow.triangle.2.circlepath.camera") {
                Task { await flip() }
            }
            .labelStyle(.iconOnly)
            .disabled(captured != nil || countdown != nil)
        }
        .font(.title3)
        .foregroundStyle(.white)
        .padding(.horizontal)
        .padding(.top, 8)
    }

    /// The 3:4 frame: preview (or the picture just taken), ghost, outline, and the drawing surface.
    private var frame: some View {
        GeometryReader { proxy in
            let size = proxy.size
            ZStack {
                if let captured, let image = UIImage(data: captured) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else if cameraReady {
                    CameraPreview(session: engine.session)
                } else {
                    Color(white: 0.1)
                    if cameraDenied {
                        Text("Allow the camera in Settings to take pictures and draw outlines.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white.opacity(0.8))
                            .padding()
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                if captured == nil, showGhost, let ghostId, let ghost = cache.images[ghostId] {
                    Image(uiImage: ghost).resizable().scaledToFill().opacity(ghostOpacity)
                }
                if isDrawing {
                    OverlayStrokes(strokes: draft.strokes, current: stroke, currentWidth: lineWidth, color: AN.claySoft)
                } else if showOutline, let overlay {
                    OverlayStrokes(strokes: overlay.strokes)
                        .opacity(captured == nil ? 0.9 : 0.5)
                }
            }
            .frame(width: size.width, height: size.height)
            .clipped()
            .contentShape(Rectangle())
            .gesture(drawGesture(in: size), including: isDrawing ? .all : .none)
        }
        .aspectRatio(Overlay.frameAspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
        .padding(.horizontal, 8)
    }

    private func drawGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                stroke.append(OverlayPoint(x: value.location.x / max(1, size.width), y: value.location.y / max(1, size.height)))
            }
            .onEnded { _ in
                if !draft.add(stroke, width: lineWidth) {
                    error = "The outline is full. Undo some lines or clear it."
                }
                stroke = []
            }
    }

    private var shootingControls: some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                if overlay != nil {
                    toggle("Outline", systemImage: "figure.stand", isOn: $showOutline)
                }
                if ghostId != nil {
                    toggle("Last time", systemImage: "square.2.layers.3d", isOn: $showGhost)
                }
                Menu {
                    Picker("Timer", selection: $timer) {
                        Text("Off").tag(0)
                        Text("3 seconds").tag(3)
                        Text("10 seconds").tag(10)
                    }
                } label: {
                    chip(timer == 0 ? "Timer" : "\(timer)s", systemImage: "timer", active: timer > 0)
                }
                Button {
                    beginDrawing()
                } label: {
                    chip(overlay == nil ? "Draw outline" : "Edit outline", systemImage: "scribble", active: false)
                }
            }
            if showGhost, ghostId != nil {
                HStack {
                    Image(systemName: "circle.lefthalf.filled").foregroundStyle(.white.opacity(0.7))
                    Slider(value: $ghostOpacity, in: 0.1...0.7)
                        .accessibilityLabel("Last time's picture opacity")
                }
                .padding(.horizontal, 32)
            }
            if target != nil {
                Button {
                    Task { await shoot() }
                } label: {
                    ZStack {
                        Circle().stroke(.white, lineWidth: 4).frame(width: 74, height: 74)
                        Circle().fill(countdown == nil ? .white : AN.clay).frame(width: 60, height: 60)
                    }
                }
                .disabled(!cameraReady || countdown != nil)
                .accessibilityLabel(timer == 0 ? "Take picture" : "Take picture in \(timer) seconds")
            }
        }
    }

    private var reviewControls: some View {
        HStack(spacing: 12) {
            Button("Retake") { captured = nil }
                .buttonStyle(.anansiOutline)
            Button {
                Task { await usePicture() }
            } label: {
                if isSaving { ProgressView().tint(AN.onClay) } else { Text("Use picture") }
            }
            .buttonStyle(.anansiPrimary)
            .disabled(isSaving)
        }
        .padding(.horizontal)
    }

    private var drawingControls: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                ForEach(Self.widths, id: \.width) { option in
                    Button {
                        lineWidth = option.width
                    } label: {
                        chip(option.name, systemImage: "pencil.tip", active: lineWidth == option.width)
                    }
                }
                Button {
                    if !draft.strokes.isEmpty { draft.strokes.removeLast() }
                } label: {
                    chip("Undo", systemImage: "arrow.uturn.backward", active: false)
                }
                .disabled(draft.strokes.isEmpty)
            }
            HStack(spacing: 12) {
                Button("Clear", role: .destructive) { draft.strokes = [] }
                    .buttonStyle(.anansiOutline)
                    .disabled(draft.strokes.isEmpty)
                Button {
                    Task { await saveOutline() }
                } label: {
                    if isSaving { ProgressView().tint(AN.onClay) } else { Text(draft.isEmpty ? "Remove outline" : "Save outline") }
                }
                .buttonStyle(.anansiPrimary)
                .disabled(isSaving || (draft.isEmpty && overlay == nil))
            }
            .padding(.horizontal)
            Text("Trace where your body should be: head, shoulders, the edge of the frame. It shows on the camera every time you take this picture.")
                .font(AN.text(.footnote))
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }

    private func toggle(_ label: String, systemImage: String, isOn: Binding<Bool>) -> some View {
        Button {
            isOn.wrappedValue.toggle()
        } label: {
            chip(label, systemImage: systemImage, active: isOn.wrappedValue)
        }
        .accessibilityValue(isOn.wrappedValue ? "On" : "Off")
    }

    private func chip(_ label: String, systemImage: String, active: Bool) -> some View {
        Label(label, systemImage: systemImage)
            .font(AN.ui(.caption).weight(.medium))
            .foregroundStyle(active ? AN.onClay : .white)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(active ? AN.clay : Color.white.opacity(0.15), in: Capsule())
    }

    // MARK: Actions

    private func setUp() async {
        if library.items.isEmpty { await library.load() }
        if let camera = overlay?.camera { position = camera == "front" ? .front : .back }
        if startDrawing { beginDrawing() }
        Task { await loadGhost() }
        guard await CaptureEngine.requestAccess() else {
            cameraDenied = true
            return
        }
        if await engine.use(position) {
            engine.start()
            cameraReady = true
        } else {
            error = "This device has no camera to use."
        }
    }

    private func loadGhost() async {
        guard let latest = try? await APIClient.shared.latestPicture(trackingItemId, excluding: target?.itemId) else { return }
        ghostId = latest.id
        cache.load(latest.id)
    }

    private func flip() async {
        let next: AVCaptureDevice.Position = position == .back ? .front : .back
        if await engine.use(next) { position = next }
    }

    private func beginDrawing() {
        draft = overlay ?? Overlay()
        draft.camera = position == .front ? "front" : "back"
        stroke = []
        isDrawing = true
    }

    private func shoot() async {
        if timer > 0 {
            for remaining in stride(from: timer, through: 1, by: -1) {
                withAnimation { countdown = remaining }
                do { try await Task.sleep(for: .seconds(1)) } catch { countdown = nil; return }
            }
            countdown = nil
        }
        guard let data = await engine.capture() else {
            error = "The camera didn't take the picture. Try again."
            return
        }
        captured = data
    }

    private func usePicture() async {
        guard let captured, let target else { return }
        isSaving = true
        defer { isSaving = false }
        guard let jpeg = await PicturePrep.jpeg(from: captured) else {
            error = "That picture couldn't be read."
            return
        }
        do {
            try OutboxStore.shared.addPicture(itemId: target.itemId, title: target.itemTitle, jpeg: jpeg,
                                              fileName: ImageSizing.fileName(for: .now, calendar: .current))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func saveOutline() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await library.setOverlay(draft.isEmpty ? nil : draft, for: trackingItemId)
            showOutline = true
            isDrawing = false
            if target == nil { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
