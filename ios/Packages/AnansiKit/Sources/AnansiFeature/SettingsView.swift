import SwiftUI

/// Server, account, what is waiting to send, the picture cache.
struct SettingsView: View {
    @State private var connection = Connection.shared
    @State private var outbox = OutboxStore.shared
    @State private var cache = AttachmentCache.shared
    @State private var cacheBytes = 0
    @State private var isConfirmingDisconnect = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let host = connection.host {
                        LabeledContent("Server", value: host)
                        if let me = connection.me {
                            LabeledContent("Account") {
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(me.name ?? "…")
                                    if let email = me.email {
                                        Text(email).font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                                    }
                                }
                            }
                        }
                        if connection.keyRejected {
                            Text(connection.lastError ?? "The key was revoked.").font(AN.text(.footnote)).foregroundStyle(AN.rust)
                        }
                    }
                    if !connection.isConnected || connection.keyRejected {
                        ConnectButtons()
                            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                    }
                    if connection.host != nil {
                        Button("Disconnect this phone", role: .destructive) { isConfirmingDisconnect = true }
                    }
                } header: {
                    Eyebrow(text: "Connection")
                } footer: {
                    Text("This phone uses its own API key, created on the web in your profile under Devices. Revoke it there to cut this phone off.")
                }
                .anansiRow()

                Section {
                    LabeledContent("Waiting to send", value: outbox.outbox.isEmpty ? "Nothing" : "\(outbox.outbox.pending.count)")
                    if outbox.outbox.uploadCount > 0 {
                        LabeledContent("Pictures", value: "\(outbox.outbox.uploadCount)")
                    }
                    if let error = outbox.outbox.lastError {
                        Text("Last try: \(error)").font(AN.text(.footnote)).foregroundStyle(AN.ink3)
                    }
                    if !outbox.outbox.isEmpty {
                        Button("Send now") { outbox.kick() }
                    }
                    ForEach(outbox.outbox.failed) { failed in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(failed.op.isUpload ? "Picture" : "Notes") · \(failed.op.itemTitle)").font(AN.ui(.subheadline).weight(.medium))
                            Text(failed.message).font(AN.text(.footnote)).foregroundStyle(AN.ink3)
                            HStack {
                                Button("Try again") { outbox.retry(failed.id) }
                                Spacer()
                                Button("Discard", role: .destructive) { outbox.dismiss(failed.id) }
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                } header: {
                    Eyebrow(text: "Sending")
                } footer: {
                    Text("Notes and pictures are kept on this phone until Anansi confirms them, so nothing is lost offline or if the app closes.")
                }
                .anansiRow()

                Section {
                    LabeledContent("Picture cache", value: Wording.fileSize(cacheBytes))
                    Button("Clear picture cache") {
                        cache.clear()
                        cacheBytes = cache.diskBytes
                    }
                } header: {
                    Eyebrow(text: "Storage")
                }
                .anansiRow()

                Section {
                    LabeledContent("Version", value: Self.version)
                } footer: {
                    HStack {
                        Spacer()
                        WebMark(size: 24).opacity(0.6)
                        Spacer()
                    }
                    .padding(.top, 12)
                }
                .anansiRow()
            }
            .anansiList()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                cacheBytes = cache.diskBytes
                await connection.refreshMe()
            }
            .confirmationDialog("Disconnect this phone?", isPresented: $isConfirmingDisconnect, titleVisibility: .visible) {
                Button("Disconnect", role: .destructive) {
                    connection.disconnect()
                    SyncData.shared.clear()
                    cache.clear()
                }
            } message: {
                Text(outbox.outbox.isEmpty
                     ? "The key is forgotten on this phone. Revoke it on the web too if you won't use it again."
                     : "Notes and pictures not sent yet stay on this phone and go out after you connect again.")
            }
        }
    }

    private static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
