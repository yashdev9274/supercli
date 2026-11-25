# Nova Eve migration: provider- and agent-independent plan

This app proves the real Eve runtime can run a model/tool continuation and keep a
turn running when its event reader disconnects. It is separate from the CLI's
Eve-inspired agent loop. It does not wrap or call that loop.

**Nova web still uses its existing harness. This does not fix production timeouts
or enable coding through Eve.** No database schema, existing web route, CLI
dependency, or production deployment configuration is changed. Web's Codex
transport now re-exports the shared implementation in `packages/codex-runtime`.

## Product scope and execution architecture

Nova is a multi-provider, multi-coding-agent product. Codex is the first
compatibility implementation, not the product boundary or universal protocol.
Steps 1 and 2 provide the runtime and first Codex proof. Step 3 adds the shared
provider/agent registry and connection-bound authorization; additional executable
backend adapters remain step 4 work. The first step-4 implementation now adds
OpenAI-compatible Chat Completions for nine fixed public provider endpoints.

The executable registry is `packages/agent-runtime/integrations.ts`. Its source
audit is recorded in [integration-audit.md](../../packages/agent-runtime/integration-audit.md).
Web's integration catalog and harness provider type now consume this registry.

Keep two execution contracts rather than treating every integration as a chat
completion endpoint:

- **Model providers:** Eve owns the model/tool loop. Adapt native OpenAI
  Responses, OpenAI-compatible Chat Completions, Anthropic Messages, Google
  integrations, managed inference and gateways while retaining each protocol's
  reasoning, tool-result, usage and cancellation semantics.
- **Coding-agent backends:** the external agent owns its coding loop. Eve
  durably starts, observes, resumes and cancels its job using persisted remote
  job IDs and event cursors. Do not execute a remote agent's reported tool
  activity again locally or wrap its entire lifetime in a single blocking tool.
  Subscription credentials do not by themselves determine whether a connection
  is a model transport or an autonomous agent backend.

The starting inventory comes from Nova's existing provider integration catalog,
model settings, server transports and CLI provider implementations, not a new
Eve-only model list. It includes managed Supercode inference, API keys, gateways,
subscription-backed integrations, custom endpoints, and local/provider-specific
paths. The catalog lists Codex, Claude Code, GitHub Copilot, SuperGrok, Cursor,
OpenCode, OpenAI, Anthropic, Google, OpenRouter, Vercel and others. Catalog
presence is not proof that inference, tool execution or durable remote-agent
control already works; audit each implementation and publish its actual status.

Nova continues to own identity, membership, connections, entitlements, billing,
repository authorization and workspace selection. Eve owns orchestration in the
new path. Preserve one visible provider/agent selection and one consistent
timeline across web and CLI, while keeping backend-specific continuation opaque.

## Runtime and safety boundary

- Node 24 or newer, Eve 1.3.0, and AI SDK 7.0.172 are pinned independently of the
  CLI's older dependency versions. Select Node 24 before invoking Eve.
- HTTP session access is disabled unless `NOVA_EVE_ENABLED=true` and
  `NOVA_EVE_SERVICE_PASSWORD` is configured. Authentication uses HTTP Basic with
  username `nova-runtime`; keep the password server-side. No cookie fallback,
  browser CORS, uploads, trusted forwarders, or anonymous access is configured.
- Tenant access additionally requires a short-lived Bearer token signed using
  `NOVA_EVE_SCOPE_SECRET` (at least 32 bytes). The service rechecks the exact Nova
  session, organization, initiator membership, and active user membership in the
  product database. The token includes a registered provider, model, optional
  reasoning effort and a required connection ID for every provider. That
  connection must match the same tenant/user/membership/provider, be connected
  and enabled, and have the current credential revision. Legacy unbound Codex
  scopes are rejected at signing, verification and execution authorization. No provider
  credentials are carried in the token.
- Eve route authentication alone does not enforce session ownership. For every
  stream, message, or control request we compare the caller with the first
  `delivery.admitted` principal in the target Eve session's stored event stream.
  No later caller can establish ownership. The probe waits up to five seconds
  for the initial admission, then fails closed if the prefix is absent or
  unreadable. This gate is specific to the pinned standalone `/eve/v1/session`
  protocol. Create sessions with their first message; empty prewarmed sessions
  and cross-agent observation are not supported by this gate.
- Before connecting users, the Nova backend must mint tokens only from
  server-authorized scope and model selections, map Eve sessions into Nova's UI,
  and enforce billing and per-tool repository authorization. There is no public
  token-minting endpoint or browser integration in this change.
- The only authored tool is `runtime_info`. Default tools and root-copy
  delegation are disabled. The virtual just-bash sandbox is for compatibility,
  not an isolated repository VM; it has no native process or network-isolation
  guarantee. No filesystem or shell tool is exposed to the model.
- Basic-authenticated operators retain the small Gateway diagnostic model.
  Tenant execution supports hosted Codex and the fixed-endpoint OpenAI-compatible
  adapter, with the existing encrypted credential stores. Membership/session ownership is
  rechecked before each inference. A disconnected account, unsupported model,
  or revoked scope fails instead of falling back to a differently billed model.
  Other registered providers fail explicitly at adapter selection until their
  implementations exist; registration does not enable them or route traffic.
- The service needs the existing product database connection and
  `NOVA_CODEX_ENCRYPTION_KEYS` / `NOVA_CODEX_ENCRYPTION_KEY_VERSION` for real Codex
  calls. Their values remain in the server environment, never in model messages,
  scope tokens, or continuation metadata. The deterministic fixtures are
  separate agents and cannot be selected by a production request or flag.
- `start` binds to loopback. The pinned built local service rejects missing and
  forged Workflow queue credentials with `401` / `x-workflow-auth-refused: 1`,
  independently of Nova's channel credentials. `eve start` refuses
  `WORKFLOW_QUEUE_AUTH=off`. The security regression test runs the actual build,
  not Eve's development proxy, in an isolated local data directory.
- Eve's development-world proxy still emits a missing-queue-auth-mode warning;
  it is not evidence that the built handler is unprotected. Do not expose the
  development server or test fixtures through a tunnel or public proxy. Vercel
  deployment security, durable production storage, billing and application
  authorization still require their own acceptance gates before public traffic.

## Run and verify

From this directory, with Node 24 selected and root dependencies installed:

```sh
bun run test
bun run typecheck
bun run build
bun run test:runtime
bun run test:codex
bun run test:compatible
bun run test:security
```

The runtime test invokes `eve eval --strict` against an actual local Eve HTTP
server and Workflow runtime. Its deterministic model calls the production
`runtime_info` tool, consumes its result, and returns a reply without provider
credentials. A second eval disconnects after a `model.started` event and attaches
with the saved stream cursor, verifying the turn completes without resubmitting
the message. These are runtime contract checks, not coding-quality benchmarks.

The Codex eval uses the real Eve workflow/HTTP runtime and actual AI SDK adapter,
but mocks OpenAI's HTTP responses and the database/credential boundary. It proves
that encrypted native reasoning survives Eve's tool-step persistence and that
another valid tenant cannot read, send to, or cancel the session. Unit checks
cover recreated models, credential refresh, revocation, tampered scope tokens,
cross-tenant state, and early text/cancellation. No real OpenAI account, live
database, process-restart recovery, or production deployment is verified here.

The hardening checks also reject JSON/structured responses and unsupported
sampling, stop, seed and output-token options before credential lookup or a
provider request. Explicit text responses remain supported. These options are
not silently ignored or translated into unsupported Codex API parameters.
`test:security` builds and starts the real service with Node 24, confirms public
health plus denial of unauthenticated sessions and forged/internal deliveries,
and verifies that the documented start command refuses disabled queue auth.

The broader legacy web harness suite is not green: an unchanged HEAD copy
reproduces 16 failures in `agent.test.ts`, `web-search.test.ts`, and the hosted
guard source assertion in `chatgpt.test.ts`. The parallel result-order test also
fails intermittently on that baseline (1 of 10 repetitions). Do not treat those
baseline failures as a passing full-suite result or weaken their assertions.
Focused shared-provider and bridge checks are run separately from those failures.

`bun run dev` starts the opt-in local service. Configure the operator environment
variables above securely to authorize operator calls. `bun run start` serves the
built output locally. Never put this service password in `NEXT_PUBLIC_*` values.
Build output, local workflow state, and eval reports are ignored by Git.

## Implementation sequence and acceptance gates

1. **Compatibility foundation (this change):** isolated real runtime, disabled
   operator channel, bounded capability set, and deterministic continuation and
   stream-reconnection evals.
2. **First backend proof: Codex and authorization (implemented, not universal):** reuse the existing protocol,
   vault and refresh behavior from `@super/codex-runtime`. An AI SDK v3-compatible
   model streams text immediately and carries native response items in persisted
   assistant-part metadata, bound to identity and model. It reconstructs requests
   from saved messages, not a mutable singleton. Both streaming and non-streaming
   SDK calls are supported. Text input and ordinary JSON/text tool results are
   the current boundary; files and provider-executed tools fail explicitly.
   Native response metadata is capped at 1 MB and reconstructed context at 4 MB.
   Changing models with existing native continuation state fails explicitly.
   The existing 180-second per-inference and 20-second catalog deadlines remain.
3. **Provider/agent registry and capability audit (implemented):** inventory the existing
   integration paths and distinguish model transports from autonomous agents.
   Resolve the selected backend and tenant-owned connection on the server.
   Generalize admission scopes so authorization is not hardcoded to Codex, while
   retaining exact session/connection ownership and least-privilege capabilities.
   Record actual support for tools, reasoning, images, structured outputs,
   cancellation, resume, parallel reads, and usage reporting. Unsupported
   capabilities must fail explicitly rather than being advertised as available.
   Acceptance: every catalog entry has an audited adapter/status, and switching
   connections cannot reuse another account's credentials or continuation state.
   The registry covers 30 integrations and distinguishes generic web credential
   routes from native Google/Neon harness paths, remote Cursor jobs and unverified
   subscription entries. Managed grants and non-Codex execution remain blocked
   until their respective entitlement and adapter implementations are verified.
4. **Protocol and agent adapters (in progress):** reuse working provider implementations, and
   repair protocol gaps instead of wrapping them unchanged. The current generic
   provider transport streams text but does not assemble OpenAI tool-call deltas;
   its Anthropic branch does not send tool schemas or native tool-result blocks.
   Those paths are not ready to be labeled coding-capable Eve adapters. Implement
   and test native tool cycles for each protocol family, then add resumable job
   adapters for integrations that actually run their own agents. Preserve local
   versus hosted restrictions; a cloud service cannot reach laptop localhost by
   assuming the same endpoint is available. Never translate an unsupported
   subscription into an unrelated paid API call.
   Acceptance: contract tests cover successful execution, partial/malformed
   streams, provider errors, credential refresh, cancellation, state replay and
   usage. Remote-agent tests prove one job creation, event reconnection and no
   duplicate tool execution. Real-account smoke tests remain a separate gate.
5. **Multi-backend read-only web/CLI canary:** feature-flag selected users and
   explicitly verified backends, project their persisted events into Nova's
   existing timeline, and preserve model, agent, connection and workspace
   selection. Validate more than Codex: include a native non-OpenAI model, an
   OpenAI-compatible gateway, and an autonomous agent path when implemented.
   Verify closing the browser does not cancel execution; explicit cancellation
   must reach the selected backend. Enforce billing and idempotent admission
   before allowing traffic. Verify Workflow storage and internal-route security
   before any public deployment. Do not silently migrate unsupported selections.
6. **Repository execution and verification:** provision real isolated workspaces
   for Eve-owned execution, and respect the workspace ownership of remote coding
   agents. Adapt existing read/edit/test tools without exposing host credentials.
   Preserve approvals and reconcile uncertain writes with operation keys instead
   of blindly replaying them. Validate actual diffs and tests before declaring a
   task complete. Give concurrent writers separate workspaces and integrate their
   changes under parent review.
7. **Recovery, performance and rollout:** test worker restarts, approvals,
   redeploys, provider failures, cancellation, account/model switching and
   concurrent tenants across supported backends. Measure verified task success,
   time to first useful action, completion latency and cost per successful task
   using the same repositories, permissions and budgets. Optimize targeted
   context retrieval, cache reuse and safe read parallelism from those traces.
   Expand traffic per verified backend, then retire only the legacy paths whose
   capabilities and reliability have been replaced without regressions.

Do not add another autonomous retry loop in Inngest around an Eve session. Eve
owns orchestration in the new path; Nova continues to own product authorization,
billing, and verification policy.

## OpenAI-compatible adapter boundary

The pinned AI SDK adapter handles Chat Completions framing and fragmented tool
arguments. Nova additionally requires a complete `[DONE]` SSE frame and a
successful stop/tool-call finish. Text streams immediately, but executable tool
calls are buffered until the entire model response is validated. Truncated,
malformed, failed, length-limited or inconsistent completions execute no tools.
This path supports ordinary text/JSON tool outputs and usage reporting; it does
not implement provider-native reasoning, images, structured output or autonomous
agent jobs.

Initial endpoints: OpenAI, OpenRouter, Vercel AI Gateway, xAI, Fireworks, Together,
DeepInfra, NVIDIA and Baseten. These are protocol-contract-tested with synthetic
responses, not live-account certified. Native Anthropic/Google, regional/custom
gateways, localhost/Ollama, Neon, OpenCode and remote agents remain separate work.
Custom/alternate endpoints fail rather than allowing server-side requests to
unverified hosts. Redirects are refused. No endpoint is taken from the prompt.

Every inference rechecks the scoped session and credential revision. The shared
`@super/provider-runtime` reader verifies the exact enabled connection before
decrypting with the existing AAD, preserving legacy key records. Saved model
messages carry an account/connection/model binding, never an API key. A new
connection cannot reuse old continuation. Provider errors are redacted; known
adapter restrictions produce actionable errors. Per-call auth/routing headers,
raw payload forwarding, provider-specific options, structured output and reasoning
effort are explicitly refused. Standard text-model generation options use the SDK.

The current generic model uses a conservative 8192-token Eve context budget,
not a claim about each upstream model's maximum. A canary must validate actual
account/model capabilities and limits. Existing Nova web still uses its previous
transport; these adapters do not change live traffic or fix the production
timeout until the web execution path is migrated.
