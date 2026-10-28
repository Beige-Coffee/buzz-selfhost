#!/usr/bin/env bash
# The whole Umbrel test on a fresh DigitalOcean droplet, unattended: the droplet, umbrelOS 2.0.0 in
# Docker on it, Buzz Relay installed through Umbrel, e2e.sh, then the app's Cloudflare tunnel and both
# Tailscale options up to their sign-in links. The droplet is deleted at the end, whatever happens.
# About $0.10 a run. Needs what server.py and e2e.sh need: ~/.buzz-test/do-token, ~/.buzz-test/id_ed25519
# and BUZZ_CLI.
#   BUZZ_CLI=path/to/buzz bash tests/umbrel/droplet-run.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
T=tests/umbrel
trap 'echo; echo "== Deleting the droplet"; python3 $T/server.py down' EXIT

echo "== Droplet"
python3 $T/server.py up || exit 1
bash $T/ssh.sh 'uname -m'

echo "== umbrelOS and Buzz Relay, installed through Umbrel"
if ! bash $T/install.sh 2.0.0; then
  echo "INFO  the install failed; Umbrel's log around it:"
  bash $T/ssh.sh "docker exec umbrelos-test journalctl -u umbrel --no-pager -n 400 2>/dev/null" |
    grep -v -E 'Downloaded [0-9.]+% of' | grep -i -E -B2 -A8 'error|denied|toomanyrequests|rate limit|failed|manifest|pull' | tail -60
  echo "INFO  retrying the install once, a minute later"
  sleep 60
  bash $T/ssh.sh "docker exec umbrelos-test umbreld client apps.install.mutate --appId buzz > /dev/null 2>&1; docker exec umbrelos-test umbreld client apps.state.query --appId buzz" |
    tr -d '\n ' | grep -q '"state":"ready"' && echo "INFO  the retry installed it" || { echo "FAIL  install, twice"; exit 1; }
fi
bash $T/ssh.sh "docker exec umbrelos-test sh -c 'for c in buzz_relay_1 buzz_cloudflared_1 buzz_tailscale_1 buzz_web_1; do printf \"%s \" \$c; docker image inspect -f \"{{.Architecture}}\" \$(docker inspect -f \"{{.Image}}\" \$c); done'"

echo "== End to end"
BUZZ_CLI=${BUZZ_CLI:?set BUZZ_CLI to the buzz CLI} bash $T/e2e.sh

echo "== Cloudflare and Tailscale, up to their sign-in links"
bash $T/ssh.sh "docker exec -i umbrelos-test sh -s" <<'CHECKS'
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; }
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1)
J=/tmp/ts-check-jar; rm -f $J
docker exec buzz_web_1 printenv APP_PASSWORD | tr -d '\n' | curl -s -o /dev/null -c $J --data-urlencode password@- http://$ip:8080/login
wait_for() { for i in $(seq 1 40); do eval "$1" && return 0; sleep 3; done; return 1; }
wait_for 'docker exec buzz_web_1 grep -q "argotunnel" /settings/cloudflare-login.log 2> /dev/null' &&
  pass "your own domain: the app's Cloudflare tunnel waits for a sign-in, with Cloudflare's link" ||
  fail "no Cloudflare sign-in link"
cur=$(docker exec buzz_web_1 sed -n 's/^BUZZ_DOMAIN=//p' /settings/relay.env)
code=$(curl -s -o /dev/null -w '%{http_code}' -b $J -c $J --data "mode=funnel&confirm=$cur" http://$ip:8080/address)
[ "$code" = 303 ] && pass "switching to the free Tailscale address is accepted" || fail "switching to funnel got HTTP $code"
wait_for 'docker exec buzz_web_1 grep -q "login.tailscale.com/a/" /settings/tailscale-status.json 2> /dev/null' &&
  pass "Tailscale waits for a sign-in, with a link (funnel)" || fail "no Tailscale sign-in link (funnel)"
wait_for '! docker exec buzz_web_1 test -e /settings/cloudflare-state' &&
  pass "the Cloudflare tunnel turns off and waits" || fail "the Cloudflare tunnel didn't turn off"
code=$(curl -s -o /dev/null -w '%{http_code}' -b $J -c $J --data "mode=private&ack=yes" http://$ip:8080/address)
[ "$code" = 303 ] && pass "switching to the private network is accepted" || fail "switching to private got HTTP $code"
page=$(curl -s -b $J http://$ip:8080/)
echo "$page" | grep -q "Connect your private network" && echo "$page" | grep -q "Sign in to Tailscale" &&
  pass "the page shows the private network's sign-in" || fail "the private network's sign-in isn't on the page"
rm -f $J
CHECKS
