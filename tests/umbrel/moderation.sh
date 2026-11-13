#!/usr/bin/env bash
# Owner moderation on a real domain, by hand: the relay's admin API at https://<B>:8443, through the app's
# own Cloudflare tunnel, as Buzz's Moderation reaches it. For the acceptance run on the owner's own domain
# (docs/umbrel.md, Not yet tested), which e2e.sh can't do: it asks the admin API through the gateway, from
# inside umbrelOS. Nothing runs unless called.
#
# From this computer, read-only (curl and tests/lib, through Cloudflare):
#   check <B> <keys> [<owner keys>]  every probe below, in order: before turning it on, and after
#   nip11 <B>                  NIP-11 at https://<B>/: does it advertise admin_api https://<B>:8443?
#   port <B>                   https://<B>:8443/ asked for NIP-11: does Host keep ":8443" up to the relay?
#   unauth <B>                 /api/admin/v1/probe with no credential, on :8443 and on the public port
#   no-ua <B>                  the same on :8443 with no User-Agent, as Buzz's admin client sends it
#   member <B> <keys>          the same, signed (NIP-98) by a member who isn't staff, no User-Agent
#   owner <B> <owner keys>     the same, signed by the owner set on the page: Buzz's Moderation for the owner
#   npub <keys>                the member's npub, to paste into Buzz
#   post <B> <keys> [channel]  the member posts with the buzz CLI (BUZZ_CLI): POSTED before a ban,
#                              BANNED (or TIMED OUT) after one
# On the test Umbrel (a droplet through tests/umbrel/ssh.sh, or this machine's umbrelOS with UMBREL_LOCAL=1):
#   status                     the page's option and switch, the relay's settings and process, the address
#   on <B>                     turns moderation on with the app's page, as its Settings does, and waits for it
#   off <B>                    turns it off the same way
#   add-member <B> <keys>      adds the member to the community at <B> with buzz-admin, as update.sh does
#
# <B>: the community's current name, such as buzz.example.com: no https://, no port.
# <keys>, <owner keys>: files whose first line is "secret hex", as MEMBER_KEYS in tests/umbrel/update.sh.
#   The secrets go to nip98.py on stdin and to the buzz CLI's environment, never to the screen. Probes with
#   the owner's key need a test owner: a real owner checks in Buzz instead.
# The page signs itself in from inside its own container, with the app password in that container's
# environment: no password leaves it. The relay process's environment is read by name only.
# UMBREL_CONTAINER: the umbrelOS container (default umbrelos-test).
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=$HERE/../lib
U="bash $HERE/ssh.sh"
[ -n "${UMBREL_LOCAL:-}" ] && U="bash -c"  # this machine's Docker
C=${UMBREL_CONTAINER:-umbrelos-test}
# The relay's Content-Security-Policy on its admin host (relay 0.3.0 crates/buzz-relay/src/router.rs)
ADMIN_CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
B="" SK="" HEX="" OSK="" ON=0 CODE="" RC=0
PASS=0 FAIL=0
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
info() { echo "INFO  $1"; }
die() { echo "$1" >&2; exit 2; }
summary() { echo; echo "passed: $PASS  failed: $FAIL"; [ "$FAIL" = 0 ]; }

need_host() {
  B=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')
  [[ $B =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
    die "<B> must be a host name such as buzz.example.com: no https://, no port"
}

# read_keys FILE: "secret hex" from the file's first line into KS and KH
read_keys() {
  [ -r "${1:-}" ] || die "a key file must be readable, its first line \"secret hex\""
  KS="" KH=""
  read -r KS KH _ < "$1" || true
  KS=${KS%$'\r'} KH=${KH%$'\r'}
  [[ $KS =~ ^[0-9a-f]{64}$ && $KH =~ ^[0-9a-f]{64}$ ]] ||
    die "the first line of a key file must be \"secret hex\", 64 lowercase hex characters each"
}
need_keys() { read_keys "${1:-}"; SK=$KS HEX=$KH; }
need_owner() { read_keys "${1:-}"; OSK=$KS; }

# get URL [curl options]: one request from this computer, no redirects followed. Leaves the headers in
# $T/h, the body in $T/b and curl's own error in $T/e; sets CODE (000 when nothing answered) and RC.
get() {
  local url=$1
  shift
  : > "$T/h"; : > "$T/b"; : > "$T/e"
  CODE=$(curl -sS -m 20 -D "$T/h" -o "$T/b" -w '%{http_code}' "$@" "$url" 2> "$T/e")
  RC=$?
}

# hdr NAME: that header's value in the last answer, the name matched in any case
hdr() {
  tr -d '\r' < "$T/h" | awk -v n="$1" '
    tolower(substr($0, 1, length(n) + 1)) == tolower(n) ":" { v = substr($0, length(n) + 2); sub(/^ +/, "", v) }
    END { print v }'
}

# field NAME: a top-level JSON field of the last body, or <not JSON>
field() {
  python3 -I - "$T/b" "$1" << 'PY'
import json, sys
try:
    v = json.load(open(sys.argv[1])).get(sys.argv[2])
    print("" if v is None else v)
except Exception:
    print("<not JSON>")
PY
}

# envelope: the code in the relay admin API's own error envelope (crates/buzz-relay/src/api/admin/error.rs),
# {"error":{"code","message","requestId"}}, or nothing
envelope() {
  python3 -I - "$T/b" << 'PY'
import json, sys
try:
    e = json.load(open(sys.argv[1]))["error"]
    if isinstance(e, dict) and isinstance(e.get("code"), str) and "requestId" in e:
        print(e["code"])
except Exception:
    pass
PY
}

# cloudflare: names a Cloudflare refusal or error page in the last answer, else prints nothing and
# fails. The markers are Cloudflare's documented behavior, not code read for this test.
cloudflare() {
  local m type body code
  m=$(hdr cf-mitigated)
  type=$(hdr content-type)
  body=$(head -c 20000 "$T/b" | tr -d '\0')
  if [ -n "$m" ]; then echo "Cloudflare challenged it (cf-mitigated: $m), $type"; return 0; fi
  if grep -q -E 'error code: 1010|cf-error-code">1010<|Error 1010' <<< "$body"; then
    echo "Cloudflare error 1010, the Browser Integrity Check (access denied on the browser's signature), $type"
    return 0
  fi
  if grep -q -i -E 'challenge-platform|Just a moment' <<< "$body"; then echo "a Cloudflare challenge page, $type"; return 0; fi
  code=$(grep -o -E 'error code: [0-9]{3,4}|cf-error-code">[0-9]{3,4}<' <<< "$body" | grep -o -E '[0-9]{3,4}' | head -n 1)
  if [ -n "$code" ]; then echo "Cloudflare error $code, $type"; return 0; fi
  if [[ $type == text/html* ]]; then echo "an HTML page, not the relay (its answers here are JSON or empty)"; return 0; fi
  return 1
}

# why: the last answer in one line, without secrets
why() {
  local cf
  if [ "$CODE" = 000 ]; then echo "no answer (curl exit $RC: $(head -n 1 "$T/e"))"; return; fi
  if cf=$(cloudflare); then echo "HTTP $CODE, $cf"; return; fi
  echo "HTTP $CODE, $(wc -c < "$T/b" | tr -d ' ') bytes of '$(hdr content-type)': $(head -c 160 "$T/b" | tr -d '\r\n' | tr -c '[:print:]' '?')"
}

nip11() {
  local admin
  get "https://$B/" -H 'Accept: application/nostr+json'
  admin=$(field admin_api)
  ON=0
  if [ "$CODE" = 200 ] && [ "$admin" = "https://$B:8443" ]; then
    ON=1
    pass "NIP-11 at https://$B/ advertises admin_api https://$B:8443: moderation is on"
  elif [ "$CODE" = 200 ] && [ -z "$admin" ]; then
    info "NIP-11 at https://$B/ has no admin_api: moderation is off, so the rest is judged for that"
  elif [ "$CODE" = 200 ] && [ "$admin" != "<not JSON>" ]; then
    ON=1
    fail "NIP-11 at https://$B/ advertises admin_api $admin, not https://$B:8443"
  else
    fail "NIP-11 at https://$B/: $(why)"
  fi
}

# advertised WANT: waits up to 2 minutes for NIP-11 to advertise WANT ("" for none), quietly
advertised() {
  for _ in $(seq 1 40); do
    get "https://$B/" -H 'Accept: application/nostr+json'
    [ "$CODE" = 200 ] && [ "$(field admin_api)" = "$1" ] && return 0
    sleep 3
  done
  return 1
}

# port: https://<B>:8443/ asked for NIP-11. The relay answers by the exact Host it receives: its admin
# host (404, admin CSP), no community at "<B>:8443" (404 text), or the community at "<B>" (200 NIP-11).
port() {
  local url="https://$B:8443/" nips
  get "$url" -H 'Accept: application/nostr+json'
  nips=$(field supported_nips)
  if [ "$CODE" = 404 ] && [ "$(hdr content-security-policy)" = "$ADMIN_CSP" ]; then
    if [ "$ON" = 1 ]; then
      pass "$url reached the relay with Host $B:8443: its admin host answered (404 with the admin CSP)"
    else
      fail "$url: the relay's admin host answered, but NIP-11 advertises none"
    fi
  elif [ "$CODE" = 404 ] && grep -q 'no community is configured for this host' "$T/b"; then
    if [ "$ON" = 1 ]; then
      fail "$url reached the relay with Host $B:8443, but that isn't its admin host: BUZZ_ADMIN_HOST isn't $B:8443"
    else
      pass "$url reached the relay with Host $B:8443 (no community there): Cloudflare, cloudflared and the gateway keep the port"
    fi
  elif [ "$CODE" = 200 ] && [ -n "$nips" ] && [ "$nips" != "<not JSON>" ]; then
    fail "$url answered as the community itself (NIP-11): Host lost ':8443' on the way, so the admin host can never match"
  elif [ "$CODE" = 404 ] && [ ! -s "$T/b" ]; then
    fail "$url: an empty 404 without the relay's admin CSP: most likely the gateway's catch-all (Host $B:8443 matched no site)"
  else
    fail "$url: $(why)"
  fi
}

# admin URL STATUS CODE LABEL: judges one answer from /api/admin/v1/probe that isn't staff's, on or off
admin() {
  local url=$1 status=$2 code=$3 label=$4 env
  env=$(envelope)
  if [ "$CODE" = "$status" ] && [ "$env" = "$code" ]; then
    if [ "$ON" = 1 ]; then
      if [ "$status" = 401 ]; then
        pass "$label: HTTP 401 unauthorized from the relay's admin API (WWW-Authenticate: $(hdr www-authenticate))"
      else
        pass "$label: HTTP $status $code from the relay's admin API"
      fi
    else
      fail "$label: the admin API answered ($status $code), but NIP-11 advertises none"
    fi
  elif [ "$CODE" = 404 ] && [ ! -s "$T/b" ]; then
    if [ "$ON" = 1 ]; then
      fail "$label: an empty 404, no admin API answered (not applied, or the gateway's catch-all)"
    else
      pass "$label: an empty 404, no admin API yet (the relay's fallback, or the gateway's catch-all: port tells which)"
    fi
  elif [ "$CODE" = 200 ]; then
    fail "$label: HTTP 200, accepted as staff (role $(field role)): this key must never be staff"
  elif [ "$CODE" = 401 ] && [ "$env" = unauthorized ] && [ "$code" = forbidden ]; then
    fail "$label: HTTP 401, the relay didn't accept the signature (is this computer's clock within 60 s?)"
  elif [ -n "$env" ]; then
    fail "$label: HTTP $CODE $env from the relay's admin API, expected $status $code"
  else
    fail "$label: $(why)"
  fi
}

unauth() {
  local url
  for url in "https://$B:8443/api/admin/v1/probe" "https://$B/api/admin/v1/probe"; do
    get "$url" -H 'Accept: application/json'
    admin "$url" 401 unauthorized "$url, no credential"
  done
}

no_ua() {
  local url="https://$B:8443/api/admin/v1/probe" cf
  get "$url" -H 'User-Agent:' -H 'Accept: application/json'
  if [ -z "$(envelope)" ] && cf=$(cloudflare); then
    fail "$url with no User-Agent: HTTP $CODE, $cf. Buzz's admin client sends no User-Agent, so Moderation would not appear"
    return
  fi
  admin "$url" 401 unauthorized "$url, no credential, no User-Agent"
}

# signed SECRET URL: a NIP-98 header for a GET of URL. The secret goes to nip98.py through a pipe from printf,
# a shell builtin: never in a process list or a temporary file.
signed() { printf '%s\n' "$1" | python3 "$LIB/nip98.py" GET "$2"; }

member() {
  local url="https://$B:8443/api/admin/v1/probe" auth
  # Signed for the URL the relay derives from BUZZ_ADMIN_HOST
  auth=$(signed "$SK" "$url") || { fail "nip98.py didn't sign"; return; }
  get "$url" -H 'User-Agent:' -H 'Accept: application/json' -H "Authorization: $auth"
  admin "$url" 403 forbidden "$url, signed by the member, no User-Agent"
  # The relay checks the roster before the Host, so the same signature on the public port is refused alike
  get "https://$B/api/admin/v1/probe" -H 'User-Agent:' -H 'Accept: application/json' -H "Authorization: $auth"
  admin "https://$B/api/admin/v1/probe" 403 forbidden "the same signature sent to https://$B/api/admin/v1/probe"
}

# owner: what Buzz's Moderation gets for the owner set on the page: the operator, through the relay's owner
# fallback (api/admin/auth.rs), on :8443 only
owner() {
  local url="https://$B:8443/api/admin/v1/probe" auth env
  auth=$(signed "$OSK" "$url") || { fail "nip98.py didn't sign"; return; }
  get "$url" -H 'User-Agent:' -H 'Accept: application/json' -H "Authorization: $auth"
  env=$(envelope)
  if [ "$ON" != 1 ]; then
    if [ "$CODE" = 404 ] && [ ! -s "$T/b" ]; then
      pass "$url, signed by the owner: an empty 404, no admin API yet"
    else
      fail "$url, signed by the owner, with moderation off: $(why)"
    fi
  elif [ "$CODE" = 200 ] && [ "$(field role) $(field source)" = "operator owner_fallback" ]; then
    pass "$url, signed by the owner, no User-Agent: HTTP 200, the operator as the relay's owner"
  elif [ "$CODE" = 200 ]; then
    fail "$url, signed by the owner: HTTP 200 as $(field role) from $(field source), not as the relay's owner: is this the page's owner?"
  elif [ "$CODE" = 403 ] && [ "$env" = forbidden ]; then
    fail "$url, signed by the owner: HTTP 403 forbidden: the key isn't the page's owner, or the Host lost its port"
  elif [ "$CODE" = 401 ] && [ "$env" = unauthorized ]; then
    fail "$url, signed by the owner: HTTP 401, the relay didn't accept the signature (is this computer's clock within 60 s?)"
  else
    fail "$url, signed by the owner: $(why)"
  fi
  # The relay's Host check: the owner's signature sent to the community's own address is refused
  get "https://$B/api/admin/v1/probe" -H 'User-Agent:' -H 'Accept: application/json' -H "Authorization: $auth"
  admin "https://$B/api/admin/v1/probe" 403 forbidden "the owner's signature sent to https://$B/api/admin/v1/probe"
}

# refused WHAT EXIT: names why the buzz CLI's command failed, from its JSON line on stderr
refused() {
  local what=$1 rc=$2 msg until
  msg=$(grep -o -E 'blocked: you are banned from this community|restricted: you are timed out until [0-9]+|relay_membership_required' "$T/err" | head -n 1)
  case "$msg" in
    'blocked: you are banned from this community')
      echo "BANNED  $what: relay error 403: $msg (CLI exit $rc)" ;;
    'restricted: you are timed out until '*)
      until=${msg##* }
      echo "TIMED OUT  $what: until $(date -r "$until" 2> /dev/null || date -d "@$until" 2> /dev/null || echo "$until") (CLI exit $rc)" ;;
    relay_membership_required)
      echo "NOT A MEMBER  $what: the member isn't in the community at $B: run add-member $B <keys>"; return 1 ;;
    *)
      echo "ERROR  $what (CLI exit $rc): $(head -c 300 "$T/err" | tr -d '\r')"; return 1 ;;
  esac
}

post() {
  local bz=${BUZZ_CLI:-} ch=${1:-} rc
  [ -n "$bz" ] && command -v "$bz" > /dev/null || die "set BUZZ_CLI to the buzz CLI"
  if [ -z "$ch" ]; then
    BUZZ_RELAY_URL="https://$B" BUZZ_PRIVATE_KEY="$SK" "$bz" channels create --name moderation-test --type stream --visibility open > "$T/out" 2> "$T/err"
    rc=$?
    if [ "$rc" != 0 ]; then refused "channels create" "$rc"; return; fi
    ch=$(python3 -I - "$T/out" << 'PY'
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("channel_id", ""))
except Exception:
    print("")
PY
)
    [ -n "$ch" ] || { echo "ERROR  channels create gave no channel_id"; return 1; }
    echo "INFO  the member made channel $ch: give it as the third argument next time"
  fi
  BUZZ_RELAY_URL="https://$B" BUZZ_PRIVATE_KEY="$SK" "$bz" messages send --channel "$ch" --content "moderation test $(date +%H:%M:%S)" > "$T/out" 2> "$T/err"
  rc=$?
  if [ "$rc" = 0 ]; then echo "POSTED  the member wrote in channel $ch"; else refused "messages send" "$rc"; fi
}

wait_live() {
  for _ in $(seq 1 60); do
    curl -fsS -m 5 "https://$B/_liveness" 2> /dev/null | grep -q ok && { pass "https://$B/_liveness answers"; return 0; }
    sleep 5
  done
  fail "https://$B/_liveness didn't answer within 5 minutes"
}

# --- The test Umbrel: inside umbrelOS, through tests/umbrel/ssh.sh or this machine's Docker -----------------

# umbrel SCRIPT: a shell script run inside the umbrelOS container
umbrel() { $U "docker exec $C sh -c $(printf '%q' "$1")"; }
# The app's page from inside its own container: it signs in with the app password from that container's own
# environment, posts its one argument to /moderation as the Settings form does, and prints the HTTP status. The
# program goes in single quotes, which any shell reads as they are, so it has none of its own.
PAGE_PY='import http.client, os, sys, urllib.parse
def post(path, form, cookie=""):
    c = http.client.HTTPConnection("127.0.0.1", 8080, timeout=30)
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if cookie:
        headers["Cookie"] = cookie
    c.request("POST", path, body=form, headers=headers)
    r = c.getresponse()
    r.read()
    return r.status, (r.getheader("Set-Cookie") or "").split(";")[0]
status, cookie = post("/login", urllib.parse.urlencode({"password": os.environ.get("APP_PASSWORD", "")}))
print(post("/moderation", sys.argv[1], cookie)[0] if status == 303 and cookie else "sign-in got HTTP %d" % status)'
page() { $U "docker exec $C docker exec buzz_web_1 python3 -c '$PAGE_PY' $(printf '%q' "$1")" 2> /dev/null; }
admin_line() { umbrel "docker exec buzz_web_1 sed -n '/^BUZZ_ADMIN_HOST/p' /settings/relay.env" 2> /dev/null; }
address() { umbrel "docker exec buzz_web_1 sed -n 's/^BUZZ_DOMAIN=//p' /settings/relay.env | head -n 1" 2> /dev/null; }
# saved NAME: one field of the page's setup.json (no secret in it); True or False for moderation, nothing for none
saved() {
  umbrel 'docker exec buzz_web_1 cat /settings/setup.json' 2> /dev/null |
    python3 -I -c 'import json, sys; v = json.load(sys.stdin).get(sys.argv[1]); print("" if v is None else v)' "$1" 2> /dev/null
}
# relay_env: the relay process's own admin settings, by name: the rest of its environment holds secrets
relay_env() {
  $U "docker exec -i $C sh -s" 2> /dev/null <<'ENV'
docker exec buzz_relay_1 bash -c 'for p in /proc/[0-9]*; do [ "$(cat $p/comm 2> /dev/null)" = buzz-relay ] && tr "\0" "\n" < $p/environ | grep -E "^(BUZZ_ADMIN_HOST|BUZZ_ADMIN_AUTH|BUZZ_ADMIN_TOKEN|RELAY_OPERATOR_PUBKEYS|BUZZ_ADMIN_WEB_DIR)="; done'
ENV
}

test_umbrel() {
  [ -n "${UMBREL_LOCAL:-}" ] || [ -r "$HERE/ssh.sh" ] || die "no $HERE/ssh.sh"
}

# on_domain: the page's option is the owner's own domain, at <B>
on_domain() {
  local mode now
  mode=$(saved mode)
  now=$(address)
  [ "$mode" = domain ] && [ "$now" = "$B" ] && return 0
  fail "the page's option is '$mode' at '$now', not the owner's own domain at $B: nothing changed"
  return 1
}

status() {
  local switch line env
  case "$(saved moderation)" in
    True) switch="on" ;;
    False) switch="off, after being on" ;;
    *) switch="never turned on" ;;
  esac
  line=$(admin_line)
  env=$(relay_env | paste -s -d ' ' -)
  echo "page:     option $(saved mode), moderation $switch"
  echo "address:  $(address)"
  echo "settings: ${line:-no BUZZ_ADMIN_HOST line}"
  echo "relay:    ${env:-no admin settings}"
  echo "app:      $(umbrel 'umbreld client apps.state.query --appId buzz 2>&1' | tr -d '\n ')"
}

on() {
  local code line
  on_domain || return 1
  code=$(page "moderation=on")
  line=$(admin_line)
  if [ "$code" = 303 ] && [ "$line" = "BUZZ_ADMIN_HOST=$B:8443" ]; then
    pass "the page turned moderation on: BUZZ_ADMIN_HOST=$B:8443 in the relay's settings"
  else
    fail "turning it on got [$code], and the relay's settings say [$line]"
    return 1
  fi
  advertised "https://$B:8443" || fail "NIP-11 didn't advertise https://$B:8443 within 2 minutes"
  line=$(relay_env)
  [ "$line" = "BUZZ_ADMIN_HOST=$B:8443" ] &&
    pass "the relay process has that alone: no open mode, no other operators, no browser dashboard" ||
    fail "the relay process's admin settings: [$(printf '%s' "$line" | tr '\n' ' ')]"
  wait_live
  nip11
}

off() {
  local code line
  on_domain || return 1
  code=$(page "")
  line=$(admin_line)
  if [ "$code" = 303 ] && [ -z "$line" ] && [ "$(saved moderation)" = False ]; then
    pass "the page turned moderation off: the line is gone, and setup.json keeps \"moderation\": false"
  else
    fail "turning it off got [$code], and the relay's settings say [$line]"
    return 1
  fi
  advertised "" || fail "NIP-11 still advertises an admin API 2 minutes after turning it off"
  line=$(relay_env)
  [ -z "$line" ] && pass "the relay process has no admin settings" || fail "the relay process still has [$(printf '%s' "$line" | tr '\n' ' ')]"
  wait_live
  nip11
}

add_member() {
  local npub
  npub=$(python3 "$LIB/npub.py" "$HEX")
  # buzz-admin's own errors stay hidden: a database error can name the database
  if $U "docker exec -i $C sh -s -- $B $npub" << 'SH'; then
set -eu
b=$1
npub=$2
d=$(docker exec buzz_web_1 sed -n 's/^BUZZ_DOMAIN=//p' /settings/relay.env | head -n 1)
if [ "$d" != "$b" ]; then echo "the community's address is '$d', not '$b': nobody added" >&2; exit 1; fi
docker exec buzz_relay_1 bash -c "set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin add-member --pubkey $npub" 2> /dev/null | grep -E '^(added|already a member)'
SH
    pass "the member belongs to the community at $B"
  else
    fail "buzz-admin didn't add the member"
  fi
}

main() {
  local cmd=${1:-}
  shift || true
  case "$cmd" in
    check)
      need_host "${1:-}"; need_keys "${2:-}"; [ -n "${3:-}" ] && need_owner "$3"
      nip11; port; unauth; no_ua; member; [ -n "$OSK" ] && owner; summary ;;
    nip11) need_host "${1:-}"; nip11; summary ;;
    port | unauth | no-ua) need_host "${1:-}"; nip11; "${cmd/-/_}"; summary ;;
    member) need_host "${1:-}"; need_keys "${2:-}"; nip11; member; summary ;;
    owner) need_host "${1:-}"; need_owner "${2:-}"; nip11; owner; summary ;;
    npub) need_keys "${1:-}"; python3 "$LIB/npub.py" "$HEX" ;;
    post) need_host "${1:-}"; need_keys "${2:-}"; post "${3:-}" ;;
    status) test_umbrel; status ;;
    on) test_umbrel; need_host "${1:-}"; on; summary ;;
    off) test_umbrel; need_host "${1:-}"; off; summary ;;
    add-member) test_umbrel; need_host "${1:-}"; need_keys "${2:-}"; add_member; summary ;;
    *) sed -n '2,30p' "$0"; exit 2 ;;
  esac
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
