#!/usr/bin/env bash
#
# One-shot base backup to S3 + retention sweep.
# Invoked by crond inside the postgres container. Connects locally via the
# postgres Unix socket as the `postgres` superuser (peer auth), so no
# replication role / password plumbing is required.
#
set -euo pipefail

CRON_ENV=/etc/barman-cloud.env
if [ -f "$CRON_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$CRON_ENV"
    set +a
fi

: "${DEST_URL:?DEST_URL not set — entrypoint did not configure backup}"
: "${SERVER_NAME:?SERVER_NAME not set}"
: "${AWS_REGION:=us-east-1}"
: "${RETENTION_DAYS:=14}"
: "${COMPRESSION:=gzip}"

log() { echo "[$(date -Is)] $*"; }

endpoint_args=()
if [ -n "${S3_ENDPOINT_URL:-}" ]; then
    endpoint_args+=(--endpoint-url "$S3_ENDPOINT_URL")
fi

SOCKET_DIR="${PGSOCKET_DIR:-/var/run/postgresql}"

log "===== base backup -> ${DEST_URL} ====="
su-exec postgres barman-cloud-backup \
    "${endpoint_args[@]}" \
    --host "$SOCKET_DIR" \
    --user postgres \
    --compression "$COMPRESSION" \
    --aws-region "$AWS_REGION" \
    "$DEST_URL" \
    "$SERVER_NAME"

log "===== retention sweep (RECOVERY WINDOW OF ${RETENTION_DAYS} DAYS) ====="
su-exec postgres barman-cloud-backup-delete \
    "${endpoint_args[@]}" \
    --aws-region "$AWS_REGION" \
    --retention-policy "RECOVERY WINDOW OF ${RETENTION_DAYS} DAYS" \
    "$DEST_URL" \
    "$SERVER_NAME"

log "===== done ====="
