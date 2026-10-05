#!/usr/bin/env bash
# Smoke test for the guide's VPS path, driven from a laptop.
# smoke-vps.sh runs the guide's server commands over SSH. The member side runs here with the
# buzz CLI, the way a member's machine reaches the relay: over the internet, through Caddy.
# Test identities are made here, so the server only ever sees public keys, as in the guide.
#
# Needs: root SSH to a fresh Ubuntu 24.04 x86 server whose domain already resolves to it,
# python3, and the buzz CLI built from block/buzz (cargo build --release -p buzz-cli --bin buzz).
#
# Usage: BUZZ_CLI=path/to/buzz bash smoke.sh <server-ip> <domain> [image-tag [upgrade-tag]]
#   upgrade-tag        a newer tag to upgrade to at the end (default: run.sh upgrade on the same tag)
#   SSH_KEY=path       key for root@<server-ip> (default: ssh's own)
#   KNOWN_HOSTS=path   known_hosts file to use (default: ssh's own)
#   JOIN_NPUB=npub1…   adds that person as a member at the end, to try Buzz Desktop and a phone
set -uo pipefail

IP=${1:?usage: smoke.sh <server-ip> <domain> [image-tag]}
DOMAIN=${2:?domain}
TAG=${3:-sha-83aab8c}
UPGRADE_TAG=${4:-}
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/lib/log.sh" && run_logged vps "$TAG" "$0" "$@"
BZ=${BUZZ_CLI:-buzz}
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

# server PHASE ARGS...: run a phase of smoke-vps.sh and fold its PASS/FAIL lines into ours.
server() {
  ssh "${SSH_OPTS[@]}" "root@$IP" bash /root/smoke-vps.sh "$@" >"$TMP/phase.log" 2>&1
  cat "$TMP/phase.log"
  PASS=$((PASS + $(grep -ac '^PASS' "$TMP/phase.log")))
  FAIL=$((FAIL + $(grep -ac '^FAIL' "$TMP/phase.log")))
}
# as SECRET ARGS...: run the buzz CLI as one identity.
as() {
  local sk=$1
  shift
  BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
nip11() { curl -fsS -H 'Accept: application/nostr+json' "https://$DOMAIN/" 2>/dev/null; }
relay_pubkey() { nip11 | field self; }
ws_status() { curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$1" 2>/dev/null; }
community_id() { nip11 | python3 -c "import json,sys; print(json.load(sys.stdin)['read_state_snapshot']['community_id'])" 2>/dev/null; }

section "Identities"
read -r OWNER_SK OWNER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r MEMBER_SK MEMBER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r STRANGER_SK _ <<<"$(python3 "$HERE/lib/keygen.py")"
MEMBER_NPUB=$(python3 "$HERE/lib/npub.py" "$MEMBER_HEX")
echo "owner   $OWNER_HEX"
echo "member  $MEMBER_NPUB"

section "Server: the guide, top to bottom"
scp "${SSH_OPTS[@]}" -q "$HERE/smoke-vps.sh" "root@$IP:/root/smoke-vps.sh"
server install "$DOMAIN" "$TAG" "$OWNER_HEX"
RELAY_PK=$(relay_pubkey)
COMMUNITY=$(community_id)
[[ $RELAY_PK =~ ^[0-9a-f]{64}$ ]] && info "relay identity $RELAY_PK (from its NIP-11 document)" || fail "the NIP-11 document has no relay identity (self)"
[[ -n $COMMUNITY ]] && info "community $COMMUNITY"

section "The owner is the owner"
server list-members
grep -qE "^$OWNER_HEX +owner" "$TMP/phase.log" && pass "RELAY_OWNER_PUBKEY became the owner" || fail "the owner is not in the member list"

section "Members post and read; a non-member is refused"
as "$OWNER_SK" channels create --name smoke --type stream --visibility open >"$TMP/channel.json" 2>&1
CH=$(field channel_id <"$TMP/channel.json")
[[ -n $CH ]] && pass "owner creates a channel" || fail "owner creates a channel: $(cat "$TMP/channel.json")"
as "$OWNER_SK" messages send --channel "$CH" --content "hello from the owner" >"$TMP/send.json" 2>&1 &&
  pass "owner posts" || fail "owner posts: $(cat "$TMP/send.json")"
server add-member "$MEMBER_NPUB" # the Day two card adds people by npub
as "$MEMBER_SK" channels join --channel "$CH" >"$TMP/join.json" 2>&1 &&
  pass "member joins the channel" || fail "member joins: $(cat "$TMP/join.json")"
as "$MEMBER_SK" messages send --channel "$CH" --content "hello from a member" >"$TMP/send.json" 2>&1 &&
  pass "member posts" || fail "member posts: $(cat "$TMP/send.json")"
if as "$STRANGER_SK" messages send --channel "$CH" --content "should be refused" >"$TMP/stranger.json" 2>&1; then
  fail "a non-member posted"
elif grep -q relay_membership_required "$TMP/stranger.json"; then
  pass "non-member refused: $(field message <"$TMP/stranger.json")"
else
  fail "non-member failed for another reason: $(cat "$TMP/stranger.json")"
fi
read_both() {
  as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 20 >"$TMP/read.json" 2>&1 &&
    grep -q "hello from the owner" "$TMP/read.json" && grep -q "hello from a member" "$TMP/read.json"
}
read_both && pass "owner reads both messages" || fail "owner reads both: $(cat "$TMP/read.json")"

section "Files"
python3 "$HERE/lib/png.py" "$TMP/pic.png"
PIC_SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as "$MEMBER_SK" upload file --file "$TMP/pic.png" >"$TMP/upload.json" 2>&1
PIC_URL=$(field url <"$TMP/upload.json")
[[ $PIC_URL == "https://$DOMAIN/media/$PIC_SHA.png" ]] &&
  pass "member uploads a file to https://$DOMAIN/media" || fail "upload: $(cat "$TMP/upload.json")"
fetch_pic() {
  rm -f "$TMP/got.png"
  as "$OWNER_SK" media get "$PIC_URL" -o "$TMP/got.png" >/dev/null 2>&1 &&
    [[ $(shasum -a 256 "$TMP/got.png" | cut -c1-64) == "$PIC_SHA" ]]
}
fetch_pic && pass "owner downloads it intact" || fail "owner downloads the file"
info "the file's URL without auth answers HTTP $(curl -s -o /dev/null -w '%{http_code}' "$PIC_URL")"

section "Phones can reach the pairing service"
PAIR_URL=$(nip11 | field pairing_relay_url)
[[ $PAIR_URL == "wss://$DOMAIN/pair" ]] && pass "the relay names its pairing service, $PAIR_URL" || fail "pairing_relay_url is [$PAIR_URL], not wss://$DOMAIN/pair"
[[ $(ws_status "https://$DOMAIN/pair") == 101 ]] && pass "WebSocket upgrade at https://$DOMAIN/pair" || fail "no WebSocket at https://$DOMAIN/pair"

section "Back up, lose the server's data, restore onto a fresh checkout"
server backup
server wipe
curl -fsS -m 5 "https://$DOMAIN/_liveness" >/dev/null 2>&1 && fail "the relay still answers after the wipe" || pass "the relay is gone after the wipe"
server restore
read_both && pass "messages survived the restore" || fail "messages after the restore: $(cat "$TMP/read.json")"
fetch_pic && pass "the file survived the restore" || fail "the file is gone after the restore"
server list-members
grep -q "$MEMBER_HEX" "$TMP/phase.log" && pass "membership survived the restore" || fail "membership lost in the restore"
[[ -z $RELAY_PK || $(relay_pubkey) == "$RELAY_PK" ]] && pass "same relay identity after the restore" || fail "the relay identity changed in the restore"
[[ -z $COMMUNITY || $(community_id) == "$COMMUNITY" ]] && pass "same community after the restore" || fail "the community changed in the restore"
as "$MEMBER_SK" messages send --channel "$CH" --content "after the restore" >"$TMP/send.json" 2>&1 &&
  pass "member posts after the restore" || fail "member posts after the restore: $(cat "$TMP/send.json")"

section "Upgrade${UPGRADE_TAG:+ to $UPGRADE_TAG}"
VERSION_BEFORE=$(nip11 | field version)
server upgrade $UPGRADE_TAG
info "relay version $VERSION_BEFORE before, $(nip11 | field version) after"
read_both && pass "messages survived the upgrade" || fail "messages after the upgrade: $(cat "$TMP/read.json")"
fetch_pic && pass "the file survived the upgrade" || fail "the file is gone after the upgrade"
[[ -z $RELAY_PK || $(relay_pubkey) == "$RELAY_PK" ]] && pass "same relay identity after the upgrade" || fail "the relay identity changed in the upgrade"
[[ -z $COMMUNITY || $(community_id) == "$COMMUNITY" ]] && pass "same community after the upgrade" || fail "the community changed in the upgrade"
as "$MEMBER_SK" messages send --channel "$CH" --content "after the upgrade" >"$TMP/send.json" 2>&1 &&
  pass "member posts after the upgrade" || fail "member posts after the upgrade: $(cat "$TMP/send.json")"
as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 20 2>&1 | grep -q "after the upgrade" &&
  pass "owner reads it" || fail "owner can't read the post-upgrade message"

if [[ -n ${JOIN_NPUB:-} ]]; then
  section "A person to try Buzz Desktop and a phone"
  server add-member "$JOIN_NPUB"
  info "join from Buzz Desktop with wss://$DOMAIN, then pair a phone in Settings, Mobile"
fi

section "RESULT"
echo "relay: wss://$DOMAIN"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
