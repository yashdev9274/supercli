import Foundation

struct WakeWordDetector {

    private static let nameAliases: Set<String> = [
        "java", "javis", "jarve", "jerus", "hervis", "harvis", "jarvee", "jervis"
    ]
    private static let wakeAliases: Set<String> = [
        "wake", "wakeup", "woke", "awake", "activate"
    ]

    static func normalize(_ text: String) -> String {
        text.lowercased()
            .replacingOccurrences(of: "[^a-z0-9 ]", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    static func editDistance(_ a: String, _ b: String) -> Int {
        let m = a.count
        let n = b.count
        var d = Array(repeating: Array(repeating: 0, count: n + 1), count: m + 1)
        for i in 0...m { d[i][0] = i }
        for j in 0...n { d[0][j] = j }
        let aChars = Array(a)
        let bChars = Array(b)
        for i in 1...m {
            for j in 1...n {
                let cost = aChars[i - 1] == bChars[j - 1] ? 0 : 1
                d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            }
        }
        return d[m][n]
    }

    static func isNameToken(_ word: String) -> Bool {
        nameAliases.contains(word) || word.hasPrefix("jar") || editDistance(word, "jarvis") <= 2
    }

    static func isWakeToken(_ word: String) -> Bool {
        wakeAliases.contains(word) || editDistance(word, "wake") <= 1 || editDistance(word, "wakeup") <= 1
    }

    static func isJarvisWake(_ text: String) -> Bool {
        let norm = normalize(text)
        guard !norm.isEmpty else { return false }
        let tokens = norm.split(separator: " ").map(String.init)

        let wakePhrases = ["jarvis wake up", "jarvis wakeup", "jarvis"]
        if wakePhrases.contains(where: { norm == $0 || norm.hasPrefix($0 + " ") }) {
            return true
        }

        let firstThree = Array(tokens.prefix(3))
        guard let nameIdx = firstThree.firstIndex(where: { isNameToken($0) }) else { return false }
        let rest = Array(tokens.dropFirst(nameIdx + 1))
        return rest.prefix(4).contains(where: { isWakeToken($0) })
    }
}
