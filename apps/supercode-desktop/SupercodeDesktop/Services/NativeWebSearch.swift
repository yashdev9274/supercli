import Foundation

enum NativeWebSearch {
    typealias Transport = (String, [String: Any]) async throws -> [String: Any]

    static func search(name: String, args: [String: Any], transport: Transport = { provider, body in
        try await SupercodeAPIClient.shared.searchProxy(provider: provider, body: body)
    }) async throws -> [String: Any] {
        let args = try TerminalContract.validate(name, args: args)
        let query = args["query"] as? String ?? ""
        let limit = args["maxResults"] as? Int ?? 10
        let providers = name == "firecrawl_search" ? ["firecrawl", "exa"] : ["exa", "firecrawl"]
        var errors: [String] = []
        for provider in providers {
            try Task.checkCancellation()
            var body: [String: Any] = ["query": query]
            if provider == "exa" { body["numResults"] = min(limit, 50) }
            else { body["limit"] = limit; body["sources"] = [["type": "web"]] }
            for key in ["includeDomains", "excludeDomains"] { body[key] = args[key] }
            do {
                let response = try await transport(provider, body)
                guard response["success"] as? Bool != false, response["error"] == nil else { throw NativeToolError("Provider reported search failure") }
                let rows: [[String: Any]]
                if provider == "exa", let results = response["results"] as? [[String: Any]] { rows = results }
                else if provider == "firecrawl", let results = response["data"] as? [[String: Any]] { rows = results }
                else if provider == "firecrawl", let data = response["data"] as? [String: Any], let web = data["web"] as? [[String: Any]] {
                    rows = web + (data["news"] as? [[String: Any]] ?? [])
                } else { throw NativeToolError("Malformed search response") }
                let results: [[String: Any]] = try rows.prefix(limit).map { row in
                    guard let link = (row["url"] ?? row["link"]) as? String,
                          let url = URL(string: link), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else {
                        throw NativeToolError("Malformed search result URL")
                    }
                    var item: [String: Any] = ["title": row["title"] as? String ?? "", "snippet": String(((row["description"] ?? row["snippet"] ?? row["text"]) as? String ?? "").prefix(10_000)), name == "firecrawl_search" ? "link" : "url": link]
                    if name == "exa_search" { item["publishedDate"] = row["publishedDate"] ?? NSNull() }
                    return item
                }
                var payload: [String: Any] = ["query": query, "provider": provider, "results": results]
                if !errors.isEmpty { payload["note"] = "Used \(provider) fallback. \(errors.joined(separator: "; "))" }
                return payload
            } catch {
                if Task.isCancelled || error is CancellationError { throw CancellationError() }
                if case APIError.unauthorized = error { throw error }
                errors.append("\(provider): \(error.localizedDescription)")
            }
        }
        throw NativeToolError("Web search failed. \(errors.joined(separator: "; "))")
    }
}
