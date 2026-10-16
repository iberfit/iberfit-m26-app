#!/usr/bin/env bash
# Synthetic-only round-trip test. NEVER load PROD data or real recovery keys.
set -euo pipefail
: "$GITHUB_RUN_ID"
: "$GITHUB_RUN_ATTEMPT"
TMP="$(mktemp -d)"
SOURCE="iberfit-restore-src-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
DEST="iberfit-restore-dest-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
cleanup() {
  docker rm -f "$SOURCE" "$DEST" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
chmod 700 "$TMP"
export IBERFIT_REHEARSAL_DIR="$TMP"
for TARGET in "$SOURCE" "$DEST"; do
  docker run --detach --name "$TARGET" \
    -e POSTGRES_PASSWORD=synthetic-local-only \
    -e POSTGRES_DB=iberfit_rehearsal \
    postgres:17 >/dev/null
done
for TARGET in "$SOURCE" "$DEST"; do
  ok=0
  for attempt in $(seq 1 45); do
    if docker exec "$TARGET" pg_isready -U postgres -d iberfit_rehearsal >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  test "$ok" = 1 || { echo "FREE_RESTORE_POSTGRES_NOT_READY"; exit 51; }
done

# All identities, objects, names and exercises here are fabricated test fixtures.
docker exec -i "$SOURCE" psql -X -v ON_ERROR_STOP=1 -U postgres -d iberfit_rehearsal <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE public.clients (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  path text NOT NULL
);
INSERT INTO public.clients VALUES
 ('11111111-1111-4111-8111-111111111111','Synthetic Client Alpha'),
 ('22222222-2222-4222-8222-222222222222','Synthetic Client Beta');
INSERT INTO auth.users VALUES
 ('33333333-3333-4333-8333-333333333333','synthetic-a@example.invalid'),
 ('44444444-4444-4444-8444-444444444444','synthetic-b@example.invalid');
INSERT INTO storage.objects VALUES
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','synthetic/a'),
 ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','synthetic/b');
SQL

docker exec "$SOURCE" pg_dump -U postgres -d iberfit_rehearsal \
  --format=custom --no-owner --no-acl > "$TMP/database.dump"
docker exec -i "$SOURCE" pg_restore --list < "$TMP/database.dump" > "$TMP/toc.txt"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import {assertArchiveList} from './scripts/ops/free_recovery_crypto.mjs';
assertArchiveList(fs.readFileSync(process.env.IBERFIT_REHEARSAL_DIR+'/toc.txt','utf8'));
NODE

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
  -out "$TMP/synthetic-private.pem" 2>/dev/null
openssl pkey -in "$TMP/synthetic-private.pem" -pubout \
  -out "$TMP/synthetic-public.pem" 2>/dev/null
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import path from 'node:path';
import {encryptBackup,decryptBackup} from './scripts/ops/free_recovery_crypto.mjs';
const dir=process.env.IBERFIT_REHEARSAL_DIR;
const encryptedPath=path.join(dir,'db.enc'),manifestPath=path.join(dir,'manifest.json');
const manifest=await encryptBackup({
 sourcePath:path.join(dir,'database.dump'),
 encryptedPath,manifestPath,
 publicKey:await fs.readFile(path.join(dir,'synthetic-public.pem'),'utf8'),
 sourceSha:'b'.repeat(40)
});
if(manifest.databaseArchiveValidated!==false||manifest.fullRestoreVerified!==false||manifest.storageObjectBytesIncluded!==false)
  throw Error('FREE_REHEARSAL_NOT_PRODUCTION_RESTORE');
const plaintext=await decryptBackup({
 encryptedPath,manifest,
 privateKey:await fs.readFile(path.join(dir,'synthetic-private.pem'),'utf8')
});
await fs.writeFile(path.join(dir,'restored.dump'),plaintext,{mode:0o600});
plaintext.fill(0);
NODE

# Independently restore the decrypted archive into an entirely separate Postgres container.
docker exec -i "$DEST" pg_restore --exit-on-error --no-owner --no-acl \
  -U postgres -d iberfit_rehearsal < "$TMP/restored.dump"
COUNTS="$(docker exec "$DEST" psql -X -At -v ON_ERROR_STOP=1 \
  -U postgres -d iberfit_rehearsal \
  -c "SELECT (SELECT count(*) FROM public.clients),(SELECT count(*) FROM auth.users),(SELECT count(*) FROM storage.objects),(SELECT count(*) FROM storage.objects o JOIN public.clients c ON o.client_id=c.id);")"
test "$COUNTS" = '2|2|2|2' || { echo 'FREE_REHEARSAL_RESTORED_ENTITIES_MISMATCH'; exit 52; }
echo 'FREE_RECOVERY_SYNTHETIC_ROUNDTRIP_OK:db-export/encrypt/decrypt/isolated-restore/foreign-keys'
echo 'FREE_RECOVERY_PROD_BACKUP_RESTORE_NOT_VERIFIED'
