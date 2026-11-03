import Foundation
import Observation
import Security

/// The phone's link to one Anansi: the server and the API key created for this device on the web (Profile →
/// Devices). The key lives only in the Keychain. Connecting checks the key against `GET /api/v1/me` before keeping
/// it, so a mistyped or revoked key never becomes the saved state.
@Observable
final class Connection {
    static let shared = Connection()

    static let defaultServer = "https://anansi.toscanini.me"

    private(set) var server: URL?
    private(set) var me: Me?
    private(set) var isConnecting = false
    private(set) var lastError: String?
    /// Set when the server stopped accepting the key (revoked on the web).
    private(set) var keyRejected = false
    @ObservationIgnored private var key: String?

    init() {
        if let stored = KeyStore.read(), let server = API.parseServer(stored.server) {
            self.server = server
            key = stored.key
            me = stored.me
        }
    }

    var isConnected: Bool { server != nil && key != nil && !keyRejected }

    /// The server and key for a request, or nil when not connected.
    var credentials: (server: URL, key: String)? {
        guard let server, let key, !keyRejected else { return nil }
        return (server, key)
    }

    var host: String? { server?.host() }

    func clearError() { lastError = nil }

    /// Checks the key with the server, then keeps it. Returns whether it worked.
    @discardableResult
    func connect(server: URL, key rawKey: String) async -> Bool {
        let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard API.isKey(key) else {
            lastError = "That isn't an Anansi key (they start with ank_)."
            return false
        }
        isConnecting = true
        lastError = nil
        defer { isConnecting = false }
        do {
            let me = try await APIClient.shared.call(API.me(), as: Me.self, server: server, key: key)
            KeyStore.save(StoredKey(server: server.absoluteString, key: key, me: me))
            self.server = server
            self.key = key
            self.me = me
            keyRejected = false
            return true
        } catch {
            lastError = (error as? APIError)?.isUnauthorized == true
                ? "Anansi didn't accept that key. Create a new one in Profile → Devices."
                : error.localizedDescription
            return false
        }
    }

    func connect(_ link: ConnectLink) async -> Bool {
        await connect(server: link.server, key: link.key)
    }

    /// Forgets the key on this phone. It stays valid on the server until revoked there.
    func disconnect() {
        KeyStore.delete()
        server = nil
        key = nil
        me = nil
        keyRejected = false
    }

    /// The server answered 401 with the saved key: it was revoked.
    func didLoseAuthorization() {
        keyRejected = true
        lastError = "Anansi no longer accepts this phone's key. Create a new one in Profile → Devices and scan it."
    }

    func refreshMe() async {
        guard credentials != nil else { return }
        if let me = try? await APIClient.shared.call(API.me(), as: Me.self) {
            self.me = me
            if let server, let key { KeyStore.save(StoredKey(server: server.absoluteString, key: key, me: me)) }
        }
    }
}

nonisolated struct StoredKey: Codable, Hashable, Sendable {
    var server: String
    var key: String
    var me: Me?
}

/// `StoredKey` as one generic-password Keychain item, as JSON.
enum KeyStore {
    private static let service = "com.santiagotoscanini.anansi.api"
    private static let account = "key"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func read() -> StoredKey? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(StoredKey.self, from: data)
    }

    @discardableResult
    static func save(_ stored: StoredKey) -> Bool {
        guard let data = try? JSONEncoder().encode(stored) else { return false }
        let status = SecItemUpdate(baseQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        guard status == errSecItemNotFound else { return status == errSecSuccess }
        var item = baseQuery
        item[kSecValueData as String] = data
        // Readable after first unlock so queued uploads can still authenticate when the app wakes in the background.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func delete() {
        _ = SecItemDelete(baseQuery as CFDictionary)
    }
}
