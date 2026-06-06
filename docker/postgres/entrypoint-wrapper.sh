#!/usr/bin/env bash
#
# Postgres + barman-cloud co-resident entrypoint.
#
# 1. If S3 backup env vars are set, render a cron job that runs
#    /usr/local/bin/barman-backup.sh on the configured schedule.
# 2. Start busybox crond in the background under tini.
# 3. Hand control to the official postgres docker-entrypoint.sh.
#
# Skipping S3 config disables the backup path entirely — the container
# behaves like a stock postgres image.
#
set -euo pipefail

log() { echo "[entrypoint] $*"; }

if [ -n "${S3_BUCKET:-}" ]; then
    : "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID required when S3_BUCKET is set}"
    : "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY required when S3_BUCKET is set}"

    SERVER_NAME="${SERVER_NAME:-postgres}"
    S3_PATH_PREFIX="${S3_PATH_PREFIX:-${SERVER_NAME}}"
    S3_PATH_PREFIX="${S3_PATH_PREFIX#/}"

    DEST_URL="s3://${S3_BUCKET}/${S3_PATH_PREFIX}"
    AWS_REGION="${AWS_REGION:-us-east-1}"
    RETENTION_DAYS="${RETENTION_DAYS:-14}"
    COMPRESSION="${COMPRESSION:-gzip}"
    BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

    # Env file sourced by the backup script (cron does not inherit container env).
    CRON_ENV=/etc/barman-cloud.env
    {
        printf 'AWS_ACCESS_KEY_ID=%q\n'     "$AWS_ACCESS_KEY_ID"
        printf 'AWS_SECRET_ACCESS_KEY=%q\n' "$AWS_SECRET_ACCESS_KEY"
        printf 'AWS_REGION=%q\n'            "$AWS_REGION"
        printf 'S3_ENDPOINT_URL=%q\n'       "${S3_ENDPOINT_URL:-}"
        printf 'DEST_URL=%q\n'              "$DEST_URL"
        printf 'SERVER_NAME=%q\n'           "$SERVER_NAME"
        printf 'RETENTION_DAYS=%q\n'        "$RETENTION_DAYS"
        printf 'COMPRESSION=%q\n'           "$COMPRESSION"
        printf 'PATH=%s\n' \
            "/opt/barman/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    } > "$CRON_ENV"
    chmod 600 "$CRON_ENV"

    install -d -m 0755 /var/log/barman
    : > /var/log/barman/backup.log
    ln -sf /dev/stdout /var/log/barman/backup.log

    install -d -m 0755 /etc/crontabs
    cat > /etc/crontabs/root <<EOF
${BACKUP_SCHEDULE} /usr/local/bin/barman-backup.sh >> /var/log/barman/backup.log 2>&1
EOF

    log "backup schedule : ${BACKUP_SCHEDULE}"
    log "backup target   : ${DEST_URL}"
    log "retention       : ${RETENTION_DAYS} day(s)"

    /usr/sbin/crond -b -l 6 -L /dev/stderr
else
    log "S3_BUCKET unset — barman-cloud backups disabled"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
