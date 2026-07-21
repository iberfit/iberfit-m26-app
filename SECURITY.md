# Security policy

IBERFIT M26 contains health, training and operational data. Security issues must not be disclosed in public issues.

## Mandatory rules

- Never commit Supabase service-role keys, JWTs, passwords, private notes, client exports or production snapshots.
- Production mutations require an approved canary plan and rollback checkpoint.
- Private Coach notes are online-only and must never enter offline storage.
- Client access is limited to the authenticated client's own `clientId`.
- New domain commands remain disabled until the authenticated registry matches exactly.
- Any suspected cross-client disclosure blocks release immediately.

## Reporting

Report privately to the repository owner with the affected commit, reproducible steps, impact and suggested containment. Do not include real client data in evidence.
