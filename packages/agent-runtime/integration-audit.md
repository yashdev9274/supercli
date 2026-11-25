# Nova integration audit

This inventory describes source-level availability, not successful live-account
execution. `integrations.ts` is the executable registry consumed by Nova web and
the experimental Eve service; this table includes the first step-4 adapter.

| Integration | Execution kind | Current web path | Eve adapter |
| --- | --- | --- | --- |
| codex | model | codex-native | codex-contract-tested |
| claude-code | unverified | unimplemented | missing |
| github-copilot | unverified | unimplemented | missing |
| supergrok | unverified | unimplemented | missing |
| supercode | model | cli-proxy | missing |
| concentrateai | model | cli-proxy | missing |
| mergedev | model | cli-proxy | missing |
| minimax | model | cli-proxy | missing |
| orcarouter | model | cli-proxy | missing |
| vercel | model | generic-text | openai-compatible-contract-tested |
| openrouter | model | generic-text | openai-compatible-contract-tested |
| cloudflare | model | generic-text | missing |
| ollama | model | generic-text | missing |
| neon | model | generic-text | missing |
| bedrock | model | generic-text | missing |
| baseten | model | generic-text | openai-compatible-contract-tested |
| fireworks | model | generic-text | openai-compatible-contract-tested |
| together | model | generic-text | openai-compatible-contract-tested |
| deepinfra | model | generic-text | openai-compatible-contract-tested |
| nvidia | model | generic-text | openai-compatible-contract-tested |
| cursor | agent | remote-job | missing |
| opencode | model | generic-text | missing |
| kimi | model | generic-text | missing |
| zai-coding | model | generic-text | missing |
| anthropic | model | generic-text | missing |
| openai | model | generic-text | openai-compatible-contract-tested |
| xai | model | generic-text | openai-compatible-contract-tested |
| google | model | generic-text | missing |
| meta | model | generic-text | missing |
| custom | model | generic-text | missing |

## Reading the capability states

- `contract-tested` means offline adapter contracts have executable coverage. It
  does not mean a production deployment, real account, or crash recovery passed.
- `implemented-unverified` means a source path exists but has not passed the Eve
  capability checks. `unknown` makes no capability claim.
- `unsupported` describes this transport, not what the upstream model can do.
  `not-applicable` separates an external agent's activity from Eve-owned tools.
- `credential` describes Nova web's credential source. CLI personal-key paths may
  coexist with a managed web route; it is not an account-wide restriction.

## Important differences between paths

Google and Neon also have native CLI/harness SDK paths, recorded separately in
`harnessPath`. Their generic web credential entries must not replace those native
routes. Neon has source-declared Gemini multi-step/structured-output restrictions
and possible Responses continuation failures. None of those paths has an Eve
adapter yet.

ConcentrateAI, Merge Dev and OrcaRouter implement model inference with local CLI
tool loops, not autonomous remote agents. MiniMax has server inference and service
code but is missing from the CLI provider factory dispatch; this audit records
that gap without changing the factory in this migration step.

Cursor starts an external coding-agent job. Its current stream adapter does not
persist job identity, resume it, or send remote cancellation. Eve must not execute
its reported tool activity a second time. Claude Code, GitHub Copilot and
SuperGrok are listed subscription entries without an executable integration
established in the audited paths; their execution kind remains unverified.

## Authorization is separate from adapter readiness

Every registered selection, including Codex, requires a signed connection ID and an
authoritative enabled, connected credential record belonging to the exact
organization/user/membership. Connection IDs are derived from membership,
provider and a credential revision, without exposing keys. Codex IDs use the
connection's `connectedAt` generation; provider-key records use `updatedAt`.
A reconnect or credential update invalidates the prior binding.

Legacy Codex scopes without a connection ID are rejected, including correctly
signed tokens created with the old schema. Admission must mint new bound scopes.
Codex contexts recheck the credential
row's generation as well as the authorization lookup, so an account change
between those reads cannot silently reuse the old continuation.

Managed inference still needs an entitlement-aware connection/grant resolver;
the production scope store denies it until that resolver exists. Authentication
of a registered provider is not permission to execute a missing adapter. Eve
selection explicitly rejects missing adapters instead of routing them to Codex
or an unrelated paid model.

## First OpenAI-compatible adapter

The nine pinned public endpoints have offline Chat Completions contracts and an
actual Eve tool-cycle eval. `eveCapabilities` describes the new adapter;
`capabilities` still describes the old web path, which remains unchanged. Neither
field certifies a real provider account. Native provider protocols, arbitrary
endpoints and autonomous agents are not routed through this adapter.
