#!/usr/bin/env bash
# Open (allow) or close (revoke) SSH on a Hetzner Cloud firewall for this CI runner.
# Env: HETZNER_API_TOKEN, FIREWALL_NAME, RULE_MARKER (unique per run, gha-*), SSH_PORT (allow only).
# Rules are tagged "RULE_MARKER <epoch>" so concurrent deploys sharing the firewall never
# remove each other's rules; writes are verified and retried because set_rules replaces
# the whole rule list (Hetzner has no atomic add/remove). Every write also prunes
# runner rules older than STALE_AFTER_SECONDS left behind by lost runners or races.
set -euo pipefail

readonly API_URL="https://api.hetzner.cloud/v1"
readonly IP_ECHO_URL="https://api.ipify.org"
readonly MAX_ATTEMPTS=6
readonly ACTION_POLL_LIMIT=30
readonly STALE_AFTER_SECONDS=3600

RUNNER_IP=""

# Print usage and exit.
usage() { echo "usage: $0 allow|revoke" >&2; exit 64; }

# Print an error and exit.
die() { echo "error: $*" >&2; exit 1; }

# Fail unless every named env var is non-empty.
require_env() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "missing env $name"
  done
}

# Call the Hetzner Cloud API: api METHOD PATH [JSON_BODY]; only GETs are retried.
api() {
  local retry=() out
  [ "$1" = GET ] && retry=(--retry 3)
  if ! out=$(curl -sS --fail-with-body "${retry[@]}" -X "$1" \
    -H "Authorization: Bearer $HETZNER_API_TOKEN" \
    -H "Content-Type: application/json" \
    ${3:+--data "$3"} \
    "$API_URL$2"); then
    echo "Hetzner API $1 $2 failed: $out" >&2
    return 1
  fi
  printf '%s' "$out"
}

# Resolve FIREWALL_NAME to its numeric id.
firewall_id() {
  [[ "$FIREWALL_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid FIREWALL_NAME"
  api GET "/firewalls?name=$FIREWALL_NAME" | jq -er '.firewalls[0].id' \
    || die "firewall '$FIREWALL_NAME' not found"
}

# Print this runner's public IPv4 address.
runner_ip() {
  local ip
  ip=$(curl -fsS --retry 3 "$IP_ECHO_URL")
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "unexpected runner IP '$ip'"
  printf '%s' "$ip"
}

# Print the firewall's rules as a JSON array, without null/empty fields set_rules may reject.
current_rules() {
  api GET "/firewalls/$1" \
    | jq -c '.firewall.rules | map(with_entries(select(.value != null and .value != [])))'
}

# Succeed if the rules on stdin contain this run's rule.
has_marker() {
  jq -e --arg m "$RULE_MARKER " 'any(.[]; (.description // "") | startswith($m))' > /dev/null
}

# Filter: drop this run's rule and runner rules older than STALE_AFTER_SECONDS.
without_runner_rule() {
  jq -c --arg m "$RULE_MARKER " --argjson cutoff "$(($(date +%s) - STALE_AFTER_SECONDS))" '
    [.[] | (.description // "") as $d
      | select(($d | startswith($m)) | not)
      | select(($d | test("^gha-.* [0-9]+$") and (($d | split(" ") | last | tonumber) < $cutoff)) | not)]'
}

# Filter: rules on stdin (stale ones pruned) plus an inbound SSH rule for RUNNER_IP.
with_runner_rule() {
  without_runner_rule | jq -c --arg ip "$RUNNER_IP/32" --arg port "$SSH_PORT" \
    --arg d "$RULE_MARKER $(date +%s)" \
    '. + [{direction: "in", protocol: "tcp", port: $port, source_ips: [$ip], description: $d}]'
}

# Block until a Hetzner action finishes; return non-zero on error or timeout.
wait_action() {
  local i status
  for ((i = 0; i < ACTION_POLL_LIMIT; i++)); do
    status=$(api GET "/actions/$1" | jq -r '.action.status') || return 1
    case "$status" in
      success) return 0 ;;
      error) echo "Hetzner action $1 failed" >&2; return 1 ;;
    esac
    sleep 2
  done
  echo "Hetzner action $1 timed out" >&2
  return 1
}

# Replace the firewall's rules and wait until applied; non-zero if Hetzner refuses (e.g. locked).
apply_rules() {
  local body ids id
  body=$(jq -nc --argjson r "$2" '{rules: $r}') || return 1
  ids=$(api POST "/firewalls/$1/actions/set_rules" "$body" | jq -r '.actions[].id') || return 1
  for id in $ids; do wait_action "$id" || return 1; done
}

# Retry FILTER on the firewall's rules until this run's rule presence equals WANT: converge FW WANT FILTER.
converge() {
  local fw=$1 want=$2 filter=$3 i rules updated present
  for ((i = 0; i <= MAX_ATTEMPTS; i++)); do
    rules=$(current_rules "$fw")
    present=false
    has_marker <<< "$rules" && present=true
    [ "$present" = "$want" ] && return 0
    ((i < MAX_ATTEMPTS)) || break
    updated=$("$filter" <<< "$rules")
    apply_rules "$fw" "$updated" || echo "set_rules refused (concurrent update?), retrying" >&2
    # Jittered backoff so concurrent jobs re-read after each other's set_rules instead of clobbering.
    sleep $((i + RANDOM % 3 + 1))
  done
  die "firewall rules did not converge after $MAX_ATTEMPTS attempts"
}

# Add an SSH rule for this runner's IP.
allow() {
  require_env SSH_PORT
  [[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] || die "invalid SSH_PORT"
  local fw
  RUNNER_IP=$(runner_ip)
  fw=$(firewall_id)
  converge "$fw" true with_runner_rule
  echo "Allowed $RUNNER_IP on port $SSH_PORT via firewall '$FIREWALL_NAME'"
}

# Remove this run's SSH rule.
revoke() {
  local fw
  fw=$(firewall_id)
  converge "$fw" false without_runner_rule
  echo "Revoked runner rule from firewall '$FIREWALL_NAME'"
}

# Dispatch the allow|revoke subcommand.
main() {
  [ $# -eq 1 ] || usage
  require_env HETZNER_API_TOKEN FIREWALL_NAME RULE_MARKER
  [[ "$RULE_MARKER" =~ ^gha-[^[:space:]]+$ ]] || die "RULE_MARKER must match gha-<no spaces>"
  case "$1" in
    allow) allow ;;
    revoke) revoke ;;
    *) usage ;;
  esac
}

main "$@"
