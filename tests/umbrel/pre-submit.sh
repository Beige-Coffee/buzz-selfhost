#!/usr/bin/env bash
# The longer test, for before submitting the package to Umbrel or an update to it. Unattended, on a
# fresh DigitalOcean droplet that's deleted at the end whatever happens, about $0.10 a run:
#   umbrelOS 2.0.0 with Buzz Relay installed through Umbrel, and its memory before setup;
#   e2e.sh, then memory with a community and under a load of 20 members sending 200 messages;
#   a 20 MB image and a real 96 MB video up and back, and the size limits;
#   what the community's public address shows, and secrets in the app's logs;
#   a restart of the whole Umbrel;
#   Umbrel's own backup, restored onto a second umbrelOS that was never set up;
#   an uninstall, then an install and e2e.sh again.
# Needs what droplet-run.sh needs, and ffmpeg on this machine for the video (skipped without it).
#   BUZZ_CLI=path/to/buzz bash tests/umbrel/pre-submit.sh
# UMBREL_LOCAL=1 runs it on this machine's umbrelOS instead, with the package already in its App Store
# (install.sh puts it there), without the restart and the restore, and uninstalls the app at the end.
set -uo pipefail
cd "$(dirname "$0")/../.."
T=tests/umbrel; L=tests/lib
BZ=${BUZZ_CLI:?set BUZZ_CLI to the buzz CLI}
C=${UMBREL_CONTAINER:-umbrelos-test}; B=umbrelos-restored; VERSION=2.0.0
TMP=$(mktemp -d)
PASS=0 FAIL=0
pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
# host runs a command where Docker runs umbrelOS; umbrel CMD [CONTAINER] runs one inside umbrelOS
if [ -n "${UMBREL_LOCAL:-}" ]; then host() { bash -c "$1"; }; else host() { bash $T/ssh.sh "$1"; }; fi
umbrel() { host "docker exec ${2:-$C} sh -c $(printf '%q' "$1")"; }
state() { umbrel 'umbreld client apps.state.query --appId buzz 2>&1' "${1:-$C}" | tr -d '\n '; }
footprint() {  # each of the app's containers, then their memory together
  umbrel "docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' | grep '^buzz_' | sort" "${1:-$C}" |
    awk '{print; m=$3; u=m; gsub(/[0-9.]/,"",u); gsub(/[A-Za-z]/,"",m); if (u=="GiB") m*=1024; else if (u=="KiB") m/=1024; t+=m} END {printf "TOTAL %.0f MiB\n", t}'
}
counts() {  # the rows in each table of the relay's database that has any
  host "docker exec -i ${1:-$C} docker exec -i buzz_postgres_1 sh -s" <<'SQL'
U=${POSTGRES_USER:-postgres}; D=${POSTGRES_DB:-$U}
for t in $(psql -U "$U" -d "$D" -Atc "select tablename from pg_tables where schemaname = current_schema() order by 1"); do
  n=$(psql -U "$U" -d "$D" -Atc "select count(*) from \"$t\""); [ "$n" != 0 ] && printf "%s=%s " "$t" "$n"
done
echo
SQL
}
setup_hash() { umbrel 'docker exec buzz_web_1 cat /settings/setup.json 2>/dev/null' "${1:-$C}" | shasum -a 256 | cut -c1-12; }
relay() {  # relay PATH [CONTAINER]: the HTTP status the relay gives the community's address, inside umbrelOS
  umbrel "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_relay_1); curl -s -o /dev/null -w '%{http_code}' -m 10 -H 'Host: $DOMAIN' http://\$ip:3000$1" "${2:-$C}"
}
e2e() {  # e2e.sh with this run's test owner, counted in this run's totals
  BUZZ_CLI=$BZ OWNER_KEYS=$TMP/owner.keys DOMAIN_FILE=$TMP/domain bash $T/e2e.sh 2>&1 | tee $TMP/e2e.txt
  PASS=$((PASS + $(grep -c '^PASS' $TMP/e2e.txt))) FAIL=$((FAIL + $(grep -c '^FAIL' $TMP/e2e.txt)))
  DOMAIN=$(cat $TMP/domain)
}
as() { local sk=$1; shift; BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"; }
finish() {
  rm -rf "$TMP"
  if [ -n "${UMBREL_LOCAL:-}" ]; then
    umbrel 'docker rm -f buzz-test-tunnel > /dev/null 2>&1; umbreld client apps.uninstall.mutate --appId buzz > /dev/null 2>&1'
  else
    echo; echo "== Deleting the droplet"; python3 $T/server.py down
  fi
}
trap finish EXIT

if [ -z "${UMBREL_LOCAL:-}" ]; then
  echo "== Droplet"
  python3 $T/server.py up || exit 1
  bash $T/ssh.sh 'uname -m'
  echo "== umbrelOS and Buzz Relay, installed through Umbrel"
  if ! bash $T/install.sh $VERSION; then
    echo "INFO  retrying the install once, a minute later"
    sleep 60
    umbrel 'umbreld client apps.install.mutate --appId buzz > /dev/null 2>&1'
    [[ $(state) == *'"ready"'* ]] && echo "INFO  the retry installed it" || { fail "install, twice"; exit 1; }
  fi
else
  echo "== Buzz Relay, installed through Umbrel"
  umbrel 'umbreld client apps.install.mutate --appId buzz > /dev/null 2>&1'
  for _ in $(seq 1 60); do [[ $(state) == *'"ready"'* ]] && break; sleep 5; done
  [[ $(state) == *'"ready"'* ]] || { fail "install: $(state)"; exit 1; }
fi
echo "== Memory, installed, before setup (after two minutes)"
sleep 120
footprint

echo "== End to end"
python3 $L/keygen.py > $TMP/owner.keys
e2e
[ -n "$DOMAIN" ] || exit 1

echo "== What each service can reach, and how fast the page stops"
# After e2e.sh the app's own Cloudflare tunnel waits for a sign-in, having named itself in its folder.
host "docker exec -i $C sh -s" > $TMP/reach.txt <<'REACH'
for i in $(seq 1 20); do docker exec buzz_cloudflared_1 test -s /cloudflare/tunnel-name && break; sleep 3; done
docker exec buzz_cloudflared_1 test -s /cloudflare/tunnel-name && echo "OWN cloudflared"
docker exec buzz_web_1 test -e /settings/cloudflare && echo "SHARED settings/cloudflare"
for c in $(docker ps --format '{{.Names}}' | grep '^buzz_'); do
  docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' $c | grep -q '/data/cloudflare ' && echo "MOUNTS $c"
done
for c in $(docker ps --format '{{.Names}}' | grep '^buzz_'); do
  for m in $(docker inspect -f '{{range .Mounts}}{{.Source}}={{.RW}} {{end}}' $c); do
    case "$m" in
      */data/settings=*) echo "SETTINGS $c ${m##*=}" ;;
      */data/tailscale-control=*) echo "TSCONTROL $c" ;;
      */data/cloudflare-control=*) echo "CFCONTROL $c" ;;
    esac
  done
done
for c in buzz_web_1 buzz_relay_1 buzz_pair_1 buzz_tailscale_1 buzz_gateway_1; do
  [ "$(docker inspect -f '{{.HostConfig.Init}}' $c)" = true ] || echo "NOINIT $c"
done
s=$(date +%s); docker stop buzz_web_1 > /dev/null; echo "STOPPED $(( $(date +%s) - s ))"
docker start buzz_web_1 > /dev/null
REACH
cat $TMP/reach.txt
grep -q '^OWN cloudflared' $TMP/reach.txt && ! grep -q '^SHARED' $TMP/reach.txt &&
  [ "$(grep '^MOUNTS' $TMP/reach.txt)" = "MOUNTS buzz_cloudflared_1" ] &&
  pass "Cloudflare's sign-in and tunnel files are in a folder only its own service mounts" ||
  fail "Cloudflare's sign-in folder is shared or missing"
[ "$(grep '^SETTINGS' $TMP/reach.txt | sort | tr '\n' ' ')" = "SETTINGS buzz_gateway_1 false SETTINGS buzz_relay_1 false SETTINGS buzz_web_1 true " ] &&
  [ "$(grep '^TSCONTROL' $TMP/reach.txt | sort | tr '\n' ' ')" = "TSCONTROL buzz_tailscale_1 TSCONTROL buzz_web_1 " ] &&
  [ "$(grep '^CFCONTROL' $TMP/reach.txt | sort | tr '\n' ' ')" = "CFCONTROL buzz_cloudflared_1 CFCONTROL buzz_web_1 " ] &&
  pass "only the page writes the relay's settings, and each helper shares only its own folder with the page" ||
  fail "a settings folder is shared more widely: $(grep -E '^(SETTINGS|TSCONTROL|CFCONTROL)' $TMP/reach.txt | tr '\n' ' ')"
grep -q '^NOINIT' $TMP/reach.txt && fail "a service runs without an init process" ||
  pass "the page, relay, pairing, Tailscale and gateway services run under an init process"
[ "$(sed -n 's/^STOPPED //p' $TMP/reach.txt)" -lt 5 ] 2> /dev/null && pass "the setup page stops in under 5 s" ||
  fail "the setup page took $(sed -n 's/^STOPPED //p' $TMP/reach.txt) s to stop"

echo "== Another app on this Umbrel, trying the app's services directly"
# A throwaway container on Umbrel's shared network, as any other app's would be, with no password or key
OWNER_HEX=$(awk '{print $2}' $TMP/owner.keys)
host "docker exec -i -e DOMAIN=$DOMAIN -e OWNER_HEX=$OWNER_HEX $C sh -s" > $TMP/hostile.txt <<'HOSTILE'
net=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' buzz_web_1 | cut -d' ' -f1)
img() { docker inspect -f '{{.Config.Image}}' "$1"; }
docker run --rm --network "$net" -e DOMAIN -e OWNER_HEX --entrypoint python3 "$(img buzz_web_1)" -c '
import http.client, json, os, socket, time
D, O = os.environ["DOMAIN"], os.environ["OWNER_HEX"]
def req(host, port, method, path, headers=None, body=None):
    try:
        c = http.client.HTTPConnection(host, port, timeout=8)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse(); r.read(4096); c.close()
        return r.status, r
    except Exception:
        return None, None
def dropped(s):
    try:
        return s.recv(10) == b""
    except OSError:
        return False
print("PAGE_GET", req("buzz_web_1", 8080, "GET", "/")[0])
print("PAGE_SAVE", req("buzz_web_1", 8080, "POST", "/save", {"Content-Type": "application/x-www-form-urlencoded"}, "owner=x")[0])
start = time.time()
s = socket.create_connection(("buzz_web_1", 8080), timeout=8)
s.sendall(b"POST /login HTTP/1.1\r\nHost: x\r\nContent-Length: -1\r\n\r\n")
first = s.recv(12); s.close()
print("PAGE_NEGLEN", first.decode(errors="replace").split(" ")[-1] if first else "none", int(time.time() - start))
st, r = req("buzz_web_1", 8080, "GET", "/login")
print("PAGE_FRAME", r.getheader("X-Frame-Options") if r else None)
idle = [socket.create_connection(("buzz_web_1", 8080), timeout=30) for _ in range(20)]
for s in idle:
    s.sendall(b"GET / HTTP/1.1\r\nHost: x\r\n")
time.sleep(23)
for s in idle:
    s.settimeout(2)
print("PAGE_IDLE", sum(dropped(s) for s in idle), req("buzz_web_1", 8080, "GET", "/login")[0])
print("RELAY_XPUBKEY", req("buzz_relay_1", 3000, "POST", "/query", {"Host": D, "X-Pubkey": O, "Content-Type": "application/json"},
                           json.dumps({"filters": [{"limit": 1}]}))[0])
print("GATEWAY_OTHER", req("buzz-gateway", 80, "GET", "/", {"Host": "old.example.com", "Accept": "application/nostr+json"})[0])
print("GATEWAY_OWN", req("buzz-gateway", 80, "GET", "/", {"Host": D, "Accept": "application/nostr+json"})[0])
print("SILO_ANON", req("buzz-silo", 9000, "GET", "/buzz-media/")[0])
print("METRICS", req("buzz_relay_1", 9102, "GET", "/metrics")[0])
'
docker run --rm --network "$net" -e PGPASSWORD=buzz --entrypoint psql "$(img buzz_postgres_1)" -h buzz_postgres_1 -U buzz -d buzz -c "select 1" > /dev/null 2>&1 &&
  echo "PG open" || echo "PG refused"
echo "REDIS $(docker run --rm --network "$net" --entrypoint redis-cli "$(img buzz_redis_1)" -h buzz_redis_1 ping 2>&1 | head -n 1)"
HOSTILE
cat $TMP/hostile.txt
v() { sed -n "s/^$1 //p" $TMP/hostile.txt; }
[ "$(v PAGE_GET)" = 303 ] && [ "$(v PAGE_SAVE)" = 401 ] && pass "another app can't use the setup page without its password" ||
  fail "the setup page answered another app: GET $(v PAGE_GET), POST $(v PAGE_SAVE)"
case "$(v PAGE_NEGLEN)" in "413 0"|"413 1") pass "a request with a bad length is refused at once, not read" ;;
  *) fail "a request with a bad length: $(v PAGE_NEGLEN)" ;; esac
[ "$(v PAGE_FRAME)" = DENY ] && pass "the setup page refuses to be shown inside another app's page" || fail "the page can be framed: $(v PAGE_FRAME)"
[ "$(v PAGE_IDLE)" = "20 200" ] && pass "20 half-sent requests are dropped after the time limit, and the page still answers" ||
  fail "half-sent requests: $(v PAGE_IDLE)"
[ "$(v RELAY_XPUBKEY)" = 401 ] && pass "the relay refuses a request that only claims to be the owner in a header" ||
  fail "a request claiming the owner's key in X-Pubkey got HTTP $(v RELAY_XPUBKEY)"
[ "$(v GATEWAY_OTHER)" = 404 ] && [ "$(v GATEWAY_OWN)" = 200 ] && pass "the gateway answers the community's address and no other" ||
  fail "the gateway: another name got $(v GATEWAY_OTHER), the community's $(v GATEWAY_OWN)"
case "$(v SILO_ANON)" in 401|403) pass "file storage refuses requests without its keys" ;; *) fail "file storage answered HTTP $(v SILO_ANON)" ;; esac
grep -q '^PG refused' $TMP/hostile.txt && pass "the database refuses a guessed password" || fail "the database took a guessed password"
grep -q '^REDIS .*NOAUTH' $TMP/hostile.txt && pass "Redis refuses commands without its password" || fail "Redis: $(v REDIS)"
echo "INFO  the relay's metrics port answers other apps with HTTP $(v METRICS): counts only, no keys or messages (block/buzz#7989, fix open in #8004)"

echo "== The relay's settings, written to by something other than the page"
# Lines a compromised writer might add: a command, and a setting that would turn membership checks off
host "docker exec -i $C sh -s" > $TMP/tamper.txt <<'TAMPER'
started() { docker inspect -f '{{.State.StartedAt}}' buzz_relay_1; }
ready() { docker exec buzz_relay_1 bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080; printf "GET /_readiness HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n" >&3; head -n 1 <&3' 2> /dev/null | grep -q ' 200 '; }
restarted() { for i in $(seq 1 60); do sleep 3; [ "$(started)" != "$1" ] && ready && return 0; done; return 1; }
before=$(started)
docker exec buzz_web_1 sh -c 'cp /settings/relay.env /tmp/relay.env.good && printf "%s\n" "BUZZ_REQUIRE_RELAY_MEMBERSHIP=false" "BUZZ_INJECTED=\$(touch /tmp/ran)" "\`touch /tmp/ran\`" >> /settings/relay.env'
restarted "$before" && echo "READY tampered"
docker exec buzz_relay_1 test -e /tmp/ran && echo "RAN"
docker exec buzz_relay_1 bash -c 'for p in /proc/[0-9]*; do [ "$(cat $p/comm 2> /dev/null)" = buzz-relay ] && tr "\0" "\n" < $p/environ | grep -E "^(BUZZ_REQUIRE_RELAY_MEMBERSHIP|BUZZ_INJECTED)="; done' | sed 's/^/ENV /'
before=$(started)
docker exec buzz_web_1 sh -c 'cp /tmp/relay.env.good /settings/relay.env.new && mv /settings/relay.env.new /settings/relay.env'
restarted "$before" && echo "READY again"
TAMPER
cat $TMP/tamper.txt
grep -q '^READY tampered' $TMP/tamper.txt && ! grep -q '^RAN' $TMP/tamper.txt &&
  grep -q '^ENV BUZZ_REQUIRE_RELAY_MEMBERSHIP=true' $TMP/tamper.txt && ! grep -q '^ENV BUZZ_INJECTED' $TMP/tamper.txt &&
  pass "lines added to the relay's settings run nothing and can't turn off its checks" ||
  fail "the relay ran or took lines added to its settings"
grep -q '^READY again' $TMP/tamper.txt && pass "the relay starts again with the page's own settings" ||
  fail "the relay didn't come back after its settings were restored"

echo "== Memory with a community"
footprint

echo "== Load: 20 members send 10 messages each, ten at a time"
for _ in $(seq 1 20); do python3 $L/keygen.py; done > $TMP/members.keys
npubs=$(while read -r _ hex; do python3 $L/npub.py "$hex"; done < $TMP/members.keys | tr '\n' ' ')
added=$(host "docker exec -i $C sh -s" <<IN
ok=0
for n in $npubs; do
  docker exec buzz_relay_1 bash -c 'set -a; . /data/settings/relay.env; . /data/secrets/relay.env; set +a; buzz-admin add-member --pubkey '"\$n" > /dev/null 2>&1 && ok=\$((ok + 1))
done
echo \$ok
IN
)
[ "$added" = 20 ] && pass "20 members added" || fail "members added: $added of 20"
read -r SK1 _ < <(sed -n 1p $TMP/members.keys)
read -r SK2 _ < <(sed -n 2p $TMP/members.keys)
as "$SK1" channels create --name load-test --type stream --visibility open > $TMP/ch.json 2>&1
CH=$(field channel_id < $TMP/ch.json)
cat > $TMP/post.sh <<EOF
read -r sk _ < <(sed -n "\$1p" $TMP/members.keys)
export BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="\$sk"
"$BZ" channels join --channel "$CH" > /dev/null 2>&1
ok=0; for m in \$(seq 1 10); do "$BZ" messages send --channel "$CH" --content "load test message \$1-\$m" > /dev/null 2>&1 && ok=\$((ok + 1)); done
echo "\$ok"
EOF
start=$(date +%s)
seq 1 20 | xargs -P 10 -I{} bash $TMP/post.sh {} > $TMP/load.txt 2>&1 &
sleep 20; echo "INFO  memory under the load:"; footprint
wait
took=$(( $(date +%s) - start ))
sent=$(awk '{s += $1} END {print s + 0}' $TMP/load.txt)
as "$SK1" --format compact messages get --channel "$CH" --limit 500 > $TMP/read.json 2>&1
back=$(grep -o 'load test message' $TMP/read.json | wc -l | tr -d ' ')
[ "$sent" = 200 ] && [ "$back" = 200 ] && pass "200 messages sent in ${took}s, and all 200 read back" || fail "sent $sent of 200 in ${took}s, read $back back"
echo "INFO  memory after the load:"; footprint
echo "INFO  the app's data: $(umbrel 'du -sh /home/umbrel/umbrel/app-data/buzz' | cut -f1)"

echo "== Files and videos"
python3 $L/png.py $TMP/image.png 20000000
t0=$(date +%s); as "$SK1" upload file --file $TMP/image.png > $TMP/up.json 2>&1
URL=$(field url < $TMP/up.json)
if [ -n "$URL" ]; then
  pass "a 20 MB image goes up, in $(( $(date +%s) - t0 ))s"
  as "$SK2" media get "$URL" -o $TMP/got.png > /dev/null 2>&1 && cmp -s $TMP/image.png $TMP/got.png &&
    pass "another member downloads it intact" || fail "the 20 MB image didn't come back intact"
else
  fail "the 20 MB image: $(head -c 300 $TMP/up.json)"
fi
python3 $L/png.py $TMP/big.png 60000000
if as "$SK1" upload file --file $TMP/big.png > $TMP/big.json 2>&1; then
  fail "a 60 MB image went up"
else
  grep -q -i "too large" $TMP/big.json && pass "a 60 MB image is refused: images stop at 50 MiB, Buzz's default" ||
    fail "the 60 MB image failed another way: $(head -c 300 $TMP/big.json)"
fi
if command -v ffmpeg > /dev/null; then
  # H.264, fast-start and no metadata: what Buzz takes, as its apps make videos
  ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -t 40 -vf noise=alls=60:allf=t+u -c:v libx264 \
    -preset ultrafast -b:v 19M -maxrate 19M -bufsize 38M -x264-params nal-hrd=cbr -pix_fmt yuv420p \
    -map_metadata -1 -fflags +bitexact -flags:v +bitexact -movflags +faststart -an $TMP/video.mp4
  t0=$(date +%s); as "$SK1" upload file --file $TMP/video.mp4 > $TMP/upv.json 2>&1 & up=$!
  sleep 6; echo "INFO  memory while it goes up:"; footprint
  wait $up
  VURL=$(field url < $TMP/upv.json)
  if [ -n "$VURL" ]; then
    pass "a $(( $(wc -c < $TMP/video.mp4) / 1000000 )) MB video goes up, in $(( $(date +%s) - t0 ))s"
    as "$SK2" media get "$VURL" -o $TMP/gotv.mp4 > /dev/null 2>&1 && cmp -s $TMP/video.mp4 $TMP/gotv.mp4 &&
      pass "another member downloads it intact" || fail "the video didn't come back intact"
  else
    fail "the video: $(head -c 300 $TMP/upv.json)"
  fi
else
  echo "INFO  no ffmpeg here, so no video"
fi
python3 $L/mp4.py $TMP/over.mp4 100500000
as "$SK1" upload file --file $TMP/over.mp4 > $TMP/over.json 2>&1
# the relay's own refusal; Cloudflare's would be an HTML page
grep -q "length limit exceeded" $TMP/over.json && pass "a 100.5 MB video is refused at the package's 100 MB limit (HTTP 413)" ||
  fail "a video over 100 MB: $(head -c 300 $TMP/over.json)"
rm -f $TMP/*.png $TMP/*.mp4

echo "== What the community's public address shows"
shown=0
for p in / /login /status.json /save /settings /metrics; do
  curl -s -m 10 -o $TMP/page "https://$DOMAIN$p"
  grep -q -i -E "app's password|class=\"brand\"|Sign out" $TMP/page && { shown=1; echo "INFO  $p shows the setup page"; }
done
[ $shown = 0 ] && pass "the public address never shows the setup page" || fail "the setup page is public"

echo "== Secrets in the app's logs"
# Names any setting whose value shows up in a container's log, never the value. Public keys aren't secret.
host "docker exec -i $C sh -s" > $TMP/scan.txt <<'SCAN'
rm -rf /tmp/scan; mkdir -p /tmp/scan
for c in $(docker ps --format '{{.Names}}' | grep '^buzz_'); do
  docker exec $c sh -c 'env; cat /data/secrets/relay.env /data/settings/relay.env 2>/dev/null' 2>/dev/null |
    grep -E '^[A-Z0-9_]*(PASSWORD|SECRET|KEY|TOKEN|DATABASE_URL|REDIS_URL)[A-Z0-9_]*=' | grep -v -E '^[A-Z0-9_]*PUBKEY=' >> /tmp/scan/sec
  docker logs $c > /tmp/scan/log.$c 2>&1
done
sort -u /tmp/scan/sec | while IFS= read -r line; do
  name=${line%%=*}; value=${line#*=}
  [ ${#value} -ge 12 ] || continue
  for f in /tmp/scan/log.*; do n=$(grep -c -F -- "$value" "$f"); [ "$n" != 0 ] && echo "FOUND $name in ${f#/tmp/scan/log.}: $n lines"; done
done
echo "settings checked: $(sort -u /tmp/scan/sec | wc -l), log lines: $(cat /tmp/scan/log.* | wc -l)"
rm -rf /tmp/scan
SCAN
cat $TMP/scan.txt
grep -q '^FOUND' $TMP/scan.txt && fail "a secret shows up in the logs" || pass "no setting's secret value shows up in the app's logs"

if [ -z "${UMBREL_LOCAL:-}" ]; then
  echo "== Restarting the whole Umbrel"
  before=$(counts); setup=$(setup_hash)
  host "docker restart $C > /dev/null"
  t0=$(date +%s)
  for _ in $(seq 1 90); do [[ $(state) == *'"ready"'* ]] && [ "$(relay /_readiness)" = 200 ] && break; sleep 10; done
  echo "INFO  back after $(( $(date +%s) - t0 ))s"
  after=$(counts)
  [ -n "$before" ] && [ "$before" = "$after" ] && pass "every table has the same rows after the restart" ||
    fail "the tables changed across the restart: $before / $after"
  [ "$(setup_hash)" = "$setup" ] && pass "the setup survives the restart" || fail "the setup changed across the restart"

  # Umbrel backs up to a USB drive or a network share. Here a share on this Umbrel, which the second
  # one mounts from across Docker's network, as a NAS would be. The test tunnel took a new name in the
  # restart, so the relay is asked for the community's address directly.
  echo "== Umbrel's own backup, restored onto a second umbrelOS that was never set up"
  host "C=$C B=$B VERSION=$VERSION DOMAIN=$DOMAIN bash -s" <<'RESTORE' | tee $TMP/restore.txt
set -uo pipefail
uc() { local f; f=$(mktemp); docker exec "$1" umbreld client "$2" "${3:-}" > "$f" 2>&1; cat "$f"; rm -f "$f"; }
js() { python3 -c "import json,sys; print(json.dumps(dict(zip(sys.argv[1::2], sys.argv[2::2]))))" "$@"; }
val() { python3 -c 'import json,sys; print(json.load(sys.stdin))' 2>/dev/null; }
counts() { docker exec -i "$1" docker exec -i buzz_postgres_1 sh -s <<'SQL'
U=${POSTGRES_USER:-postgres}; D=${POSTGRES_DB:-$U}
for t in $(psql -U "$U" -d "$D" -Atc "select tablename from pg_tables where schemaname = current_schema() order by 1"); do
  n=$(psql -U "$U" -d "$D" -Atc "select count(*) from \"$t\""); [ "$n" != 0 ] && printf "%s=%s " "$t" "$n"
done
echo
SQL
}
setup_hash() { docker exec "$1" docker exec buzz_web_1 cat /settings/setup.json 2>/dev/null | sha256sum | cut -c1-12; }
stored() { docker exec "$1" sh -c "cd /home/umbrel/umbrel/app-data/buzz/data/silo 2>/dev/null && find . -type f -name 'part.*' -exec sha256sum {} + | sort -k2 | sha256sum | cut -c1-12"; }
ready() { docker exec "$1" sh -c "ip=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_relay_1); curl -s -o /dev/null -w '%{http_code}' -m 10 -H 'Host: $DOMAIN' http://\$ip:3000/_readiness"; }
# Umbrel mounts shares with CIFS's UTF-8 character set, which Ubuntu's cloud kernel keeps in linux-modules-extra
modprobe nls_utf8 2> /dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y -q "linux-modules-extra-$(uname -r)" > /tmp/apt.log 2>&1; modprobe nls_utf8; }
uc $C files.createDirectory.mutate "$(js path /Home/Backups)" > /dev/null
uc $C files.addShare.mutate "$(js path /Home/Backups)" > /dev/null
NAME=$(uc $C files.shares.query | python3 -c 'import json,sys; print(next(s["sharename"] for s in json.load(sys.stdin) if s["path"] == "/Home/Backups"))' 2>/dev/null)
SPW=$(uc $C files.sharePassword.query | val)
RPW=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
SHARE=$(uc $C files.addNetworkShare.mutate "$(js host localhost share "$NAME" username umbrel password "$SPW")" | val)
REPO=$(uc $C backups.createRepository.mutate "$(js path "$SHARE" password "$RPW")" | val)
[ -n "$SHARE" ] && [ -n "$REPO" ] || { echo "FAIL  no backup share or repository"; exit; }
BEFORE=$(counts $C); SETUP=$(setup_hash $C); STORED=$(stored $C)
t0=$(date +%s); uc $C backups.backup.mutate "$(js repositoryId "$REPO")" > /dev/null
n=$(uc $C backups.listBackups.query "$(js repositoryId "$REPO")" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null)
[ "${n:-0}" -ge 1 ] && echo "PASS  Umbrel backs up the app, in $(( $(date +%s) - t0 ))s" || { echo "FAIL  the backup"; exit; }
docker rm -f $B > /dev/null 2>&1; docker volume rm $B > /dev/null 2>&1
docker create -it --name $B --hostname umbrel-restored --privileged --volume $B:/data "ghcr.io/getumbrel/umbrelos:$VERSION" /sbin/init > /dev/null
for unit in NetworkManager.service NetworkManager-wait-online.service; do
  ln -sf /dev/null "/tmp/$unit" && docker cp "/tmp/$unit" "$B:/etc/systemd/system/$unit"
done
docker start $B > /dev/null
for _ in $(seq 1 60); do [ "$(uc $B user.exists.query)" = false ] && break; sleep 5; done
AIP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $C)
for _ in $(seq 1 30); do
  SHAREB=$(uc $B files.addNetworkShare.mutate "$(js host "$AIP" share "$NAME" username umbrel password "$SPW")" | val) && [ -n "$SHAREB" ] && break
  sleep 5
done
for _ in $(seq 1 30); do
  REPOB=$(uc $B backups.connectToExistingRepository.mutate "$(js path "${SHAREB:-}" password "$RPW")" | val) && [ -n "$REPOB" ] && break
  sleep 5
done
BID=$(uc $B backups.listBackups.query "$(js repositoryId "${REPOB:-}")" | python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["id"])' 2>/dev/null)
[ -n "$BID" ] || { echo "FAIL  the second Umbrel can't see the backup"; exit; }
# The restore copies the backup in, then reboots into it, which ends this call and stops the container
t0=$(date +%s)
uc $B backups.restoreBackup.mutate "$(js backupId "$BID")" > /dev/null 2>&1 &
sleep 30
for _ in $(seq 1 120); do
  [ "$(docker inspect -f '{{.State.Running}}' $B)" = false ] && docker start $B > /dev/null
  uc $B apps.state.query "$(js appId buzz)" | tr -d '\n ' | grep -q '"state":"ready"' && [ "$(ready $B)" = 200 ] && break
  sleep 10
done
echo "INFO  the second Umbrel ran Buzz from the backup after $(( $(date +%s) - t0 ))s"
AFTER=$(counts $B)
[ -n "$BEFORE" ] && [ "$AFTER" = "$BEFORE" ] && echo "PASS  every table has the rows it had at the backup" || echo "FAIL  the tables differ: $BEFORE / $AFTER"
[ "$(setup_hash $B)" = "$SETUP" ] && echo "PASS  the setup came back" || echo "FAIL  the setup differs"
[ "$(ready $B)" = 200 ] && echo "PASS  the relay serves the community's address" || echo "FAIL  the relay doesn't serve the community's address"
[ -n "$STORED" ] && [ "$(stored $B)" = "$STORED" ] && echo "PASS  the stored files are byte for byte the same" || echo "FAIL  the stored files differ"
log=$(docker exec $B docker logs buzz_postgres_1 2>&1)
[ "$(printf '%s\n' "$log" | grep -c -E 'PANIC|corrupt|invalid page|could not read')" = 0 ] && echo "PASS  Postgres starts with no errors" || echo "FAIL  Postgres reports errors"
echo "INFO  Postgres recovered as after a power cut, since Umbrel copies its files while it runs: $(printf '%s\n' "$log" | grep -c -E 'not properly shut down|redo done') lines"
RESTORE
  PASS=$((PASS + $(grep -c '^PASS' $TMP/restore.txt))) FAIL=$((FAIL + $(grep -c '^FAIL' $TMP/restore.txt)))
  echo "INFO  memory on the second Umbrel:"; footprint $B
  host "docker rm -f $B > /dev/null; docker volume rm $B > /dev/null"
fi

echo "== Cloudflare and Tailscale, up to their sign-in links, and what each can see"
# Last, since leaving the domain ends this community's address
host "docker exec -i $C sh -s" > $TMP/signin.txt <<'CHECKS'
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; }
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' buzz_web_1)
J=/tmp/ts-check-jar; rm -f $J
docker exec buzz_web_1 printenv APP_PASSWORD | tr -d '\n' | curl -s -o /dev/null -c $J --data-urlencode password@- http://$ip:8080/login
wait_for() { for i in $(seq 1 40); do eval "$1" && return 0; sleep 3; done; return 1; }
wait_for 'docker exec buzz_web_1 grep -q "argotunnel" /cloudflare/cloudflare-login.log 2> /dev/null' &&
  pass "your own domain: the app's Cloudflare tunnel waits for a sign-in, with Cloudflare's link" ||
  fail "no Cloudflare sign-in link"
cur=$(docker exec buzz_web_1 sed -n 's/^BUZZ_DOMAIN=//p' /settings/relay.env)
code=$(curl -s -o /dev/null -w '%{http_code}' -b $J -c $J --data "mode=funnel&confirm=$cur" http://$ip:8080/address)
[ "$code" = 303 ] && pass "switching to the free Tailscale address is accepted" || fail "switching to funnel got HTTP $code"
wait_for 'docker exec buzz_web_1 grep -q "login.tailscale.com/a/" /tailscale/tailscale-status.json 2> /dev/null' &&
  pass "Tailscale waits for a sign-in, with a link (funnel)" || fail "no Tailscale sign-in link (funnel)"
wait_for '! docker exec buzz_web_1 test -e /cloudflare/cloudflare-state' &&
  pass "the Cloudflare tunnel turns off and waits" || fail "the Cloudflare tunnel didn't turn off"
code=$(curl -s -o /dev/null -w '%{http_code}' -b $J -c $J --data "mode=private&ack=yes" http://$ip:8080/address)
[ "$code" = 303 ] && pass "switching to the private network is accepted" || fail "switching to private got HTTP $code"
page=$(curl -s -b $J http://$ip:8080/)
echo "$page" | grep -q "Connect your private network" && echo "$page" | grep -q "Sign in to Tailscale" &&
  pass "the page shows the private network's sign-in" || fail "the private network's sign-in isn't on the page"
! docker exec buzz_relay_1 test -e /data/settings/tailscale-status.json && ! docker exec buzz_tailscale_1 test -e /settings/relay.env &&
  ! docker exec buzz_cloudflared_1 test -e /settings/relay.env &&
  pass "the relay can't see Tailscale's status, and neither helper can see the relay's settings" ||
  fail "a service can see another's files"
rm -f $J
CHECKS
cat $TMP/signin.txt
PASS=$((PASS + $(grep -c '^PASS' $TMP/signin.txt))) FAIL=$((FAIL + $(grep -c '^FAIL' $TMP/signin.txt)))

echo "== Uninstall, then install again"
umbrel 'docker rm -f buzz-test-tunnel > /dev/null 2>&1; umbreld client apps.uninstall.mutate --appId buzz > /dev/null 2>&1'
[[ $(state) == *not-installed* ]] && pass "Umbrel uninstalls the app" || fail "after the uninstall: $(state)"
umbrel 'test -e /home/umbrel/umbrel/app-data/buzz' && fail "the app's data is left behind" || pass "uninstalling removes the app's data"
if [ -z "${UMBREL_LOCAL:-}" ]; then
  bash $T/install.sh $VERSION > /dev/null  # copies the package into the App Store again first
else
  umbrel 'umbreld client apps.install.mutate --appId buzz > /dev/null 2>&1'
fi
for _ in $(seq 1 60); do [[ $(state) == *'"ready"'* ]] && break; sleep 5; done
[[ $(state) == *'"ready"'* ]] || fail "installing again: $(state)"
umbrel 'docker exec buzz_web_1 test -e /settings/setup.json' && fail "the old setup came back" ||
  pass "installing again starts at a fresh setup page"
e2e

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
