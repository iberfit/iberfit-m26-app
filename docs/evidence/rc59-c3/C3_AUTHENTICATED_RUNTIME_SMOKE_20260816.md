# RC59.0C3 — Authenticated runtime smoke closeout

Date: 2026-08-16
Status: PASS

## Code under test

- Branch: feature/rc58-design-system
- C3 implementation commit: 5e0ef9cf688e7683afbdf34eff965aa7344f3cd1
- QA identity compatibility fix: 78818af43be1595e37e603cd9317a2642063f8e0
- Canonical Supabase project ref: pjhmrhejsoofmouedavw
- Remote uploader: src/m26/telemetry/remote-sync.js
- Backend RPC: public.m26_telemetry_import_v59(jsonb)

## Identity adjudication

The authenticated read-only probe confirmed:

- canonical bootstrap role: cliente;
- canonical role source: bootstrap.user.role;
- clientId present: true;
- telemetry smoke eligible: true.

The QA validator was aligned with the same bootstrap role source before the write smoke.
The fix passed its dedicated regression test and the full repository test suite before publication.

## Authenticated end-to-end smoke

- QA Client login: PASS
- QA identity validation: PASS
- canonical telemetry event: PASS
- durable local outbox stage: PASS
- authenticated C3 remote sync: PASS
- backend granular ACK: PASS
- first flush disposition: accepted
- idempotent replay: PASS
- second flush duplicate count: 1
- final local outbox total count: 0
- deterministic QA event id: RC59-C3-SMOKE-78818af43be1
- client identifier SHA256: 759bbc8577d279bcab340404fba0c831e7f3d5357a9263c0c70abbfb4b70c464

No access token, password, publishable key, email, or raw client identifier is recorded.

## Safety

- No schema mutation.
- No migration-history mutation.
- No destructive telemetry cleanup.
- Exactly one deterministic QA event identity is used.
- Replay uses the same eventId and is classified as duplicate.

Smoke report SHA256: 59d315172cc342dc199ad3653aa3e2f86e5801f145646ba69cc01037fa0f66a9

## Conclusion

RC59.0C3 remote outbox upload is closed.
RC59.0 Canonical telemetry timeline is closed.
RC59.1 Live Session Intelligence is the next active implementation stage.