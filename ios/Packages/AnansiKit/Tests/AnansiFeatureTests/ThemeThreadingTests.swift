@testable import AnansiFeature
import SwiftUI
import Testing
import UIKit

/// Build 102 crashed on every screen transition: SwiftUI resolves colors on its async render thread while something
/// animates, and the theme's dynamic colors trapped there (`_dispatch_assert_queue_fail`) because their provider was
/// main-actor code. This resolves them off the main thread the same way; a regression traps the test run.
struct ThemeThreadingTests {
    @Test func themeColorsResolveOffTheMainThread() async {
        let paper = AN.paper
        let hairline = AN.hairline
        let resolved: [Double] = await Task.detached {
            func components(_ color: Color, _ style: UIUserInterfaceStyle) -> (red: Double, alpha: Double) {
                var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
                UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
                    .getRed(&red, green: &green, blue: &blue, alpha: &alpha)
                return (Double(red), Double(alpha))
            }
            return [
                components(paper, .light).red,
                components(paper, .dark).red,
                components(hairline, .light).alpha,
                components(hairline, .dark).alpha,
            ]
        }.value

        #expect(abs(resolved[0] - Double(0xF8) / 255) < 0.01)
        #expect(abs(resolved[1] - Double(0x11) / 255) < 0.01)
        #expect(abs(resolved[2] - 0.08) < 0.01)
        #expect(abs(resolved[3] - 0.10) < 0.01)
    }
}
