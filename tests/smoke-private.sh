#!/usr/bin/env bash
# Smoke test for the private-network path: the compose bundle on a server that's only on a
# Tailscale network. smoke-vps.sh runs the server half over SSH; the member side runs here with the
# buzz CLI, so this machine must be on the same tailnet (the Tailscale app, signed in).
#
# Needs: root SSH to a fresh Ubuntu 24.04 x86 server, a Tailscale auth key for your tailnet in a
# file, python3, and the buzz CLI (cargo build --release -p buzz-cli --bin buzz).
#
# Usage: BUZZ_CLI=path/to/buzz TS_AUTHKEY_FILE=path bash smoke-private.sh <server-ip> [machine-name] [image-tag]
#   SSH_KEY, KNOWN_HOSTS as in smoke.sh; JOIN_NPUB=npub1… adds that person as a member at the end
set -uo pipefail

IP=${1:?usage: smoke-private.sh <server-ip> [machine-name] [image-tag]}
NAME=${2:-buzz-test}
TAG=${3:-sha-83aab8c}
HERE=$(cd "$(dirname "$0")" && pwd)
BZ=${BUZZ_CLI:-buzz}
KEYFILE=${TS_AUTHKEY_FILE:?set TS_AUTHKEY_FILE to a file holding a Tailscale auth key}
source "$HERE/lib/log.sh" && run_logged private "$TAG" "$0" "$@"
SSH_OPTS=(-o BatchMode=yes -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new)
[[ -n ${SSH_KEY:-} ]] && SSH_OPTS+=(-i "$SSH_KEY")
[[ -n ${KNOWN_HOSTS:-} ]] && SSH_OPTS+=(-o UserKnownHostsFile="$KNOWN_HOSTS")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
info() { echo "INFO  $1"; }
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
  BUZZ_RELAY_URL="https://$HOST" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
ws_status() { curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$1" 2>/dev/null; }

section "Identities"
read -r OWNER_SK OWNER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r MEMBER_SK MEMBER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r STRANGER_SK _ <<<"$(python3 "$HERE/lib/keygen.py")"
MEMBER_NPUB=$(python3 "$HERE/lib/npub.py" "$MEMBER_HEX")
echo "owner   $OWNER_HEX"

section "Server: on the tailnet, nothing public"
scp "${SSH_OPTS[@]}" -q "$HERE/smoke-vps.sh" "root@$IP:/root/smoke-vps.sh"
(umask 077 && tr -d '[:space:]' <"$KEYFILE" >"$TMP/authkey")
scp "${SSH_OPTS[@]}" -q "$TMP/authkey" "root@$IP:/root/.ts-authkey"
rm -f "$TMP/authkey"
server private "$TAG" "$OWNER_HEX" "$NAME"
HOST=$(grep -aoE "PASS  tailnet name [^ ]+" "$TMP/phase.log" | awk '{print $4}')
[[ -n $HOST ]] || { echo "no tailnet name; stopping"; exit 1; }

section "From this machine, over the tailnet"
for _ in $(seq 1 180); do [[ -x $BZ ]] && break; sleep 10; done   # a CLI still building
[[ $(curl -fsS -m 10 "https://$HOST/_liveness" 2>/dev/null) == ok ]] && pass "https://$HOST answers here" || fail "this machine can't reach https://$HOST (is it on the tailnet?)"
as "$OWNER_SK" channels create --name private --type stream --visibility open >"$TMP/channel.json" 2>&1
CH=$(field channel_id <"$TMP/channel.json")
[[ -n $CH ]] && pass "owner creates a channel" || fail "owner creates a channel: $(cat "$TMP/channel.json")"
as "$OWNER_SK" messages send --channel "$CH" --content "hello over the tailnet" >"$TMP/send.json" 2>&1 &&
  pass "owner posts" || fail "owner posts: $(cat "$TMP/send.json")"
server add-member "$MEMBER_NPUB"
as "$MEMBER_SK" channels join --channel "$CH" >"$TMP/join.json" 2>&1 && pass "member joins" || fail "member joins: $(cat "$TMP/join.json")"
as "$MEMBER_SK" messages send --channel "$CH" --content "hello from a member" >"$TMP/send.json" 2>&1 &&
  pass "member posts" || fail "member posts: $(cat "$TMP/send.json")"
if as "$STRANGER_SK" messages send --channel "$CH" --content "should be refused" >"$TMP/stranger.json" 2>&1; then
  fail "a non-member posted"
elif grep -q relay_membership_required "$TMP/stranger.json"; then
  pass "non-member refused"
else
  fail "non-member failed for another reason: $(cat "$TMP/stranger.json")"
fi
as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 10 2>&1 | grep -q "hello from a member" &&
  pass "owner reads the member's message" || fail "owner can't read the member's message"
python3 "$HERE/lib/png.py" "$TMP/pic.png"
PIC_SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as "$MEMBER_SK" upload file --file "$TMP/pic.png" >"$TMP/upload.json" 2>&1
PIC_URL=$(field url <"$TMP/upload.json")
[[ $PIC_URL == "https://$HOST/media/$PIC_SHA.png" ]] && pass "upload lands at https://$HOST/media" || fail "upload: $(cat "$TMP/upload.json")"
as "$OWNER_SK" media get "$PIC_URL" -o "$TMP/got.png" >/dev/null 2>&1 &&
  [[ $(shasum -a 256 "$TMP/got.png" | cut -c1-64) == "$PIC_SHA" ]] && pass "download intact" || fail "download"

section "Phones can reach the pairing service, over the tailnet"
PAIR_URL=$(curl -fsS -m 10 -H 'Accept: application/nostr+json' "https://$HOST/" 2>/dev/null | field pairing_relay_url)
[[ $PAIR_URL == "wss://$HOST/pair" ]] && pass "the relay names its pairing service, $PAIR_URL" || fail "pairing_relay_url is [$PAIR_URL], not wss://$HOST/pair"
[[ $(ws_status "https://$HOST/pair") == 101 ]] && pass "WebSocket upgrade at https://$HOST/pair" || fail "no WebSocket at https://$HOST/pair"

if [[ -n ${JOIN_NPUB:-} ]]; then
  section "A person to try Buzz Desktop and a phone"
  server add-member "$JOIN_NPUB"
  info "join from Buzz Desktop with wss://$HOST, then pair a phone in Settings, Mobile (Tailscale on)"
fi

section "RESULT"
echo "relay: wss://$HOST"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
