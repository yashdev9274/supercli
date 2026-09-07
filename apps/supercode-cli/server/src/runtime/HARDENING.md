# Provider × model hardening checklist (Phase 6)

Every path must use `runUnifiedTurn` / harness or `runProviderStreamTurn` (same event bus + finalizeAnswerVsProcess).

## Providers
- [ ] supercode cloud (proxy)
- [ ] concentrateai BYOK + proxy
- [ ] openrouter BYOK + proxy
- [ ] google BYOK
- [ ] nvidia BYOK
- [ ] mergedev BYOK
- [ ] orcarouter BYOK + proxy
- [ ] minimax (if enabled)

## Models (sample)
- [ ] reasoning-heavy (DeepSeek) — Thinking ≠ Result
- [ ] Claude/GPT-class
- [ ] Gemini
- [ ] free/OSS via OpenRouter

## Modes
- [ ] chat / plan / build

## Paths
- [ ] direct BYOK
- [ ] proxy/cloud

## Frozen files (must stay unchanged)
auth.ts, token.ts, prisma.ts, dodo.ts, pricing.ts, credit-meter.ts, subscription-check.ts, plan-gate.ts, login commands, api/billing/**
