-- M44 Auth/Vault cardinality census. Read-only; never selects passwords,
-- sessions, tokens, identities, Vault names, ciphertext or customer records.
-- A single statement uses one PostgreSQL MVCC snapshot. The result is one
-- JSON object. Run protected with psql -X -A -t -v ON_ERROR_STOP=1.
SELECT json_build_object(
  'schema', 'iberfit.m44.auth-vault-cardinality.v1',
  'captured_at', to_char(clock_timestamp() AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'counts', json_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'auth_identities', (SELECT count(*) FROM auth.identities),
    'auth_sessions', (SELECT count(*) FROM auth.sessions),
    'auth_refresh_tokens', (SELECT count(*) FROM auth.refresh_tokens),
    'auth_mfa_factors', (SELECT count(*) FROM auth.mfa_factors),
    'auth_webauthn_credentials', (SELECT count(*) FROM auth.webauthn_credentials),
    'auth_oauth_clients', (SELECT count(*) FROM auth.oauth_clients),
    'auth_sso_providers', (SELECT count(*) FROM auth.sso_providers),
    'auth_saml_providers', (SELECT count(*) FROM auth.saml_providers),
    'auth_custom_oauth_providers', (SELECT count(*) FROM auth.custom_oauth_providers),
    'vault_secrets', (SELECT count(*) FROM vault.secrets),
    'storage_buckets', (SELECT count(*) FROM storage.buckets),
    'storage_objects', (SELECT count(*) FROM storage.objects)
  )
);
