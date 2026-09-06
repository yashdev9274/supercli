import Foundation

/// Mirrors CLI model picker sections from `slashCommands/model.ts` + `providerMeta`.
enum ModelCatalog {
    enum Provider: String, CaseIterable, Identifiable, Codable {
        case supercode
        case concentrateai
        case mergedev
        case google
        case minimax
        case nvidia
        case openrouter
        case orcarouter

        var id: String { rawValue }

        var label: String {
            switch self {
            case .supercode: return "Supercode Cloud"
            case .concentrateai: return "ConcentrateAI"
            case .mergedev: return "Merge Dev Gateway"
            case .google: return "Google Gemini"
            case .minimax: return "MiniMax"
            case .nvidia: return "NVIDIA NIM"
            case .openrouter: return "OpenRouter"
            case .orcarouter: return "OrcaRouter"
            }
        }

        /// Short chip label for the composer.
        var shortLabel: String {
            switch self {
            case .supercode: return "Cloud"
            case .concentrateai: return "Concentrate"
            case .mergedev: return "Merge"
            case .google: return "Gemini"
            case .minimax: return "MiniMax"
            case .nvidia: return "NVIDIA"
            case .openrouter: return "OpenRouter"
            case .orcarouter: return "Orca"
            }
        }

        var defaultModelId: String {
            switch self {
            case .supercode: return "deepseek-v4-flash"
            case .concentrateai: return "deepseek/deepseek-v4-flash"
            case .mergedev: return "anthropic/claude-opus-4-8"
            case .google: return "gemini-2.5-flash"
            case .minimax: return "MiniMax-M2"
            case .nvidia: return "minimaxai/minimax-m3"
            case .openrouter: return "openai/gpt-oss-120b:free"
            case .orcarouter: return "openai/gpt-4o-mini"
            }
        }

        /// BYOK providers need a server-side / user key; cloud is always available via proxy.
        var isCloud: Bool { self == .supercode }

        var sectionKind: SectionKind {
            isCloud ? .cloud : .byok
        }
    }

    enum SectionKind: String {
        case cloud
        case byok

        var title: String {
            switch self {
            case .cloud: return "Supercode Cloud"
            case .byok: return "Bring Your Own Key"
            }
        }
    }

struct ModelEntry: Identifiable, Equatable, Hashable {
        /// Model slug sent to the API (not unique across providers).
        let id: String
        let provider: Provider
        let label: String
        let cost: String
        let desc: String

        /// Unique across providers for SwiftUI ForEach (same slug can repeat under BYOK).
        var menuId: String { "\(provider.rawValue)::\(id)" }

        /// Prefer menuId so cloud + BYOK lists never collide in nested menus.
        var identity: String { menuId }

        var chipLabel: String {
            id.split(separator: "/").last.map(String.init) ?? label
        }

        var subtitle: String {
            var parts: [String] = []
            if !cost.isEmpty { parts.append(cost) }
            if !desc.isEmpty { parts.append(desc) }
            return parts.joined(separator: " · ")
        }
    }

    static let defaultProvider: Provider = .supercode
    static let defaultModelId: String = Provider.supercode.defaultModelId

    static let cloudModels: [ModelEntry] = [
        .init(id: "deepseek-v4-flash", provider: .supercode, label: "DeepSeek V4 Flash", cost: "", desc: "Fast & capable"),
        .init(id: "kimi-k2-6", provider: .supercode, label: "Kimi K2.6", cost: "", desc: "Long context"),
        .init(id: "kimi-k2-7-code", provider: .supercode, label: "Kimi K2.7 Code", cost: "", desc: "Code specialist"),
        .init(id: "kimi-k3", provider: .supercode, label: "Kimi K3", cost: "", desc: "Moonshot latest"),
        .init(id: "minimax-m3", provider: .supercode, label: "MiniMax M3", cost: "", desc: "Fast & smart"),
        .init(id: "glm-5.2", provider: .supercode, label: "GLM 5.2", cost: "", desc: "Latest GLM"),
        .init(id: "glm-5.1", provider: .supercode, label: "GLM 5.1", cost: "", desc: "Stable & reliable"),
        .init(id: "mimo-v2.5", provider: .supercode, label: "Mimo v2.5", cost: "", desc: "Novita"),
        .init(id: "hy3", provider: .supercode, label: "Hunyuan Hy3", cost: "", desc: "Tencent flagship"),
        .init(id: "gemini-2.5-flash", provider: .supercode, label: "Gemini 2.5 Flash", cost: "", desc: "Google smart & fast"),
        .init(id: "meta/llama-3.3-70b-instruct", provider: .supercode, label: "Llama 3.3 70B", cost: "", desc: "Open weights"),
        .init(id: "orcarouter/auto", provider: .supercode, label: "OrcaRouter Auto", cost: "", desc: "Auto-pick cheapest"),
        .init(id: "stealth/ox-alpha", provider: .supercode, label: "OX Alpha", cost: "", desc: "Free · Coding & reasoning"),
    ]

    static let byokModels: [ModelEntry] = [
        // ConcentrateAI
        .init(id: "anthropic/claude-opus-5", provider: .concentrateai, label: "Claude Opus 5", cost: "", desc: "Most capable"),
        .init(id: "anthropic/claude-opus-4-8", provider: .concentrateai, label: "Claude Opus 4.8", cost: "", desc: "Deep reasoning"),
        .init(id: "anthropic/claude-opus-4", provider: .concentrateai, label: "Claude Opus 4", cost: "", desc: "Top-tier reasoning"),
        .init(id: "anthropic/claude-sonnet-4-5", provider: .concentrateai, label: "Claude Sonnet 4.5", cost: "", desc: "Latest sonnet"),
        .init(id: "anthropic/claude-sonnet-4", provider: .concentrateai, label: "Claude Sonnet 4", cost: "", desc: "Balanced"),
        .init(id: "anthropic/claude-3-5-haiku", provider: .concentrateai, label: "Claude 3.5 Haiku", cost: "", desc: "Fast & cheap"),
        .init(id: "openai/gpt-4o", provider: .concentrateai, label: "GPT-4o", cost: "", desc: "OpenAI flagship"),
        .init(id: "openai/gpt-4o-mini", provider: .concentrateai, label: "GPT-4o Mini", cost: "", desc: "Cheap & fast"),
        .init(id: "openai/gpt-4-1", provider: .concentrateai, label: "GPT-4.1", cost: "", desc: "Latest GPT"),
        .init(id: "openai/o3-mini", provider: .concentrateai, label: "o3-mini", cost: "", desc: "Reasoning mini"),
        .init(id: "openai/o4-mini", provider: .concentrateai, label: "o4-mini", cost: "", desc: "Reasoning v4 mini"),
        .init(id: "x-ai/grok-4-5", provider: .concentrateai, label: "Grok 4.5", cost: "", desc: "xAI latest"),
        .init(id: "x-ai/grok-3", provider: .concentrateai, label: "Grok 3", cost: "", desc: "xAI flagship"),
        .init(id: "x-ai/grok-3-mini", provider: .concentrateai, label: "Grok 3 Mini", cost: "", desc: "Compact Grok"),
        .init(id: "deepseek/deepseek-v4-flash", provider: .concentrateai, label: "DeepSeek V4 Flash", cost: "", desc: "Fast & capable"),
        .init(id: "deepseek/deepseek-v3", provider: .concentrateai, label: "DeepSeek V3", cost: "", desc: "DeepSeek flagship"),
        .init(id: "deepseek/deepseek-r1", provider: .concentrateai, label: "DeepSeek R1", cost: "", desc: "Reasoning model"),
        .init(id: "meta-llama/llama-4-maverick", provider: .concentrateai, label: "Llama 4 Maverick", cost: "", desc: "Latest Llama"),
        .init(id: "z-ai/glm-5-2", provider: .concentrateai, label: "GLM 5.2", cost: "", desc: "Latest GLM"),
        .init(id: "kimi-k3", provider: .concentrateai, label: "Kimi K3", cost: "", desc: "Moonshot latest"),
        .init(id: "kimi-k2-6", provider: .concentrateai, label: "Kimi K2.6", cost: "", desc: "Long context"),
        .init(id: "minimax/minimax-m3", provider: .concentrateai, label: "MiniMax M3", cost: "", desc: "Fast & smart"),

        // Merge Dev
        .init(id: "anthropic/claude-opus-5", provider: .mergedev, label: "Claude Opus 5", cost: "50x", desc: "Most capable"),
        .init(id: "anthropic/claude-sonnet-4-6", provider: .mergedev, label: "Claude Sonnet 4.6", cost: "12x", desc: "Latest sonnet"),
        .init(id: "anthropic/claude-opus-4-8", provider: .mergedev, label: "Claude Opus 4.8", cost: "40x", desc: "Deep reasoning"),
        .init(id: "gpt-4o", provider: .mergedev, label: "GPT-4o", cost: "4x", desc: "OpenAI flagship"),
        .init(id: "xai/grok-4.3", provider: .mergedev, label: "Grok 4.3", cost: "10x", desc: "Via Merge Dev"),
        .init(id: "google/gemini-2.5-flash", provider: .mergedev, label: "Gemini 2.5 Flash", cost: "2x", desc: "Via Merge Dev"),
        .init(id: "google/gemini-2.5-pro", provider: .mergedev, label: "Gemini 2.5 Pro", cost: "4x", desc: "Via Merge Dev"),
        .init(id: "deepseek/deepseek-v4-flash", provider: .mergedev, label: "DeepSeek V4 Flash", cost: "1.2x", desc: "Via Merge Dev"),
        .init(id: "moonshot/kimi-k3", provider: .mergedev, label: "Kimi K3", cost: "3x", desc: "Via Merge Dev"),
        .init(id: "anthropic/claude-opus-4-20250514", provider: .mergedev, label: "Claude Opus 4", cost: "30x", desc: "Top-tier reasoning"),
        .init(id: "anthropic/claude-sonnet-4-5-20250929", provider: .mergedev, label: "Claude Sonnet 4.5", cost: "15x", desc: "Latest sonnet"),
        .init(id: "gpt-4o-mini", provider: .mergedev, label: "GPT-4o Mini", cost: "1x", desc: "Cheap & fast"),
        .init(id: "gpt-4.1", provider: .mergedev, label: "GPT-4.1", cost: "3x", desc: "Latest GPT"),
        .init(id: "o3-mini", provider: .mergedev, label: "o3-mini", cost: "3x", desc: "Reasoning mini"),
        .init(id: "o4-mini", provider: .mergedev, label: "o4-mini", cost: "3x", desc: "Reasoning v4 mini"),
        .init(id: "xai/grok-4.5", provider: .mergedev, label: "Grok 4.5", cost: "15x", desc: "xAI latest"),
        .init(id: "deepseek/deepseek-v3", provider: .mergedev, label: "DeepSeek V3", cost: "1.5x", desc: "DeepSeek flagship"),
        .init(id: "deepseek/deepseek-r1", provider: .mergedev, label: "DeepSeek R1", cost: "4x", desc: "Reasoning model"),
        .init(id: "meta/llama-4-maverick-17b-128e-instruct", provider: .mergedev, label: "Llama 4 Maverick", cost: "2x", desc: "Latest Llama"),
        .init(id: "moonshot/kimi-k2.6", provider: .mergedev, label: "Kimi K2.6", cost: "3x", desc: "Long context"),
        .init(id: "minimax/minimax-m3", provider: .mergedev, label: "MiniMax M3", cost: "1.5x", desc: "Fast & smart"),

        // Google
        .init(id: "gemini-2.5-flash", provider: .google, label: "Gemini 2.5 Flash", cost: "2.0x", desc: "Smart & fast"),
        .init(id: "gemini-2.5-pro", provider: .google, label: "Gemini 2.5 Pro", cost: "4.0x", desc: "Deep reasoning"),
        .init(id: "gemini-2.0-flash", provider: .google, label: "Gemini 2.0 Flash", cost: "1.5x", desc: "Previous gen"),
        .init(id: "gemini-2.5-flash-preview", provider: .google, label: "Gemini 2.5 Flash Preview", cost: "2.0x", desc: "Latest preview"),
        .init(id: "gemini-2.5-pro-preview", provider: .google, label: "Gemini 2.5 Pro Preview", cost: "4.0x", desc: "Max preview"),
        .init(id: "learnlm-1.5-pro", provider: .google, label: "LearnLM 1.5 Pro", cost: "1.0x", desc: "Teaching optimized"),

        // MiniMax
        .init(id: "MiniMax-M2", provider: .minimax, label: "MiniMax M2", cost: "0.8x", desc: "MiniMax flagship"),
        .init(id: "MiniMax-M3", provider: .minimax, label: "MiniMax M3", cost: "0.5x", desc: "Fast & smart"),

        // NVIDIA
        .init(id: "meta/llama-3.1-405b-instruct", provider: .nvidia, label: "Llama 3.1 405B", cost: "2.0x", desc: "Via NVIDIA NIM"),
        .init(id: "meta/llama-3.3-70b-instruct", provider: .nvidia, label: "Llama 3.3 70B", cost: "1.2x", desc: "Open weights"),
        .init(id: "meta/llama-3.1-70b-instruct", provider: .nvidia, label: "Llama 3.1 70B", cost: "1.0x", desc: "Via NVIDIA NIM"),
        .init(id: "meta/llama-3.1-8b-instruct", provider: .nvidia, label: "Llama 3.1 8B", cost: "0.5x", desc: "Via NVIDIA NIM"),
        .init(id: "nvidia/llama-3.1-nemotron-70b-instruct", provider: .nvidia, label: "Nemotron 70B", cost: "1.2x", desc: "RLHF optimized"),
        .init(id: "nvidia/llama-3.1-nemotron-ultra-253b", provider: .nvidia, label: "Nemotron Ultra 253B", cost: "2.5x", desc: "Biggest NIM"),
        .init(id: "mistralai/mistral-7b-instruct-v0.3", provider: .nvidia, label: "Mistral 7B", cost: "0.5x", desc: "Via NVIDIA NIM"),
        .init(id: "qwen/qwen2.5-72b-instruct", provider: .nvidia, label: "Qwen 2.5 72B", cost: "1.2x", desc: "Via NVIDIA NIM"),
        .init(id: "minimaxai/minimax-m3", provider: .nvidia, label: "MiniMax M3", cost: "0.5x", desc: "Via NVIDIA NIM"),
        .init(id: "deepseek-ai/deepseek-v4-flash", provider: .nvidia, label: "DeepSeek V4 Flash", cost: "1.0x", desc: "Via NVIDIA NIM"),

        // OpenRouter
        .init(id: "stealth/ox-alpha", provider: .openrouter, label: "OX Alpha", cost: "", desc: "Free · Coding & reasoning"),
        .init(id: "anthropic/claude-opus-5", provider: .openrouter, label: "Claude Opus 5", cost: "50x", desc: "Most capable"),
        .init(id: "anthropic/claude-opus-4-8", provider: .openrouter, label: "Claude Opus 4.8", cost: "40x", desc: "Deep reasoning"),
        .init(id: "anthropic/claude-opus-4", provider: .openrouter, label: "Claude Opus 4", cost: "30x", desc: "Top-tier reasoning"),
        .init(id: "anthropic/claude-sonnet-4", provider: .openrouter, label: "Claude Sonnet 4", cost: "12x", desc: "Balanced"),
        .init(id: "anthropic/claude-sonnet-4.5", provider: .openrouter, label: "Claude Sonnet 4.5", cost: "10x", desc: "Latest sonnet"),
        .init(id: "anthropic/claude-3.5-haiku", provider: .openrouter, label: "Claude 3.5 Haiku", cost: "3x", desc: "Fast & cheap"),
        .init(id: "openai/gpt-4o", provider: .openrouter, label: "GPT-4o", cost: "4x", desc: "OpenAI flagship"),
        .init(id: "openai/gpt-4o-mini", provider: .openrouter, label: "GPT-4o Mini", cost: "0.5x", desc: "Cheap & fast"),
        .init(id: "openai/gpt-4.1", provider: .openrouter, label: "GPT-4.1", cost: "3x", desc: "Latest GPT"),
        .init(id: "openai/gpt-4.1-mini", provider: .openrouter, label: "GPT-4.1 Mini", cost: "1x", desc: "Compact GPT"),
        .init(id: "openai/gpt-4.1-nano", provider: .openrouter, label: "GPT-4.1 Nano", cost: "0.3x", desc: "Tiny & fast"),
        .init(id: "openai/o3-mini", provider: .openrouter, label: "o3-mini", cost: "3x", desc: "Reasoning mini"),
        .init(id: "openai/o4-mini", provider: .openrouter, label: "o4-mini", cost: "3x", desc: "Reasoning v4 mini"),
        .init(id: "openai/gpt-oss-120b:free", provider: .openrouter, label: "GPT OSS 120B", cost: "", desc: "Open-weight"),
        .init(id: "x-ai/grok-3", provider: .openrouter, label: "Grok 3", cost: "10x", desc: "xAI flagship"),
        .init(id: "x-ai/grok-3-mini", provider: .openrouter, label: "Grok 3 Mini", cost: "5x", desc: "Compact Grok"),
        .init(id: "x-ai/grok-3-mini-fast", provider: .openrouter, label: "Grok 3 Mini Fast", cost: "5x", desc: "Fast Grok"),
        .init(id: "deepseek/deepseek-v4-flash", provider: .openrouter, label: "DeepSeek V4 Flash", cost: "1.2x", desc: "Via OpenRouter"),
        .init(id: "deepseek/deepseek-v3", provider: .openrouter, label: "DeepSeek V3", cost: "1.5x", desc: "DeepSeek flagship"),
        .init(id: "deepseek/deepseek-r1", provider: .openrouter, label: "DeepSeek R1", cost: "4x", desc: "Reasoning model"),
        .init(id: "meta-llama/llama-4-maverick", provider: .openrouter, label: "Llama 4 Maverick", cost: "2x", desc: "Latest Llama"),
        .init(id: "meta-llama/llama-4-scout", provider: .openrouter, label: "Llama 4 Scout", cost: "1x", desc: "Lightweight Llama"),
        .init(id: "meta-llama/llama-3.3-70b", provider: .openrouter, label: "Llama 3.3 70B", cost: "1.2x", desc: "Open weights"),
        .init(id: "mistral/mistral-large", provider: .openrouter, label: "Mistral Large", cost: "4x", desc: "Mistral flagship"),
        .init(id: "mistral/mistral-small", provider: .openrouter, label: "Mistral Small", cost: "0.5x", desc: "Compact Mistral"),
        .init(id: "mistral/codestral-2501", provider: .openrouter, label: "Codestral", cost: "2x", desc: "Code specialist"),
        .init(id: "google/gemini-2.5-pro", provider: .openrouter, label: "Gemini 2.5 Pro", cost: "4x", desc: "Via OpenRouter"),
        .init(id: "google/gemini-2.5-flash", provider: .openrouter, label: "Gemini 2.5 Flash", cost: "2x", desc: "Via OpenRouter"),
        .init(id: "qwen/qwen-2.5-72b", provider: .openrouter, label: "Qwen 2.5 72B", cost: "1.2x", desc: "Alibaba flagship"),
        .init(id: "qwen/qwen-2.5-coder-32b", provider: .openrouter, label: "Qwen 2.5 Coder 32B", cost: "1x", desc: "Coding specialist"),
        .init(id: "qwen/qwq-32b", provider: .openrouter, label: "QWQ 32B", cost: "1.2x", desc: "Reasoning model"),
        .init(id: "cohere/command-r-plus", provider: .openrouter, label: "Command R+", cost: "3x", desc: "Cohere flagship"),
        .init(id: "minimax/minimax-m3", provider: .openrouter, label: "MiniMax M3", cost: "3.0x", desc: "Via OpenRouter"),
        .init(id: "z-ai/glm-5.1", provider: .openrouter, label: "GLM 5.1", cost: "1.0x", desc: "Via OpenRouter"),
        .init(id: "moonshotai/kimi-k2.6", provider: .openrouter, label: "Kimi K2.6", cost: "1.5x", desc: "Via OpenRouter"),

        // OrcaRouter
        .init(id: "anthropic/claude-opus-5", provider: .orcarouter, label: "Claude Opus 5", cost: "", desc: "Most capable"),
        .init(id: "anthropic/claude-opus-4.8", provider: .orcarouter, label: "Claude Opus 4.8", cost: "", desc: "Deep reasoning"),
        .init(id: "anthropic/claude-opus-4", provider: .orcarouter, label: "Claude Opus 4", cost: "", desc: "Top-tier reasoning"),
        .init(id: "anthropic/claude-sonnet-4.5", provider: .orcarouter, label: "Claude Sonnet 4.5", cost: "", desc: "Latest sonnet"),
        .init(id: "anthropic/claude-sonnet-4", provider: .orcarouter, label: "Claude Sonnet 4", cost: "", desc: "Balanced"),
        .init(id: "anthropic/claude-3.5-haiku", provider: .orcarouter, label: "Claude 3.5 Haiku", cost: "", desc: "Fast & cheap"),
        .init(id: "openai/gpt-4o", provider: .orcarouter, label: "GPT-4o", cost: "", desc: "OpenAI flagship"),
        .init(id: "openai/gpt-4o-mini", provider: .orcarouter, label: "GPT-4o Mini", cost: "", desc: "Cheap & fast"),
        .init(id: "openai/gpt-4.1", provider: .orcarouter, label: "GPT-4.1", cost: "", desc: "Latest GPT"),
        .init(id: "openai/o3-mini", provider: .orcarouter, label: "o3-mini", cost: "", desc: "Reasoning mini"),
        .init(id: "openai/o4-mini", provider: .orcarouter, label: "o4-mini", cost: "", desc: "Reasoning v4 mini"),
        .init(id: "grok/grok-4.5", provider: .orcarouter, label: "Grok 4.5", cost: "", desc: "xAI latest"),
        .init(id: "grok/grok-3", provider: .orcarouter, label: "Grok 3", cost: "", desc: "xAI flagship"),
        .init(id: "grok/grok-3-mini", provider: .orcarouter, label: "Grok 3 Mini", cost: "", desc: "Compact Grok"),
        .init(id: "deepseek/deepseek-chat", provider: .orcarouter, label: "DeepSeek Chat", cost: "", desc: "Fast & capable"),
        .init(id: "deepseek/deepseek-v3", provider: .orcarouter, label: "DeepSeek V3", cost: "", desc: "DeepSeek flagship"),
        .init(id: "deepseek/deepseek-reasoner", provider: .orcarouter, label: "DeepSeek Reasoner", cost: "", desc: "Reasoning model"),
        .init(id: "meta-llama/llama-4-maverick", provider: .orcarouter, label: "Llama 4 Maverick", cost: "", desc: "Latest Llama"),
        .init(id: "z-ai/glm-5.2", provider: .orcarouter, label: "GLM 5.2", cost: "", desc: "Latest GLM"),
        .init(id: "kimi/kimi-k3", provider: .orcarouter, label: "Kimi K3", cost: "", desc: "Moonshot latest"),
        .init(id: "kimi/kimi-k2.6", provider: .orcarouter, label: "Kimi K2.6", cost: "", desc: "Long context"),
        .init(id: "minimax/minimax-m3", provider: .orcarouter, label: "MiniMax M3", cost: "", desc: "Fast & smart"),
        .init(id: "orcarouter/auto", provider: .orcarouter, label: "OrcaRouter Auto", cost: "", desc: "Auto-pick cheapest"),
    ]

    static var allModels: [ModelEntry] { cloudModels + byokModels }

    static func models(for provider: Provider) -> [ModelEntry] {
        allModels.filter { $0.provider == provider }
    }

static var byokProviders: [Provider] {
        Provider.allCases.filter { !$0.isCloud }
    }

    static func find(provider: String, model: String) -> ModelEntry? {
        allModels.first { $0.provider.rawValue == provider && $0.id == model }
    }

    static func resolve(provider rawProvider: String, model rawModel: String) -> (Provider, ModelEntry) {
        let provider = Provider(rawValue: rawProvider) ?? .supercode
        if let entry = find(provider: provider.rawValue, model: rawModel) {
            return (provider, entry)
        }
        // Fallback: match model id under any provider, preferring requested provider default.
        if let entry = allModels.first(where: { $0.id == rawModel }) {
            return (entry.provider, entry)
        }
        let fallbackId = provider.defaultModelId
        if let entry = find(provider: provider.rawValue, model: fallbackId) {
            return (provider, entry)
        }
        return (.supercode, cloudModels[0])
    }

    static func displayChip(provider rawProvider: String, model rawModel: String) -> String {
        let (provider, entry) = resolve(provider: rawProvider, model: rawModel)
        if provider == .supercode {
            return entry.chipLabel
        }
        return "\(provider.shortLabel) · \(entry.chipLabel)"
    }
}
