#!/usr/bin/env bash
# Smoke test for the Kubernetes path: Block's Helm chart, quickstart profile, behind an ingress
# with a Let's Encrypt certificate. Runs from a laptop with kubectl, helm and the buzz CLI.
#
# Needs: KUBECONFIG pointing at a cluster with an ingress controller (class $INGRESS_CLASS) and a
# cert-manager ClusterIssuer named $ISSUER; a domain that resolves to the ingress; the buzz CLI.
#
# Usage: BUZZ_CLI=path/to/buzz bash smoke-k8s.sh <domain> [image-tag]
#   image-tag        sha-<7 hex> or a release such as 0.3.0 (default: tested-image in SKILL.md). Any
#                    other tag needs EXPECTED_DIGEST. The chart needs no bundle, so no commit.
#   INGRESS_CLASS (default traefik), ISSUER (default letsencrypt), CHART_VERSION (default 0.1.10)
#   JOIN_NPUB=npub1… adds that person as a member at the end, to try Buzz Desktop and a phone
set -uo pipefail

DOMAIN=${1:?usage: smoke-k8s.sh <domain> [image-tag]}
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/lib/image.sh"
SKILL=$HERE/../skills/self-host-buzz
TAG=${2:-$(default_image_tag "$SKILL/SKILL.md")} || exit 2
EXPECTED_DIGEST=$(expected_image_digest "$TAG" "${EXPECTED_DIGEST:-}" "$SKILL/SKILL.md") || exit 2
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

section "1. The values file (kubernetes.md step 3, run as written)"
# The guide's own block, so the test installs what the steps install: both images by digest, the
# CORS origins, notifications and the pairing route. Only the ingress class and the issuer can
# differ, when INGRESS_CLASS or ISSUER name the cluster's own.
VALUES_BLOCK=$(awk '/^\*\*3\. Values\.\*\*/ {s=1} s && /^```bash$/ {f=1; next} f && /^```$/ {exit} f' "$SKILL/references/kubernetes.md")
[[ $VALUES_BLOCK == "cat > buzz-values.yaml <<YAML"* ]] || { fail "kubernetes.md step 3 has no values block to run"; exit 1; }
(cd "$TMP" && DIGEST=$EXPECTED_DIGEST && eval "$VALUES_BLOCK") || { fail "kubernetes.md step 3's values block failed"; exit 1; }
if [[ $CLASS != traefik || $ISSUER != letsencrypt ]]; then
  sed -i.bak -e "s|^\( *className: \)traefik$|\1$CLASS|" -e "s|^\( *ingressClassName: \)traefik$|\1$CLASS|" \
    -e "s|^\( *cert-manager.io/cluster-issuer: \)letsencrypt$|\1$ISSUER|" "$TMP/buzz-values.yaml" && rm "$TMP/buzz-values.yaml.bak"
fi
cat "$TMP/buzz-values.yaml"
# kubernetes.md step 3's check, verbatim
VALUES_CHECK=$(grep -E '^(relayUrl|ownerPubkey):|^  (tag|digest|url):' "$TMP/buzz-values.yaml")
VALUES_EXPECTED="  tag: $TAG
  digest: $EXPECTED_DIGEST
relayUrl: wss://$DOMAIN
ownerPubkey: $OWNER_HEX
  url: wss://$DOMAIN/pair"
[[ $VALUES_CHECK == "$VALUES_EXPECTED" ]] && pass "the values name the tag, the digest, the address, the owner and the pairing address" ||
  { fail "the values file is not what step 3 describes: $VALUES_CHECK"; exit 1; }
STORE_IMAGE=$(sed -n 's/^  image: \(ghcr\.io\/block\/buzz-minio@sha256:[0-9a-f]\{64\}\)$/\1/p' "$TMP/buzz-values.yaml")
[[ -n $STORE_IMAGE && $(grep -c "^  mcImage: $STORE_IMAGE$" "$TMP/buzz-values.yaml") == 1 ]] && pass "the values pin the file store's two images to one digest" ||
  { fail "the values don't pin the file store's images by digest"; exit 1; }

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
[[ $IMG == "ghcr.io/block/buzz@$EXPECTED_DIGEST" ]] && pass "relay is pinned to the expected digest for $TAG" || { fail "relay image is not the expected digest"; exit 1; }
# kubernetes.md step 6's check, verbatim: what the running pod pulled ends with the digest
IMAGE_ID=$(kubectl -n buzz get pods -l app.kubernetes.io/component=relay -o jsonpath='{.items[*].status.containerStatuses[?(@.name=="relay")].imageID}')
info "the running relay's image: $IMAGE_ID"
[[ $IMAGE_ID == *"@$EXPECTED_DIGEST" ]] && pass "the running relay's image ends with the digest (step 6's check)" || fail "the running relay's image doesn't end with the digest"
STORE_RUNNING=$(kubectl -n buzz get deploy -o jsonpath='{range .items[*]}{.spec.template.spec.containers[0].image}{"\n"}{end}' | grep buzz-minio)
[[ $STORE_RUNNING == "$STORE_IMAGE" ]] && pass "the file store is pinned to its digest" || fail "the file store's image is [$STORE_RUNNING], not the pinned one"
show kubectl -n buzz exec "$DEPLOY" -c relay -- /usr/local/bin/buzz-admin list-members >"$TMP/members.out" 2>&1
grep -qE "$OWNER_HEX +owner" "$TMP/members.out" && pass "ownerPubkey became the owner" || fail "the owner is not in the member list: $(tail -3 "$TMP/members.out")"

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
PAIR_URL=$(curl -s -H 'Accept: application/nostr+json' "https://$DOMAIN/" | field pairing_relay_url)
[[ $PAIR_URL == "wss://$DOMAIN/pair" ]] && pass "the relay names its pairing service, $PAIR_URL" || fail "pairing_relay_url is [$PAIR_URL]"
PS=$(curl -s -m 3 --http1.1 -o /dev/null -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: c21va2UtdGVzdC0xMjM0NQ==' "https://$DOMAIN/pair" 2>/dev/null)
[[ $PS == 101 ]] && pass "phones reach the pairing service at /pair (WebSocket)" || fail "no WebSocket at /pair: HTTP $PS"

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

if [[ -n ${JOIN_NPUB:-} ]]; then
  section "A person to try Buzz Desktop and a phone"
  kubectl -n buzz exec "$DEPLOY" -- /usr/local/bin/buzz-admin add-member --pubkey "$JOIN_NPUB" --role member && info "join from Buzz Desktop with wss://$DOMAIN, then pair a phone in Settings, Mobile"
fi

section "RESULT"
echo "relay: wss://$DOMAIN"
echo "passed: $PASS  failed: $FAIL"
[[ $FAIL -eq 0 ]]
