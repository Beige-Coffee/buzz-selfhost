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
