import Foundation

@MainActor
final class ReviewStore: ObservableObject {
    static let shared = ReviewStore()

    @Published var destination: DesktopDestination = .home
    @Published var reviews: [PullRequestReviewSummary] = []
    @Published var selectedReviewID: String?
    @Published var selectedFilename: String?
    @Published var detail: PullRequestReviewDetail?
    @Published var files: [PullRequestDiffFile] = []
    @Published var isLoadingList = false
    @Published var isLoadingDetail = false
    @Published var isTriggering = false
    @Published var errorMessage: String?
    @Published var searchQuery = ""
    @Published var selectedTab = ReviewTab.overview

    enum ReviewTab: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case diff = "Diff"
        var id: String { rawValue }
    }

    var filteredReviews: [PullRequestReviewSummary] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return reviews }
        return reviews.filter {
            $0.prTitle.lowercased().contains(query) ||
            $0.repository.fullName.lowercased().contains(query) ||
            "#\($0.prNumber)".contains(query)
        }
    }

    func showHome() {
        destination = .home
    }

    func showReview() {
        destination = .review
        Task { await refreshList() }
    }

    func refreshList() async {
        guard !isLoadingList else { return }
        isLoadingList = true
        errorMessage = nil
        defer { isLoadingList = false }
        do {
            reviews = try await SupercodeAPIClient.shared.listReviews()
            if let selectedReviewID, !reviews.contains(where: { $0.id == selectedReviewID }) {
                self.selectedReviewID = nil
                selectedFilename = nil
                detail = nil
                files = []
            }
            if selectedReviewID == nil, let firstReview = reviews.first {
                await select(firstReview)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func select(_ review: PullRequestReviewSummary) async {
        guard selectedReviewID != review.id else { return }
        selectedReviewID = review.id
        selectedFilename = nil
        detail = nil
        files = []
        selectedTab = .overview
        await loadSelectedReview()
    }

    func selectFile(_ filename: String) {
        selectedFilename = filename
        selectedTab = .diff
    }

    func loadSelectedReview() async {
        guard let selectedReviewID else { return }
        isLoadingDetail = true
        errorMessage = nil
        defer { isLoadingDetail = false }
        do {
            async let nextDetail = SupercodeAPIClient.shared.getReview(id: selectedReviewID)
            async let nextFiles = SupercodeAPIClient.shared.getReviewFiles(id: selectedReviewID)
            detail = try await nextDetail
            files = try await nextFiles
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func triggerReview() async {
        guard let selectedReviewID, !isTriggering else { return }
        isTriggering = true
        errorMessage = nil
        defer { isTriggering = false }
        do {
            _ = try await SupercodeAPIClient.shared.triggerReview(id: selectedReviewID)
            await loadSelectedReview()
            await refreshList()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reset() {
        destination = .home
        reviews = []
        selectedReviewID = nil
        selectedFilename = nil
        detail = nil
        files = []
        errorMessage = nil
        searchQuery = ""
    }
}
