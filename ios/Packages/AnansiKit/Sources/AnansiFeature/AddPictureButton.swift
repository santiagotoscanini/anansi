import PhotosUI
import SwiftUI
import UIKit

/// "Add picture": take one with the camera or choose several from the library. Each becomes an upright JPEG
/// (long side ≤ 2048 px) kept on the phone and queued in the outbox, so it uploads even if the app is closed or
/// offline right now.
struct AddPictureButton: View {
    let itemId: String
    let itemTitle: String
    var compact = false

    @State private var selection: [PhotosPickerItem] = []
    @State private var isShowingLibrary = false
    @State private var isShowingCamera = false
    @State private var isPreparing = false
    @State private var error: String?

    private var hasCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        Menu {
            if hasCamera {
                Button("Take a picture", systemImage: "camera") { isShowingCamera = true }
            }
            Button("Choose from library", systemImage: "photo.on.rectangle") { isShowingLibrary = true }
        } label: {
            if isPreparing {
                ProgressView().controlSize(.small)
            } else if compact {
                Label("Add picture", systemImage: "camera")
                    .font(AN.ui(.footnote).weight(.medium))
                    .foregroundStyle(AN.clayDeep)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(AN.clayWash, in: Capsule())
            } else {
                Label("Add picture", systemImage: "camera")
                    .font(AN.ui(.subheadline).weight(.medium))
                    .foregroundStyle(AN.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(AN.canvas, in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: AN.radius, style: .continuous).stroke(AN.hairline2, lineWidth: 1))
            }
        }
        .disabled(isPreparing)
        .photosPicker(isPresented: $isShowingLibrary, selection: $selection, maxSelectionCount: 10, matching: .images)
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { data in
                isShowingCamera = false
                guard let data else { return }
                Task { await add([data]) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: selection) { _, items in
            guard !items.isEmpty else { return }
            selection = []
            Task {
                var datas: [Data] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self) { datas.append(data) }
                }
                await add(datas)
            }
        }
        .alert("Couldn't add the picture", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: {
            Text(error ?? "")
        }
    }

    private func add(_ datas: [Data]) async {
        guard !datas.isEmpty else { return }
        isPreparing = true
        defer { isPreparing = false }
        let now = Date.now
        for (index, data) in datas.enumerated() {
            guard let jpeg = await PicturePrep.jpeg(from: data) else {
                error = "That picture couldn't be read."
                continue
            }
            guard jpeg.count <= ImageSizing.maxUploadBytes else {
                error = "That picture is larger than Anansi's 10 MB limit."
                continue
            }
            do {
                try OutboxStore.shared.addPicture(itemId: itemId, title: itemTitle, jpeg: jpeg,
                                                  fileName: ImageSizing.fileName(for: now, calendar: .current, index: index))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// The system camera, handing back the picture as JPEG data (nil when cancelled).
struct CameraPicker: UIViewControllerRepresentable {
    let completion: (Data?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completion: (Data?) -> Void

        init(completion: @escaping (Data?) -> Void) {
            self.completion = completion
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            completion(image?.jpegData(compressionQuality: 0.92))
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            completion(nil)
        }
    }
}
