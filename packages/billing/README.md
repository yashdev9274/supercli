# Product credit accounting

The terminal database is the billing authority. Web and terminal user IDs are not interchangeable: the web sandbox service resolves its authenticated user's email to a terminal user before billing.

One product credit is 1,000,000 integer microcredits. Free users, including existing grandfathered Spark subscribers, receive exactly 1000 credits per UTC calendar month. There is no rollover. Existing dollar-cent balance columns are legacy display data and are not used for enforcement. `Plan.monthlyCredits` is the product allowance; the migration preserves the old numeric paid allowance and sets Spark to 1000.

Default conversion is explicit:

```sh
BILLING_CREDITS_PER_USD=100
BILLING_PROVIDER_MARKUP=2
```

1000 credits represent $10 of retail allowance. With 2x provider markup, $5 of upstream cost consumes that allowance. Small calls round up only at the microcredit boundary, not to whole credits or cents. Native DeepSeek's context override does not expand any other model's entitlement. Only a genuinely client-supplied inference key exempts inference; sandbox and hosted MCP usage remain metered.

Sandbox rates charge every allocated CPU and GiB of RAM for all running seconds, with no free machine baseline. E2B rates are $0.000014/vCPU-second and $0.0000045/GiB-second ([source](https://docs.e2b.dev/faq/calculate-sandbox-price)). Vercel rates are $0.128/CPU-hour and $0.0212/GiB-hour with a 60-second minimum ([source](https://vercel.com/docs/sandbox/pricing)); the reservation conservatively treats allocated CPU runtime as active CPU. MCP provider-cost estimates are exported as `MCP_TOOL_COST_USD` and converted with the same explicit markup.

`createBillingService(terminalPrisma)` accepts the terminal Prisma client's transaction/raw-query interface. `reserve({userId,key,kind,amountMicrocredits,metadata})` holds an upper bound atomically before external work; insufficient funds throw HTTP-compatible 402. A replay returns the original reservation with `replayed: true`: never dispatch that work again. `settle({reservationId,actualMicrocredits,metadata})` refunds unused hold exactly once. Actual usage cannot exceed the hold; callers must cap execution to their reserved bound. `getReservation({userId,key})` enables crash recovery. A hold whose usage is unknown stays charged; recovery may settle at the full reserved bound rather than silently granting free usage. Settling an old period never refunds into a new month. Plan upgrades/downgrades preserve committed consumption, so repeated events cannot replenish a month's allowance.

## Rollout

1. Back up the terminal database and verify `DATABASE_URL_TERMINAL` points to it. The canonical migration directory is `apps/supercode-cli/server/prisma/migrations`; its historical `20260729130000_add_missing_models` migration creates the billing baseline.
2. From `apps/supercode-cli/server`, run `bunx prisma migrate deploy` against the terminal database. The mirrored new migration in `packages/db-terminal` describes the same database change; do not deploy it a second time or use that directory as a replacement for the canonical history.
3. Regenerate both clients with `bun run db:generate` in the server and `packages/db-terminal`, then deploy the server and web changes together. No production seed or grandfather topup is required. Credit accounts provision lazily on the first balance lookup or reservation, with a user foreign key preventing phantom accounts.
4. Configure explicit per-model provider rates where the upstream contract differs from the built-in table. `BILLING_MODEL_RATES_JSON` maps exact dispatched model names to USD-per-million `{inputPrice,outputPrice,cachedPrice}` objects, for example `{"my-model":{"inputPrice":0.15,"outputPrice":0.60,"cachedPrice":0.003}}`. All three rates must be finite and nonnegative; cache cannot exceed ordinary input. Neon models use the `neon/` prefix. Unknown hosted inference rates fail closed, not free; the existing Qwen voice model needs its negotiated rate configured before use. Built-in DeepSeek Flash prices conservatively use the documented peak $0.30 input/$1.20 output/$0.006 cache ([source](https://api-docs.deepseek.com/quick_start/pricing)), so peak traffic cannot undercut the cost cap. Configure explicit overrides for negotiated or off-peak contracts. Server billing status exposes `productCreditBalance` separately from the deprecated cent-based balance.
5. Revoke previously issued upstream Composio MCP sessions as part of rollout. New `/api/composio/session` responses point to the metered CLI-server proxy and never issue upstream credentials; old credentials cannot be retroactively made metered by an application deployment.

Tests run against isolated embedded PostgreSQL with `bun test packages/billing/src/index.test.ts`. They do not connect to production or mutate real balances.
