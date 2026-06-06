#!/usr/bin/env bash
#
# One-shot base backup to S3 + retention sweep.
# Invoked by crond inside the postgres container. Connects to postgres over
# TCP loopback as POSTGRES_USER (the superuser created by the docker-entrypoint
# at first init) using the POSTGRES_PASSWORD captured by entrypoint-wrapper.sh.
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
: "${POSTGRES_USER:?POSTGRES_USER not set — entrypoint did not capture credentials}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set — entrypoint did not capture credentials}"
: "${POSTGRES_DB:=postgres}"
: "${AWS_REGION:=us-east-1}"
: "${RETENTION_DAYS:=14}"
: "${COMPRESSION:=gzip}"

log() { echo "[$(date -Is)] $*"; }

endpoint_args=()
if [ -n "${S3_ENDPOINT_URL:-}" ]; then
    endpoint_args+=(--endpoint-url "$S3_ENDPOINT_URL")
fi

# barman-cloud-backup 3.x exposes compression as boolean flags, not a value.
compress_args=()
case "${COMPRESSION:-gzip}" in
    gzip)      compress_args+=(--gzip) ;;
    bzip2)     compress_args+=(--bzip2) ;;
    snappy)    compress_args+=(--snappy) ;;
    lz4)       compress_args+=(--lz4) ;;
    none|"")   ;;
    *)
        log "ERROR: unknown COMPRESSION='$COMPRESSION' (expected: gzip|bzip2|snappy|lz4|none)"
        exit 1
        ;;
esac

export PGPASSWORD="$POSTGRES_PASSWORD"

log "===== base backup -> ${DEST_URL} ====="
barman-cloud-backup \
    "${endpoint_args[@]}" \
    "${compress_args[@]}" \
    --host 127.0.0.1 \
    --port 5432 \
    --user "$POSTGRES_USER" \
    --aws-region "$AWS_REGION" \
    "$DEST_URL" \
    "$SERVER_NAME"

log "===== retention sweep (RECOVERY WINDOW OF ${RETENTION_DAYS} DAYS) ====="
# barman-cloud-backup-delete reads region from AWS_REGION env (no --aws-region flag).
export AWS_DEFAULT_REGION="$AWS_REGION"
barman-cloud-backup-delete \
    "${endpoint_args[@]}" \
    --retention-policy "RECOVERY WINDOW OF ${RETENTION_DAYS} DAYS" \
    "$DEST_URL" \
    "$SERVER_NAME"

log "===== done ====="
