# Nova harness efficiency

## Diagnosis

The first optimization is less orchestration, not another mandatory agent graph.
Provider inference speed is only one part of latency: unnecessary model rounds,
serial independent tool calls, and repeated instructions also contribute.

The active paths differ:

- Interactive CLI chat calls provider.sendMessage in
  apps/supercode-cli/server/src/cli/ai/chat/chat.ts. Adapters expose the manual
  cli/ai/tool-executor.ts compatibility loop; the cloud proxy and OpenRouter
  also own compatibility loops. Their local calls were awaited one at a time,
  including independent reads. Unified turns with a resolved LanguageModel
  instead use the already-parallel SDK harness in cli/runtime/turn-runner.ts.
- Nova web calls streamOriginalHarness in
  apps/web/modules/nova/harness/bridge.ts. The CLI worker's
  nova-bridge/runner.ts invokes agents/lib/harness.ts, which uses AI SDK
  streamText. The SDK already executes multiple tool calls concurrently, but
  the web bridge awaited every host handoff before consuming the next one.
- packages/agent-runtime/turn.ts is another implementation, not the primary
  Nova bridge loop. Optimizing only that package would miss these active paths.

The CLI prompt also encouraged "10+ tool calls", while its budget section
demanded stopping after five rounds, even for incomplete work. The build
instructions duplicated those workflow rules and demanded delegation for small
investigations. These are conflicting incentives, not evidence that a model
needs more reasoning effort.

## Changes

1. Batch known read-only tools with a bounded worker pool in the compatibility
   loops. Preserve transcript order and emit completed tool results promptly.
   Writes, shell execution, session state, delegation, and unknown tools remain
   ordering barriers. Do not infer safety from a tool name containing "get".
2. Keep the common CLI and build instructions concise: inspect, act, verify at
   the scope the task needs, and stop. Research, plans, TODOs, and subagents are
   optional costs, not compulsory stages. Remove the mandatory scaffolding
   recipe and exhaustive review format when the task does not need them. Keep
   project checks, permissions, truthful results, and failure recovery.
3. In the SDK harness, disable tools during repetition recovery instead of
   repeatedly telling a model to stop while still offering the same tools.
   One final model response can summarize the evidence or blocker.
4. In the non-journaled web bridge, consume up to four authorized read handoffs
   concurrently instead of awaiting each before reading the next event.
   Drain reads before inference, mutations, state operations, approvals, or
   completion. Journaled runs retain their existing serialization because
   changing receipt ordering requires a separately verified replay design.
   The main web session path is journaled, so it does not gain concurrent
   host-tool execution from this change; non-journaled routines do.

In a local synthetic scheduling fixture with eight 25 ms read operations,
three serial runs took 209/206/207 ms and bounded parallel runs took
53/52/52 ms. This isolates tool scheduling only: it excludes inference,
network variance, permissions, and real tool work, so it is not a production
speedup claim.

The five edited instruction sources shrink from 11,891 to 6,456 characters
(45.7%). This is a source-text measurement, not a token count or a measured
end-to-end latency improvement. Workspace context, skills, schemas, and other
prompt sections are additional input.

These changes do not switch providers or models, reduce user-selected reasoning,
remove permission checks, or skip required verification. Models that emit one
tool per round cannot benefit from same-round tool concurrency until they batch
their requests; the instructions encourage that but cannot guarantee it.

## What the five articles contribute

- [Rahul: programmable loops](https://x.com/sairahul1/status/2078367561453101097):
  explicit goals, bounded continuation, and verified completion are useful.
  A planner/worker/verifier chain for every small edit adds latency, so Nova
  should not adopt that chain as its default.
- [ArchiveExplorer: harness configuration](https://x.com/ArchiveExplorer/status/2071192832455430283):
  compact standing context, progressive skill loading, clear permissions, and
  bounded memory matter more than adding another loop.
- [Hanako: verification and stop conditions](https://x.com/hanakoxbt/status/2077387678241141070):
  tests and builds provide stronger completion evidence than self-approval.
  Keep hard budgets; do not equate fewer rounds with a completed task.
- [0xRafy: graph architectures](https://x.com/0xRafy/status/2079542513317118268):
  fan out independent work and keep dependent edges ordered. Routing and
  specialist contexts are useful for genuinely separable, substantial jobs,
  not a reason to add a model-based router to every user message.
- [EXM7777: remove fake dependencies](https://x.com/EXM7777/status/2079934660982047021):
  remove waiting when no result dependency exists. Keep one writer per shared
  resource and put human gates at consequential actions, not routine reads.

All five texts were read; the last three were recovered through FxTwitter's
article JSON when direct X requests failed. Embedded image/code examples were
not treated as inspected source code. Their benchmark numbers, quotations,
product claims, and absolute assertions about self-review were not independently
validated and are not evidence for Nova's performance.

## Capy comparison and limits

[Capy's public background-work documentation](https://docs.capy.ai/async-work)
describes event-driven turns: CI, reviews, child completions, and watched
operations wake an agent instead of requiring repeated status polling.
[Its subagent documentation](https://docs.capy.ai/subagents) describes focused
child contexts, shared read-only work, isolated writers, and parallel versus
stacked work according to dependencies.

Those are documented product behaviors, not access to Capy's private harness
implementation, prompts, scheduler code, or benchmarks. Nova can borrow the
principles without claiming to reproduce the internals. It already has a
durable bridge journal; preserve that replay and approval contract while
optimizing transport scheduling.

## Evaluation and next priorities

Use the same tasks, provider/model, reasoning settings, and workspace state
before and after. Track median and p95 wall time, time to first visible output,
inference rounds, input/output tokens, tool time, repeated calls, and whether
the requested change passed its relevant checks. Include single edits,
multi-file reads, a failing test repair, large investigations, and denied tools.
Compare accepted and verified completions, not only raw speed.

The next larger bottleneck is bridge inference buffering: the host collects
all inference events before replying, then createBridgeModel replays them.
Real incremental streaming needs a versioned RPC/checkpoint change rather than
an unsafe partial fix that breaks durable replay. Other follow-ups are
task-relevant tool discovery, progress-aware context pruning, and provider-matrix
live evaluations. None should silently change model choice or reasoning effort.

## Second pass: child execution graphs and loop completion

The CLI task tool had two correctness defects: its sequential branch actually
started three children concurrently and omitted the rest, while its parallel
branch started every child at once despite declaring a three-worker limit.

CLI, shared-runtime session tools, and non-journaled Nova delegation now use
the same bounded fan-out/fan-in scheduler:

- Sequential execution completes all requested nodes in input order, up to eight.
- Parallel read-only children use three rolling workers. A completed child frees
  a slot immediately instead of waiting for an entire batch's slowest member.
- General/write-capable children are exclusive barriers: earlier reads join
  before the writer, and later nodes wait until it finishes.
- Results retain input order, cancellation reaches active children, and a thrown
  scheduler failure aborts and drains active branches before returning.
- Budget limits reject excess work instead of silently dropping tasks. Recursive
  CLI delegation is excluded from child capabilities.

This is an execution graph built from ordered and independent tasks, not an
arbitrary DAG configuration language or a mandatory planner/reviewer chain.
The parent still decides which independent tasks to submit and synthesizes their
results. Ordinary small tasks continue through the single-agent loop.

Child loops no longer report success for exhausted tool budgets, truncated
output, or empty summaries. CLI results retain useful partial summaries with a
concrete failure; Nova/shared child loops reject incomplete completion. These
gates prevent a cutoff from masquerading as finished work; they are not a
substitute for running the task's actual tests.

The graph tests exercise Nova's real worker bridge with independent child
transports. This uncovered and fixed a bridge inference bug: a child with no
tools sent an absent tools field where the host required an array. Tool-free
child requests now explicitly send an empty array.

A local eight-node fixture with 25 ms work per node took 212/208/211 ms
sequentially and 78/79/79 ms with three read workers. Both paths completed all
eight nodes. This compares valid serial versus bounded execution, not the
broken old path that skipped work, and excludes real model inference and
worker startup. Capping previously unbounded parallelism may increase latency
for some batches; the cap controls resource use and provider pressure.

At the end of the second pass, the main durable web session did not expose
delegation. The third pass below adds read-only child scopes without changing
the parent's serialized receipt order or replaying uncertain executions.

## Third pass: visible parallel subagents in web sessions

Main web sessions can now delegate focused read-only investigations with up to
three concurrent children and eight total children per turn. Each child has its
own prompt, context, and journal scope. General/write-capable children are denied
before execution in durable sessions; this does not provision separate writing
machines or bypass the parent mode's permissions.

The parent journal reserves and executes its task receipt in order. Child journal
forks use stable keys derived from that receipt and the replay-preserved child
index, so concurrent children do not race the parent's cursor. Replaying a
completed parent receipt returns its recorded result without spawning children
or emitting duplicate lifecycle records. An uncertain executing receipt still
fails closed rather than retrying work.

The authenticated turn route supplies independent child transport factories for
Codex and connected provider routes. Codex children receive fresh continuation
state; parent and sibling transport identity reuse is rejected. Factories receive
graph cancellation. Providers without a safe factory do not advertise delegation,
and a model must support actual tool calling to initiate children.

Actual queued, working, completed, failed, and cancelled events are multiplexed
while the parent awaits its task, then persisted through the existing scoped
session activity channel. Each child emits at most eight deduplicated tool-name
updates plus three lifecycle records; no per-token events, raw reasoning, tool
arguments, or tool payload dumps are added to sidebar storage. Persistence uses
existing tables, not a schema migration.

Overview now lists these child records separately from ordinary tool activity.
Selecting a row opens a child tab showing its prompt, inherited model/provider,
status, elapsed time, progress, and final reply. Children survive session reload
through activity sync. Interrupted parent runs settle unfinished child displays
without inventing a successful final answer. Parent chat and working-process
displays exclude child-only events.

The actual WorkspacePanel component was checked in an isolated headless browser
fixture with clearly labeled synthetic events: overview, details, closing and
reopening tabs, keyboard activation, collapse/expand, and a 375 px mobile layout
all worked without page errors or horizontal page overflow. These screenshots
are UI evidence, not a live provider run or a production database verification.

## Verification notes

The focused CLI harness, compatibility-loop, task-graph, and bridge-worker suites
pass (42 tests). The CLI package's full TypeScript check passes after generating
its local Prisma client. No database migration was run and no schema changed.
The web child-graph, bridge concurrency, durable-subagent, provider-isolation,
and sidebar suites pass (55 tests). The full web TypeScript check passes after
generating its declared database clients. Scoped ESLint reports no errors and
one pre-existing FilesPane hook-dependency warning. Shared runtime graph/session
tests pass (9 tests), along with its TypeScript check. Nova contract tests pass
(24 tests), along with their TypeScript check.

The broader web agent integration suite has 12 failing tests. The same 12
failures reproduce from an untouched HEAD archive using the same installed
dependencies; these include session-tool catalog expectations and error-envelope
expectations. Existing tests were not changed to hide those failures.

Live requests across every provider/model were not benchmarked. The scheduling
fixtures prove concurrency, ordering, identity, cancellation, and safety
properties; they do not prove equal latency gains for all providers or unchanged
task quality under the shorter prompt. That requires the live task matrix above.
