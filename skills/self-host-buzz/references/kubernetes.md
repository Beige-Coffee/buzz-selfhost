# Kubernetes, with Block's Helm chart

Chart `0.1.10`, quickstart profile: Postgres, Redis and MinIO run in the cluster, with one relay
replica. That's the tested install. The chart calls it an evaluation profile (one MinIO replica):
for a team, back it up (operations.md) or use the production profile (managed Postgres, Redis and
S3), which isn't tested here. Tell the user which one they're getting. Tested on DigitalOcean
Kubernetes 1.36 with Traefik (chart 41.6.1, Traefik 3.7) and cert-manager 1.21. Needs `kubectl`
and `helm` pointed at the cluster, with `kubectl` within one minor version of it: keep the same
`KUBECONFIG` or context for every command, including the ones the user runs. `RELAY_URL=wss://$DOMAIN`, `ORIGIN=https://$DOMAIN`. Ask before
anything that costs money or creates DNS records: Traefik's load balancer, and the quickstart's
four volumes (34 GiB on DigitalOcean). Run the heredocs below as shown, unindented.
For a relay reachable only over a private network (Tailscale), read **Private network** below
first: it replaces steps 1, 2 and 6.

**1. Cluster.** `helm list -n buzz` must not show an existing `buzz` release. Then
`kubectl get ingressclass; kubectl get clusterissuer` should show an ingress class and a ready
issuer. On a fresh cluster the second command errors (`doesn't have a resource type`): there's no
cert-manager yet. If the cluster has its own, use their names wherever this file says `traefik`
and `letsencrypt`. If it lacks one or both, and the user agrees, install what's missing (Traefik
creates a cloud load balancer, which costs money):
```bash
helm install traefik oci://ghcr.io/traefik/helm/traefik --version 41.6.1 -n traefik \
  --create-namespace --wait
helm install cert-manager oci://quay.io/jetstack/charts/cert-manager --version v1.21.2 -n cert-manager \
  --create-namespace --set crds.enabled=true --wait
kubectl apply -f - <<'YAML'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-account
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
YAML
```

Check: `kubectl get ingressclass` shows `traefik`, and `kubectl get clusterissuer letsencrypt`
shows `READY True` (it takes a few seconds).

**2. DNS.** Ask the user for an A record for `$DOMAIN` at the ingress's load balancer:
`kubectl -n traefik get svc traefik -o jsonpath='{.status.loadBalancer.ingress[0].ip}'` (if it
prints nothing, the load balancer is still being made: wait a minute and run it again). Where
the load balancer has a hostname instead (AWS), read `.hostname` and ask for a CNAME. For a test
without a domain, `<the IP with dashes>.sslip.io` resolves to that IP with no record; like any
name from an IP, it only lives as long as the load balancer keeps it. Check:
`python3 -c "import socket; print(socket.gethostbyname('$DOMAIN'))"` prints the same address.

**3. Values.** Pin the image (the chart's default, `0.1.0`, dates from June 2026, before file
reads required membership), replace the dead MinIO images (block/buzz#7880; note `:latest` can
change under you), let Buzz Desktop in (block/buzz#2872), and turn on the phone pairing service,
which the chart runs but doesn't route: the last block adds a `/pair` route to it on the same
name and certificate. The file holds no secrets, and
upgrades reuse it: ask the user where to keep it, such as their infrastructure repository, and run
steps 3 and 4 from that folder (create it if needed; `cat >` replaces a file already there).
```bash
cat > buzz-values.yaml <<YAML
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
  className: traefik
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - hosts: [$DOMAIN]
      secretName: buzz-tls
pairingRelay:
  enabled: true
  url: wss://$DOMAIN/pair
extraManifests:
  - apiVersion: networking.k8s.io/v1
    kind: Ingress
    metadata:
      name: buzz-pairing
    spec:
      ingressClassName: traefik
      tls:
        - hosts: [$DOMAIN]
          secretName: buzz-tls
      rules:
        - host: $DOMAIN
          http:
            paths:
              - path: /pair
                pathType: Prefix
                backend:
                  service:
                    name: buzz-pairing
                    port:
                      number: 5000
YAML
```
Check: `grep -E '^(relayUrl|ownerPubkey):|^  tag:|^  url:' buzz-values.yaml` shows `$TAG`,
`wss://$DOMAIN`, `$OWNER_HEX` and `wss://$DOMAIN/pair`, not empty values (a shell that lost the
variables writes blanks).

**4. Install.** About 80 to 100 seconds in testing; run it in the background if your tool times
out sooner. Helm's notes say "Buzz 0.1.0": that's the chart's app version, not the relay's.
```bash
helm install buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 \
  --namespace buzz --create-namespace -f buzz-values.yaml --wait --timeout 10m
```

Check: `kubectl -n buzz get pods` shows the relay (`buzz-…`), the pairing service
(`buzz-pairing-…`), MinIO, Postgres and Redis pods `1/1 Running`. The relay restarts a few times while Postgres starts. The MinIO init job shows
`Completed` and is removed about two minutes later, so not seeing it afterwards is normal.

**5. Relay key.** The chart generated it into the `buzz-relay` Secret. Check, without printing
it: `kubectl -n buzz describe secret buzz-relay | grep BUZZ_RELAY_PRIVATE_KEY` → `64 bytes`. Ask
the user to copy it into a password manager two maintainers can open, by running this in their
own terminal with the same `KUBECONFIG` (it prints the key), and carry on meanwhile:
`kubectl -n buzz get secret buzz-relay -o jsonpath='{.data.BUZZ_RELAY_PRIVATE_KEY}' | base64 -d`.

**6. Checks.** `kubectl -n buzz get certificate` → `buzz-tls` `True` (if `False`, wait a minute
and run it again);
`kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin list-members` shows
`$OWNER_HEX` with the role `owner`; then SKILL.md section 3. To confirm the relay's own ports
aren't exposed, give it a node's public IP (`kubectl get nodes -o wide`, EXTERNAL-IP) and
`3000 5000 8080`: the load balancer forwards only 80 and 443, so a leak would show on a node. Then
**join**, as section 4 says.

**Private network (Tailscale).** The relay gets a name on the user's tailnet,
`<name>.<tailnet>.ts.net`, with HTTPS from Tailscale and nothing public: no load balancer, no DNS
record. Tailscale's Kubernetes operator does it. Members install Tailscale and join the tailnet
before they join the community, on their phones too.
Each member uses a Tailscale user seat, which costs money on paid plans. Tested on DigitalOcean
Kubernetes 1.36 with operator 1.102. In order: P1 to P6, then SKILL.md section 3.

**P1. Tailnet.** The user does these in the Tailscale admin console (they change the account,
so ask):
- DNS: Enable HTTPS. It lists the relay's name in public certificate logs.
- Access controls, in `tagOwners`: `"tag:k8s-operator": ["autogroup:admin"]` and
  `"tag:k8s": ["tag:k8s-operator"]`. Unless the policy already allows everything, a grant:
  `{"src": ["autogroup:member"], "dst": ["tag:k8s"], "ip": ["tcp:443"]}`, adding to `src` any tag
  the user's own devices carry (a tagged device doesn't count as a member).
- Settings, Trust credentials, Credential, OAuth: Write on General › Services, Devices › Core and
  Keys › Auth Keys, with the tag `tag:k8s-operator`. They save the client ID and the secret into
  two files only they can read, with no newline at the end: the operator reads the files as they
  are, and a newline breaks its sign-in. `printf '%s' '<value>' > <file>` writes one that way.

Check: `wc -l < <file>` → `0` for each file (no newline; it prints nothing secret, and macOS pads
the number with spaces), and `ls -l` shows `-rw-------` for both.

**P2. Operator.** `helm list -n buzz` must not show an existing `buzz` release. The Secret keeps
the OAuth secret out of Helm's values, which `helm get values` shows:
```bash
kubectl create namespace tailscale
kubectl -n tailscale create secret generic operator-oauth \
  --from-file=client_id=<client ID file> --from-file=client_secret=<secret file>
helm install tailscale-operator tailscale-operator --repo https://pkgs.tailscale.com/helmcharts \
  --version 1.102.4 -n tailscale --wait
```
Check, half a minute later: `kubectl -n tailscale logs deploy/operator | grep -c "Startup complete"`
→ `1`: the operator signed in with the OAuth client. A wrong ID or secret never gets there, though
the pod still shows `Running`. And `kubectl get ingressclass` shows `tailscale`.

**P3. Name.** This machine must be on the tailnet:
```bash
tailscale status --json | python3 -c 'import json,sys,socket; s=json.load(sys.stdin); me=s["Self"]["DNSName"].rstrip("."); print(s["MagicDNSSuffix"], me, socket.gethostbyname(me))'
```
On a Mac without the CLI on its path, use `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
It prints the tailnet's part of the name, then this machine's own name and address. The address
shows this machine uses Tailscale's DNS, so the next check means something; an error means it
doesn't, so fix that first. The user picks the first part, such as `buzz`. Set `DOMAIN` to both,
like `buzz.tail1234.ts.net`, and have the user confirm the whole URL, `wss://$DOMAIN`: it's
permanent, and renaming the tailnet later changes it too. Check that it's free:
`python3 -c "import socket; print(socket.gethostbyname('$DOMAIN'))"` must fail. If it prints an
address, another machine has the name: Tailscale would call the relay `<name>-1` while the
community's URL led to that machine. Pick another name.

**P4. Values and install.** In the folder the user picked for the values file (step 3). Its
`ingress:` takes the full name: Tailscale names the machine after its first part, and ignores the
chart's rule unless the rule's host matches it exactly.
```bash
cat > buzz-values.yaml <<YAML
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
  className: tailscale
  tls:
    - hosts: [$DOMAIN]
YAML
```
Check: `grep -E '^(relayUrl|ownerPubkey):|^  tag:' buzz-values.yaml` shows `$TAG`, `wss://$DOMAIN`
and `$OWNER_HEX`, not empty values. Then install, which takes 80 to 100 seconds:
```bash
helm install buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 \
  --namespace buzz --create-namespace -f buzz-values.yaml --wait --timeout 10m
```
Check: `kubectl -n buzz get pods` shows the relay (`buzz-…`), MinIO, Postgres and Redis pods
`1/1 Running`; the relay restarts a few times while Postgres starts.

**P5. Relay key.** The chart generated it into the `buzz-relay` Secret. Check, without printing
it: `kubectl -n buzz describe secret buzz-relay | grep BUZZ_RELAY_PRIVATE_KEY` → `64 bytes`. Ask
the user to copy it into a password manager two maintainers can open, any time before anyone
joins, by running this in their own terminal with the same `KUBECONFIG` (it prints the key):
`kubectl -n buzz get secret buzz-relay -o jsonpath='{.data.BUZZ_RELAY_PRIVATE_KEY}' | base64 -d`.

**P6. Checks.**
- `kubectl -n buzz get ingress buzz` shows `$DOMAIN` under ADDRESS within a minute or so. If it
  shows `<name>-1`, the name was taken: uninstall, pick a free name, and start again at P3.
- Nothing public: `kubectl get svc -A -o jsonpath='{range .items[*]}{.spec.type}{"\n"}{end}' | grep -vc ClusterIP`
  → `0`, and `kubectl -n buzz get ingress buzz -o jsonpath='{.metadata.annotations}'` shows no
  `tailscale.com/funnel` (Funnel would publish the relay to the internet).
- `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin list-members` shows
  `$OWNER_HEX` with the role `owner`.
- SKILL.md section 3 from this machine, with a node's public IP (`kubectl get nodes -o wide`,
  EXTERNAL-IP) and `80 443 3000 8080`. The first request makes the certificate; the script waits.

Members, backups and upgrades work as for the public install.

**Removing it** (ask first: it deletes the community). `helm uninstall buzz -n buzz` keeps the
data volumes; `kubectl delete namespace buzz` then deletes them. On a private network, uninstall
before deleting the cluster: the operator then removes the relay's machine from the tailnet,
while the operator's own machine stays until the user removes it in the admin console. In testing,
deleting a DigitalOcean cluster didn't always delete its volumes, which keep costing money: check
the provider's volumes list afterwards.

**Production.** For production, or for Argo CD and Flux (they render with `helm template`, which
makes the chart's generated secrets rotate, changing the relay's identity), use the chart's
production profile with managed Postgres, Redis and S3 and a Secret made ahead of time; see the
chart's README. Not yet tested here.

**Phone pairing on a private network.** Steps 3 and 4 turn it on for a public relay. Here it would
need its own Tailscale name: a second Tailscale ingress to the `buzz-pairing` service on port
5000, and `pairingRelay.url` set to `wss://` that name. Not yet tested.
