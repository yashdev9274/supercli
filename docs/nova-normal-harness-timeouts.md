# Normal Nova harness timeout and progress repair

This change applies to ordinary Nova web turns, without selecting or enabling Eve.
It does not change credentials, billing, provider selection, tool permissions or
the CLI bridge wire protocol.

## Confirmed failure mechanisms

The hosted Codex chat transport applied a fixed 180-second absolute response
timeout twice, including while upstream streamed useful data. The normal web
bridge awaited an entire inference handoff inline, so it stopped forwarding the
CLI's heartbeat messages. Provider reasoning was buffered until the completed
round returned to the CLI. The UI could therefore appear stalled and then fail
even while the provider was actively generating.

The screenshot does not prove which original timer fired. This fixes the
source-confirmed mechanisms, not a claimed production reproduction.

## Repair

- Codex uses a 180-second inactivity deadline, reset by received SSE bytes, plus
  a separate six-minute absolute response limit. The caller's cancellation and
  earlier parent deadline still win. Stalls and response-budget expiry have
  distinct messages, and timers are released when inference finishes or closes.
- The duplicate fixed 180-second chat wrapper deadline is removed. Native Codex
  callers and existing chat continuations share the same bounded inference path.
- The bridge services handoffs asynchronously while forwarding CLI heartbeats.
  Inference and writes remain exclusive barriers; durable receipts remain ordered.
  Provider reasoning/status reaches the UI before round completion, with matching
  CLI reasoning echoes suppressed. Final answer text still passes through the
  CLI's existing filtering and completion path; partial inference never authorizes
  tool execution or counts as a completed result.
- Web work has a nine-minute deadline within the declared ten-minute route
  allowance, retaining a bounded cleanup/persistence window. Expiry reports that
  the task is incomplete instead of a generic platform abort. This declaration
  cannot override a lower deployed hosting-plan/function/proxy limit.

## Verification and remaining limits

Tests hold an inference open while observing reasoning and a CLI heartbeat,
then confirm reasoning is not duplicated and completed answer text is delivered
once. Other checks prove write barriers, durable replay, cancellation, active
responses surviving the original idle window, total caps, stalled streams and
body-reader cleanup.

This does not make request-bound execution durable: closing the browser can still
cancel the normal path, and work beyond its request budget must fail truthfully.
Eve remains the separately gated background path. Real provider accounts and the
original production changelog task still need a deployed smoke test; no live
traffic is changed from this local checkout.
