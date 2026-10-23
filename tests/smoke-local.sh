#!/usr/bin/env bash
# Smoke test for the guide's local test (compose.md, `local` mode) on this machine, with Docker
# Desktop or Docker on Linux: the bundle at https://localhost, served by Caddy with a certificate
# from Caddy's own local authority. It runs the skill's commands verbatim (keep them in sync with
# compose.md), then checks from this machine against that authority alone: curl --cacert, and a
# WebSocket client that answers the relay's NIP-42 challenge the way Buzz 1.0's window does. So
# nothing here has to trust the authority; joining from Buzz 1.0 needs the trust step the user runs
# (compose.md step 12).
#
# Needs python3, git, curl, openssl and Docker. Ports 80 and 443 must be free, and no buzz-prod
# volumes left from an earlier local test.
#
# Usage: bash tests/smoke-local.sh [image-tag]
#   BUZZ_BASE=path   the folder that stands for ~ in compose.md (default: ~/buzz-local-test); the
#                    bundle goes in path/buzz, which must not exist yet
#   KEEP=1           leave the relay running, to join it from Buzz 1.0 (prints how to remove it);
#                    otherwise it stops the relay, removes its volumes and deletes the folder
set -uo pipefail

TAG=${1:-sha-e8781ca}
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/lib/log.sh" && run_logged local "$TAG" "$0" "$@"
BASE=${BUZZ_BASE:-$HOME/buzz-local-test}
SKILL=$(cd "$HERE/../skills/self-host-buzz" && pwd)
COMPOSE_DIR=$BASE/buzz/deploy/compose
TMP=$(mktemp -d)
OUT=$TMP/out
mkdir -p "$OUT"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

# ── harness, as in smoke-vps.sh ───────────────────────────────────────
run() {
  __run_name=$1
  printf '\n----- %s\n' "$__run_name"
  printf '%s\n' "$2" | sed 's/^/$ /'
  { eval "$2"; } >"$OUT/$__run_name.out" 2>&1
  __run_rc=$?
  cat "$OUT/$__run_name.out"
  echo "(exit $__run_rc)"
  return $__run_rc
}
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
info() { echo "INFO  $1"; }
expect() { if [[ "$3" == "$2" ]]; then pass "$1"; else fail "$1: expected [$2] got [$3]"; fi; }
section() { printf '\n===== %s\n' "$*"; }
finish() {
  section "RESULT"
  echo "relay: wss://localhost"
  echo "passed: $PASS  failed: $FAIL"
  [[ $FAIL -eq 0 ]]
  exit $?
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
CA=$COMPOSE_DIR/local-ca.crt
# signed_post SECRET PATH BODY: a NIP-98 signed POST to https://localhost, trusting only the local
# authority. Prints the HTTP status; the response goes to $TMP/post.json. Secrets go on stdin only.
signed_post() {
  local auth
  auth=$(python3 "$HERE/lib/nip98.py" POST "https://localhost$2" "$3" <<<"$1")
  curl -sS -m 15 --cacert "$CA" -o "$TMP/post.json" -w '%{http_code}' -X POST "https://localhost$2" \
    -H "Authorization: $auth" -H 'Content-Type: application/json' --data-binary "$3" 2>/dev/null
}
# publish SECRET KIND TAGS [CONTENT]: sign an event and POST it to /events. Prints the HTTP status.
publish() {
  local ev
  ev=$(python3 "$HERE/lib/event.py" "$2" "$3" "${4:-}" <<<"$1")
  signed_post "$1" /events "$ev"
}
accepted() { [[ $1 == 200 && $(field accepted <"$TMP/post.json") == True ]]; }
uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }

section "Identities"
read -r OWNER_SK OWNER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r STRANGER_SK _ <<<"$(python3 "$HERE/lib/keygen.py")"
echo "owner   $OWNER_HEX"
HOST=localhost
RELAY_URL=wss://localhost
ORIGIN=https://localhost
IMAGE=ghcr.io/block/buzz:$TAG

section "1. Machine (local)"
run docker-version "docker version --format '{{.Server.Version}}'" && pass "Docker answers" || { fail "Docker isn't running"; finish; }
run compose-version 'docker compose version'
V=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' "$OUT/compose-version.out" | head -1)
printf '2.24.4\n%s\n' "$V" | sort -V -C && pass "compose $V >= 2.24.4" || fail "compose $V < 2.24.4"
run ports "python3 -c 'import socket; [print(p, \"taken\" if socket.socket().connect_ex((\"127.0.0.1\", p)) == 0 else \"free\") for p in (80, 443)]'"
expect "ports 80 and 443 free" "80 free 443 free" "$(tr '\n' ' ' <"$OUT/ports.out" | sed 's/ $//')"
run volumes 'docker volume ls -q | grep buzz-prod'
[[ -s $OUT/volumes.out ]] && { fail "buzz-prod volumes are left from an earlier try"; finish; } || pass "no buzz-prod volumes left"
[[ -e $BASE/buzz ]] && { fail "$BASE/buzz already exists"; finish; }

section "4. The bundle"
mkdir -p "$BASE" && cd "$BASE" || { fail "can't use $BASE"; finish; }
run clone 'git clone https://github.com/block/buzz.git
cd buzz && git checkout -q ${TAG#sha-} && cd deploy/compose
cp .env.example .env && chmod 600 .env' >/dev/null
cd "$COMPOSE_DIR" || { fail "clone"; finish; }
expect "bundle at the image's commit" "${TAG#sha-}" "$(git rev-parse HEAD | cut -c1-7)"
run ls 'ls'
for f in Caddyfile compose.caddy.yml compose.yml run.sh; do
  [[ -e $f ]] && pass "bundle has $f" || fail "bundle lacks $f"
done

section "5. Random secrets"
run secrets 'for name in $(grep '"'"'CHANGE_ME_RANDOM'"'"' .env | cut -d= -f1); do
  sed -i.bak "s/^${name}=.*/${name}=$(openssl rand -hex 32)/" .env
done && rm -f .env.bak'
expect "no CHANGE_ME_RANDOM left" "0" "$(grep -c CHANGE_ME_RANDOM .env)"
expect "each is 64 hex characters" "$(grep -c CHANGE_ME_RANDOM .env.example)" \
  "$(grep -cE "^($(grep CHANGE_ME_RANDOM .env.example | cut -d= -f1 | paste -sd'|' -))=[0-9a-f]{64}$" .env)"

section "6. Relay key"
run relay-key 'key=$(docker run --rm --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz:$TAG generate-key | awk '"'"'/^Secret key:/ {print $3}'"'"')
sed -i.bak "s/^BUZZ_RELAY_PRIVATE_KEY=.*/BUZZ_RELAY_PRIVATE_KEY=${key}/" .env && rm .env.bak && unset key' >/dev/null
expect "relay key is 64 characters" "64" "$(grep '^BUZZ_RELAY_PRIVATE_KEY=' .env | cut -d= -f2 | tr -d '\n' | wc -c | tr -d ' ')"

section "7. Owner"
run owner 'sed -i.bak "s/^RELAY_OWNER_PUBKEY=.*/RELAY_OWNER_PUBKEY=$OWNER_HEX/" .env && rm .env.bak'
expect "owner is 64 hex" "1" "$(grep -cE '^RELAY_OWNER_PUBKEY=[0-9a-f]{64}$' .env)"
expect "no CHANGE_ME value lines" "0" "$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env)"

section "8. URL and version"
run url 'sed -i.bak \
  -e "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" \
  -e "s|^BUZZ_DOMAIN=.*|BUZZ_DOMAIN=$HOST|" \
  -e "s|^RELAY_URL=.*|RELAY_URL=$RELAY_URL|" \
  -e "s|^BUZZ_MEDIA_BASE_URL=.*|BUZZ_MEDIA_BASE_URL=$ORIGIN/media|" \
  -e "s|^BUZZ_MEDIA_SERVER_DOMAIN=.*|BUZZ_MEDIA_SERVER_DOMAIN=$HOST|" \
  -e "s|^BUZZ_CORS_ORIGINS=.*|BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,$ORIGIN|" \
  .env && rm .env.bak'
run url-check "grep -E '^(BUZZ_IMAGE|BUZZ_DOMAIN|RELAY_URL|BUZZ_MEDIA_BASE_URL|BUZZ_MEDIA_SERVER_DOMAIN|BUZZ_CORS_ORIGINS)=' .env"
expect "six URL/version lines" "BUZZ_IMAGE=$IMAGE BUZZ_DOMAIN=localhost RELAY_URL=wss://localhost BUZZ_MEDIA_BASE_URL=https://localhost/media BUZZ_MEDIA_SERVER_DOMAIN=localhost BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,https://localhost" \
  "$(tr '\n' ' ' <"$OUT/url-check.out" | sed 's/ $//')"

section "8P. Localhost only (local: Caddy's ports)"
run caddy-ports 'sed -i.bak -e "s/^CADDY_HTTP_PORT=.*/CADDY_HTTP_PORT=127.0.0.1:80/" \
  -e "s/^CADDY_HTTPS_PORT=.*/CADDY_HTTPS_PORT=127.0.0.1:443/" .env && rm .env.bak'
run caddy-ports-check "grep -E '^CADDY_HTTPS?_PORT=' .env"
expect "Caddy's ports on 127.0.0.1" "CADDY_HTTP_PORT=127.0.0.1:80 CADDY_HTTPS_PORT=127.0.0.1:443" "$(tr '\n' ' ' <"$OUT/caddy-ports-check.out" | sed 's/ $//')"

section "9. Bundle edits (local: the MinIO check only)"
run minio-grep "grep -n 'image:.*quay.io/minio' compose.yml"
if [[ -s $OUT/minio-grep.out ]]; then
  fail "a MinIO bundle: this test expects a Silo bundle (2026-10-07 on)"
else
  expect "a Silo bundle: no MinIO edit, Silo's two images" "2" "$(grep -c 'image: pgsty/' compose.yml)"
fi
expect ".env is private" "600" "$(python3 -c 'import os; print(oct(os.stat(".env").st_mode & 0o777)[2:])')"

section "10. Start"
SECONDS=0
run start 'BUZZ_COMPOSE_TLS=true ./run.sh start' >/dev/null && pass "run.sh start returned 0 (${SECONDS}s)" || fail "run.sh start failed"
run status 'BUZZ_COMPOSE_TLS=true ./run.sh status'
for svc in relay postgres redis minio; do
  grep -qE "buzz-prod-$svc-1 .*Up .*\(healthy\)" "$OUT/status.out" && pass "$svc up (healthy)" || fail "$svc not healthy"
done
grep -qE "buzz-prod-caddy-1 .*Up" "$OUT/status.out" && pass "caddy up" || fail "caddy not up"
grep -q "127.0.0.1:443->443/tcp" "$OUT/status.out" && grep -q "127.0.0.1:80->80/tcp" "$OUT/status.out" &&
  pass "Caddy's ports read 127.0.0.1:80 and 127.0.0.1:443" || fail "Caddy's ports aren't bound to 127.0.0.1"
grep -qE '0\.0\.0\.0:443|\[::\]:443' "$OUT/status.out" && fail "443 is open beyond this machine" || pass "443 isn't published on other addresses"
grep -q "buzz-prod-pair-relay-1" "$OUT/status.out" && fail "a pairing service in local mode" || pass "no pairing service (phones can't pair with a local test)"

section "11. Checks"
run list-members './run.sh list-members < /dev/null'
grep -qE "^$OWNER_HEX +owner" "$OUT/list-members.out" && pass "RELAY_OWNER_PUBKEY became the owner" || fail "the owner is not in the member list"

section "12. The local certificate"
sleep 2 # Caddy makes its authority when it starts
run local-ca 'docker cp buzz-prod-caddy-1:/data/caddy/pki/authorities/local/root.crt local-ca.crt
CA_FILE=local-ca.crt bash $SKILL/scripts/check-relay.sh https://localhost'
grep -q "Caddy Local Authority" <(openssl x509 -in local-ca.crt -noout -subject 2>/dev/null) &&
  pass "local-ca.crt is Caddy's local authority ($(openssl x509 -in local-ca.crt -noout -subject | sed 's/^subject= *//'))" ||
  fail "local-ca.crt isn't Caddy's local authority"
expect "check-relay.sh: no FAIL" "0" "$(grep -c '^FAIL' "$OUT/local-ca.out")"
expect "check-relay.sh: six PASS lines" "6" "$(grep -c '^PASS' "$OUT/local-ca.out")"
grep -q '^SKIP  phone pairing' "$OUT/local-ca.out" && pass "check-relay.sh skips phone pairing" || fail "check-relay.sh didn't skip phone pairing"
run chain "openssl s_client -connect 127.0.0.1:443 -servername localhost -CAfile local-ca.crt -verify_return_error < /dev/null 2>&1 | grep -E 'subject=|issuer=|Verify return code' | sort -u"
grep -q "Verify return code: 0 (ok)" "$OUT/chain.out" && pass "the certificate for localhost chains to local-ca.crt" || fail "the certificate doesn't chain to local-ca.crt"
run untrusted 'curl -sS -m 10 -o /dev/null https://localhost/_liveness'
[[ $? -ne 0 ]] && info "without local-ca.crt, curl refuses the certificate, as expected until it's trusted" ||
  info "curl already trusts the certificate"
if command -v security >/dev/null; then
  run verify-cert 'security verify-cert https://localhost'
  grep -q "verification successful" "$OUT/verify-cert.out" && info "macOS already trusts the local authority" ||
    info "macOS doesn't trust the local authority yet: compose.md step 12's command, which the user runs"
fi

section "Buzz 1.0 joins it: what it checks first"
NIP11=$(curl -fsS -m 10 --cacert "$CA" -H 'Accept: application/nostr+json' https://localhost/)
[[ $(printf '%s' "$NIP11" | field self) =~ ^[0-9a-f]{64}$ ]] && pass "NIP-11 names the relay's identity (self)" || fail "no relay identity in NIP-11"
printf '%s' "$NIP11" | python3 -c 'import json,sys; i=json.load(sys.stdin); sys.exit(0 if {29, 43} <= set(i.get("supported_nips") or []) and "nip-cl" in (i.get("supported_extensions") or []) else 1)' &&
  pass "NIP-11 lists NIPs 29 and 43 and channel labels (nip-cl)" || fail "NIP-11 lacks NIP 29, 43 or nip-cl"
# Buzz 1.0 reads a 404, or an answer without "policy", as no join policy (src/features/communities/native-api.ts)
JP=$(curl -s -m 10 --cacert "$CA" -o "$TMP/policy.json" -w '%{http_code}' https://localhost/api/join-policy)
[[ $JP == 404 ]] || { [[ $JP == 200 ]] && python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("policy") is None else 1)' "$TMP/policy.json" 2>/dev/null; } &&
  pass "no join policy to accept (GET /api/join-policy: HTTP $JP $(head -c 80 "$TMP/policy.json"))" || fail "join policy: HTTP $JP $(head -c 200 "$TMP/policy.json")"

section "The owner: a channel, a message, read back over HTTPS and over the live connection"
CH=$(uuid)
STATUS=$(publish "$OWNER_SK" 9007 "[[\"h\",\"$CH\"],[\"name\",\"local\"],[\"visibility\",\"open\"],[\"channel_type\",\"stream\"]]")
accepted "$STATUS" && pass "owner creates a channel" || fail "owner creates a channel: HTTP $STATUS $(cat "$TMP/post.json")"
STATUS=$(publish "$OWNER_SK" 9 "[[\"h\",\"$CH\"]]" "hello from the owner over https://localhost")
accepted "$STATUS" && pass "owner posts" || fail "owner posts: HTTP $STATUS $(cat "$TMP/post.json")"
STATUS=$(signed_post "$OWNER_SK" /query "[{\"kinds\":[9],\"#h\":[\"$CH\"],\"limit\":5}]")
grep -q "hello from the owner" "$TMP/post.json" && pass "owner reads it back (POST /query)" || fail "owner reads it back: HTTP $STATUS $(cat "$TMP/post.json")"
run websocket "python3 \"$HERE/lib/wscheck.py\" wss://localhost $CH \"$CA\" <<<\"\$OWNER_SK\""
grep -q "^NIP-42: the relay accepted AUTH" "$OUT/websocket.out" && pass "live connection: TLS, WebSocket and NIP-42 AUTH at wss://localhost" || fail "live connection at wss://localhost"
grep -q "hello from the owner" "$OUT/websocket.out" && pass "live connection reads the channel" || fail "live connection didn't read the message"
STATUS=$(publish "$STRANGER_SK" 9 "[[\"h\",\"$CH\"]]" "should be refused")
grep -q relay_membership_required "$TMP/post.json" && pass "a non-member is refused (HTTP $STATUS)" || fail "a non-member: HTTP $STATUS $(cat "$TMP/post.json")"

section "Files through https://localhost/media"
python3 "$HERE/lib/png.py" "$TMP/pic.png"
PIC_SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
EXP=$(($(date +%s) + 60))
AUTH=$(python3 "$HERE/lib/event.py" --header 24242 "[[\"x\",\"$PIC_SHA\"],[\"t\",\"upload\"],[\"server\",\"localhost\"],[\"expiration\",\"$EXP\"]]" "Upload pic.png" <<<"$OWNER_SK")
curl -sS -m 30 --cacert "$CA" -o "$TMP/upload.json" -X PUT https://localhost/upload -H "Authorization: $AUTH" \
  -H 'Content-Type: image/png' -H "X-SHA-256: $PIC_SHA" --data-binary @"$TMP/pic.png" 2>/dev/null
PIC_URL=$(field url <"$TMP/upload.json")
[[ $PIC_URL == "https://localhost/media/$PIC_SHA.png" ]] && pass "owner uploads a file to https://localhost/media" || fail "upload: $(cat "$TMP/upload.json")"
AUTH=$(python3 "$HERE/lib/event.py" --header 24242 "[[\"t\",\"get\"],[\"server\",\"localhost\"],[\"expiration\",\"$EXP\"]]" "Get buzz-media" <<<"$OWNER_SK")
curl -sS -m 30 --cacert "$CA" -o "$TMP/got.png" -H "Authorization: $AUTH" "$PIC_URL" 2>/dev/null
[[ -s $TMP/got.png && $(shasum -a 256 "$TMP/got.png" | cut -c1-64) == "$PIC_SHA" ]] && pass "owner downloads it intact" || fail "download"

section "Invites: Buzz 1.0's Invite with a link"
STATUS=$(signed_post "$OWNER_SK" /api/invites '{}')
CODE=$(field code <"$TMP/post.json")
INVITE_URL=$(field url <"$TMP/post.json")
[[ $STATUS == 200 && -n $CODE ]] && pass "owner creates an invite" || fail "owner creates an invite: HTTP $STATUS $(cat "$TMP/post.json")"
[[ $INVITE_URL == "https://localhost/invite/$CODE" ]] && pass "the link is https://localhost/invite/<code>, which Buzz 1.0's first screen takes" || fail "the invite link is [$INVITE_URL]"
expect "the invite page answers over HTTPS" "200" "$(curl -s -m 10 --cacert "$CA" -o /dev/null -w '%{http_code}' "$INVITE_URL")"
read -r GUEST_SK GUEST_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
STATUS=$(signed_post "$GUEST_SK" /api/invites/claim "{\"code\":\"$CODE\"}")
[[ $STATUS == 200 && $(field status <"$TMP/post.json") == joined ]] && pass "a new identity joins with it" || fail "claiming the invite: HTTP $STATUS $(cat "$TMP/post.json")"
run members-after './run.sh list-members < /dev/null'
grep -q "$GUEST_HEX" "$OUT/members-after.out" && pass "list-members shows the invited member" || fail "the invited member isn't in list-members"

section "Buzz 1.0: New chat (a chat labelled buzz.solo)"
SOLO=$(uuid)
STATUS=$(publish "$OWNER_SK" 9007 "[[\"h\",\"$SOLO\"],[\"name\",\"local chat\"],[\"visibility\",\"private\"],[\"channel_type\",\"stream\"],[\"t\",\"buzz.solo\"]]")
accepted "$STATUS" && pass "owner starts a chat" || fail "starting a chat: HTTP $STATUS $(cat "$TMP/post.json")"
STATUS=$(signed_post "$OWNER_SK" /query "[{\"kinds\":[39000],\"#d\":[\"$SOLO\"]}]")
LABELS=$(python3 -c 'import json,sys; print(" ".join(t[1] for e in json.load(open(sys.argv[1])) for t in e["tags"] if t[0] == "t"))' "$TMP/post.json" 2>/dev/null)
[[ " $LABELS " == *" buzz.solo "* ]] && pass "the relay keeps the chat's label (t tags: $LABELS)" || fail "the chat lost its label: [$LABELS]"

section "Left running, or removed"
if [[ -n ${KEEP:-} ]]; then
  INVITE=$BASE/owner-invite.txt
  STATUS=$(signed_post "$OWNER_SK" /api/invites '{"ttl_secs":604800}')
  (umask 077 && field url <"$TMP/post.json" >"$INVITE")
  [[ $STATUS == 200 && -s $INVITE ]] && info "a 7-day invite link for a person's own Buzz 1.0 is in $INVITE" || fail "the 7-day invite: HTTP $STATUS"
  info "left running: buzz-prod's containers and volumes, from $COMPOSE_DIR"
  info "remove it: cd $COMPOSE_DIR && BUZZ_COMPOSE_TLS=true ./run.sh stop && docker volume rm \$(docker volume ls -q | grep '^buzz-prod_') && rm -rf $BASE"
else
  run stop 'BUZZ_COMPOSE_TLS=true ./run.sh stop'
  run remove "docker volume rm \$(docker volume ls -q | grep '^buzz-prod_')"
  expect "no buzz-prod volumes left" "0" "$(docker volume ls -q | grep -c '^buzz-prod_')"
  cd "$HOME" && rm -rf "$BASE" && pass "removed $BASE" || fail "couldn't remove $BASE"
fi
finish
