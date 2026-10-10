# Auth session generation protection · 2026-10-09

A real code race existed in `createM26Application.login`: the result from `transport.login` was assigned to `session` **before** checking whether the auth attempt remained current. A login delayed past the watchdog timeout could therefore assign a stale session after the UI had already offered a recovery/retry state, potentially interfering with a newer attempt.

The change stores the returned session in a local candidate, verifies `authWatchdog.isCurrent(authAttemptId)`, and only then assigns `session`, marks the first factor accepted, and saves in the vault. It does not alter MFA, the server login contract, expiry times, RLS, consent or retry policy. Late success becomes inert: no stale session is installed after supersession.

Tests cover ordering of the real login source and deterministic watchdog invalidation. This closes this specific assignment race; **it does not establish the cause** of the intermittent missing-auth-request QA failure tracked in #821. Keep #821 open and diagnose separately with PR #822.
