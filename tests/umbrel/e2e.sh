#!/usr/bin/env bash
# End to end on the test Umbrel: a Cloudflare quick tunnel to the app's gateway, setup through the
# app's page, then the relay checks, members posting and reading, a stranger refused, a file up and
# down, invite links, Buzz 1.0's New chat with an agent, and the same after Umbrel restarts the app.
#
# The owner is a test identity made here, unless OWNER_HEX names a real person, who joins from Buzz
# afterwards. With a real owner the invite checks are skipped (they need the owner's key), and New
# chat runs as a member, which Buzz 1.0 allows any member.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
U="bash $HERE/ssh.sh"
[ -n "${UMBREL_LOCAL:-}" ] && U="bash -c"  # this machine's Docker
T=$HERE/..
SKILL=$HERE/../../skills/self-host-buzz
BZ=${BUZZ_CLI:?set BUZZ_CLI to the buzz CLI}
C=${UMBREL_CONTAINER:-umbrelos-test}
DOMAIN_FILE=${DOMAIN_FILE:-$HOME/.buzz-test/umbrel-domain}
TMP=$(mktemp -d)
PASS=0 FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
umbrel() { $U "docker exec $C sh -c $(printf '%q' "$1")"; }
# OWNER_KEYS: a file of "secret hex" for a test owner to reuse; SETUP_ONLY=1 stops after setup.
OWNER_SK=""
if [ -n "${OWNER_KEYS:-}" ]; then
  read -r OWNER_SK OWNER_HEX < "$OWNER_KEYS"
elif [ -z "${OWNER_HEX:-}" ]; then
  read -r OWNER_SK OWNER_HEX <<<"$(python3 "$T/lib/keygen.py")"
  echo "INFO  the owner is a test identity"
fi

echo "== Tunnel"
if [ -z "${DOMAIN:-}" ]; then
  umbrel 'docker rm -f buzz-test-tunnel >/dev/null 2>&1; docker pull -q cloudflare/cloudflared:2026.10.0 >/dev/null; docker run -d --name buzz-test-tunnel --network umbrel_main_network --restart unless-stopped cloudflare/cloudflared:2026.10.0 tunnel --no-autoupdate --url http://buzz-gateway:80 >/dev/null'
  for _ in $(seq 1 40); do
    DOMAIN=$(umbrel 'docker logs buzz-test-tunnel 2>&1' | grep -o -E 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 | sed 's|https://||')
    [ -n "$DOMAIN" ] && break
    sleep 3
  done
fi
[ -n "$DOMAIN" ] && pass "relay address https://$DOMAIN" || { fail "no quick tunnel address"; exit 1; }
echo "$DOMAIN" > "$DOMAIN_FILE"

nip11() { curl -fsS -m 10 -H 'Accept: application/nostr+json' "https://$DOMAIN/" 2>/dev/null; }
# has_ext NAME: the relay's NIP-11 lists NAME in supported_extensions (Buzz 1.0 reads nip-cl there)
has_ext() { nip11 | python3 -c "import json,sys; sys.exit(0 if '$1' in (json.load(sys.stdin).get('supported_extensions') or []) else 1)" 2>/dev/null; }
# signed_post SECRET PATH BODY [AUTH_TAG]: a NIP-98 signed POST, as Buzz 1.0 sends one, with an
# agent's NIP-OA tag in x-auth-tag if given. Prints the HTTP status; the response goes to
# $TMP/post.json. The secret reaches nip98.py on stdin, never in a process list.
signed_post() {
  local auth extra=()
  [[ -n ${4:-} ]] && extra=(-H "x-auth-tag: $4")
  auth=$(python3 "$T/lib/nip98.py" POST "https://$DOMAIN$2" "$3" <<<"$1")
  curl -sS -m 15 -o "$TMP/post.json" -w '%{http_code}' -X POST "https://$DOMAIN$2" \
    -H "Authorization: $auth" -H 'Content-Type: application/json' ${extra[@]+"${extra[@]}"} --data-binary "$3" 2>/dev/null
}
members() { umbrel "docker exec buzz_relay_1 bash -c 'set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin $1' 2>&1"; }

if [ -z "${SKIP_SETUP:-}" ]; then
echo "== Setup, through the app's page"
code=$(umbrel "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1); curl -s -o /dev/null -w '%{http_code}' --data 'owner=npub1notreal&domain=$DOMAIN' http://\$ip:8080/save")
[ "$code" = 400 ] && pass "the page refuses a bad public ID (HTTP 400)" || fail "a bad public ID got HTTP $code"
code=$(umbrel "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1); curl -s -o /dev/null -w '%{http_code}' --data 'owner=$OWNER_HEX&domain=https://$DOMAIN/' http://\$ip:8080/save")
[ "$code" = 303 ] && pass "the page saves the owner and domain (HTTP 303)" || fail "saving got HTTP $code"
fi
[ -n "${SETUP_ONLY:-}" ] && { echo "setup only: passed $PASS, failed $FAIL"; rm -rf "$TMP"; [ "$FAIL" = 0 ]; exit; }

echo "== The relay, at its public address"
for _ in $(seq 1 40); do
  curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null | grep -q ok && break
  sleep 5
done
bash "$SKILL/scripts/check-relay.sh" "https://$DOMAIN" > "$TMP/check.txt" 2>&1
cat "$TMP/check.txt"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/check.txt"))) FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/check.txt")))
members list-members | grep -qE "^$OWNER_HEX +owner" && pass "the page's owner is the relay's owner" || fail "the owner isn't in list-members"

echo "== Members"
read -r A_SK A_HEX <<<"$(python3 "$T/lib/keygen.py")"
read -r B_SK B_HEX <<<"$(python3 "$T/lib/keygen.py")"
read -r X_SK _ <<<"$(python3 "$T/lib/keygen.py")"
for hex in "$A_HEX" "$B_HEX"; do
  out=$(members "add-member --pubkey $(python3 "$T/lib/npub.py" "$hex")" | tail -1)
  echo "INFO  add-member: $(printf '%s' "$out" | sed -E 's/[0-9a-f]{64}/<hex>/g' | cut -c1-100)"
done
as() { local sk=$1; shift; BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"; }
as "$A_SK" users set-profile --name "Test member" --about "Added by the end-to-end test" > /dev/null 2>&1
as "$A_SK" channels create --name umbrel-test --type stream --visibility open > "$TMP/ch.json" 2>&1
CH=$(field channel_id < "$TMP/ch.json")
[ -n "$CH" ] && pass "member creates a channel" || fail "member creates a channel: $(cat "$TMP/ch.json")"
as "$A_SK" messages send --channel "$CH" --content "hello from member A" > /dev/null 2>&1 && pass "member A posts" || fail "member A posts"
as "$B_SK" channels join --channel "$CH" > /dev/null 2>&1 && pass "member B joins the channel" || fail "member B joins"
as "$B_SK" messages send --channel "$CH" --content "hello from member B" > /dev/null 2>&1 && pass "member B posts" || fail "member B posts"
if as "$X_SK" messages send --channel "$CH" --content "should be refused" > "$TMP/x.json" 2>&1; then
  fail "a stranger posted"
else
  grep -q relay_membership_required "$TMP/x.json" && pass "stranger refused" || fail "stranger failed another way: $(head -c 200 "$TMP/x.json")"
fi
read_both() {
  as "$B_SK" --format compact messages get --channel "$CH" --limit 20 > "$TMP/read.json" 2>&1 &&
    grep -q "hello from member A" "$TMP/read.json" && grep -q "hello from member B" "$TMP/read.json"
}
read_both && pass "member B reads both messages" || fail "member B reads both"

echo "== Files"
python3 "$T/lib/png.py" "$TMP/pic.png"
SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as "$A_SK" upload file --file "$TMP/pic.png" > "$TMP/up.json" 2>&1
URL=$(field url < "$TMP/up.json")
[ "$URL" = "https://$DOMAIN/media/$SHA.png" ] && pass "member A uploads a file" || fail "upload: $(head -c 300 "$TMP/up.json")"
fetch() { rm -f "$TMP/got.png"; as "$B_SK" media get "$URL" -o "$TMP/got.png" > /dev/null 2>&1 && [ "$(shasum -a 256 "$TMP/got.png" | cut -c1-64)" = "$SHA" ]; }
fetch && pass "member B downloads it intact" || fail "member B downloads the file"

if [ -n "$OWNER_SK" ]; then
  echo "== Invites: what Buzz 1.0's Invite members, Invite with a link does"
  STATUS=$(signed_post "$OWNER_SK" /api/invites '{}')
  CODE=$(field code < "$TMP/post.json")
  INVITE_URL=$(field url < "$TMP/post.json")
  [[ $STATUS == 200 && -n $CODE ]] && pass "owner creates an invite link" || fail "owner creates an invite: HTTP $STATUS $(cat "$TMP/post.json")"
  [[ $INVITE_URL == "https://$DOMAIN/invite/$CODE" ]] && pass "the link is https://$DOMAIN/invite/<code>" || fail "the invite link is [$INVITE_URL]"
  STATUS=$(signed_post "$A_SK" /api/invites '{}')
  [[ $STATUS == 403 ]] && pass "a member who isn't an admin can't create one (HTTP 403)" || fail "a member creates an invite: HTTP $STATUS"
  read -r GUEST_SK GUEST_HEX <<<"$(python3 "$T/lib/keygen.py")"
  STATUS=$(signed_post "$GUEST_SK" /api/invites/claim "{\"code\":\"$CODE\"}")
  [[ $STATUS == 200 && $(field status < "$TMP/post.json") == joined ]] &&
    pass "a new identity joins with the link" || fail "claiming the invite: HTTP $STATUS $(cat "$TMP/post.json")"
  as "$GUEST_SK" channels join --channel "$CH" > /dev/null 2>&1 &&
    as "$GUEST_SK" messages send --channel "$CH" --content "hello from an invited member" > /dev/null 2>&1 &&
    pass "the invited member posts" || fail "the invited member posts"
else
  echo "INFO  invite links skipped: the owner is a real person, whose key isn't here"
fi

echo "== Buzz 1.0: New chat, with an agent admitted through its owner"
# The chat is a private channel labelled buzz.solo, which needs channel labels (nip-cl); the agent
# has its own key, and its owner's NIP-OA attestation admits it with no add-member.
if [ -n "$OWNER_SK" ]; then HUMAN_SK=$OWNER_SK; else HUMAN_SK=$A_SK; fi
nip11 | python3 -c 'import json,sys; sys.exit(0 if {29, 43} <= set(json.load(sys.stdin).get("supported_nips") or []) else 1)' 2>/dev/null &&
  pass "NIP-11 lists NIPs 29 and 43 (channels, membership)" || fail "NIP-11 lacks NIP 29 or 43"
read -r AGENT_SK AGENT_HEX <<<"$(python3 "$T/lib/keygen.py")"
AGENT_TAG=$(python3 "$T/lib/event.py" --attest "$AGENT_HEX" <<<"$HUMAN_SK")
SOLO=$(python3 -c 'import uuid; print(uuid.uuid4())')
EVENT=$(python3 "$T/lib/event.py" 9007 "[[\"h\",\"$SOLO\"],[\"name\",\"umbrel chat\"],[\"visibility\",\"private\"],[\"channel_type\",\"stream\"],[\"t\",\"buzz.solo\"],[\"p\",\"$AGENT_HEX\"]]" <<<"$HUMAN_SK")
STATUS=$(signed_post "$HUMAN_SK" /events "$EVENT")
[[ $STATUS == 200 && $(field accepted < "$TMP/post.json") == True ]] &&
  pass "a chat that names an agent starts (kind 9007, label buzz.solo)" || fail "starting the chat: HTTP $STATUS $(cat "$TMP/post.json")"
STATUS=$(signed_post "$HUMAN_SK" /query "[{\"kinds\":[39000],\"#d\":[\"$SOLO\"]}]")
LABELS=$(python3 -c 'import json,sys; print(" ".join(t[1] for e in json.load(open(sys.argv[1])) for t in e["tags"] if t[0] == "t"))' "$TMP/post.json" 2>/dev/null)
[[ " $LABELS " == *" buzz.solo "* ]] && pass "the relay keeps the chat's label" || fail "the chat lost its buzz.solo label: HTTP $STATUS [$LABELS]"
BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$AGENT_SK" BUZZ_AUTH_TAG="$AGENT_TAG" "$BZ" messages send --channel "$SOLO" \
  --content "hello from an agent" > "$TMP/agent.json" 2>&1 &&
  pass "the agent posts in the chat, admitted through its owner" || fail "the agent posts: $(head -c 300 "$TMP/agent.json")"
as "$HUMAN_SK" --format compact messages get --channel "$SOLO" --limit 5 2>&1 | grep -q "hello from an agent" &&
  pass "the agent's owner reads its message" || fail "the agent's owner can't read its message"
if as "$AGENT_SK" messages send --channel "$SOLO" --content "should be refused" > "$TMP/noauth.json" 2>&1; then
  fail "the agent's key posted without its owner's attestation"
else
  grep -q relay_membership_required "$TMP/noauth.json" && pass "the agent's key alone is refused" ||
    fail "the agent's key alone failed another way: $(head -c 200 "$TMP/noauth.json")"
fi

echo "== Restart through Umbrel"
umbrel 'umbreld client apps.restart.mutate --appId buzz > /dev/null 2>&1'
for _ in $(seq 1 60); do
  curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null | grep -q ok && break
  sleep 5
done
state=$(umbrel 'umbreld client apps.state.query --appId buzz 2>&1' | tr -d '\n ')
[[ $state == *ready* ]] && pass "Umbrel reports the app ready after restart" || fail "state after restart: $state"
read_both && pass "messages survive the restart" || fail "messages after restart"
fetch && pass "the file survives the restart" || fail "file after restart"

echo
echo "passed: $PASS  failed: $FAIL"
echo "community address: https://$DOMAIN"
rm -rf "$TMP"
[ "$FAIL" = 0 ]
