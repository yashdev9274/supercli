# Shared provider credential boundary

Nova web reuses the original provider vault through this package, preserving its
ciphertext and AAD format. The experimental Eve service uses the scoped reader;
the existing web request/authentication flow is not replaced in this step.

`readScopedProviderConfig(scope)` selects only an enabled, connected credential
whose membership matches the exact user, organization, membership and provider.
It checks the signed connection revision against the row's `updatedAt` before
decrypting. Returned configuration is private server-side data, never model
history, stream metadata or client output.

`parseStoredProviderConfig` handles saved configuration and legacy raw keys,
rejecting malformed object-shaped records. Endpoint, header, protocol and model
restrictions are enforced by the consuming adapter, not by the vault.

Run `bun run test` and `bun run typecheck` here. Tests use a mocked Prisma query
and synthetic encryption material; they do not query a real database.
