# supercode-cli agents harness

Filesystem-first agent system (eve-inspired layout, **not** the eve runtime).

## Layout

```text
src/agents/
  agent.ts              # root build defineAgent
  instructions.md       # build system prompt
  index.ts              # public facade
  service.ts            # agent registry singleton
  instrumentation.ts
  lib/
    define.ts           # defineTool / defineAgent / defineSkill
    discover.ts         # path discovery helpers
    harness.ts          # multi-step runTurn / runAgent loop
    approval.ts         # bridge → tools/permission-manager
    types.ts
    subagent-permissions.ts
  tools/                # one file per tool (filename = tool name)
  subagents/<name>/
    agent.ts
    instructions.md
  connectors/           # MCP catalog (transport = src/mcp)
  hooks/
  skills/
  sandbox/
  schedules/
  channels/
src/evals/              # bun test smoke cases
```

## Public API

```ts
import {
  createHarness,
  runTurn,
  getAgent,
  listAgents,
  loadTools,
  agentService,
  tools,
} from "src/agents"
```

## Compatibility

- `src/agent/*` re-exports this package (legacy singular path).
- `src/tools/registry.ts` and `src/tools/definitions/*` re-export `src/agents/tools/*`.
- Permission UX stays in `src/tools/permission-manager.ts`.
- MCP transport stays in `src/mcp/mcp-manager.ts`.

## Do not

- Install or import the `eve` npm package.
- Put tool implementations only under `src/tools/definitions` going forward.
- Rewrite login / TUI chrome for harness changes.
