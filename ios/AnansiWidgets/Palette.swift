import SwiftUI

/// Anansi's warm palette (AnansiFeature's `AN`), the few colors the extension draws with. Plain values: the system
/// renders widgets wherever it likes, so nothing here resolves colors with a closure.
enum Palette {
    static let paper = Color(hex: 0xF8F2EB)
    static let paperDark = Color(hex: 0x1A1512)
    static let ink = Color(hex: 0x1B1511)
    static let inkDark = Color(hex: 0xF3EDE6)
    static let ink3 = Color(hex: 0x77706B)
    static let ink3Dark = Color(hex: 0x857F79)
    static let clay = Color(hex: 0xC96546)
    /// The clay of dark mode: the Dynamic Island is always dark.
    static let clayBright = Color(hex: 0xDB8566)
    static let onClay = Color(hex: 0xFDF9F4)
    static let moss = Color(hex: 0x90B080)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}
