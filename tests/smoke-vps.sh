#!/usr/bin/env bash
# Server half of the smoke test for the guide's "Self-host on a VPS" path.
# Runs on a fresh Ubuntu 24.04 x86 server, as root, and executes the guide's commands verbatim
# (copied from site/src/data/steps.ts and the Day two cards; keep them in sync).
# tests/smoke.sh drives it over SSH and runs the member side from a laptop with the buzz CLI.
#
# Usage:
#   bash smoke-vps.sh install <domain> <image-tag> <owner-hex>
#   bash smoke-vps.sh practice <image-tag> <owner-hex>      (the laptop path, on a server with Docker)
#   bash smoke-vps.sh private <image-tag> <owner-hex> <tailnet machine name>   (needs /root/.ts-authkey)
#   bash smoke-vps.sh add-member <hex>
#   bash smoke-vps.sh list-members | backup | wipe | restore
#   bash smoke-vps.sh upgrade [new-image-tag]   (no tag: run.sh upgrade on the same tag)
set -uo pipefail

PHASE="${1:?usage: smoke-vps.sh <phase> ...}"
OUT=/root/smoke
COMPOSE_DIR=/root/buzz/deploy/compose
mkdir -p "$OUT"
PASS=0
FAIL=0

# ── harness ───────────────────────────────────────────────────────────
# run NAME SNIPPET: echo the snippet, run it in this shell (so cd sticks), save its output.
# The snippet shares this shell, so the harness keeps its own variable names out of its way.
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
expect() { # name expected actual
  if [[ "$3" == "$2" ]]; then pass "$1"; else fail "$1: expected [$2] got [$3]"; fi
}
section() { printf '\n##### %s\n' "$*"; }
finish() {
  echo
  echo "passed: $PASS  failed: $FAIL"
  [[ $FAIL -eq 0 ]]
  exit $?
}
domain() { grep '^BUZZ_DOMAIN=' "$COMPOSE_DIR/.env" | cut -d= -f2; }
ws_status() { curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$1"; }

# compose.md step 9's phone pairing edits, verbatim; install, restore and upgrade all run them.
IFS= read -r -d '' PAIR_EDIT <<'SNIP' || true
printf '%s\n' \
  '  pair-relay:' \
  '    image: ${BUZZ_IMAGE:-ghcr.io/block/buzz:main}' \
  '    entrypoint: ["/usr/local/bin/buzz-pair-relay"]' \
  '    environment: {BUZZ_PAIR_RELAY_BIND_ADDR: "0.0.0.0:5000"}' \
  '    ports: ["127.0.0.1:5000:5000"]' \
  '    restart: unless-stopped' \
  '    networks: [buzz-net]' |
  sed -i.bak '/^services:$/r /dev/stdin' compose.yml && rm compose.yml.bak
SNIP
IFS= read -r -d '' CADDY_EDIT <<'SNIP' || true
sed -i.bak 's|^  reverse_proxy relay:3000$|  reverse_proxy /pair* pair-relay:5000\n  reverse_proxy relay:3000|' Caddyfile && rm Caddyfile.bak
SNIP
# pairing_edits MODE: the edits for server or private mode, with their checks
pairing_edits() {
  run pair-service "$PAIR_EDIT"
  expect "pairing service in compose.yml" "1" "$(grep -c buzz-pair-relay compose.yml)"
  docker compose --env-file .env config --services 2>/dev/null | grep -qx pair-relay && pass "compose.yml still parses, with pair-relay" || fail "compose.yml doesn't parse after the pairing edit"
  if [[ $1 == server ]]; then
    run pair-route "$CADDY_EDIT"
    expect "Caddy routes /pair" "1" "$(grep -c 'pair-relay:5000' Caddyfile)"
  fi
}
wait_alive() { # up to 3 minutes: Caddy gets its certificate on the first request
  for _ in $(seq 1 36); do curl -fsS "https://$(domain)/_liveness" >/dev/null 2>&1 && return 0; sleep 5; done
  return 1
}

# bundle IMAGE OWNER_HEX HOST RELAY_URL ORIGIN MODE: steps 4 to 9, shared by every path.
bundle() {
  local IMAGE=$1 OWNER_HEX=$2 HOST=$3 RELAY_URL=$4 ORIGIN=$5 MODE=$6
  local TAG=${IMAGE##*:}
  section "4. Get the deploy bundle"
  cd /root
  run clone 'git clone https://github.com/block/buzz.git
cd buzz && git checkout -q ${TAG#sha-} && cd deploy/compose
cp .env.example .env && chmod 600 .env' >/dev/null
  cd "$COMPOSE_DIR" || { fail "clone"; finish; }
  expect "bundle at the image's commit" "${TAG#sha-}" "$(git rev-parse HEAD | cut -c1-7)"
  run ls 'ls'
  expect "ls" "Caddyfile README.md compose.caddy.yml compose.dev.yml compose.yml run.sh" "$(ls | tr '\n' ' ' | sed 's/ $//')"

  section "5. Fill in the random secrets"
  run secrets 'for name in $(grep '"'"'CHANGE_ME_RANDOM'"'"' .env | cut -d= -f1); do
  sed -i.bak "s/^${name}=.*/${name}=$(openssl rand -hex 32)/" .env
done && rm -f .env.bak'
  expect "no CHANGE_ME_RANDOM left" "0" "$(grep -c CHANGE_ME_RANDOM .env)"

  section "6. Generate the relay key"
  run relay-key "key=\$(docker run --rm --entrypoint /usr/local/bin/buzz-admin $IMAGE generate-key | awk '/^Secret key:/ {print \$3}')
sed -i.bak \"s/^BUZZ_RELAY_PRIVATE_KEY=.*/BUZZ_RELAY_PRIVATE_KEY=\${key}/\" .env && rm .env.bak && unset key" >/dev/null
  expect "relay key is 64 characters" "64" "$(grep '^BUZZ_RELAY_PRIVATE_KEY=' .env | cut -d= -f2 | tr -d '\n' | wc -c | tr -d ' ')"
  grep -qE '^BUZZ_RELAY_PRIVATE_KEY=[0-9a-f]{64}$' .env && pass "relay key is hex" || fail "relay key is not hex"
  run generate-key-format "docker run --rm --entrypoint /usr/local/bin/buzz-admin $IMAGE generate-key | sed -E 's/[0-9a-f]{64}/<64 hex>/'"

  section "7. Set the owner"
  run owner "sed -i.bak \"s/^RELAY_OWNER_PUBKEY=.*/RELAY_OWNER_PUBKEY=$OWNER_HEX/\" .env && rm .env.bak"
  expect "no CHANGE_ME value lines" "0" "$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env)"

  section "8. Set the URL and the version"
  run url "sed -i.bak \\
  -e \"s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=$IMAGE|\" \\
  -e \"s|^BUZZ_DOMAIN=.*|BUZZ_DOMAIN=$HOST|\" \\
  -e \"s|^RELAY_URL=.*|RELAY_URL=$RELAY_URL|\" \\
  -e \"s|^BUZZ_MEDIA_BASE_URL=.*|BUZZ_MEDIA_BASE_URL=$ORIGIN/media|\" \\
  -e \"s|^BUZZ_MEDIA_SERVER_DOMAIN=.*|BUZZ_MEDIA_SERVER_DOMAIN=$HOST|\" \\
  -e \"s|^BUZZ_CORS_ORIGINS=.*|BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,$ORIGIN|\" \\
  .env && rm .env.bak"
  run url-check "grep -E '^(BUZZ_IMAGE|BUZZ_DOMAIN|RELAY_URL|BUZZ_MEDIA_BASE_URL|BUZZ_MEDIA_SERVER_DOMAIN|BUZZ_CORS_ORIGINS)=' .env"
  expect "six URL/version lines" "BUZZ_IMAGE=$IMAGE BUZZ_DOMAIN=$HOST RELAY_URL=$RELAY_URL BUZZ_MEDIA_BASE_URL=$ORIGIN/media BUZZ_MEDIA_SERVER_DOMAIN=$HOST BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,$ORIGIN" \
    "$(tr '\n' ' ' <"$OUT/url-check.out" | sed 's/ $//')"
  if [[ $MODE != local ]]; then
    run pair-url "grep -q '^BUZZ_PAIRING_RELAY_URL=' .env || echo \"BUZZ_PAIRING_RELAY_URL=wss://$HOST/pair\" >> .env"
    expect "pairing URL, one line" "BUZZ_PAIRING_RELAY_URL=wss://$HOST/pair" "$(grep '^BUZZ_PAIRING_RELAY_URL=' .env)"
  fi

  section "9. Bundle edits: MinIO images, phone pairing"
  run minio "sed -i.bak \\
  -e 's|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|' \\
  -e 's|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|' \\
  compose.yml && rm compose.yml.bak"
  run minio-check "grep -n 'image:.*buzz-minio' compose.yml"
  expect "two MinIO images swapped" "2" "$(wc -l <"$OUT/minio-check.out" | tr -d ' ')"
  [[ $MODE != local ]] && pairing_edits "$MODE"
  expect ".env is private after the edits" "600" "$(stat -c %a .env)"
}

# install_docker: the guide's Docker step, shared by the server paths.
install_docker() {
  export DEBIAN_FRONTEND=noninteractive
  run docker-install 'sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER' >/dev/null && pass "docker installed" || fail "docker install"
  run compose-version 'docker compose version'
  V=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' "$OUT/compose-version.out" | head -1)
  if printf '2.24.4\n%s\n' "$V" | sort -V -C; then pass "compose $V >= 2.24.4"; else fail "compose $V < 2.24.4"; fi
}

case "$PHASE" in
# ══ install: the guide, top to bottom ═════════════════════════════════
install)
  DOMAIN="${2:?domain}"
  cloud-init status --wait >/dev/null 2>&1 || true   # a brand-new server is still installing its first-boot updates
  TAG="${3:?image tag}"
  OWNER_HEX="${4:?owner hex}"
  IMAGE="ghcr.io/block/buzz:${TAG}"

  section "1. Create the server"
  expect "x86_64" "x86_64" "$(uname -m)"
  MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  [[ $MEM_KB -ge 3500000 ]] && pass "4 GB RAM ($MEM_KB kB)" || fail "RAM too small ($MEM_KB kB)"
  run server 'uname -m; free -h'

  section "2. Point your domain at it"
  PUBLIC_IP=$(curl -4 -s https://checkip.amazonaws.com)
  if run dig "dig +short $DOMAIN"; then
    expect "dig resolves to this server" "$PUBLIC_IP" "$(tail -1 "$OUT/dig.out")"
  else
    fail "dig is not available on a fresh server (the guide's check command)"
  fi

  section "3. Install Docker"
  install_docker

  bundle "$IMAGE" "$OWNER_HEX" "$DOMAIN" "wss://$DOMAIN" "https://$DOMAIN" server

  section "10. Start it"
  SECONDS=0
  run start 'BUZZ_COMPOSE_TLS=true ./run.sh start' >/dev/null && pass "run.sh start returned 0 (${SECONDS}s)" || fail "run.sh start failed"
  run status 'BUZZ_COMPOSE_TLS=true ./run.sh status'
  for svc in relay postgres redis minio; do
    grep -qE "buzz-prod-$svc-1 .*Up .*\(healthy\)" "$OUT/status.out" && pass "$svc up (healthy)" || fail "$svc not healthy"
  done
  grep -qE "buzz-prod-caddy-1 .*Up" "$OUT/status.out" && pass "caddy up" || fail "caddy not up"
  grep -qE "buzz-prod-pair-relay-1 .*Up" "$OUT/status.out" && pass "pair-relay up" || fail "pair-relay not up"

  section "11. Check that it answers"
  SECONDS=0
  wait_alive
  run liveness "curl -fsS https://$DOMAIN/_liveness" && pass "https liveness (${SECONDS}s including the certificate)" || fail "https liveness"
  run cert "echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -issuer -subject"
  run port3000 "curl -s -m 5 -o /dev/null -w '%{http_code}' http://$PUBLIC_IP:3000/_liveness || echo ' closed'"
  grep -q "closed" "$OUT/port3000.out" && pass "port 3000 not reachable from outside" || fail "port 3000 reachable"
  run cors "curl -s -o /dev/null -D - -X OPTIONS https://$DOMAIN/info -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' | grep -i '^access-control-allow-origin'"
  grep -qi "tauri://localhost" "$OUT/cors.out" && pass "CORS lets Buzz Desktop in" || fail "CORS refuses Buzz Desktop's origin"
  expect "phones reach the pairing service at /pair (WebSocket)" "101" "$(ws_status "https://$DOMAIN/pair")"
  run port5000 "curl -s -m 5 -o /dev/null -w '%{http_code}' http://$PUBLIC_IP:5000/ || echo ' closed'"
  grep -q "closed" "$OUT/port5000.out" && pass "port 5000 not reachable from outside" || fail "port 5000 reachable"
  finish
  ;;

# ══ private: the server on a Tailscale network, no public ports ═══════
# The auth key arrives as /root/.ts-authkey (copied by tests/smoke-private.sh) and is deleted after use.
private)
  TAG="${2:?image tag}"
  cloud-init status --wait >/dev/null 2>&1 || true   # a brand-new server is still installing its first-boot updates
  OWNER_HEX="${3:?owner hex}"
  TS_NAME="${4:?machine name on the tailnet}"
  IMAGE="ghcr.io/block/buzz:${TAG}"

  section "1. Create the server"
  expect "x86_64" "x86_64" "$(uname -m)"
  run server 'uname -m; free -h'
  PUBLIC_IP=$(curl -4 -s https://checkip.amazonaws.com)

  section "2. Put it on your tailnet"
  run tailscale-install 'curl -fsSL https://tailscale.com/install.sh | sh' >/dev/null && pass "tailscale installed" || fail "tailscale install"
  run tailscale-up "sudo tailscale up --hostname=$TS_NAME --authkey=\$(cat /root/.ts-authkey)" && pass "joined the tailnet" || fail "tailscale up"
  rm -f /root/.ts-authkey
  run tailscale-name "tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"Self\"][\"DNSName\"].rstrip(\".\"))'"
  HOST=$(tail -1 "$OUT/tailscale-name.out")
  [[ $HOST == "$TS_NAME".*.ts.net ]] && pass "tailnet name $HOST" || fail "unexpected tailnet name: $HOST"

  section "3. Install Docker"
  install_docker

  bundle "$IMAGE" "$OWNER_HEX" "$HOST" "wss://$HOST" "https://$HOST" private

  section "Keep the relay off the public network"
  run localhost-only 'sed -i.bak "s/^BUZZ_HTTP_PORT=.*/BUZZ_HTTP_PORT=127.0.0.1:3000/" .env && rm .env.bak'
  expect "relay port bound to localhost" "BUZZ_HTTP_PORT=127.0.0.1:3000" "$(grep '^BUZZ_HTTP_PORT=' .env)"
  expect "one BUZZ_HTTP_PORT line" "1" "$(grep -c '^BUZZ_HTTP_PORT=' .env)"

  section "Start it"
  run start './run.sh start' >/dev/null && pass "run.sh start returned 0" || fail "run.sh start failed"
  run status './run.sh status'
  for svc in relay postgres redis minio; do
    grep -qE "buzz-prod-$svc-1 .*Up .*\(healthy\)" "$OUT/status.out" && pass "$svc up (healthy)" || fail "$svc not healthy"
  done
  grep -qE "buzz-prod-pair-relay-1 .*Up" "$OUT/status.out" && pass "pair-relay up" || fail "pair-relay not up"
  run relay-port 'docker port buzz-prod-relay-1 3000'
  grep -qx "127.0.0.1:3000" "$OUT/relay-port.out" && pass "relay published on 127.0.0.1 only" || fail "relay published beyond localhost"

  section "Serve it over HTTPS on the tailnet"
  run serve 'sudo tailscale serve --bg 3000' && pass "tailscale serve" || fail "tailscale serve"
  run serve-pair 'sudo tailscale serve --bg --set-path /pair 5000' && pass "tailscale serve /pair" || fail "tailscale serve /pair"
  run serve-status 'tailscale serve status'
  grep -q '/pair' "$OUT/serve-status.out" && pass "serve status lists /pair" || fail "serve status has no /pair"

  section "Check that it answers"
  SECONDS=0
  for _ in $(seq 1 36); do curl -fsS "https://$HOST/_liveness" >/dev/null 2>&1 && break; sleep 5; done
  run liveness "curl -fsS https://$HOST/_liveness" && pass "https liveness on the tailnet (${SECONDS}s including the certificate)" || fail "https liveness on the tailnet"
  run cert "echo | openssl s_client -connect $HOST:443 -servername $HOST 2>/dev/null | openssl x509 -noout -issuer -subject"
  run websocket "curl -s -m 6 --http1.1 -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: c21va2UtdGVzdC0xMjM0NQ==' https://$HOST/ | head -c 600"
  grep -q "101" "$OUT/websocket.out" && pass "WebSocket upgrade through tailscale serve" || fail "no WebSocket upgrade"
  grep -q '"AUTH"' "$OUT/websocket.out" && pass "relay sends its NIP-42 challenge" || fail "no NIP-42 challenge"
  run cors "curl -s -o /dev/null -D - -X OPTIONS https://$HOST/info -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' | grep -i '^access-control-allow-origin'"
  grep -qi "tauri://localhost" "$OUT/cors.out" && pass "CORS lets Buzz Desktop in" || fail "CORS refuses Buzz Desktop's origin"
  expect "phones reach the pairing service at /pair (WebSocket)" "101" "$(ws_status "https://$HOST/pair")"
  for port in 80 443 3000 5000; do
    run "public-$port" "curl -s -m 5 -o /dev/null -w '%{http_code}' http://$PUBLIC_IP:$port/ || echo ' closed'"
    grep -q "closed" "$OUT/public-$port.out" && pass "public port $port closed" || fail "public port $port answers"
  done
  finish
  ;;

# ══ practice: the laptop path (no domain, no TLS, 127.0.0.1:3000) ════
practice)
  TAG="${2:?image tag}"
  OWNER_HEX="${3:?owner hex}"
  IMAGE="ghcr.io/block/buzz:${TAG}"
  export DEBIAN_FRONTEND=noninteractive
  command -v docker >/dev/null || { fail "docker is not installed (run the install phase's step 3 first)"; finish; }

  section "Check this machine"
  run machine 'docker compose version
lsof -nP -iTCP:3000 -sTCP:LISTEN'
  grep -q LISTEN "$OUT/machine.out" && fail "port 3000 is taken" || pass "port 3000 is free"

  cd /root
  bundle "$IMAGE" "$OWNER_HEX" "127.0.0.1" "ws://127.0.0.1:3000" "http://127.0.0.1:3000" local

  section "Start it"
  run start './run.sh start' >/dev/null && pass "run.sh start returned 0" || fail "run.sh start failed"
  run status './run.sh status'
  for svc in relay postgres redis minio; do
    grep -qE "buzz-prod-$svc-1 .*Up .*\(healthy\)" "$OUT/status.out" && pass "$svc up (healthy)" || fail "$svc not healthy"
  done
  grep -q "buzz-prod-caddy-1" "$OUT/status.out" && fail "caddy is running in practice mode" || pass "no caddy"

  section "Check that it answers"
  run liveness 'curl -fsS http://127.0.0.1:3000/_liveness' && pass "liveness on 127.0.0.1:3000" || fail "liveness"
  run cors "curl -s -o /dev/null -D - -X OPTIONS http://127.0.0.1:3000/info -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' | grep -i '^access-control-allow-origin'"
  grep -qi "tauri://localhost" "$OUT/cors.out" && pass "CORS lets Buzz Desktop in" || fail "CORS refuses Buzz Desktop's origin"
  finish
  ;;

# ══ Day two: people ═══════════════════════════════════════════════════
add-member)
  cd "$COMPOSE_DIR" || exit 1
  run add-member "./run.sh add-member ${2:?hex} --role member" && pass "add-member" || fail "add-member"
  finish
  ;;
list-members)
  cd "$COMPOSE_DIR" || exit 1
  run list-members './run.sh list-members'
  finish
  ;;

# ══ Day two: back up (the page's commands) ════════════════════════════
backup)
  cd "$COMPOSE_DIR" || exit 1
  run backup 'mkdir -p ~/buzz-backup && chmod 700 ~/buzz-backup
docker compose stop relay
docker compose exec -T postgres pg_dump -U buzz -Fc buzz > ~/buzz-backup/postgres.dump < /dev/null
for v in minio-data git-data; do
  docker run --rm -v buzz-prod_buzz-$v:/data:ro -v ~/buzz-backup:/backup alpine \
    tar czf /backup/$v.tgz -C /data .
done
cp .env ~/buzz-backup/env
docker compose start relay' && pass "backup" || fail "backup"
  run backup-files 'ls -la ~/buzz-backup'
  for f in postgres.dump minio-data.tgz git-data.tgz env; do
    [[ -s ~/buzz-backup/$f ]] && pass "backup has $f" || fail "backup missing $f"
  done
  wait_alive && pass "relay back up after the backup" || fail "relay down after the backup"
  finish
  ;;

# ══ lose the server's data: the checkout and the three data volumes ════
# (Caddy's certificate volumes stay, to spare Let's Encrypt's rate limit.)
wipe)
  cd "$COMPOSE_DIR" || exit 1
  run wipe 'BUZZ_COMPOSE_TLS=true ./run.sh stop
docker volume rm buzz-prod_buzz-postgres-data buzz-prod_buzz-minio-data buzz-prod_buzz-git-data
cd /root && rm -rf buzz' && pass "wipe" || fail "wipe"
  finish
  ;;

# ══ Day two: restore onto a fresh checkout (the page's commands) ══════
restore)
  cd /root
  run reclone 'TAG=$(grep '"'"'^BUZZ_IMAGE='"'"' ~/buzz-backup/env | cut -d: -f2)
git clone https://github.com/block/buzz.git
cd buzz && git checkout -q ${TAG#sha-} && cd deploy/compose
cp .env.example .env && chmod 600 .env
sed -i.bak \
  -e '"'"'s|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|'"'"' \
  -e '"'"'s|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|'"'"' \
  compose.yml && rm compose.yml.bak' >/dev/null && pass "fresh checkout" || fail "fresh checkout"
  cd "$COMPOSE_DIR" || exit 1
  pairing_edits server
  expect "fresh checkout at the backup's commit" "$(grep '^BUZZ_IMAGE=' ~/buzz-backup/env | cut -d: -f2 | sed 's/^sha-//')" "$(git rev-parse HEAD | cut -c1-7)"
  run restore 'cp ~/buzz-backup/env .env
docker compose create
for v in minio-data git-data; do
  docker run --rm -v buzz-prod_buzz-$v:/data -v ~/buzz-backup:/backup alpine \
    tar xzf /backup/$v.tgz -C /data
done
docker compose up -d --wait postgres
docker compose exec -T postgres pg_restore -U buzz -d buzz < ~/buzz-backup/postgres.dump
BUZZ_COMPOSE_TLS=true ./run.sh start' && pass "restore" || fail "restore"
  grep -q "not created by Docker Compose" "$OUT/restore.out" && fail "compose warns about volumes it didn't create" || pass "no volume warnings"
  wait_alive && pass "relay answers after the restore" || fail "relay down after the restore"
  expect "pairing answers after the restore" "101" "$(ws_status "https://$(domain)/pair")"
  finish
  ;;

# ══ Day two: upgrade ══════════════════════════════════════════════════
upgrade)
  NEW_TAG="${2:-}"
  cd "$COMPOSE_DIR" || exit 1
  if [[ -n $NEW_TAG ]]; then
    TAG=$NEW_TAG
    run newer 'OLD=$(grep '"'"'^BUZZ_IMAGE='"'"' .env | cut -d: -f2)
git fetch -q origin
git merge-base --is-ancestor ${OLD#sha-} ${TAG#sha-} && echo newer'
    expect "the new tag is newer" "newer" "$(cat "$OUT/newer.out")"
    run move-bundle 'git checkout compose.yml Caddyfile
git checkout -q ${TAG#sha-}' && pass "bundle moved" || fail "bundle moved"
    run minio-again 'sed -i.bak \
  -e '"'"'s|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|'"'"' \
  -e '"'"'s|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|'"'"' \
  compose.yml && rm compose.yml.bak' && pass "MinIO edit redone" || fail "MinIO edit redone"
    pairing_edits server
    expect "bundle at the new tag's commit" "${TAG#sha-}" "$(git rev-parse HEAD | cut -c1-7)"
    run new-settings 'comm -13 <(grep -oE '"'"'^[A-Z][A-Z0-9_]*='"'"' .env | sort) <(grep -oE '"'"'^[A-Z][A-Z0-9_]*='"'"' .env.example | sort)'
    expect "settings the new bundle added" "" "$(cat "$OUT/new-settings.out")"
    run set-image 'sed -i.bak "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" .env && rm .env.bak'
    expect "BUZZ_IMAGE" "BUZZ_IMAGE=ghcr.io/block/buzz:$TAG" "$(grep '^BUZZ_IMAGE=' .env)"
  fi
  run upgrade 'BUZZ_COMPOSE_TLS=true ./run.sh upgrade' && pass "run.sh upgrade" || fail "run.sh upgrade"
  wait_alive && pass "relay answers after the upgrade" || fail "relay down after the upgrade"
  expect "pairing answers after the upgrade" "101" "$(ws_status "https://$(domain)/pair")"
  [[ -n $NEW_TAG ]] && expect "relay runs the new image" "relay ghcr.io/block/buzz:$NEW_TAG healthy" \
    "$(docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}' relay | sed -E 's/ Up .*\((healthy)\)$/ \1/')"
  run members-after './run.sh list-members < /dev/null'
  run status-after 'BUZZ_COMPOSE_TLS=true ./run.sh status'
  finish
  ;;

*)
  echo "unknown phase: $PHASE" >&2
  exit 2
  ;;
esac
