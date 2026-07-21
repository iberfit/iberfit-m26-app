# RC18 rollback runbook

1. Disable the M26 canary feature flag and allowlist.
2. Remove the canary custom domain from the failed deployment.
3. Restore the last verified canary deployment or M25.1 rollback artifact.
4. Do not delete evidence, command receipts or incident logs.
5. Confirm Coach and Client production routes still resolve to the prior stable version.
6. Re-run read-only bootstrap and RLS checks.
7. Open an incident with deployment ID, UTC window, affected role, command IDs and containment result.
