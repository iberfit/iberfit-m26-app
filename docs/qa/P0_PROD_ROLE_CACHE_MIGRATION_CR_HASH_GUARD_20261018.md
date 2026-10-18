# P0 PROD role-cache hash-guard correction — immutable migration path

Historical migration `20261018214135_p0_bootstrap_role_access_eval_cache_v1.sql` was already added as part of PR #1006 and is **immutable**. Production's attempted application failed closed with SQLSTATE 22012 and rolled back. The original historical file is preserved byte-for-byte; no migration ledger entry was written by that failed attempt.

The append-only corrective migration is `supabase/migrations/20261018234000_p0_bootstrap_role_access_eval_cache_prod_corrected_v2.sql` and is **explicitly PROD-targeted**. It changes only the two guard escape literals from SQL two-backslash E-strings (literal backslash-r) to SQL one-backslash E-strings (carriage return), retaining exact expected baseline hashes, security attributes, function definitions and post-install hashes. All other function logic is byte-for-byte identical to the historical migration.

A full corrected SQL trial ran successfully inside `BEGIN/ROLLBACK` on the actual PROD database. No production function changes persisted during that test. New tests validate the immutable historical and corrected PROD guard literals.

**Deployment caution:** Because the historical QA migration remains in the repository but not in the PROD migration ledger, do not run unattended bulk `supabase db push` until migration-ledger compatibility is explicitly reconciled by the protected database release process. Use the explicit reviewed corrective migration; never fake a successful application of the historical SQL. Keep rollback and restored hash evidence.
