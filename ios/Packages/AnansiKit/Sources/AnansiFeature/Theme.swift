import SwiftUI
import UIKit

/// Anansi's look, from the web app's tokens (anansi/src/styles/globals.css): warm cream paper and warm near-black
/// ink (never pure white, never grey), ONE accent (clay, a terracotta), a serif voice for display and prose, mono
/// for small metadata. Like the web app it follows the system appearance: dark mode is "deep coffee", the same
/// hues inverted. The OKLCH tokens are converted to sRGB once, here.
enum AN {
    // MARK: Paper / surface ladder
    static let paper = Color(light: 0xF8F2EB, dark: 0x110C09)
    static let paperDeep = Color(light: 0xF2ECE3, dark: 0x0A0605)
    static let canvas = Color(light: 0xFDF9F4, dark: 0x1A1512)
    static let vellum = Color(light: 0xEDE3D8, dark: 0x241E1A)
    static let ash = Color(light: 0xDED6CE, dark: 0x332C28)

    // MARK: Ink ladder
    static let ink = Color(light: 0x1B1511, dark: 0xF3EDE6)
    static let ink2 = Color(light: 0x47413D, dark: 0xBCB6AF)
    static let ink3 = Color(light: 0x77706B, dark: 0x857F79)
    static let ink4 = Color(light: 0xAAA39D, dark: 0x524C47)
    static let hairline = Color(light: 0x1B1511, dark: 0xF3EDE6, opacity: 0.08, darkOpacity: 0.10)
    static let hairline2 = Color(light: 0x1B1511, dark: 0xF3EDE6, opacity: 0.14, darkOpacity: 0.18)

    // MARK: Accent and supporting hues
    static let clay = Color(light: 0xC96546, dark: 0xDB8566)
    static let clayDeep = Color(light: 0xA94524, dark: 0xF69E7F)
    static let claySoft = Color(light: 0xFFDDCA, dark: 0x452318)
    static let clayWash = Color(light: 0xFDEFE5, dark: 0x26160F)
    static let moss = Color(light: 0x5A7D46, dark: 0x90B080)
    static let mossSoft = Color(light: 0xDFEED2, dark: 0x202D19)
    static let indigo = Color(light: 0x486199, dark: 0x8BA4DB)
    static let indigoSoft = Color(light: 0xDDE8FF, dark: 0x1E283F)
    static let amber = Color(light: 0xD49838, dark: 0xE5B46E)
    static let amberSoft = Color(light: 0xFFE8BE, dark: 0x3E2909)
    static let rust = Color(light: 0xB54B41, dark: 0xE1897E)
    static let rustSoft = Color(light: 0xFFDCD4, dark: 0x421C18)
    static let plum = Color(light: 0x874C74, dark: 0xC592B3)
    static let plumSoft = Color(light: 0xF9DFEF, dark: 0x382030)

    /// Text on a clay fill.
    static let onClay = Color(light: 0xFDF9F4, dark: 0x110C09)

    // MARK: Type: a display serif (Instrument Serif on the web), serif prose (Newsreader), mono metadata (Geist
    // Mono). System designs stand in for the web fonts, as text styles so Dynamic Type works.
    static func display(_ style: Font.TextStyle = .title) -> Font { .system(style, design: .serif) }
    static func text(_ style: Font.TextStyle = .body) -> Font { .system(style, design: .serif) }
    static func ui(_ style: Font.TextStyle = .body) -> Font { .system(style) }
    static func mono(_ style: Font.TextStyle = .caption2) -> Font { .system(style, design: .monospaced) }

    // MARK: Radii (--r-sm, --r-md, --r-lg)
    static let radiusSmall: CGFloat = 6
    static let radius: CGFloat = 10
    static let radiusLarge: CGFloat = 14
}

extension Color {
    /// A color that follows the light/dark appearance, from two `0xRRGGBB` values.
    ///
    /// The provider must stay `@Sendable` (nonisolated). SwiftUI resolves colors on its async render thread while
    /// something animates (a push, a spinner); a provider inferred as main-actor code (this package's default
    /// isolation) traps there with `_dispatch_assert_queue_fail`, which crashed every screen transition in build 102.
    nonisolated init(light: UInt32, dark: UInt32, opacity: Double = 1, darkOpacity: Double? = nil) {
        self.init(uiColor: UIColor { @Sendable traits in
            let isDark = traits.userInterfaceStyle == .dark
            let hex = isDark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255,
                           green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255,
                           alpha: CGFloat(isDark ? (darkOpacity ?? opacity) : opacity))
        })
    }
}

// MARK: The web mark

/// Ananse Ntontan, the spider's web: eight spokes, two octagon rings, a clay drop at the centre.
struct WebMark: View {
    var size: CGFloat = 28
    var lineWidth: CGFloat?

    var body: some View {
        // The renderer can run off the main thread too: it takes plain values, never `self` or `AN`.
        let ink = AN.ink
        let clay = AN.clay
        let fixedWidth = self.lineWidth
        Canvas { @Sendable context, canvas in
            let s = min(canvas.width, canvas.height) / 100
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            let outer = [p(50, 10), p(78.3, 21.7), p(90, 50), p(78.3, 78.3), p(50, 90), p(21.7, 78.3), p(10, 50), p(21.7, 21.7)]
            let inner = [p(50, 26), p(67, 33), p(74, 50), p(67, 67), p(50, 74), p(33, 67), p(26, 50), p(33, 33)]
            var web = Path()
            for point in outer {
                web.move(to: p(50, 50))
                web.addLine(to: point)
            }
            for ring in [outer, inner] {
                web.addLines(ring)
                web.closeSubpath()
            }
            let width = fixedWidth ?? max(1, 4 * s)
            context.stroke(web, with: .color(ink), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            let r = 4.5 * s
            context.fill(Path(ellipseIn: CGRect(x: 50 * s - r, y: 50 * s - r, width: 2 * r, height: 2 * r)), with: .color(clay))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: Surfaces

extension View {
    /// The screen ground: warm paper under everything, clay tint, ink text.
    func anansiScreen() -> some View {
        self
            .background(AN.paper.ignoresSafeArea())
            .tint(AN.clay)
            .foregroundStyle(AN.ink)
    }

    /// A List/Form in Anansi dress: paper ground instead of the system's grouped grey.
    func anansiList() -> some View {
        self
            .scrollContentBackground(.hidden)
            .background(AN.paper.ignoresSafeArea())
            .tint(AN.clay)
    }

    /// A card lifted off the paper: canvas fill, a hairline frame, the web's soft warm shadow.
    func anansiCard(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AN.canvas, in: RoundedRectangle(cornerRadius: AN.radiusLarge, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: AN.radiusLarge, style: .continuous).stroke(AN.hairline2, lineWidth: 1))
            .shadow(color: Color(red: 50 / 255, green: 38 / 255, blue: 28 / 255).opacity(0.06), radius: 4, y: 2)
    }

    /// A recessed panel (paper-deep), for quieter groups.
    func anansiRecess(padding: CGFloat = 14) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AN.paperDeep, in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
    }

    /// Row fill for List and Form.
    func anansiRow() -> some View {
        listRowBackground(AN.canvas)
            .listRowSeparatorTint(AN.hairline2)
    }

    /// The navigation bar on paper.
    func anansiNavigationBar() -> some View {
        self
            .toolbarBackground(AN.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

// MARK: Text pieces

/// "SYNC · WEEKLY RETROSPECTIVE": the small uppercase mono line above a title.
struct Eyebrow: View {
    let text: String
    var color: Color = AN.ink3

    var body: some View {
        Text(text.uppercased())
            .font(AN.mono(.caption2))
            .tracking(1.2)
            .foregroundStyle(color)
    }
}

/// A section heading: serif title, optional count, optional help line.
struct SectionHeading: View {
    let title: String
    var count: Int?
    var help: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title).font(AN.display(.title2)).foregroundStyle(AN.ink)
                if let count {
                    Text("\(count)").font(AN.mono(.caption)).foregroundStyle(AN.ink3)
                }
            }
            if let help {
                Text(help).font(AN.text(.subheadline)).italic().foregroundStyle(AN.ink3)
            }
        }
        .padding(.top, 6)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A thin progress rule in clay: the week's "filled".
struct ProgressRule: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(AN.vellum)
                Capsule().fill(AN.clay).frame(width: max(0, min(1, fraction)) * proxy.size.width)
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

// MARK: Buttons

struct AnansiPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AN.ui(.headline))
            .foregroundStyle(AN.onClay)
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, 16)
            .background((configuration.isPressed ? AN.clayDeep : AN.clay).opacity(isEnabled ? 1 : 0.4),
                        in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
    }
}

struct AnansiOutlineButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AN.ui(.subheadline).weight(.medium))
            .foregroundStyle(AN.ink.opacity(isEnabled ? 1 : 0.4))
            .frame(minHeight: 44)
            .padding(.horizontal, 14)
            .background(configuration.isPressed ? AN.vellum : AN.canvas, in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: AN.radius, style: .continuous).stroke(AN.hairline2, lineWidth: 1))
    }
}

extension ButtonStyle where Self == AnansiPrimaryButtonStyle {
    static var anansiPrimary: AnansiPrimaryButtonStyle { .init() }
}

extension ButtonStyle where Self == AnansiOutlineButtonStyle {
    static var anansiOutline: AnansiOutlineButtonStyle { .init() }
}

/// A small pill tag: "Unscoped", "High", "uploading".
struct Tag: View {
    enum Tone { case plain, accent, good, warn, bad, relation }

    let text: String
    var tone: Tone = .plain

    var body: some View {
        Text(text)
            .font(AN.mono(.caption2))
            .foregroundStyle(colors.fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(colors.bg, in: Capsule())
            .accessibilityLabel(text)
    }

    private var colors: (fg: Color, bg: Color) {
        switch tone {
        case .plain: (AN.ink2, AN.vellum)
        case .accent: (AN.clayDeep, AN.claySoft)
        case .good: (AN.moss, AN.mossSoft)
        case .warn: (AN.amber, AN.amberSoft)
        case .bad: (AN.rust, AN.rustSoft)
        case .relation: (AN.indigo, AN.indigoSoft)
        }
    }
}

/// An empty state: a clean page, not an unfinished form.
struct EmptyPage: View {
    let title: String
    let message: String
    var systemImage: String?

    var body: some View {
        VStack(spacing: 10) {
            if let systemImage {
                Image(systemName: systemImage).font(.title).foregroundStyle(AN.ink4)
            } else {
                WebMark(size: 36).opacity(0.5)
            }
            Text(title).font(AN.display(.title3)).foregroundStyle(AN.ink)
            Text(message).font(AN.text(.subheadline)).foregroundStyle(AN.ink3).multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// A one-line problem with the real text, never silent.
struct ProblemCard: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle").foregroundStyle(AN.rust)
            Text(message).font(AN.text(.subheadline)).foregroundStyle(AN.ink2).frame(maxWidth: .infinity, alignment: .leading)
            if let retry {
                Button("Retry", action: retry).buttonStyle(.anansiOutline)
            }
        }
        .padding(14)
        .background(AN.rustSoft.opacity(0.5), in: RoundedRectangle(cornerRadius: AN.radius, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
