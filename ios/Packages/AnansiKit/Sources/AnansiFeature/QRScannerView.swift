import SwiftUI
import VisionKit

/// Scans the QR code the web's Devices panel shows (an `anansi://connect` link) and hands back the link.
struct QRScannerView: View {
    let onFound: (ConnectLink) -> Void
    let onCancel: () -> Void
    @State private var message = "Point the camera at the QR code in Anansi on the web (your profile, then Devices)."

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()
            if DataScannerViewController.isSupported, DataScannerViewController.isAvailable {
                QRScanner { payload in
                    if let link = ConnectLink(string: payload) {
                        onFound(link)
                    } else {
                        message = "That QR code isn't an Anansi key. Create one in your profile, under Devices."
                    }
                }
                .ignoresSafeArea()
            } else {
                Text("This iPhone can't scan here. Use the iPhone Camera app on the QR code, or enter the key by hand.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                    .padding()
                    .frame(maxHeight: .infinity)
            }
            VStack(spacing: 12) {
                Text(message)
                    .font(AN.text(.subheadline))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                Button("Cancel", action: onCancel).buttonStyle(.anansiOutline)
            }
            .padding()
            .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: AN.radiusLarge, style: .continuous))
            .padding()
        }
        .preferredColorScheme(.dark)
    }
}

private struct QRScanner: UIViewControllerRepresentable {
    let onPayload: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                                qualityLevel: .balanced,
                                                isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onPayload: onPayload) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onPayload: (String) -> Void
        private var lastPayload: String?

        init(onPayload: @escaping (String) -> Void) {
            self.onPayload = onPayload
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            for item in addedItems {
                guard case .barcode(let barcode) = item, let payload = barcode.payloadStringValue,
                      payload != lastPayload
                else { continue }
                lastPayload = payload
                onPayload(payload)
                return
            }
        }
    }
}
