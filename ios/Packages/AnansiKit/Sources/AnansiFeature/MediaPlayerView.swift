import AVFoundation
import AVKit
import SwiftUI

/// A video or a voice recording, played straight from Anansi. The request carries this phone's key and the
/// server answers ranges, so nothing is downloaded whole first.
struct MediaPlayerView: View {
    let attachment: SyncAttachment

    @State private var player: AVPlayer?
    @State private var problem: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let player {
                    VideoPlayer(player: player)
                } else if let problem {
                    Text(problem)
                        .font(AN.text(.body))
                        .foregroundStyle(Color.white)
                        .multilineTextAlignment(.center)
                        .padding()
                } else {
                    ProgressView().tint(.white)
                }
            }
            .navigationTitle(attachment.fileName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { start() }
            .onDisappear { player?.pause() }
        }
    }

    private func start() {
        guard player == nil else { return }
        guard let credentials = Connection.shared.credentials,
              let url = API.url(server: credentials.server, API.attachment(attachment.id))
        else {
            problem = "This phone isn't connected to Anansi."
            return
        }
        // A recording should be heard with the ring switch off, like any player.
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        let headers: [String: String] = ["Authorization": "Bearer \(credentials.key)"]
        let asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
        let player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
        self.player = player
        player.play()
    }
}
