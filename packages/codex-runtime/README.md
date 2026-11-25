# Shared hosted Codex protocol

Nova web's existing Codex modules re-export this package. The experimental Eve
service consumes the same credential rotation, encryption bindings, model
catalog validation, and Responses parser; it does not implement another OAuth
flow or use Eve's local-only ChatGPT helper.

`createCodexRuntime(context, fetcher)` exposes:

- `catalog(signal)` for the connected account's model list.
- `prepare(model, effort, signal)` for the existing stateful CLI-bridge chat
  transport. Its conversation checkpoint format is unchanged.
- `prepareNative(model, effort, signal)` for a one-round transport with explicit
  native Responses input. It streams events and returns complete native output
  items, including encrypted reasoning, to its caller. It owns no cross-round
  conversation state. The caller must persist/reconstruct those items and pair
  every function-call result correctly.

No credential is returned as conversation state. The context supplies a scoped
credential store and authenticated vault binding. `createPrismaCodexStore` is
loaded through the separate `./store` export and rechecks active membership when
credentials are read. Product session authorization remains the caller's job.

Existing web contract tests cover the moved implementation under
`apps/web/modules/nova/codex` and `apps/web/modules/nova/chatgpt`. Eve adapter,
reconstruction, streaming, and tenant-isolation checks live under
`apps/nova-agent/tests`. Run `bun run typecheck` here for the shared package.
