#!/usr/bin/env bash
# End to end on the test Umbrel: a Cloudflare quick tunnel to the app's gateway, setup through the
# app's page, then the relay checks, members posting and reading, a stranger refused, a file up and
# down, and the same after Umbrel restarts the app. The owner is OWNER_HEX (a real person, who joins
# from Buzz Desktop afterwards); the automated checks use two test members and a stranger.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
U="bash $HERE/ssh.sh"
T=$HERE/..
SKILL=$HERE/../../skills/self-host-buzz
BZ=${BUZZ_CLI:?set BUZZ_CLI to the buzz CLI}
OWNER_HEX=${OWNER_HEX:?set OWNER_HEX}
C=${UMBREL_CONTAINER:-umbrelos-test}
DOMAIN_FILE=${DOMAIN_FILE:-$HOME/.buzz-test/umbrel-domain}
TMP=$(mktemp -d)
PASS=0 FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
umbrel() { $U "docker exec $C sh -c $(printf '%q' "$1")"; }

echo "== Tunnel"
if [ -z "${DOMAIN:-}" ]; then
  umbrel 'docker rm -f buzz-test-tunnel >/dev/null 2>&1; docker pull -q cloudflare/cloudflared:2026.10.0 >/dev/null; docker run -d --name buzz-test-tunnel --network umbrel_main_network --restart unless-stopped cloudflare/cloudflared:2026.10.0 tunnel --no-autoupdate --url http://buzz-gateway:80 >/dev/null'
  for _ in $(seq 1 40); do
    DOMAIN=$(umbrel 'docker logs buzz-test-tunnel 2>&1' | grep -o -E 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 | sed 's|https://||')
    [ -n "$DOMAIN" ] && break
    sleep 3
  done
fi
[ -n "$DOMAIN" ] && pass "quick tunnel at https://$DOMAIN" || { fail "no quick tunnel address"; exit 1; }
echo "$DOMAIN" > "$DOMAIN_FILE"

if [ -z "${SKIP_SETUP:-}" ]; then
echo "== Setup, through the app's page"
code=$(umbrel "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1); curl -s -o /dev/null -w '%{http_code}' --data 'owner=npub1notreal&domain=$DOMAIN' http://\$ip:8080/save")
[ "$code" = 400 ] && pass "the page refuses a bad public ID (HTTP 400)" || fail "a bad public ID got HTTP $code"
code=$(umbrel "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1); curl -s -o /dev/null -w '%{http_code}' --data 'owner=$OWNER_HEX&domain=https://$DOMAIN/' http://\$ip:8080/save")
[ "$code" = 303 ] && pass "the page saves the owner and domain (HTTP 303)" || fail "saving got HTTP $code"
fi

echo "== The relay, through Cloudflare"
for _ in $(seq 1 40); do
  curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null | grep -q ok && break
  sleep 5
done
bash "$SKILL/scripts/check-relay.sh" "https://$DOMAIN" > "$TMP/check.txt" 2>&1
cat "$TMP/check.txt"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/check.txt"))) FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/check.txt")))

echo "== Members"
read -r A_SK A_HEX <<<"$(python3 "$T/lib/keygen.py")"
read -r B_SK B_HEX <<<"$(python3 "$T/lib/keygen.py")"
read -r X_SK _ <<<"$(python3 "$T/lib/keygen.py")"
for hex in "$A_HEX" "$B_HEX"; do
  npub=$(python3 "$T/lib/npub.py" "$hex")
  out=$(umbrel "docker exec buzz_relay_1 bash -c 'set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin add-member --pubkey $npub' 2>&1 | tail -1")
  echo "INFO  add-member: $(printf '%s' "$out" | sed -E 's/[0-9a-f]{64}/<hex>/g' | cut -c1-100)"
done
as() { local sk=$1; shift; BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"; }
as "$A_SK" users set-profile --name "Test member" --about "Added by the end-to-end test" > /dev/null 2>&1
as "$A_SK" channels create --name umbrel-test --type stream --visibility open > "$TMP/ch.json" 2>&1
CH=$(field channel_id < "$TMP/ch.json")
[ -n "$CH" ] && pass "member creates a channel" || fail "member creates a channel: $(cat "$TMP/ch.json")"
as "$A_SK" messages send --channel "$CH" --content "hello from member A, through Cloudflare" > /dev/null 2>&1 && pass "member A posts" || fail "member A posts"
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
echo "relay: wss://$DOMAIN"
rm -rf "$TMP"
[ "$FAIL" = 0 ]
