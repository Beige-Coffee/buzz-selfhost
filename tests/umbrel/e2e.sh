#!/usr/bin/env bash
# End to end on the test Umbrel: a Cloudflare quick tunnel to the app's gateway, setup through the
# app's page, then the relay checks, members posting and reading, a stranger refused, a file up and
# down, invite links, Buzz 1.0's New chat with an agent, moderation turned on and off on the page
# (the admin API's answers, a ban that an invite link doesn't get around, and its lift), and the same
# after Umbrel restarts the app, with moderation still on.
#
# The owner is a test identity made here, unless OWNER_HEX names a real person, who joins from Buzz
# afterwards. With a real owner the invite checks, the owner's moderation checks, the ban and its lift
# are skipped (they need the owner's key), and New chat runs as a member, which Buzz 1.0 allows any member.
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
# Requests from inside umbrelOS straight to the page, past Umbrel's proxy, as another app could
# make them. post PATH FORM prints the HTTP status, with the session cookie once signed in.
WEB="ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1)"
JAR=/tmp/buzz-e2e-jar
post() { umbrel "$WEB; curl -s -o /dev/null -w '%{http_code}' -b $JAR -c $JAR --data '$2' http://\$ip:8080$1"; }
saved() { umbrel 'docker exec buzz_web_1 cat /settings/setup.json 2>/dev/null'; }
# The app password from the page's own environment, on stdin: never printed or in a process list
signin() { umbrel "$WEB; docker exec buzz_web_1 printenv APP_PASSWORD | tr -d '\n' | curl -s -o /dev/null -w '%{http_code}' -c $JAR --data-urlencode password@- http://\$ip:8080/login"; }

if [ -z "${SKIP_SETUP:-}" ]; then
echo "== Setup, through the app's page"
umbrel "rm -f $JAR"
before=$(saved)
code=$(post /save "owner=$OWNER_HEX&mode=domain&domain=evil.example.com&ack=yes")
[ "$code" = 401 ] && [ "$(saved)" = "$before" ] &&
  pass "without the app password, a direct request can't save settings (HTTP 401)" || fail "a save without signing in got HTTP $code"
code=$(signin)
[ "$code" = 303 ] && pass "the app password signs in to the page (HTTP 303)" || fail "signing in got HTTP $code"
code=$(post /save "owner=npub1notreal&mode=domain&domain=$DOMAIN&ack=yes")
[ "$code" = 400 ] && pass "the page refuses a bad public ID (HTTP 400)" || fail "a bad public ID got HTTP $code"
code=$(post /save "owner=$OWNER_HEX&mode=domain&domain=https://$DOMAIN/")
[ "$code" = 400 ] && pass "the page refuses to create without the acknowledgement (HTTP 400)" || fail "no acknowledgement got HTTP $code"
code=$(post /save "owner=$OWNER_HEX&mode=domain&domain=https://$DOMAIN/&ack=yes")
[ "$code" = 303 ] && pass "the page saves the owner and domain (HTTP 303)" || fail "saving got HTTP $code"
umbrel "rm -f $JAR"
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

echo "== Moderation: the relay's admin API, turned on and off on the app's page"
# The admin API is asked through the gateway from inside umbrelOS, with the Host a request for <name>:8443
# has when the app's Cloudflare tunnel delivers it, so a quick tunnel that doesn't carry port 8443 changes
# nothing here. Signatures (NIP-98) are made on this machine and reach the request on stdin, never on a
# command line. The banned member posts with event.py, as Buzz does, without the buzz CLI.
ORIGIN="https://$DOMAIN:8443"
GATEWAY_PY='import http.client, json, sys
host, method, path, accept = sys.argv[1:5]
body = sys.argv[5].encode() if len(sys.argv) > 5 else None
auth = sys.stdin.readline().strip()
headers = {"Host": host, "Accept": accept}
if auth:
    headers["Authorization"] = auth
if body is not None:
    headers["Content-Type"] = "application/json"
try:
    c = http.client.HTTPConnection("buzz-gateway", 80, timeout=15)
    c.request(method, path, body=body, headers=headers)
    r = c.getresponse()
    h = {k.lower(): v for k, v in r.getheaders()}
    text = r.read(65536).decode(errors="replace")
    print(json.dumps({"status": r.status, "csp": h.get("content-security-policy", ""), "type": h.get("content-type", ""), "www": h.get("www-authenticate", ""), "body": text[:4000]}))
except Exception as e:
    print(json.dumps({"status": 0, "body": type(e).__name__}))'
# gateway HOST METHOD PATH ACCEPT [BODY] < AUTHORIZATION: one request through the gateway, from the page's
# container on Umbrel's network. The answer goes to $TMP/gw.json: status, csp, type, www and body. The program
# goes in single quotes, which any shell reads as they are, so it has none of its own.
gateway() { $U "docker exec -i $C docker exec -i buzz_web_1 python3 -c '$GATEWAY_PY' $(printf '%q ' "$@")" > "$TMP/gw.json" 2> /dev/null; }
gw() { python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ''))" "$TMP/gw.json" "$1" 2>/dev/null; }
# sign SECRET METHOD PATH [BODY]: a NIP-98 header for $ORIGIN$PATH, the URL the relay derives from its admin host
sign() { python3 "$T/lib/nip98.py" "$2" "$ORIGIN$3" ${4+"$4"} <<<"$1"; }
admin_api() { nip11 | python3 -c "import json,sys; print(json.load(sys.stdin).get('admin_api') or '<none>')" 2>/dev/null; }
advertised() { for _ in $(seq 1 40); do [ "$(admin_api)" = "$1" ] && return 0; sleep 3; done; return 1; }
admin_line() { umbrel "docker exec buzz_web_1 sed -n '/^BUZZ_ADMIN_HOST/p' /settings/relay.env"; }
# relay_admin_env: the relay process's own admin settings, by name: the rest of its environment holds secrets
relay_admin_env() {
  $U "docker exec -i $C sh -s" <<'ENV'
docker exec buzz_relay_1 bash -c 'for p in /proc/[0-9]*; do [ "$(cat $p/comm 2> /dev/null)" = buzz-relay ] && tr "\0" "\n" < $p/environ | grep -E "^(BUZZ_ADMIN_HOST|BUZZ_ADMIN_AUTH|BUZZ_ADMIN_TOKEN|RELAY_OPERATOR_PUBKEYS|BUZZ_ADMIN_WEB_DIR)="; done' 2> /dev/null
ENV
}
# member_posts SECRET TEXT: a member's message in the channel, signed with event.py and posted as Buzz posts it
member_posts() { signed_post "$1" /events "$(python3 "$T/lib/event.py" 9 "[[\"h\",\"$CH\"]]" "$2" <<<"$1")"; }
banned() { for _ in $(seq 1 10); do [ "$(member_posts "$A_SK" "$1")" = 403 ] && grep -q banned "$TMP/post.json" && return 0; sleep 3; done; return 1; }
# accepted SECRET TEXT: the member's message is accepted within 30 seconds, as after a ban is lifted
accepted() {
  for _ in $(seq 1 10); do
    STATUS=$(member_posts "$1" "$2")
    [[ $STATUS == 200 && $(field accepted < "$TMP/post.json") == True ]] && return 0
    sleep 3
  done
  return 1
}
umbrel "rm -f $JAR"
[ "$(signin)" = 303 ] || fail "signing in to the page for moderation"
if [ "$(saved | field mode)" != domain ]; then
  # A Tailscale address: Buzz opens moderation only at addresses that resolve to public ones, so the page
  # offers it on the owner's own domain alone
  code=$(post /moderation "moderation=on")
  [ "$code" = 400 ] && [ -z "$(admin_line)" ] && pass "on a Tailscale address the page refuses to turn moderation on (HTTP 400)" ||
    fail "on a Tailscale address, turning moderation on got HTTP $code, and the relay's settings say [$(admin_line)]"
  echo "INFO  the other moderation checks skipped: they need a domain, the owner's own or a quick tunnel's"
else
  [ "$(admin_api)" = "<none>" ] && pass "moderation is off by default: NIP-11 advertises no admin API" ||
    fail "before it's turned on, NIP-11's admin_api is [$(admin_api)]"
  gateway "$DOMAIN:8443" GET /api/admin/v1/probe application/json < /dev/null
  [ "$(gw status)" = 404 ] && pass "and $DOMAIN:8443 has no admin API (HTTP 404)" || fail "before it's turned on, $DOMAIN:8443 answered HTTP $(gw status)"
  code=$(post /moderation "moderation=on")
  [ "$code" = 303 ] && [ "$(admin_line)" = "BUZZ_ADMIN_HOST=$DOMAIN:8443" ] &&
    pass "the page turns it on: one line in the relay's settings, BUZZ_ADMIN_HOST=$DOMAIN:8443" ||
    fail "turning it on got HTTP $code, and the relay's settings say [$(admin_line)]"
  advertised "$ORIGIN" && pass "the relay restarts with it: NIP-11 advertises admin_api $ORIGIN" ||
    fail "NIP-11 didn't advertise $ORIGIN within 2 minutes: [$(admin_api)]"
  [ "$(relay_admin_env)" = "BUZZ_ADMIN_HOST=$DOMAIN:8443" ] &&
    pass "the relay process has that alone: no open mode, no other operators, and no browser dashboard" ||
    fail "the relay process's admin settings: [$(relay_admin_env | tr '\n' ' ')]"
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H 'Accept: application/nostr+json' "$ORIGIN/" 2> /dev/null)
  echo "INFO  from this machine, through Cloudflare, $ORIGIN/ answered HTTP $code (404 when Cloudflare carries port 8443 to it)"
  gateway "$DOMAIN:8443" GET / application/nostr+json < /dev/null
  [ "$(gw status)" = 404 ] && [[ $(gw csp) == "default-src 'none'"*"frame-ancestors 'none'"* ]] &&
    pass "through the gateway, $DOMAIN:8443 is the relay's admin host (404 with its own security policy)" ||
    fail "through the gateway, $DOMAIN:8443/ answered HTTP $(gw status), policy [$(gw csp)]"
  gateway "$DOMAIN:8443" GET / text/html < /dev/null
  [ "$(gw status)" = 404 ] && [ -z "$(gw body)" ] && pass "a browser there gets no page: the dashboard is off" ||
    fail "a browser at $DOMAIN:8443/ got HTTP $(gw status), $(gw type)"
  gateway "$DOMAIN:8443" GET /api/admin/v1/probe application/json < /dev/null
  [ "$(gw status)" = 401 ] && [ "$(gw www)" = Nostr ] && pass "an unsigned request to the admin API is refused (HTTP 401)" ||
    fail "an unsigned probe got HTTP $(gw status): $(gw body | head -c 200)"
  sign "$A_SK" GET /api/admin/v1/probe | gateway "$DOMAIN:8443" GET /api/admin/v1/probe application/json
  [ "$(gw status)" = 403 ] && pass "a member's signature is refused (HTTP 403)" || fail "a member's probe got HTTP $(gw status): $(gw body | head -c 200)"
  if [ -n "$OWNER_SK" ]; then
    sign "$OWNER_SK" GET /api/admin/v1/probe | gateway "$DOMAIN:8443" GET /api/admin/v1/probe application/json
    role=$(gw body | python3 -c 'import json,sys; b = json.load(sys.stdin); print(b.get("role"), b.get("source"))' 2> /dev/null)
    [ "$(gw status)" = 200 ] && [ "$role" = "operator owner_fallback" ] &&
      pass "the owner's signature gets in (HTTP 200): the operator, as the relay's owner" ||
      fail "the owner's probe got HTTP $(gw status) [$role]: $(gw body | head -c 200)"
    sign "$OWNER_SK" GET /api/admin/v1/probe | gateway "$DOMAIN" GET /api/admin/v1/probe application/json
    [ "$(gw status)" = 403 ] && pass "the same signature sent for the community's own address is refused (HTTP 403)" ||
      fail "the owner's probe for $DOMAIN got HTTP $(gw status)"
    BAN="/api/admin/v1/members/$A_HEX/ban?communityHost=$DOMAIN"
    BODY="{\"requestId\":\"$(python3 -c 'import uuid; print(uuid.uuid4())')\"}"
    sign "$OWNER_SK" POST "$BAN" "$BODY" | gateway "$DOMAIN:8443" POST "$BAN" application/json "$BODY"
    case "$(gw status)" in 200|202) pass "the owner bans member A through the admin API (HTTP $(gw status))" ;;
      *) fail "the ban got HTTP $(gw status): $(gw body | head -c 200)" ;; esac
    banned "after the ban" && pass "member A's posts are refused: banned from this community" ||
      fail "member A posted after the ban: HTTP $(member_posts "$A_SK" "after the ban, again") $(head -c 200 "$TMP/post.json")"
    STATUS=$(member_posts "$B_SK" "member B, after A's ban")
    [[ $STATUS == 200 && $(field accepted < "$TMP/post.json") == True ]] && pass "member B still posts" ||
      fail "member B after A's ban: HTTP $STATUS $(head -c 200 "$TMP/post.json")"
    # The page says a banned identity can't come back with an invite link, and a new identity still joins with one
    STATUS=$(signed_post "$OWNER_SK" /api/invites '{}')
    INVITE=$(field code < "$TMP/post.json")
    STATUS=$(signed_post "$A_SK" /api/invites/claim "{\"code\":\"$INVITE\"}")
    [[ -n $INVITE && $STATUS == 403 && $(field error < "$TMP/post.json") == invite_restricted ]] &&
      pass "member A can't come back with the owner's new invite link (HTTP 403, invite_restricted)" ||
      fail "member A claiming an invite after the ban: HTTP $STATUS $(head -c 200 "$TMP/post.json")"
    read -r G_SK _ <<<"$(python3 "$T/lib/keygen.py")"
    STATUS=$(signed_post "$G_SK" /api/invites/claim "{\"code\":\"$INVITE\"}")
    [[ $STATUS == 200 && $(field status < "$TMP/post.json") == joined ]] && pass "a new identity joins with the same link" ||
      fail "a new identity claiming that link: HTTP $STATUS $(head -c 200 "$TMP/post.json")"
  else
    echo "INFO  the owner's own checks and the ban skipped: the owner is a real person, whose key isn't here"
  fi
  code=$(post /moderation "")
  [ "$code" = 303 ] && [ -z "$(admin_line)" ] && pass "the page turns it off: the line is gone from the relay's settings" ||
    fail "turning it off got HTTP $code, and the relay's settings say [$(admin_line)]"
  advertised "<none>" && pass "the relay restarts without it: NIP-11 advertises no admin API" ||
    fail "NIP-11 still advertises [$(admin_api)] 2 minutes after turning it off"
  gateway "$DOMAIN:8443" GET /api/admin/v1/probe application/json < /dev/null
  [ "$(gw status)" = 404 ] && pass "and $DOMAIN:8443 has no admin API again (HTTP 404)" || fail "after turning it off, the probe got HTTP $(gw status)"
  if [ -n "$OWNER_SK" ]; then
    banned "with moderation off" && pass "the ban holds with moderation off" || fail "member A posted once moderation was off"
  fi
  # On again: lifting a ban needs it, and it stays on through the restart below
  code=$(post /moderation "moderation=on")
  [ "$code" = 303 ] && advertised "$ORIGIN" && pass "the page turns it on again, and NIP-11 advertises it" ||
    fail "turning it on again got HTTP $code, and NIP-11 advertises [$(admin_api)]"
  MODERATION_ON=1
  if [ -n "$OWNER_SK" ]; then
    LIFT="/api/admin/v1/members/$A_HEX/ban?communityHost=$DOMAIN"
    sign "$OWNER_SK" DELETE "$LIFT" | gateway "$DOMAIN:8443" DELETE "$LIFT" application/json
    [ "$(gw status)" = 204 ] && pass "the owner lifts member A's ban through the admin API (HTTP 204)" ||
      fail "lifting the ban got HTTP $(gw status): $(gw body | head -c 200)"
    accepted "$A_SK" "after the ban is lifted" && pass "member A posts again" ||
      fail "member A after the lift: HTTP $STATUS $(head -c 200 "$TMP/post.json")"
  fi
fi
umbrel "rm -f $JAR"

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
if [ -n "${MODERATION_ON:-}" ]; then
  advertised "$ORIGIN" && pass "moderation stays on through the restart: NIP-11 advertises $ORIGIN" ||
    fail "after the restart, NIP-11 advertises [$(admin_api)]"
  umbrel "rm -f $JAR"
  [ "$(signin)" = 303 ] || fail "signing in to the page after the restart"
  code=$(post /moderation "")
  [ "$code" = 303 ] && [ -z "$(admin_line)" ] && advertised "<none>" && pass "then the page turns it off" ||
    fail "turning it off after the restart got HTTP $code: the relay's settings say [$(admin_line)], NIP-11 [$(admin_api)]"
  umbrel "rm -f $JAR"
fi

echo
echo "passed: $PASS  failed: $FAIL"
echo "community address: https://$DOMAIN"
rm -rf "$TMP"
[ "$FAIL" = 0 ]
