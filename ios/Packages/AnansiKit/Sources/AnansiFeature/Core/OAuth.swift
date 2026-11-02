import Foundation

// Signing in is the MCP connector flow, exactly as Claude does it: Anansi is its own OAuth 2.1 authorization
// server. Discover (`/.well-known/oauth-authorization-server`), register once as a public client (RFC 7591,
// `token_endpoint_auth_method: none`), send the browser to `/oauth/authorize` with PKCE S256, trade the code at
// `/oauth/token`. Access tokens last an hour; refresh tokens last 30 days and rotate on every use, so a refresh
// must never run twice at once (the loser's token is already revoked). This file is the pure half: URLs, bodies,
// parsing. The SHA-256 for the challenge and the browser live in `AuthStore`.

nonisolated enum OAuth {
    static let callbackScheme = "anansi"
    static let redirectURI = "anansi://oauth/callback"
    static let scope = "anansi:read anansi:write"
    static let clientName = "Anansi for iPhone"
    /// Refresh this long before the access token runs out, so a call never leaves with a dying token.
    static let refreshLeeway: TimeInterval = 120

    /// Accepts `https://host[/path]` (or `http://` for a dev server), trimmed; anything else is nil.
    static func parseServer(_ string: String) -> URL? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host(), !host.isEmpty
        else { return nil }
        // The origin is what matters: metadata, the MCP endpoint and the OAuth routes all hang off it.
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = host
        parts.port = url.port
        return parts.url
    }

    static func metadataURL(server: URL) -> URL {
        server.appending(path: ".well-known/oauth-authorization-server")
    }

    static func mcpURL(server: URL) -> URL {
        server.appending(path: "api/mcp")
    }

    /// RFC 7591 registration body for a public native client.
    static func registrationBody() throws -> Data {
        let body: JSONValue = [
            "client_name": .string(clientName),
            "redirect_uris": [.string(redirectURI)],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": .string(scope),
        ]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(body)
    }

    static func authorizeURL(metadata: AuthServerMetadata, clientId: String, challenge: String, state: String) -> URL? {
        guard var parts = URLComponents(string: metadata.authorizationEndpoint) else { return nil }
        parts.queryItems = (parts.queryItems ?? []) + [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "state", value: state),
        ]
        return parts.url
    }

    static func codeExchangeBody(code: String, verifier: String, clientId: String) -> Data {
        formBody([
            ("grant_type", "authorization_code"),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirectURI),
            ("client_id", clientId),
        ])
    }

    static func refreshBody(refreshToken: String, clientId: String) -> Data {
        formBody([("grant_type", "refresh_token"), ("refresh_token", refreshToken), ("client_id", clientId)])
    }

    static func revokeBody(token: String, clientId: String) -> Data {
        formBody([("token", token), ("client_id", clientId)])
    }

    /// `application/x-www-form-urlencoded`, with everything but unreserved characters escaped.
    static func formBody(_ fields: [(String, String)]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let encoded = fields.map { key, value in
            let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
            let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
            return "\(k)=\(v)"
        }
        return Data(encoded.joined(separator: "&").utf8)
    }

    /// The code from the redirect, checking `state`; the server's `error` comes back as a sentence.
    static func parseCallback(_ url: URL, expectedState: String) -> Result<String, OAuthFlowError> {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
        if let error = value("error") {
            if error == "access_denied" { return .failure(.denied) }
            return .failure(.server(value("error_description") ?? error))
        }
        guard value("state") == expectedState else { return .failure(.stateMismatch) }
        guard let code = value("code"), !code.isEmpty else { return .failure(.server("No code came back.")) }
        return .success(code)
    }

    /// A PKCE verifier: 32 random bytes, base64url (43 characters, inside the server's 43…128).
    static func makeVerifier<G: RandomNumberGenerator>(using generator: inout G) -> String {
        base64URL(Data((0..<32).map { _ in UInt8.random(in: .min ... .max, using: &generator) }))
    }

    static func makeVerifier() -> String {
        var generator = SystemRandomNumberGenerator()
        return makeVerifier(using: &generator)
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// RFC 8414 metadata, the fields the phone uses.
nonisolated struct AuthServerMetadata: Codable, Hashable, Sendable {
    var issuer: String
    var authorizationEndpoint: String
    var tokenEndpoint: String
    var registrationEndpoint: String?
    var revocationEndpoint: String?

    enum CodingKeys: String, CodingKey {
        case issuer
        case authorizationEndpoint = "authorization_endpoint"
        case tokenEndpoint = "token_endpoint"
        case registrationEndpoint = "registration_endpoint"
        case revocationEndpoint = "revocation_endpoint"
    }
}

nonisolated struct ClientRegistration: Codable, Hashable, Sendable {
    var clientId: String

    enum CodingKeys: String, CodingKey { case clientId = "client_id" }
}

/// The token endpoint's answer.
nonisolated struct TokenResponse: Codable, Hashable, Sendable {
    var accessToken: String
    var tokenType: String?
    var expiresIn: Int?
    var refreshToken: String?
    var scope: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case refreshToken = "refresh_token"
        case scope
    }

    /// What is kept in the Keychain. A refresh that answers without a refresh token keeps the old one.
    func tokens(now: Date, previousRefresh: String? = nil) -> TokenSet {
        TokenSet(accessToken: accessToken,
                 refreshToken: refreshToken ?? previousRefresh,
                 expiresAt: now.addingTimeInterval(TimeInterval(expiresIn ?? 3600)))
    }
}

nonisolated struct OAuthErrorResponse: Codable, Hashable, Sendable {
    var error: String
    var errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case error
        case errorDescription = "error_description"
    }
}

/// The signed-in state for one server: the client this phone registered and its current tokens.
nonisolated struct TokenSet: Codable, Hashable, Sendable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date

    func isFresh(now: Date) -> Bool {
        expiresAt.timeIntervalSince(now) > OAuth.refreshLeeway
    }
}

nonisolated struct StoredCredentials: Codable, Hashable, Sendable {
    /// The origin these belong to; a different server means signing in again.
    var server: String
    var clientId: String
    var tokens: TokenSet?
}

nonisolated enum OAuthFlowError: Error, Equatable, Sendable, LocalizedError {
    case cancelled
    case denied
    case stateMismatch
    case server(String)
    case notAnansi(String)
    /// The refresh token was refused: the phone must sign in again.
    case expired

    var errorDescription: String? {
        switch self {
        case .cancelled: "Sign-in was cancelled."
        case .denied: "Access was denied on the consent screen."
        case .stateMismatch: "The sign-in answer didn't match this request. Try again."
        case .server(let message): message
        case .notAnansi(let message): message
        case .expired: "The sign-in expired. Sign in again."
        }
    }
}
