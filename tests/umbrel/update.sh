#!/usr/bin/env bash
# The update path on the test Umbrel: a member posts and uploads, the package moves to a newer relay
# image under a new manifest version, Umbrel updates the app, and then the relay must answer at the
# same address with the message, the file, the settings and the member intact.
# Usage: BUZZ_CLI=path/to/buzz bash tests/umbrel/update.sh <tag> <index-digest>
#        BUZZ_CLI=path/to/buzz PKG_DIR=umbrel/buzz bash tests/umbrel/update.sh   # update to that package as is
# The member is made here and added with buzz-admin, unless MEMBER_KEYS names a file of "secret hex"
# for an existing one.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
U="bash $HERE/ssh.sh"
[ -n "${UMBREL_LOCAL:-}" ] && U="bash -c"  # this machine's Docker
C=${UMBREL_CONTAINER:-umbrelos-test}
T=$HERE/..
SKILL=$HERE/../../skills/self-host-buzz
BZ=${BUZZ_CLI:?set BUZZ_CLI to the buzz CLI}
TAG=${1:-}
DIGEST=${2:-}
[ -n "${PKG_DIR:-}" ] || [ -n "$DIGEST" ] || { echo "usage: update.sh <tag> <index-digest>, or PKG_DIR=<package> update.sh"; exit 2; }
DOMAIN=$(cat "${DOMAIN_FILE:-$HOME/.buzz-test/umbrel-domain}")
if [ -n "${MEMBER_KEYS:-}" ]; then read -r SK _ < "$MEMBER_KEYS"; else SK=""; fi
TMP=$(mktemp -d)
PASS=0 FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
umbrel() { $U "docker exec $C sh -c $(printf '%q' "$1")"; }
as() { BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$SK" "$BZ" "$@"; }
image() { umbrel "docker inspect -f '{{.Config.Image}}' buzz_relay_1" | sed 's/@.*//'; }

echo "== Before the update"
# setup may have just restarted the relay with its settings: wait until it answers
for _ in $(seq 1 60); do
  curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null | grep -q ok && break
  sleep 5
done
if [ -z "$SK" ]; then
  read -r SK HEX <<<"$(python3 "$T/lib/keygen.py")"
  umbrel "docker exec buzz_relay_1 bash -c 'set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin add-member --pubkey $(python3 "$T/lib/npub.py" "$HEX")' > /dev/null 2>&1"
fi
echo "INFO  relay image $(image)"
as channels create --name update-test --type stream --visibility open > "$TMP/ch.json" 2>&1
CH=$(field channel_id < "$TMP/ch.json")
as messages send --channel "$CH" --content "posted before the update" > /dev/null 2>&1 && pass "member posts" || fail "member posts: $(head -c 200 "$TMP/ch.json")"
python3 "$T/lib/png.py" "$TMP/pic.png"
SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as upload file --file "$TMP/pic.png" > "$TMP/up.json" 2>&1
URL=$(field url < "$TMP/up.json")
[ "$URL" = "https://$DOMAIN/media/$SHA.png" ] && pass "member uploads a file" || fail "upload: $(head -c 200 "$TMP/up.json")"

mkdir -p "$TMP/pkg"
if [ -n "${PKG_DIR:-}" ]; then
  cp -R "$PKG_DIR" "$TMP/pkg/buzz"
  TAG=$(grep -o -m1 -E 'ghcr\.io/block/buzz:sha-[0-9a-f]+' "$TMP/pkg/buzz/docker-compose.yml" | sed 's|.*:||')
else
cp -R "$HERE/../../umbrel/buzz" "$TMP/pkg/buzz"
python3 - "$TMP/pkg/buzz" "$TAG" "$DIGEST" <<'PY'
import re, sys
root, tag, digest = sys.argv[1:]
p = root + "/docker-compose.yml"
t = open(p).read()
t = re.sub(r"ghcr\.io/block/buzz:sha-[0-9a-f]+@sha256:[0-9a-f]{64}", "ghcr.io/block/buzz:" + tag + "@" + digest, t)
open(p, "w").write(t)
p = root + "/umbrel-app.yml"
t = open(p).read()
t = re.sub(r'(?m)^version: ".*"$', 'version: "' + tag.removeprefix("sha-") + '"', t)
open(p, "w").write(t)
PY
fi
echo "== Update through Umbrel to $TAG"
STORE=/home/umbrel/umbrel/app-stores/getumbrel-umbrel-apps-github-53f74447
if [ -n "${UMBREL_LOCAL:-}" ]; then UPD=$HOME/.buzz-test/umbrel-update; else UPD=/root/buzz-update; fi
COPYFILE_DISABLE=1 tar --no-xattrs -C "$TMP/pkg" -czf - buzz | $U "rm -rf $UPD && mkdir -p $UPD && tar -C $UPD -xzf - 2>/dev/null &&
  tar --no-xattrs -C $UPD -cf - buzz | docker exec -i $C sh -c 'rm -rf $STORE/buzz && tar -C $STORE -xf - && find $STORE/buzz -name .gitkeep -delete && chown -R 1000:1000 $STORE/buzz'"
umbrel 'umbreld client apps.update.mutate --appId buzz > /dev/null 2>&1'
for _ in $(seq 1 60); do
  state=$(umbrel 'umbreld client apps.state.query --appId buzz 2>&1' | tr -d '\n ')
  [[ $state == *'"ready"'* ]] && break
  sleep 5
done
[[ $state == *'"ready"'* ]] && pass "Umbrel updated the app and reports it ready" || fail "state after update: $state"
[[ $(image) == "ghcr.io/block/buzz:$TAG" ]] && pass "the relay now runs $TAG" || fail "the relay runs $(image)"

echo "== After the update"
for _ in $(seq 1 60); do
  curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null | grep -q ok && break
  sleep 5
done
bash "$SKILL/scripts/check-relay.sh" "https://$DOMAIN" > "$TMP/check.txt" 2>&1
cat "$TMP/check.txt"
PASS=$((PASS + $(grep -c '^PASS' "$TMP/check.txt"))) FAIL=$((FAIL + $(grep -c '^FAIL' "$TMP/check.txt")))
as --format compact messages get --channel "$CH" --limit 20 2>&1 | grep -q "posted before the update" &&
  pass "the message from before the update is still there" || fail "the message from before the update"
rm -f "$TMP/got.png"
as media get "$URL" -o "$TMP/got.png" > /dev/null 2>&1 && [ "$(shasum -a 256 "$TMP/got.png" | cut -c1-64)" = "$SHA" ] &&
  pass "the file from before the update comes back intact" || fail "the file from before the update"
as messages send --channel "$CH" --content "posted after the update" > /dev/null 2>&1 &&
  pass "the member still belongs and posts" || fail "the member posts after the update"

echo
echo "passed: $PASS  failed: $FAIL"
rm -rf "$TMP"
[ "$FAIL" = 0 ]
