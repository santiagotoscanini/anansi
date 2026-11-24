import SwiftUI

/// "Discard" for something the server would not take. A capture (a thought, a voice note) is asked about first:
/// discarding it deletes it from this phone for good, and it may be the only copy.
struct DiscardFailedButton: View {
    let failed: FailedOp
    @State private var outbox = OutboxStore.shared
    @State private var confirming = false

    var body: some View {
        Button("Discard", role: .destructive) {
            if failed.op.isCapture { confirming = true } else { outbox.dismiss(failed.id) }
        }
        .confirmationDialog(failed.op.isVoiceCapture ? "Delete this voice note?" : "Delete this thought?",
                            isPresented: $confirming, titleVisibility: .visible) {
            Button("Delete for good", role: .destructive) { outbox.dismiss(failed.id) }
        } message: {
            Text("It never reached Anansi, so this phone has the only copy.")
        }
    }
}
