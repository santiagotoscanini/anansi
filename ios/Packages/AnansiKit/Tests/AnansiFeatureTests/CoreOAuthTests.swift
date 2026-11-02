import Foundation
@testable import AnansiFeature
import Testing

struct CoreOAuthTests {
    let metadata = AuthServerMetadata(issuer: "https://anansi.example.com",
                                      authorizationEndpoint: "https://anansi.example.com/oauth/authorize",
                                      tokenEndpoint: "https://anansi.example.com/oauth/token",
                                      registrationEndpoint: "https://anansi.example.com/oauth/register",
                                      revocationEndpoint: "https://anansi.example.com/oauth/revoke")

    @Test func keepsOnlyTheOrigin() {
        #expect(OAuth.parseServer(" https://anansi.example.com/app/pulse ")?.absoluteString == "https://anansi.example.com")
        #expect(OAuth.parseServer("http://localhost:5173")?.absoluteString == "http://localhost:5173")
        #expect(OAuth.parseServer("anansi.example.com") == nil)
        #expect(OAuth.parseServer("ftp://anansi.example.com") == nil)
    }

    @Test func buildsServerURLs() throws {
        let server = try #require(OAuth.parseServer("https://anansi.example.com"))
        #expect(OAuth.metadataURL(server: server).absoluteString == "https://anansi.example.com/.well-known/oauth-authorization-server")
        #expect(OAuth.mcpURL(server: server).absoluteString == "https://anansi.example.com/api/mcp")
    }

    @Test func decodesMetadata() throws {
        let json = Data(#"{"issuer":"https://a.b","authorization_endpoint":"https://a.b/oauth/authorize","token_endpoint":"https://a.b/oauth/token","registration_endpoint":"https://a.b/oauth/register","revocation_endpoint":"https://a.b/oauth/revoke","response_types_supported":["code"],"code_challenge_methods_supported":["S256"]}"#.utf8)
        let decoded = try JSONDecoder().decode(AuthServerMetadata.self, from: json)
        #expect(decoded.tokenEndpoint == "https://a.b/oauth/token")
        #expect(decoded.registrationEndpoint == "https://a.b/oauth/register")
    }

    @Test func registersAsAPublicNativeClient() throws {
        let body = try OAuth.registrationBody()
        let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(json?["redirect_uris"] as? [String] == ["anansi://oauth/callback"])
        #expect(json?["token_endpoint_auth_method"] as? String == "none")
        #expect(json?["grant_types"] as? [String] == ["authorization_code", "refresh_token"])
    }

    @Test func buildsTheAuthorizeURL() throws {
        let url = try #require(OAuth.authorizeURL(metadata: metadata, clientId: "c1", challenge: "abc", state: "s1"))
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
        #expect(url.absoluteString.hasPrefix("https://anansi.example.com/oauth/authorize?"))
        #expect(value("response_type") == "code")
        #expect(value("client_id") == "c1")
        #expect(value("redirect_uri") == "anansi://oauth/callback")
        #expect(value("code_challenge") == "abc")
        #expect(value("code_challenge_method") == "S256")
        #expect(value("scope") == "anansi:read anansi:write")
        #expect(value("state") == "s1")
    }

    @Test func formEncodesTheTokenRequests() {
        let exchange = String(decoding: OAuth.codeExchangeBody(code: "a b", verifier: "v~1", clientId: "c"), as: UTF8.self)
        #expect(exchange == "grant_type=authorization_code&code=a%20b&code_verifier=v~1&redirect_uri=anansi%3A%2F%2Foauth%2Fcallback&client_id=c")
        let refresh = String(decoding: OAuth.refreshBody(refreshToken: "mcp_rt_x+y", clientId: "c"), as: UTF8.self)
        #expect(refresh == "grant_type=refresh_token&refresh_token=mcp_rt_x%2By&client_id=c")
    }

    @Test func readsTheCallback() throws {
        let ok = try #require(URL(string: "anansi://oauth/callback?code=xyz&state=s1"))
        #expect(OAuth.parseCallback(ok, expectedState: "s1") == .success("xyz"))
        #expect(OAuth.parseCallback(ok, expectedState: "other") == .failure(.stateMismatch))
        let denied = try #require(URL(string: "anansi://oauth/callback?error=access_denied&state=s1"))
        #expect(OAuth.parseCallback(denied, expectedState: "s1") == .failure(.denied))
        let broken = try #require(URL(string: "anansi://oauth/callback?error=invalid_request&error_description=bad%20scope"))
        #expect(OAuth.parseCallback(broken, expectedState: "s1") == .failure(.server("bad scope")))
    }

    @Test func makesAVerifierInRange() {
        let verifier = OAuth.makeVerifier()
        #expect((43...128).contains(verifier.count))
        #expect(verifier.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
        #expect(OAuth.makeVerifier() != verifier)
    }

    @Test func base64URLHasNoPadding() {
        #expect(OAuth.base64URL(Data([0xFB, 0xFF])) == "-_8")
    }

    @Test func tokensRefreshBeforeTheyExpire() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let response = TokenResponse(accessToken: "at", tokenType: "Bearer", expiresIn: 3600, refreshToken: nil, scope: nil)
        let tokens = response.tokens(now: now, previousRefresh: "old_rt")
        #expect(tokens.refreshToken == "old_rt")
        #expect(tokens.isFresh(now: now.addingTimeInterval(3000)))
        #expect(!tokens.isFresh(now: now.addingTimeInterval(3500)))
    }
}
