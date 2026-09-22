import Foundation

enum DesktopDestination: Equatable {
    case home
    case review
}

enum PullRequestReviewStatus: String, Codable {
    case completed
    case pending
    case failed
    case unreviewed
    case skipped
    case trialEnded = "trial_ended"

    var title: String {
        switch self {
        case .completed: return "Reviewed"
        case .pending: return "In progress"
        case .failed: return "Failed"
        case .unreviewed: return "Not reviewed"
        case .skipped: return "Skipped"
        case .trialEnded: return "Trial ended"
        }
    }

    var symbol: String {
        switch self {
        case .completed: return "checkmark.circle.fill"
        case .pending: return "clock.fill"
        case .failed: return "exclamationmark.triangle.fill"
        default: return "circle.dashed"
        }
    }
}

enum PullRequestState: String, Codable {
    case open
    case closed
    case merged
}

struct ReviewRepository: Codable, Hashable {
    let id: String?
    let name: String
    let fullName: String
    let owner: String
}

struct PullRequestReviewSummary: Identifiable, Codable, Hashable {
    let id: String
    let prNumber: Int
    let prTitle: String
    let prUrl: String
    let status: PullRequestReviewStatus
    let summary: String?
    let author: String?
    let authorAvatar: String?
    let additions: Int?
    let deletions: Int?
    let prState: PullRequestState?
    let createdAt: Date
    let updatedAt: Date
    let repository: ReviewRepository
}

struct PullRequestReviewDetail: Identifiable, Codable {
    let id: String
    let prNumber: Int
    let prTitle: String
    let prUrl: String
    let status: PullRequestReviewStatus
    let review: String
    let summary: String?
    let prState: PullRequestState?
    let author: String?
    let authorName: String?
    let authorAvatar: String?
    let body: String?
    let additions: Int?
    let deletions: Int?
    let changedFiles: Int?
    let baseRef: String?
    let headRef: String?
    let createdAt: Date
    let updatedAt: Date
    let repository: ReviewRepository
}

struct PullRequestDiffFile: Identifiable, Codable, Hashable {
    var id: String { filename }
    let filename: String
    let previousFilename: String?
    let status: String
    let additions: Int
    let deletions: Int
    let changes: Int
    let patch: String?
    let blobUrl: String?
    let rawUrl: String?
}

struct ReviewTriggerResponse: Codable {
    let success: Bool?
    let message: String?
}
