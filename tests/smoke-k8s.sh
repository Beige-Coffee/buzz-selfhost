#!/usr/bin/env bash
# Smoke test for the Kubernetes path: Block's Helm chart, quickstart profile, behind an ingress
# with a Let's Encrypt certificate. Runs from a laptop with kubectl, helm and the buzz CLI.
#
# Needs: KUBECONFIG pointing at a cluster with an ingress controller (class $INGRESS_CLASS) and a
# cert-manager ClusterIssuer named $ISSUER; a domain that resolves to the ingress; the buzz CLI.
#
# Usage: BUZZ_CLI=path/to/buzz bash smoke-k8s.sh <domain> [image-tag]
#   INGRESS_CLASS (default traefik), ISSUER (default letsencrypt), CHART_VERSION (default 0.1.10)
set -uo pipefail

DOMAIN=${1:?usage: smoke-k8s.sh <domain> [image-tag]}
TAG=${2:-sha-83aab8c}
HERE=$(cd "$(dirname "$0")" && pwd)
BZ=${BUZZ_CLI:-buzz}
CLASS=${INGRESS_CLASS:-traefik}
ISSUER=${ISSUER:-letsencrypt}
VERSION=${CHART_VERSION:-0.1.10}
source "$HERE/lib/log.sh" && run_logged k8s "$TAG" "$0" "$@"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
info() { echo "INFO  $1"; }
section() { printf '\n===== %s\n' "$*"; }
show() { printf '$ %s\n' "$*"; "$@"; }
as() {
  local sk=$1
  shift
  BUZZ_RELAY_URL="https://$DOMAIN" BUZZ_PRIVATE_KEY="$sk" "$BZ" "$@"
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin).get('$1', ''))" 2>/dev/null; }
alive() { for _ in $(seq 1 36); do [[ $(curl -fsS -m 5 "https://$DOMAIN/_liveness" 2>/dev/null) == ok ]] && return 0; sleep 5; done; return 1; }

section "Identities"
read -r OWNER_SK OWNER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r MEMBER_SK MEMBER_HEX <<<"$(python3 "$HERE/lib/keygen.py")"
read -r STRANGER_SK _ <<<"$(python3 "$HERE/lib/keygen.py")"
MEMBER_NPUB=$(python3 "$HERE/lib/npub.py" "$MEMBER_HEX")
echo "owner   $OWNER_HEX"

section "1. The values file (the guide's buzz-values.yaml)"
cat >"$TMP/buzz-values.yaml" <<YAML
image:
  tag: $TAG
relayUrl: wss://$DOMAIN
ownerPubkey: $OWNER_HEX
quickstart: true
postgresql:
  enabled: true
redis:
  enabled: true
minio:
  enabled: true
  image: ghcr.io/block/buzz-minio:latest
  mcImage: ghcr.io/block/buzz-minio:latest
relay:
  corsOrigins:
    - tauri://localhost
    - http://tauri.localhost
    - https://$DOMAIN
ingress:
  enabled: true
  className: $CLASS
  annotations:
    cert-manager.io/cluster-issuer: $ISSUER
  tls:
    - hosts: [$DOMAIN]
      secretName: buzz-tls
YAML
cat "$TMP/buzz-values.yaml"

section "2. Install"
SECONDS=0
show helm install buzz oci://ghcr.io/block/buzz/charts/buzz --version "$VERSION" \
  --namespace buzz --create-namespace -f "$TMP/buzz-values.yaml" --wait --timeout 10m >"$TMP/install.log" 2>&1 &&
  pass "helm install (${SECONDS}s)" || { fail "helm install: $(tail -5 "$TMP/install.log")"; }
show kubectl -n buzz get pods
NOT_READY=$(kubectl -n buzz get pods --no-headers 2>/dev/null | awk '$3 != "Completed" && $3 != "Succeeded" { split($2, r, "/"); if (r[1] != r[2]) print $1 }')
[[ -z $NOT_READY ]] && pass "every pod ready" || fail "pods not ready: $NOT_READY"
DEPLOY=$(kubectl -n buzz get deploy -o name | grep -v -E 'redis|postgres|minio|pair' | head -1)
info "relay deployment: $DEPLOY"
IMG=$(kubectl -n buzz get "$DEPLOY" -o jsonpath='{.spec.template.spec.containers[0].image}')
[[ $IMG == "ghcr.io/block/buzz:$TAG" ]] && pass "relay runs $TAG" || fail "relay runs $IMG"

section "3. Certificate and liveness"
for _ in $(seq 1 30); do kubectl -n buzz get certificate buzz-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -q True && break; sleep 6; done
show kubectl -n buzz get certificate
alive && pass "https://$DOMAIN/_liveness answers ok" || fail "no liveness over https"
ISSUER_NAME=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
[[ $ISSUER_NAME == *"Let's Encrypt"* ]] && pass "Let's Encrypt certificate" || fail "certificate issuer: $ISSUER_NAME"
curl -s -o /dev/null -D - -X OPTIONS "https://$DOMAIN/info" -H 'Origin: tauri://localhost' -H 'Access-Control-Request-Method: GET' | grep -qi 'access-control-allow-origin: tauri://localhost' &&
  pass "CORS lets Buzz Desktop in" || fail "CORS refuses Buzz Desktop's origin"
curl -s -m 6 --http1.1 -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: c21va2UtdGVzdC0xMjM0NQ==' "https://$DOMAIN/" 2>/dev/null | head -c 600 >"$TMP/ws.out"
grep -q 101 "$TMP/ws.out" && grep -q '"AUTH"' "$TMP/ws.out" && pass "WebSocket upgrade and NIP-42 challenge through the ingress" || fail "WebSocket through the ingress: $(head -c 200 "$TMP/ws.out")"
V=$(curl -s -H 'Accept: application/nostr+json' "https://$DOMAIN/" | field version)
info "relay version $V"

section "4. Members post and read; a non-member is refused"
for _ in $(seq 1 180); do [[ -x $BZ ]] && break; sleep 10; done   # a CLI still building
as "$OWNER_SK" channels create --name k8s --type stream --visibility open >"$TMP/channel.json" 2>&1
CH=$(field channel_id <"$TMP/channel.json")
[[ -n $CH ]] && pass "owner creates a channel" || fail "owner creates a channel: $(cat "$TMP/channel.json")"
as "$OWNER_SK" messages send --channel "$CH" --content "hello from kubernetes" >/dev/null 2>&1 && pass "owner posts" || fail "owner posts"
show kubectl -n buzz exec "$DEPLOY" -- /usr/local/bin/buzz-admin add-member --pubkey "$MEMBER_NPUB" --role member >"$TMP/add.log" 2>&1 &&
  pass "add-member through kubectl exec" || fail "add-member: $(cat "$TMP/add.log")"
as "$MEMBER_SK" channels join --channel "$CH" >/dev/null 2>&1 && as "$MEMBER_SK" messages send --channel "$CH" --content "hello from a member" >/dev/null 2>&1 &&
  pass "member joins and posts" || fail "member joins and posts"
if as "$STRANGER_SK" messages send --channel "$CH" --content "should be refused" >"$TMP/stranger.json" 2>&1; then
  fail "a non-member posted"
elif grep -q relay_membership_required "$TMP/stranger.json"; then
  pass "non-member refused"
else
  fail "non-member failed for another reason: $(cat "$TMP/stranger.json")"
fi
python3 "$HERE/lib/png.py" "$TMP/pic.png"
PIC_SHA=$(shasum -a 256 "$TMP/pic.png" | cut -c1-64)
as "$MEMBER_SK" upload file --file "$TMP/pic.png" >"$TMP/upload.json" 2>&1
PIC_URL=$(field url <"$TMP/upload.json")
[[ $PIC_URL == "https://$DOMAIN/media/$PIC_SHA.png" ]] && pass "upload lands at https://$DOMAIN/media" || fail "upload: $(cat "$TMP/upload.json")"
fetch_pic() { rm -f "$TMP/got.png"; as "$OWNER_SK" media get "$PIC_URL" -o "$TMP/got.png" >/dev/null 2>&1 && [[ $(shasum -a 256 "$TMP/got.png" | cut -c1-64) == "$PIC_SHA" ]]; }
fetch_pic && pass "download intact" || fail "download"
[[ $(curl -s -o /dev/null -w '%{http_code}' "$PIC_URL") == 401 ]] && pass "the file's URL needs auth (401)" || fail "the file's URL is open without auth"

section "5. Back up the database"
PG=$(kubectl -n buzz get pods -o name | grep -i postgres | head -1)
show kubectl -n buzz exec "$PG" -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U buzz -Fc buzz' >"$TMP/buzz.dump" 2>"$TMP/dump.err"
[[ -s $TMP/buzz.dump ]] && pass "pg_dump through kubectl exec ($(wc -c <"$TMP/buzz.dump" | tr -d ' ') bytes)" || fail "pg_dump: $(head -3 "$TMP/dump.err")"

section "6. Upgrade (helm upgrade with the same values)"
show helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version "$VERSION" \
  --namespace buzz -f "$TMP/buzz-values.yaml" --wait --timeout 10m >"$TMP/upgrade.log" 2>&1 &&
  pass "helm upgrade" || fail "helm upgrade: $(tail -5 "$TMP/upgrade.log")"
kubectl -n buzz rollout restart "$DEPLOY" >/dev/null && kubectl -n buzz rollout status "$DEPLOY" --timeout 5m >/dev/null && pass "relay restarted" || fail "relay restart"
alive && pass "liveness after the restart" || fail "no liveness after the restart"
as "$OWNER_SK" --format compact messages get --channel "$CH" --limit 10 2>&1 | grep -q "hello from a member" && pass "messages survive a restart" || fail "messages lost in a restart"
fetch_pic && pass "the file survives a restart" || fail "the file is gone after a restart"

section "RESULT"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
