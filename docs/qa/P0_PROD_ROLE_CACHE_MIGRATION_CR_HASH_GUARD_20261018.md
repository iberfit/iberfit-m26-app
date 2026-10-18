# P0 production migration hash guard — 2026-10-18

On the protected PROD promotion, stage 2 failed closed (SQLSTATE 22012 division by zero). No SQL changes or migration-ledger entry persisted. The PROD role and access definitions match their expected normalized hashes, and both security-attribute guards pass.

Root cause: the stage 2 migration source used `E'\\\\r'` (two literal backslashes), removing a literal backslash-r sequence rather than CR. Change exactly two source occurrences to `E'\\r'` (one SQL backslash, escaped carriage return). No function bodies, target hashes, role conditions, RLS, grants or timeouts change.

Dry-run of the complete corrected SQL in `BEGIN/ROLLBACK` on PROD succeeded, including both post-install hashes. The two affected preflight hashes and all security attributes were verified read-only before the dry-run. This PR adds a node:test regression invariant for the two SQL string literals. Apply stage 2 only after fresh M44 recoverable backup and once the corrected source commit is merged and certified. QA and PROD scopes remain separate.
