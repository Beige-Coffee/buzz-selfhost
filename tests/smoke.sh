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
#   upgrade-tag        a newer tag to upgrade to at the end, after a fresh backup (default: run.sh
#                      upgrade on the same tag). From a tag before 2026-10-07 to a later one, this moves
#                      uploaded files from MinIO to Silo (block/buzz#8023).
#   SSH_KEY=path       key for root@<server-ip> (default: ssh's own)
#   KNOWN_HOSTS=path   known_hosts file to use (default: ssh's own)
#   JOIN_NPUB=npub1…   adds that person as a member at the end, to try Buzz 1.0 and a phone
set -uo pipefail

IP=${1:?usage: smoke.sh <server-ip> <domain> [image-tag [upgrade-tag]]}
DOMAIN=${2:?domain}
TAG=${3:-sha-e8781ca}
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
# has_ext NAME: the relay's NIP-11 lists NAME in supported_extensions (Buzz 1.0 reads nip-cl there)
has_ext() { nip11 | python3 -c "import json,sys; sys.exit(0 if '$1' in (json.load(sys.stdin).get('supported_extensions') or []) else 1)" 2>/dev/null; }
# signed_post SECRET PATH BODY [AUTH_TAG]: a NIP-98 signed POST, as Buzz 1.0 sends one, with an agent's
# NIP-OA tag in x-auth-tag if given. Prints the HTTP status; the response goes to $TMP/post.json. The
# secret reaches nip98.py on stdin, never in a process list.
signed_post() {
  local auth extra=()
  [[ -n ${4:-} ]] && extra=(-H "x-auth-tag: $4")
  auth=$(python3 "$HERE/lib/nip98.py" POST "https://$DOMAIN$2" "$3" <<<"$1")
  curl -sS -m 15 -o "$TMP/post.json" -w '%{http_code}' -X POST "https://$DOMAIN$2" \
    -H "Authorization: $auth" -H 'Content-Type: application/json' ${extra[@]+"${extra[@]}"} --data-binary "$3" 2>/dev/null
}

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
has_ext nip-cl && info "channel labels (nip-cl) on $TAG: Buzz 1.0's New chat works" ||
  info "no channel labels (nip-cl) on $TAG: Buzz 1.0's New chat needs an image from 2026-10-15 or later"

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

section "Invites: the relay API behind Buzz 1.0's Add or invite people (Buzz 0.X: Settings, Invites)"
STATUS=$(signed_post "$OWNER_SK" /api/invites '{}')
CODE=$(field code <"$TMP/post.json")
INVITE_URL=$(field url <"$TMP/post.json")
[[ $STATUS == 200 && -n $CODE ]] && pass "owner creates an invite" || fail "owner creates an invite: HTTP $STATUS $(cat "$TMP/post.json")"
[[ $INVITE_URL == "https://$DOMAIN/invite/$CODE" ]] && pass "the invite link is https://$DOMAIN/invite/<code>" || fail "the invite link is [$INVITE_URL]"
info "the invite link's page answers HTTP $(curl -s -o /dev/null -w '%{http_code}' "$INVITE_URL")"
STATUS=$(signed_post "$MEMBER_SK" /api/invites '{}')
[[ $STATUS == 403 ]] && pass "a member who isn't an admin can't create one (HTTP 403)" || fail "a member creates an invite: HTTP $STATUS"
read -r GUEST_SK GUEST_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
STATUS=$(signed_post "$GUEST_SK" /api/invites/claim "{\"code\":\"$CODE\"}")
[[ $STATUS == 200 && $(field status <"$TMP/post.json") == joined ]] &&
  pass "a new identity joins with the invite, as $(field role <"$TMP/post.json")" || fail "claiming the invite: HTTP $STATUS $(cat "$TMP/post.json")"
as "$GUEST_SK" channels join --channel "$CH" >"$TMP/join.json" 2>&1 &&
  as "$GUEST_SK" messages send --channel "$CH" --content "hello from an invited member" >"$TMP/send.json" 2>&1 &&
  pass "the invited member posts" || fail "the invited member posts: $(cat "$TMP/join.json" "$TMP/send.json")"
server list-members
grep -q "$GUEST_HEX" "$TMP/phase.log" && pass "list-members shows the invited member" || fail "the invited member isn't in list-members"

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
[[ -n $UPGRADE_TAG ]] && server backup # operations.md: back up first
server upgrade $UPGRADE_TAG
info "relay version $VERSION_BEFORE before, $(nip11 | field version) after"
read_both && pass "messages survived the upgrade" || fail "messages after the upgrade: $(cat "$TMP/read.json")"
fetch_pic && pass "the file survived the upgrade" || fail "the file is gone after the upgrade"
[[ -z $RELAY_PK || $(relay_pubkey) == "$RELAY_PK" ]] && pass "same relay identity after the upgrade" || fail "the relay identity changed in the upgrade"
[[ -z $COMMUNITY || $(community_id) == "$COMMUNITY" ]] && pass "same community after the upgrade" || fail "the community changed in the upgrade"
as "$MEMBER_SK" messages send --channel "$CH" --content "after the upgrade" >"$TMP/send.json" 2>&1 &&
  pass "member posts after the upgrade" || fail "member posts after the upgrade: $(cat "$TMP/send.json")"
as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 20 2>&1 | grep "after the upgrade" >/dev/null &&
  pass "owner reads it" || fail "owner can't read the post-upgrade message"
python3 "$HERE/lib/png.py" "$TMP/pic2.png"
PIC2_SHA=$(shasum -a 256 "$TMP/pic2.png" | cut -c1-64)
as "$MEMBER_SK" upload file --file "$TMP/pic2.png" >"$TMP/upload2.json" 2>&1
PIC2_URL=$(field url <"$TMP/upload2.json")
[[ $PIC2_URL == "https://$DOMAIN/media/$PIC2_SHA.png" ]] && pass "member uploads a new file after the upgrade" ||
  fail "upload after the upgrade: $(cat "$TMP/upload2.json")"
rm -f "$TMP/got2.png"
as "$OWNER_SK" media get "$PIC2_URL" -o "$TMP/got2.png" >/dev/null 2>&1 &&
  [[ $(shasum -a 256 "$TMP/got2.png" | cut -c1-64) == "$PIC2_SHA" ]] &&
  pass "owner downloads the new file intact" || fail "owner downloads the file uploaded after the upgrade"

section "Buzz 1.0: New chat, with an agent admitted through its owner"
# What Buzz 1.0 does when the owner starts a chat with one of their agents: the agent has its own key,
# and the owner's NIP-OA attestation admits it through the owner's membership (BUZZ_ALLOW_NIP_OA_AUTH),
# with no add-member. The chat is a private channel labelled buzz.solo, which needs channel labels
# (nip-cl); the create names the agent, so it's a member at once (block/buzz#8421).
nip11 | python3 -c 'import json,sys; sys.exit(0 if {29, 43} <= set(json.load(sys.stdin).get("supported_nips") or []) else 1)' 2>/dev/null &&
  pass "NIP-11 lists NIPs 29 and 43 (channels, membership)" || fail "NIP-11 lacks NIP 29 or 43"
has_ext nip-cl && pass "the relay advertises channel labels (nip-cl), which New chat needs" ||
  fail "no channel labels (nip-cl): Buzz 1.0's New chat would fail on this image"
read -r AGENT_SK AGENT_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
AGENT_TAG=$(python3 "$HERE/lib/event.py" --attest "$AGENT_HEX" <<<"$OWNER_SK")
SOLO=$(python3 -c 'import uuid; print(uuid.uuid4())')
EVENT=$(python3 "$HERE/lib/event.py" 9007 "[[\"h\",\"$SOLO\"],[\"name\",\"smoke chat\"],[\"visibility\",\"private\"],[\"channel_type\",\"stream\"],[\"t\",\"buzz.solo\"],[\"p\",\"$AGENT_HEX\"]]" <<<"$OWNER_SK")
STATUS=$(signed_post "$OWNER_SK" /events "$EVENT")
[[ $STATUS == 200 && $(field accepted <"$TMP/post.json") == True ]] &&
  pass "owner starts a chat that names an agent (kind 9007, label buzz.solo)" || fail "starting the chat: HTTP $STATUS $(cat "$TMP/post.json")"
STATUS=$(signed_post "$OWNER_SK" /query "[{\"kinds\":[39000],\"#d\":[\"$SOLO\"]}]")
LABELS=$(python3 -c 'import json,sys; print(" ".join(t[1] for e in json.load(open(sys.argv[1])) for t in e["tags"] if t[0] == "t"))' "$TMP/post.json" 2>/dev/null)
[[ " $LABELS " == *" buzz.solo "* ]] && pass "the relay keeps the chat's label (t tags: $LABELS)" ||
  fail "the chat lost its buzz.solo label: HTTP $STATUS [$LABELS]"
BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$AGENT_SK" BUZZ_AUTH_TAG="$AGENT_TAG" "$BZ" messages send --channel "$SOLO" \
  --content "hello from an agent" >"$TMP/agent.json" 2>&1 &&
  pass "the agent posts in the chat, admitted through its owner" || fail "the agent posts: $(cat "$TMP/agent.json")"
as "$OWNER_SK" --format compact messages get --channel "$SOLO" --limit 5 2>&1 | grep "hello from an agent" >/dev/null &&
  pass "owner reads the agent's message" || fail "owner can't read the agent's message"
if as "$AGENT_SK" messages send --channel "$SOLO" --content "should be refused" >"$TMP/noauth.json" 2>&1; then
  fail "the agent's key posted without its owner's attestation"
elif grep -q relay_membership_required "$TMP/noauth.json"; then
  pass "the agent's key without the attestation is refused"
else
  fail "the agent's key without the attestation failed for another reason: $(cat "$TMP/noauth.json")"
fi
read -r ROGUE_SK ROGUE_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
ROGUE_TAG=$(python3 "$HERE/lib/event.py" --attest "$ROGUE_HEX" <<<"$STRANGER_SK")
if BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$ROGUE_SK" BUZZ_AUTH_TAG="$ROGUE_TAG" "$BZ" messages send --channel "$CH" \
  --content "should be refused" >"$TMP/rogue.json" 2>&1; then
  fail "an agent whose owner isn't a member posted"
elif grep -q relay_membership_required "$TMP/rogue.json"; then
  pass "an agent whose owner isn't a member is refused"
else
  fail "an agent whose owner isn't a member failed for another reason: $(cat "$TMP/rogue.json")"
fi
server list-members
grep -q "$AGENT_HEX" "$TMP/phase.log" && fail "the agent became a relay member" ||
  pass "the agent isn't a relay member: no add-member per agent"

if [[ -n ${JOIN_NPUB:-} ]]; then
  section "A person to try Buzz 1.0 and a phone"
  server add-member "$JOIN_NPUB"
  info "join from Buzz 1.0 with https://$DOMAIN, then pair a phone in Settings, Pair mobile"
fi

section "RESULT"
echo "relay: wss://$DOMAIN"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
