# E2B workspaces

Nova checks out a pinned GitHub archive without sending a GitHub token into the VM. The archive becomes a local Git baseline; patches compare against that baseline, not the upstream commit ID.

## Persistence

Files live on the sandbox disk. Closing a turn denies outbound networking and pauses the same sandbox in filesystem-only mode. Reconnecting uses `onResume: "reboot"`: files survive, but processes and RAM do not. A refused pause leaves the run lease in place for recovery.

This is pause/resume, not a reusable E2B snapshot or an external volume. `providerSandboxId` identifies the retained disk; `snapshotId` is unused for E2B. Nova deletes retained work after its own seven-day retention period, even though E2B can retain paused sandboxes indefinitely. Downloaded patches are stored separately as database artifacts and also expire after seven days. There is no independent snapshot backup.

Missing or incomplete retained workspaces are never silently replaced. Start a new thread after an interrupted initial checkout; existing retained edits are not reset to repair setup.

## Templates

Explicit machine sizes use `machine-templates.json`, with `NOVA_E2B_TEMPLATE_<SIZE>` overrides. Default uses `NOVA_E2B_TEMPLATE` or E2B's `base`. Template access is account-specific, and requested CPU/memory must match exactly. Filesystem-only pause must be enabled for the E2B account; Nova does not fall back to restoring memory.

From `apps/web`:

```bash
bun run sandbox:build-machines --dry-run
bun run sandbox:build-machines 1cpu-4gb 2cpu-8gb
```

The builder requires `E2B_API_KEY`, creates uniquely named templates from `e2bdev/base`, and validates the required Git, Python, shell, and bootstrap executables. Each template is smoke-tested for unprivileged execution, exact resources, and filesystem-only persistence before the catalog is updated atomically. Existing sandbox IDs and their disks are unchanged. Additional language dependencies are not installed by this base template definition.

Use `--output=/absolute/path/catalog.json` to verify builds without changing the active catalog. Omitting sizes builds the two currently supported catalog sizes. Larger sizes require explicit arguments and sufficient E2B account capacity.
