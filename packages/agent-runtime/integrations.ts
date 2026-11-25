export const INTEGRATION_IDS = [
  "codex", "claude-code", "github-copilot", "supergrok",
  "supercode", "concentrateai", "mergedev", "minimax", "orcarouter",
  "vercel", "openrouter", "cloudflare", "ollama", "neon", "bedrock",
  "baseten", "fireworks", "together", "deepinfra", "nvidia", "cursor",
  "opencode", "kimi", "zai-coding", "anthropic", "openai", "xai", "google",
  "meta", "custom",
] as const

export type IntegrationId = typeof INTEGRATION_IDS[number]
export const OPENAI_COMPATIBLE_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  vercel: "https://ai-gateway.vercel.sh/v1",
  xai: "https://api.x.ai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  together: "https://api.together.xyz/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  nvidia: "https://integrate.api.nvidia.com/v1",
  baseten: "https://inference.baseten.co/v1",
} as const

export type OpenAICompatibleIntegration = keyof typeof OPENAI_COMPATIBLE_BASE_URLS
export function isOpenAICompatibleIntegration(id: IntegrationId): id is OpenAICompatibleIntegration {
  return Object.hasOwn(OPENAI_COMPATIBLE_BASE_URLS, id)
}
export type HarnessIntegrationId = Exclude<IntegrationId, "claude-code" | "github-copilot" | "supergrok">
export type CapabilityStatus = "contract-tested" | "implemented-unverified" | "unsupported" | "unknown" | "not-applicable"
export type IntegrationCapabilities = Record<"streaming" | "tools" | "reasoning" | "images" | "structuredOutput" | "cancellation" | "continuation" | "parallelCalls" | "usage", CapabilityStatus>
export type IntegrationDefinition = {
  id: IntegrationId
  kind: "model" | "agent" | "unverified"
  credential: "subscription" | "provider-key" | "managed"
  webTransport: "codex-native" | "generic-text" | "remote-job" | "cli-proxy" | "unimplemented"
  eveAdapter: "codex-contract-tested" | "openai-compatible-contract-tested" | "anthropic-contract-tested" | "missing"
  eveCapabilities?: IntegrationCapabilities
  capabilities: IntegrationCapabilities
  evidence: readonly string[]
  limitation: string
  harnessPath?: { evidence: readonly string[]; limitation: string }
}

const UNKNOWN_CAPABILITIES: IntegrationCapabilities = {
  streaming: "unknown", tools: "unknown", reasoning: "unknown", images: "unknown",
  structuredOutput: "unknown", cancellation: "unknown", continuation: "unknown",
  parallelCalls: "unknown", usage: "unknown",
}
const GENERIC_WEB_CAPABILITIES: IntegrationCapabilities = {
  ...UNKNOWN_CAPABILITIES, streaming: "implemented-unverified", tools: "unsupported", images: "unsupported",
  structuredOutput: "unsupported", continuation: "unsupported", parallelCalls: "unsupported",
  usage: "implemented-unverified",
}

export const INTEGRATIONS: readonly IntegrationDefinition[] = INTEGRATION_IDS.map((id): IntegrationDefinition => {
  if (id === "codex") return {
    id, kind: "model", credential: "subscription", webTransport: "codex-native", eveAdapter: "codex-contract-tested",
    capabilities: { ...UNKNOWN_CAPABILITIES, streaming: "contract-tested", tools: "contract-tested", reasoning: "contract-tested", images: "unsupported", structuredOutput: "unsupported", cancellation: "contract-tested", continuation: "contract-tested", parallelCalls: "unsupported", usage: "implemented-unverified" },
    evidence: ["packages/codex-runtime/runtime.ts", "apps/nova-agent/tests/codex-model.test.ts", "apps/nova-agent/tests/fixtures/codex/evals/codex.eval.ts"],
    limitation: "Offline protocol and saved-history contracts only; live account, process-restart recovery and deployment remain unverified",
  }
  if (id === "cursor") return {
    id, kind: "agent", credential: "provider-key", webTransport: "remote-job", eveAdapter: "missing",
    capabilities: { ...UNKNOWN_CAPABILITIES, streaming: "implemented-unverified", tools: "not-applicable", cancellation: "unsupported", continuation: "unsupported", parallelCalls: "not-applicable" },
    evidence: ["apps/web/modules/nova/provider-credentials/runtime.ts"],
    limitation: "Creates and streams an external agent run; lacks durable job identity, resume and remote cancellation. Its tool activity must not be executed by Eve",
  }
  if (["claude-code", "github-copilot", "supergrok"].includes(id)) return {
    id, kind: "unverified", credential: "subscription", webTransport: "unimplemented", eveAdapter: "missing", capabilities: { ...UNKNOWN_CAPABILITIES },
    evidence: ["apps/web/modules/nova-web/provider-integrations.ts", "apps/web/modules/nova-web/components/provider-connections.tsx"],
    limitation: "Listed subscription integration; no verified executable model or autonomous-agent transport in the audited web path",
  }
  if (["supercode", "concentrateai", "mergedev", "minimax", "orcarouter"].includes(id)) return {
    id, kind: "model", credential: "managed", webTransport: "cli-proxy", eveAdapter: "missing", capabilities: { ...UNKNOWN_CAPABILITIES },
    evidence: ["apps/web/modules/nova/harness/client.ts", "apps/supercode-cli/server/src/index.ts", "apps/web/modules/nova-web/model-settings.ts"],
    limitation: id === "minimax"
      ? "Harness-server inference exists, but the CLI provider factory omits MiniMax dispatch; no Eve adapter"
      : "CLI-hosted model inference exists, including CLI personal-key paths; managed means the current web credential source, not a restriction to managed keys. No Eve adapter",
  }
  if (id === "google" || id === "neon") return {
    id, kind: "model", credential: "provider-key", webTransport: "generic-text", eveAdapter: "missing", capabilities: { ...GENERIC_WEB_CAPABILITIES },
    evidence: ["apps/web/modules/nova/provider-credentials/runtime.ts"],
    limitation: "Generic web credential path is text-limited and must not replace the separate native CLI/harness route",
    harnessPath: {
      evidence: id === "google"
        ? ["apps/supercode-cli/server/src/cli/ai/google-service.ts", "apps/supercode-cli/server/src/cli/ai/adapters/google.ts"]
        : ["apps/supercode-cli/server/src/cli/ai/neon-service.ts", "apps/supercode-cli/server/src/runtime/stream/neon-stream.ts"],
      limitation: id === "google"
        ? "Native Google SDK inference exists; capabilities still require Eve contract and live-account tests"
        : "Native Neon SDK inference exists; Gemini multi-step tools/structured output are restricted and Responses continuation may fail upstream",
    },
  }
  if (id === "anthropic") return {
    id, kind: "model", credential: "provider-key", webTransport: "generic-text", eveAdapter: "missing",
    capabilities: { ...GENERIC_WEB_CAPABILITIES },
    eveCapabilities: { ...UNKNOWN_CAPABILITIES, streaming: "contract-tested", tools: "contract-tested", reasoning: "unsupported", images: "unsupported", structuredOutput: "unsupported", cancellation: "contract-tested", continuation: "contract-tested", parallelCalls: "unsupported", usage: "contract-tested" },
    evidence: ["apps/nova-agent/lib/anthropic-model.ts", "apps/nova-agent/lib/scoped-provider-model.ts"],
    limitation: "Anthropic-native implementation was interrupted before verification and is not eligible for the Eve canary. The existing web generic path is unchanged",
  }
  return {
    id, kind: "model", credential: "provider-key", webTransport: "generic-text",
    eveAdapter: isOpenAICompatibleIntegration(id) ? "openai-compatible-contract-tested" : "missing",
    ...(isOpenAICompatibleIntegration(id) ? { eveCapabilities: { ...UNKNOWN_CAPABILITIES, streaming: "contract-tested", tools: "contract-tested", reasoning: "unsupported", images: "unsupported", structuredOutput: "unsupported", cancellation: "contract-tested", continuation: "contract-tested", parallelCalls: "unsupported", usage: "contract-tested" } satisfies IntegrationCapabilities } : {}),
    capabilities: { ...GENERIC_WEB_CAPABILITIES },
    evidence: ["apps/web/modules/nova/provider-credentials/runtime.ts", "apps/web/modules/nova/provider-credentials/server.ts", ...(isOpenAICompatibleIntegration(id) ? ["apps/nova-agent/lib/openai-compatible-model.ts", "apps/nova-agent/tests/openai-compatible.test.ts"] : [])],
    limitation: "Audit describes the current web credential transport, not upstream model capabilities: tool-call deltas and native Anthropic tool blocks are missing; CLI routes may differ",
  }
})

export function isIntegrationId(value: unknown): value is IntegrationId {
  return typeof value === "string" && (INTEGRATION_IDS as readonly string[]).includes(value)
}

export function integrationFor(id: IntegrationId): IntegrationDefinition {
  const integration = INTEGRATIONS.find((entry) => entry.id === id)
  if (!integration) throw new Error("Unknown Nova integration")
  return integration
}
