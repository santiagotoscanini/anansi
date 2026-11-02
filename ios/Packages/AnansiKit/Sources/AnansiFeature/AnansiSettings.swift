import Foundation
import Security

/// Connection settings. The server URL lives in UserDefaults; the OAuth client id and tokens live only in the
/// Keychain.
enum AnansiSettings {
    static let defaultServer = "https://anansi.toscanini.me"
    static let serverKey = "anansi.server"

    static var serverString: String {
        UserDefaults.standard.string(forKey: serverKey) ?? defaultServer
    }

    static var server: URL? { OAuth.parseServer(serverString) }
}

/// `StoredCredentials` as one generic-password Keychain item, as JSON.
enum CredentialStore {
    private static let service = "com.santiagotoscanini.anansi.oauth"
    private static let account = "credentials"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func read() -> StoredCredentials? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return try? JSONDecoder().decode(StoredCredentials.self, from: data)
    }

    @discardableResult
    static func save(_ credentials: StoredCredentials) -> Bool {
        guard let data = try? JSONEncoder().encode(credentials) else { return false }
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
