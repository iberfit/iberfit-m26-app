# P0 Supabase Free — QA bootstrap field footprint (no added requests)

**Purpose:** identify the dominant remaining collection in the *final authenticated HTTP bootstrap* before modifying a privacy-sensitive SQL projection. Canary/QA diagnostics only. Reuse the pre-existing response observer; never request the RPC again.

- Source: pre-existing Playwright `response.body()`, at most three byte samples per fixed endpoint. Parse at most one successful `iberfit_bootstrap_v26` response (≤4 MB) per observer; no token, user, URL, key or contents in logs.
- Output: only fixed, allowlisted collection labels, row counts and JSON byte sizes; aggregated size of all other `data` properties without their names, plus remote revision map count and serialized bytes. Zero additional Supabase requests. No database, RLS, Auth, WebAuthn, role, feature flag or runtime modifications.
- Attribution: these are UTF-8 JSON reserialization bytes; the network may compress them. They are NOT Supabase uncached/cached billable Egress and must not be summed into monthly quota.
- Gate: inspect existing `M26_QA_SUPABASE_PAYLOAD_FOOTPRINT` in the protected RC64.2B smoke artifacts on one real QA cycle. Baseline on 2026-11-01 Client A bootstrap 1,403,693 decoded bytes, Client B 87,758; full Client A history requires explicit click 28 pages, 1,718,996 decoded bytes; no parity inference from comparing distinct accounts.
- NEXT (not included): target largest field only after confirming UI before-click, progress, session results and historical execution parity, Client B privacy, offline, ACK, SHA exact gates, and QA-only reversible migration. Do not cut `results` until proven lossless.
- Rollback: revert this QA test-only parser; it has no runtime impact. Keep issue #1209 open until organization Usage confirms Free 5 GB uncached and 5 GB cached with safety margin. No PROD deployment.
