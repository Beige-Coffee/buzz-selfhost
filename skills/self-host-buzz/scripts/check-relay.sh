#!/usr/bin/env bash
# Check a running relay from this machine: it answers, reports its version, has what Buzz 1.0
# needs (the relay's identity and channel labels), takes WebSocket connections, lets Buzz 0.X in,
# when it names a pairing service, that phones can reach it, and whether it offers phone
# notifications. Optionally check that ports on the server's public address are closed from outside.
#
# Usage: check-relay.sh <origin> [public-ip [port ...]]
#   origin     https://buzz.example.org, or https://localhost for a local test
#   public-ip  the server's public address; checks the listed ports are closed (default: 3000 5000)
#
#   check-relay.sh https://buzz.example.org 203.0.113.10                       # public server
#   check-relay.sh https://buzz.tail1234.ts.net 203.0.113.10 80 443 3000 5000 # private network
#   CA_FILE=local-ca.crt check-relay.sh https://localhost                      # local test
#
# CA_FILE=<file> trusts that certificate authority, and only it, for the relay's certificate: the
# local test's, before this computer trusts it.
# RESOLVE_IP=<server IP> checks that server directly, for when this computer still has the domain's
# old address cached (a wildcard record or an earlier one): RESOLVE_IP=203.0.113.10 check-relay.sh ...
#
# Prints PASS or FAIL per check (SKIP for phone pairing or notifications on a relay without them) and exits non-zero
# if any failed. Prints no secrets.
set -u
ORIGIN=${1:?usage: check-relay.sh <origin> [public-ip [port ...]]}
ORIGIN=${ORIGIN%/}
IP=${2:-}
shift $(( $# < 2 ? $# : 2 ))
PORTS=${*:-3000 5000}
failed=0
# with RESOLVE_IP, every request to the relay's own name goes to that address
host=${ORIGIN#*://}; host=${host%%/*}
case $ORIGIN in https://*) port=443 ;; *) port=80 ;; esac
CURL_OPTS=()
if [ -n "${RESOLVE_IP:-}" ]; then
  CURL_OPTS=(--resolve "${host%%:*}:${host##*:}:$RESOLVE_IP")
  case $host in *:*) ;; *) CURL_OPTS=(--resolve "$host:$port:$RESOLVE_IP") ;; esac
  echo "INFO  checking $host at $RESOLVE_IP directly (RESOLVE_IP)"
fi
# with CA_FILE, curl trusts that authority alone for the relay's certificate
if [ -n "${CA_FILE:-}" ]; then
  [ -r "$CA_FILE" ] || { echo "FAIL  CA_FILE $CA_FILE can't be read"; exit 1; }
  CURL_OPTS+=(--cacert "$CA_FILE")
  echo "INFO  trusting only the certificate authority in $CA_FILE (CA_FILE)"
fi
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

# A new certificate can take a minute or more on the first request: retry for up to three minutes.
live=""
for _ in $(seq 1 36); do
  live=$(curl -fsS -m 10 ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} "$ORIGIN/_liveness" 2>/dev/null) && break
  sleep 5
done
[ "$live" = ok ] && pass "liveness: ok" || fail "liveness: no answer from $ORIGIN/_liveness"

info=$(curl -fsS -m 10 ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} -H 'Accept: application/nostr+json' "$ORIGIN/" 2>/dev/null)
field() { printf '%s' "$info" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$1') or '')" 2>/dev/null; }
version=$(field version)
[ -n "$version" ] && pass "relay version $version" || fail "relay info (NIP-11) didn't answer"

# Buzz 1.0 joins only a relay that names its own identity (set by BUZZ_RELAY_PRIVATE_KEY), and its
# New chat needs channel labels (nip-cl), which relay images have from 2026-10-15 on.
self=$(field self)
if printf '%s' "$self" | grep -qE '^[0-9a-f]{64}$'; then
  pass "relay identity (Buzz 1.0 needs it to join)"
else
  fail "relay identity: the relay names none, so Buzz 1.0 can't join (is BUZZ_RELAY_PRIVATE_KEY set?)"
fi
ext() { printf '%s' "$info" | python3 -c "import json,sys; sys.exit(0 if '$1' in (json.load(sys.stdin).get('supported_extensions') or []) else 1)" 2>/dev/null; }
ext nip-cl && pass "channel labels (nip-cl): Buzz 1.0 can start chats" ||
  fail "channel labels (nip-cl): missing, so Buzz 1.0's New chat fails; it needs a relay image from 2026-10-15 or later"

# Buzz joins over a WebSocket: the upgrade must come back 101. The connection then stays
# open, so curl stops at its time limit; the status code is what counts. The short limits keep a
# private server's full check under 30 seconds, which some agents' command tools stop at.
upgrade() {
  curl -s --http1.1 -m 3 ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$1" 2>/dev/null
}
ws=$(upgrade "$ORIGIN/")
[ "$ws" = 101 ] && pass "WebSocket upgrade (what Buzz joins over)" || fail "WebSocket upgrade: HTTP ${ws:-no answer}"

# Phones pair through the service the relay names; the desktop app shows the code, the phone scans it.
pair=$(field pairing_relay_url)
if [ -n "$pair" ]; then
  ws=$(upgrade "$(printf '%s' "$pair" | sed -e 's|^wss://|https://|' -e 's|^ws://|http://|')")
  [ "$ws" = 101 ] && pass "phone pairing at $pair" || fail "phone pairing at $pair: HTTP ${ws:-no answer}"
else
  echo "SKIP  phone pairing: the relay names no pairing service"
fi

# Phone notifications: with BUZZ_PUSH_ENABLED=true the relay offers buzz-push-v1, and the Buzz phone
# app (0.25 or later) asks it for wakes, which go through Block's gateway (push.buzz.xyz).
if ext buzz-push-v1; then
  pass "phone notifications (buzz-push-v1)"
else
  echo "SKIP  phone notifications: off (BUZZ_PUSH_ENABLED isn't true)"
fi

allowed=$(curl -s -m 10 ${CURL_OPTS[@]+"${CURL_OPTS[@]}"} -o /dev/null -D - -X OPTIONS "$ORIGIN/info" \
  -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' |
  tr -d '\r' | awk 'tolower($1) == "access-control-allow-origin:" {print $2}')
[ "$allowed" = "tauri://localhost" ] && pass "Buzz 0.X allowed (CORS; Buzz 1.0 doesn't need it)" ||
  fail "Buzz 0.X not allowed: BUZZ_CORS_ORIGINS needs tauri://localhost,http://tauri.localhost"

if [ -n "$IP" ]; then
  for port in $PORTS; do
    # a plain TCP connect: any listener counts as open, whatever it would answer
    state=$(python3 -c 'import socket,sys
s = socket.socket(); s.settimeout(3)
try:
    s.connect((sys.argv[1], int(sys.argv[2]))); print("open")
except OSError:
    print("closed")' "$IP" "$port")
    [ "$state" = closed ] && pass "port $port on $IP closed from outside" ||
      fail "port $port on $IP is open from outside: it should be closed"
  done
fi
exit $failed
