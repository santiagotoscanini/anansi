import SwiftUI

/// Server, account, what is waiting to send, the picture cache.
struct SettingsView: View {
    @State private var auth = AuthStore.shared
    @State private var outbox = OutboxStore.shared
    @State private var cache = AttachmentCache.shared
    @State private var server = AnansiSettings.serverString
    @State private var serverError: String?
    @State private var cacheBytes = 0
    @State private var isConfirmingSignOut = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://anansi.example.com", text: $server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(applyServer)
                    if let serverError {
                        Text(serverError).font(AN.text(.footnote)).foregroundStyle(AN.rust)
                    }
                    if server != AnansiSettings.serverString {
                        Button("Use this server", action: applyServer)
                    }
                } header: {
                    Eyebrow(text: "Server")
                } footer: {
                    Text("Your Anansi's address. Changing it signs this phone out of the previous one.")
                }
                .anansiRow()

                Section {
                    if auth.isSignedIn {
                        LabeledContent("Signed in as") {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(auth.me?.name ?? "…")
                                if let email = auth.me?.email {
                                    Text(email).font(AN.ui(.caption)).foregroundStyle(AN.ink3)
                                }
                            }
                        }
                        Button("Sign out", role: .destructive) { isConfirmingSignOut = true }
                    } else {
                        SignInButton()
                            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                    }
                } header: {
                    Eyebrow(text: "Account")
                } footer: {
                    Text("The phone connects like Claude does: through Anansi's MCP server, with its own sign-in. You can revoke it from Anansi at any time.")
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
                if auth.isSignedIn, auth.me == nil { await auth.loadMe() }
            }
            .confirmationDialog("Sign out of Anansi?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            } message: {
                Text(outbox.outbox.isEmpty
                     ? "You can sign in again at any time."
                     : "Notes and pictures not sent yet stay on this phone and go out after you sign in again.")
            }
        }
    }

    private func applyServer() {
        guard let url = OAuth.parseServer(server) else {
            serverError = "Enter an https:// address."
            return
        }
        serverError = nil
        server = url.absoluteString
        guard url.absoluteString != AnansiSettings.server?.absoluteString else { return }
        UserDefaults.standard.set(url.absoluteString, forKey: AnansiSettings.serverKey)
        auth.reload()
        SyncData.shared.clear()
        cache.clear()
    }

    private static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
