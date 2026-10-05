#!/usr/bin/env bash
# Smoke test for the guide's practice path: a relay at ws://127.0.0.1:3000, no domain, no TLS.
# Runs the practice commands on a Linux server that already has Docker (smoke-vps.sh practice),
# then reaches the relay through an SSH tunnel on this machine's 127.0.0.1:3000, so the buzz CLI
# sees exactly the URL a practice relay has on a laptop. Port 3000 must be free here.
#
# Usage: BUZZ_CLI=path/to/buzz bash smoke-practice.sh <server-ip> [image-tag]
#   SSH_KEY, KNOWN_HOSTS as in smoke.sh
set -uo pipefail

IP=${1:?usage: smoke-practice.sh <server-ip> [image-tag]}
TAG=${2:-sha-83aab8c}
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/lib/log.sh" && run_logged practice "$TAG" "$0" "$@"
BZ=${BUZZ_CLI:-buzz}
SSH_OPTS=(-o BatchMode=yes -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new)
[[ -n ${SSH_KEY:-} ]] && SSH_OPTS+=(-i "$SSH_KEY")
[[ -n ${KNOWN_HOSTS:-} ]] && SSH_OPTS+=(-o UserKnownHostsFile="$KNOWN_HOSTS")
TMP=$(mktemp -d)
TUNNEL=
cleanup() {
  [[ -n $TUNNEL ]] && kill "$TUNNEL" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
PASS=0
FAIL=0

pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
section() { printf '\n===== %s\n' "$*"; }
server() {
  ssh "${SSH_OPTS[@]}" "root@$IP" bash /root/smoke-vps.sh "$@" >"$TMP/phase.log" 2>&1
  cat "$TMP/phase.log"
  PASS=$((PASS + $(grep -ac '^PASS' "$TMP/phase.log")))
  FAIL=$((FAIL + $(grep -ac '^FAIL' "$TMP/phase.log")))
}
as() {
  local sk=$1
  shift
  BUZZ_RELAY_URL=http://127.0.0.1:3000 BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port 3000 is taken on this machine; free it first" >&2
  exit 2
fi

section "Identities"
read -r OWNER_SK OWNER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r STRANGER_SK _ <<<"$(python3 "$HERE/lib/keygen.py")"
echo "owner   $OWNER_HEX"

section "Server: the practice path"
scp "${SSH_OPTS[@]}" -q "$HERE/smoke-vps.sh" "root@$IP:/root/smoke-vps.sh"
server practice "$TAG" "$OWNER_HEX"

section "This machine's 127.0.0.1:3000, tunneled to the relay"
ssh "${SSH_OPTS[@]}" -N -L 127.0.0.1:3000:127.0.0.1:3000 "root@$IP" &
TUNNEL=$!
for _ in $(seq 1 20); do curl -fsS -m 2 http://127.0.0.1:3000/_liveness >/dev/null 2>&1 && break; sleep 1; done
[[ $(curl -fsS -m 5 http://127.0.0.1:3000/_liveness 2>/dev/null) == ok ]] && pass "liveness through the tunnel" || fail "no relay on 127.0.0.1:3000"

section "The owner posts, uploads and reads back; a non-member is refused"
as "$OWNER_SK" channels create --name practice --type stream --visibility open >"$TMP/channel.json" 2>&1
CH=$(field channel_id <"$TMP/channel.json")
[[ -n $CH ]] && pass "owner creates a channel" || fail "owner creates a channel: $(cat "$TMP/channel.json")"
as "$OWNER_SK" messages send --channel "$CH" --content "hello from practice" >"$TMP/send.json" 2>&1 &&
  pass "owner posts" || fail "owner posts: $(cat "$TMP/send.json")"
as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 5 2>&1 | grep -q "hello from practice" &&
  pass "owner reads it back" || fail "owner can't read the message"
if as "$STRANGER_SK" messages send --channel "$CH" --content "should be refused" >"$TMP/stranger.json" 2>&1; then
  fail "a non-member posted"
elif grep -q relay_membership_required "$TMP/stranger.json"; then
  pass "non-member refused"
else
  fail "non-member failed for another reason: $(cat "$TMP/stranger.json")"
fi
python3 "$HERE/lib/png.py" "$TMP/pic.png"
PIC_SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as "$OWNER_SK" upload file --file "$TMP/pic.png" >"$TMP/upload.json" 2>&1
PIC_URL=$(field url <"$TMP/upload.json")
[[ $PIC_URL == "http://127.0.0.1:3000/media/$PIC_SHA.png" ]] &&
  pass "upload lands at http://127.0.0.1:3000/media" || fail "upload: $(cat "$TMP/upload.json")"
as "$OWNER_SK" media get "$PIC_URL" -o "$TMP/got.png" >/dev/null 2>&1 &&
  [[ $(shasum -a 256 "$TMP/got.png" | cut -c1-64) == "$PIC_SHA" ]] && pass "download intact" || fail "download"

section "RESULT"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
