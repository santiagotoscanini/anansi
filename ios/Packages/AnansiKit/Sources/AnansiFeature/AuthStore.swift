import AuthenticationServices
import CryptoKit
import Foundation
import Observation

/// Signing in to Anansi and keeping the sign-in alive. The browser step is passed in by the view
/// (SwiftUI's `webAuthenticationSession`), so this type never presents anything itself.
///
/// Refresh tokens rotate and a refresh revokes the previous pair, so at most one refresh runs at a time: every
/// caller that finds the token stale awaits the same task.
@Observable
final class AuthStore {
    static let shared = AuthStore()

    enum Phase: Equatable {
        case signedOut
        case signingIn
        case signedIn
    }

    private(set) var phase: Phase = .signedOut
    private(set) var me: Me?
    private(set) var lastError: String?

    @ObservationIgnored private var credentials: StoredCredentials?
    @ObservationIgnored private var metadata: (server: String, value: AuthServerMetadata)?
    @ObservationIgnored private var refreshTask: Task<TokenSet, Error>?
    @ObservationIgnored private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
        reload()
    }

    var isSignedIn: Bool { phase == .signedIn }

    /// The server the current sign-in belongs to.
    var serverHost: String? { AnansiSettings.server?.host() }

    /// Re-reads the Keychain against the configured server (after the server URL changes).
    func reload() {
        let stored = CredentialStore.read()
        if let stored, stored.server == AnansiSettings.server?.absoluteString {
            credentials = stored
        } else {
            credentials = nil
            me = nil
        }
        phase = credentials?.tokens == nil ? .signedOut : .signedIn
    }

    func clearError() { lastError = nil }

    // MARK: Signing in

    /// Runs the whole connector flow. `authenticate` opens the consent page and returns the redirect URL.
    func signIn(authenticate: (URL) async throws -> URL) async {
        guard let server = AnansiSettings.server else {
            lastError = "The server address isn't a valid https:// URL."
            return
        }
        phase = .signingIn
        lastError = nil
        do {
            let metadata = try await serverMetadata(server)
            let clientId = try await registeredClient(server: server, metadata: metadata)
            let verifier = OAuth.makeVerifier()
            let challenge = OAuth.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
            let state = OAuth.makeVerifier()
            guard let url = OAuth.authorizeURL(metadata: metadata, clientId: clientId, challenge: challenge, state: state) else {
                throw OAuthFlowError.notAnansi("The server's authorize address is not a URL.")
            }
            let callback: URL
            do {
                callback = try await authenticate(url)
            } catch {
                throw Self.isCancellation(error) ? OAuthFlowError.cancelled : error
            }
            let code = try OAuth.parseCallback(callback, expectedState: state).get()
            let response = try await tokenRequest(metadata: metadata,
                                                  body: OAuth.codeExchangeBody(code: code, verifier: verifier, clientId: clientId))
            let tokens = response.tokens(now: .now)
            store(StoredCredentials(server: server.absoluteString, clientId: clientId, tokens: tokens))
            phase = .signedIn
            await loadMe()
        } catch OAuthFlowError.cancelled {
            phase = credentials?.tokens == nil ? .signedOut : .signedIn
        } catch {
            phase = credentials?.tokens == nil ? .signedOut : .signedIn
            lastError = error.localizedDescription
        }
    }

    /// Revokes the refresh token (best effort) and forgets the tokens. The registered client id is kept.
    func signOut() async {
        let current = credentials
        if let current {
            store(StoredCredentials(server: current.server, clientId: current.clientId, tokens: nil))
        }
        me = nil
        phase = .signedOut
        guard let current, let refresh = current.tokens?.refreshToken, let server = AnansiSettings.server,
              let metadata = try? await serverMetadata(server),
              let endpoint = metadata.revocationEndpoint.flatMap(URL.init(string:))
        else { return }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = OAuth.revokeBody(token: refresh, clientId: current.clientId)
        _ = try? await session.data(for: request)
    }

    /// Who is signed in (`whoami`), for Settings and the home header.
    func loadMe() async {
        guard isSignedIn else { return }
        do {
            me = try await MCPClient.shared.call("whoami", as: Me.self)
        } catch {
            // Not fatal: the header just shows the host.
        }
    }

    // MARK: Tokens

    /// A token good for at least `OAuth.refreshLeeway`, refreshing first when needed. `forceRefresh` after a 401.
    func validAccessToken(forceRefresh: Bool = false) async throws -> String {
        guard let tokens = credentials?.tokens else { throw MCPError.notSignedIn }
        if !forceRefresh, tokens.isFresh(now: .now) { return tokens.accessToken }
        return try await refreshed().accessToken
    }

    private func refreshed() async throws -> TokenSet {
        if let refreshTask { return try await refreshTask.value }
        let task = Task { try await self.performRefresh() }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func performRefresh() async throws -> TokenSet {
        guard let current = credentials, let refresh = current.tokens?.refreshToken else { throw MCPError.notSignedIn }
        guard let server = AnansiSettings.server else { throw MCPError.notSignedIn }
        let metadata: AuthServerMetadata
        do {
            metadata = try await serverMetadata(server)
        } catch {
            throw MCPError.offline(error.localizedDescription)
        }
        do {
            let response = try await tokenRequest(metadata: metadata,
                                                  body: OAuth.refreshBody(refreshToken: refresh, clientId: current.clientId))
            let tokens = response.tokens(now: .now, previousRefresh: refresh)
            store(StoredCredentials(server: current.server, clientId: current.clientId, tokens: tokens))
            return tokens
        } catch OAuthFlowError.expired {
            didLoseAuthorization()
            throw MCPError.unauthorized
        } catch let error as OAuthFlowError {
            throw MCPError.rpc(error.localizedDescription)
        } catch {
            throw MCPError.offline(error.localizedDescription)
        }
    }

    /// The server refused the refresh token or a freshly refreshed access token: sign in again.
    func didLoseAuthorization() {
        if let current = credentials {
            store(StoredCredentials(server: current.server, clientId: current.clientId, tokens: nil))
        }
        me = nil
        phase = .signedOut
        lastError = OAuthFlowError.expired.localizedDescription
    }

    // MARK: Requests

    private func serverMetadata(_ server: URL) async throws -> AuthServerMetadata {
        if let metadata, metadata.server == server.absoluteString { return metadata.value }
        let (data, response) = try await session.data(from: OAuth.metadataURL(server: server))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200, let value = try? JSONDecoder().decode(AuthServerMetadata.self, from: data) else {
            throw OAuthFlowError.notAnansi("\(server.host() ?? "That server") doesn't look like Anansi (no OAuth metadata, HTTP \(status)).")
        }
        metadata = (server.absoluteString, value)
        return value
    }

    /// The client id this phone registered with `server`, registering once when there is none.
    private func registeredClient(server: URL, metadata: AuthServerMetadata) async throws -> String {
        if let credentials, credentials.server == server.absoluteString { return credentials.clientId }
        guard let endpoint = metadata.registrationEndpoint.flatMap(URL.init(string:)) else {
            throw OAuthFlowError.notAnansi("The server doesn't offer client registration.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try OAuth.registrationBody()
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status), let registration = try? JSONDecoder().decode(ClientRegistration.self, from: data) else {
            throw OAuthFlowError.server(Self.oauthMessage(data) ?? "Registering this phone failed (HTTP \(status)).")
        }
        store(StoredCredentials(server: server.absoluteString, clientId: registration.clientId, tokens: nil))
        return registration.clientId
    }

    private func tokenRequest(metadata: AuthServerMetadata, body: Data) async throws -> TokenResponse {
        guard let endpoint = URL(string: metadata.tokenEndpoint) else {
            throw OAuthFlowError.notAnansi("The server's token address is not a URL.")
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200, let tokens = try? JSONDecoder().decode(TokenResponse.self, from: data) { return tokens }
        let error = try? JSONDecoder().decode(OAuthErrorResponse.self, from: data)
        switch error?.error {
        case "invalid_grant":
            throw OAuthFlowError.expired
        case "invalid_client":
            // The server forgot this phone (a reset database): register again next time.
            credentials = nil
            CredentialStore.delete()
            throw OAuthFlowError.server("Anansi no longer knows this phone. Sign in again.")
        default:
            if status == 429 { throw MCPError.rateLimited }
            throw OAuthFlowError.server(error?.errorDescription ?? error?.error ?? "The token request failed (HTTP \(status)).")
        }
    }

    private func store(_ new: StoredCredentials) {
        credentials = new
        CredentialStore.save(new)
    }

    private static func oauthMessage(_ data: Data) -> String? {
        guard let error = try? JSONDecoder().decode(OAuthErrorResponse.self, from: data) else { return nil }
        return error.errorDescription ?? error.error
    }

    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { return true }
        return false
    }
}
