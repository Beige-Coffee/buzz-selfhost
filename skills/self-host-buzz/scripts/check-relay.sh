#!/usr/bin/env bash
# Check a running relay from this machine: it answers, reports its version, takes WebSocket
# connections, lets Buzz Desktop in, and, when it names a pairing service, that phones can reach it.
# Optionally check that ports on the server's public address are closed from outside.
#
# Usage: check-relay.sh <origin> [public-ip [port ...]]
#   origin     https://buzz.example.org, or http://127.0.0.1:3000 for a local test
#   public-ip  the server's public address; checks the listed ports are closed (default: 3000)
#
#   check-relay.sh https://buzz.example.org 203.0.113.10                       # public server
#   check-relay.sh https://buzz.tail1234.ts.net 203.0.113.10 80 443 3000      # private network
#
# Prints PASS or FAIL per check (SKIP for phone pairing on a relay without it) and exits non-zero
# if any failed. Prints no secrets.
set -u
ORIGIN=${1:?usage: check-relay.sh <origin> [public-ip [port ...]]}
ORIGIN=${ORIGIN%/}
IP=${2:-}
shift $(( $# < 2 ? $# : 2 ))
PORTS=${*:-3000}
failed=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failed=1; }

# A new certificate can take a minute or more on the first request: retry for up to three minutes.
live=""
for _ in $(seq 1 36); do
  live=$(curl -fsS -m 10 "$ORIGIN/_liveness" 2>/dev/null) && break
  sleep 5
done
[ "$live" = ok ] && pass "liveness: ok" || fail "liveness: no answer from $ORIGIN/_liveness"

info=$(curl -fsS -m 10 -H 'Accept: application/nostr+json' "$ORIGIN/" 2>/dev/null)
field() { printf '%s' "$info" | python3 -c "import json,sys; print(json.load(sys.stdin).get('$1') or '')" 2>/dev/null; }
version=$(field version)
[ -n "$version" ] && pass "relay version $version" || fail "relay info (NIP-11) didn't answer"

# Buzz Desktop joins over a WebSocket: the upgrade must come back 101. The connection then stays
# open, so curl stops at its time limit; the status code is what counts.
upgrade() {
  curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$1" 2>/dev/null
}
ws=$(upgrade "$ORIGIN/")
[ "$ws" = 101 ] && pass "WebSocket upgrade (what Buzz Desktop joins over)" || fail "WebSocket upgrade: HTTP ${ws:-no answer}"

# Phones pair through the service the relay names; Desktop shows the code, the phone scans it.
pair=$(field pairing_relay_url)
if [ -n "$pair" ]; then
  ws=$(upgrade "$(printf '%s' "$pair" | sed -e 's|^wss://|https://|' -e 's|^ws://|http://|')")
  [ "$ws" = 101 ] && pass "phone pairing at $pair" || fail "phone pairing at $pair: HTTP ${ws:-no answer}"
else
  echo "SKIP  phone pairing: the relay names no pairing service"
fi

allowed=$(curl -s -m 10 -o /dev/null -D - -X OPTIONS "$ORIGIN/info" \
  -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' |
  tr -d '\r' | awk 'tolower($1) == "access-control-allow-origin:" {print $2}')
[ "$allowed" = "tauri://localhost" ] && pass "Buzz Desktop allowed (CORS)" ||
  fail "Buzz Desktop not allowed: BUZZ_CORS_ORIGINS needs tauri://localhost,http://tauri.localhost"

if [ -n "$IP" ]; then
  for port in $PORTS; do
    # a plain TCP connect: any listener counts as open, whatever it would answer
    state=$(python3 -c 'import socket,sys
s = socket.socket(); s.settimeout(5)
try:
    s.connect((sys.argv[1], int(sys.argv[2]))); print("open")
except OSError:
    print("closed")' "$IP" "$port")
    [ "$state" = closed ] && pass "port $port on $IP closed from outside" ||
      fail "port $port on $IP is open from outside: it should be closed"
  done
fi
exit $failed
