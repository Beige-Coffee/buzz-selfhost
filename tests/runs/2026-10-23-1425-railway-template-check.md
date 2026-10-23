# Railway: Block's template, deployed from the CLI

- **When:** 2026-10-23 14:25 PDT, about 3 minutes from `railway init` to `railway delete`
- **Setup:** Block's template, deployed once with `railway deploy -t buzz-relay-block` into a new
  project (`buzz-template-check`), from a new empty directory linked to it, with the Railway CLI
  5.62.1. The workspace is on Railway's trial: the Hobby plan with $5 of credit, at most 2 projects
  and 5 services in each, and no other projects at the start. railway.md steps 2, 3 and 5, then
  check-relay.sh, then the project deleted. Not run: step 4 (no custom domain) and step 6 (phone
  pairing, a fifth service).
- **Relay version:** `sha-788b3c0` (relay 0.2.0) from the template, then `sha-9e8c9fc` (relay
  0.2.1), the tag `pick-tag.py` chose. The skill was last tested with `sha-e8781ca`.
- **Result:** The template still deploys, and every railway.md check passed as written.
  - Step 2: `block/buzz:main` reached `Status: SUCCESS` a minute after `railway deploy`, with
    Postgres, Redis and the bucket. `railway domain list` named the relay.
  - Step 3: `wss://$DOMAIN $OWNER_HEX 64`, the relay key checked by its length only.
  - Step 5: the version said `0.2.0`, `source connect` printed nothing, and the relay went through
    `DEPLOYING` to `SUCCESS` in about 30 seconds. `railway service list` then showed
    `image: ghcr.io/block/buzz:sha-9e8c9fc`, and the version said `0.2.1`.
  - check-relay.sh on the template's image: every line passed except channel labels (`nip-cl`), so
    Buzz 1.0 could join but not start a chat. After the update, every line passed, `nip-cl`
    included. Phone pairing printed `SKIP`, as step 6 wasn't run.
- **Cost:** $0.0002, as `railway usage` reported it, out of the trial's credit.
- **Removed:** `railway delete --project <id> --yes` was accepted at once: the relay's address
  answered 404, the CLI said `Project is deleted`, and the workspace's project count went back to
  0. `railway list` still names the project, with a `deletedAt` two days on (2026-10-25 21:28
  UTC), as railway.md says deleted projects stay listed. `railway unlink -y` then removed the
  directory's link, and the directory was removed.

## Notes

- railway.md says Railway listed the template as degraded that day, after Railway's own validation
  run on 2026-10-18 failed with a workspace restriction. This deploy from the CLI worked. Railway's
  API listed the template as `PUBLISHED`, with a health of 92 and 571 active projects, last updated
  2026-10-19.
- The skill's steps needed no change. The template still pins `sha-788b3c0`, so step 5's image
  update now matters for Buzz 1.0's New chat as well as for who can read files.
- `railway service status` without `-s` answers `No service linked`. The skill always passes `-s`.
- After `source connect`, the first status already named the new deployment (`DEPLOYING`), not the
  old deployment's `SUCCESS` that railway.md warns about.

## Read-only context

The workspace's plan before the deploy, and the template's status, from `railway api`. The queries
and their answers are trimmed to the fields that matter.

```text
$ railway api 'query($id: String!) { workspace(workspaceId: $id) { plan projectCount subscriptionPlanLimit customer { isTrialing trialDaysRemaining creditBalance remainingUsageCreditBalance } } }' --raw-var id=<id>
plan HOBBY, projectCount 0
customer: isTrialing true, trialDaysRemaining 8, creditBalance 5, remainingUsageCreditBalance 4.97
subscriptionPlanLimit: projects 2, project.services 5, buckets.maxPerProject 3, volumes.maxSizeMB 500
$ railway api 'query { template(code: "buzz-relay-block") { status health activeProjects updatedAt } }'
status PUBLISHED, health 92, activeProjects 571, updatedAt 2026-10-19T08:04:04.963Z
```

## The commands, as they ran

`$SKILL` is the skill's folder and `$SP` a scratch folder. Every command ran in the new directory
linked to the project. Masked with `lib/redact.py --private`, plus the relay's name as `<domain>`
and Railway's IDs as `<id>`.

```text
[14:25:17] $ OWNER_HEX=$(python3 $SKILL/scripts/npub-to-hex.py npub1<masked>); echo "owner hex: ${#OWNER_HEX} chars, $OWNER_HEX"
owner hex: 64 chars, <hex>
[14:25:17] $ TAG=$(python3 $SKILL/scripts/pick-tag.py); echo "tag: $TAG"
tag: sha-9e8c9fc
[14:25:30] $ pwd; ls -A | wc -l; railway status
/private/tmp/claude-503/-Users-user-code/<id>/scratchpad/railway-check
       0
No linked project found. Run railway link to connect to a project
  → Run `railway link` to connect to a project.
[exit 1]
[14:25:39] $ railway list

beige-coffee's Projects
[exit 0]
[14:25:39] $ railway whoami --json | python3 -c 'import json,sys; [print(w["id"], w["name"]) for w in json.load(sys.stdin)["workspaces"]]'
<id> beige-coffee's Projects
[exit 0]
[14:25:40] $ railway init --name buzz-template-check --workspace <id>
> Select a workspace beige-coffee's Projects
> Project Name buzz-template-check

Created project buzz-template-check on beige-coffee's Projects
https://railway.com/project/<id>
[exit 0]
[14:25:41] $ railway status

Workspace:       beige-coffee's Projects

Project:         buzz-template-check
Project ID:      <id>

Environment:     production
Environment ID:  <id>

Linked service

    Service:         None

────────────────────────────────────────────────

All resources


[exit 0]
[14:25:46] $ railway deploy -t buzz-relay-block -v RELAY_OWNER_PUBKEY=$OWNER_HEX
Creating buzz-relay-block...
[exit 0]
[14:25:58] $ for i in $(seq 1 30); do out=$(railway service status -s "block/buzz:main" 2>&1); echo "[$(date +%H:%M:%S)] $(echo "$out" | tr "
" " " | sed -E "s/ +/ /g")"; case $out in *SUCCESS*|*FAILED*|*CRASHED*|*REMOVED*) break;; esac; sleep 10; done
[14:25:59] Service: block/buzz:main Deployment: <id> Status: INITIALIZING 
[14:26:12] Service: block/buzz:main Deployment: <id> Status: QUEUED 
[14:26:24] Service: block/buzz:main Deployment: <id> Status: DEPLOYING 
[14:26:35] Service: block/buzz:main Deployment: <id> Status: DEPLOYING 
[14:26:46] Service: block/buzz:main Deployment: <id> Status: SUCCESS 
[exit 0]
[14:26:50] $ railway service status
No service linked. Use --service flag or --all to see all services
[exit 1]
[14:26:51] $ railway service list

Services in production

block/buzz:main
    status:        ● Online
    image:         ghcr.io/block/buzz:sha-788b3c0
    url:           https://<domain>
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

Postgres
    status:        ● Online
    image:         ghcr.io/railwayapp-templates/postgres-ssl:18
    volume:        postgres-volume · /var/lib/postgresql/data · 0 MB / 500 MB
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

Redis
    status:        ● Online
    image:         redis:8.2.1
    volume:        redis-volume · /data · 0 MB / 500 MB
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

[exit 0]
[14:26:56] $ railway bucket list
Bucket
[exit 0]
[14:26:57] $ railway domain list --service "block/buzz:main"
Domains for service block/buzz:main in environment production:
Domain                                         Type      ID                                     Port   Sync
<domain>   service   <id>   3000   ACTIVE
[exit 0]
[14:27:03] $ railway service status --all
Warning: `railway service status --all` is deprecated. Please use `railway service list` instead.
Services in production:

Postgres             | <id> | SUCCESS
block/buzz:main      | <id> | SUCCESS
Redis                | <id> | SUCCESS
[exit 0]
[14:27:10] $ railway variable list -s "block/buzz:main" --json | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["RELAY_URL"], v["RELAY_OWNER_PUBKEY"], len(v["BUZZ_RELAY_PRIVATE_KEY"]))' > $SP/step3.out; cat $SP/step3.out; [ "$(cat $SP/step3.out)" = "wss://$DOMAIN $OWNER_HEX 64" ] && echo "MATCH: wss://\$DOMAIN \$OWNER_HEX 64" || echo "MISMATCH"
wss://<domain> <hex> 64
MATCH: wss://$DOMAIN $OWNER_HEX 64
[exit 0]
[14:27:16] $ curl -s -H "Accept: application/nostr+json" $ORIGIN/ | grep -o "\"version\":\"[^\"]*\""
"version":"0.2.0"
[exit 0]
[14:27:16] $ bash $SKILL/scripts/check-relay.sh "$ORIGIN"
PASS  liveness: ok
PASS  relay version 0.2.0
PASS  relay identity (Buzz 1.0 needs it to join)
FAIL  channel labels (nip-cl): missing, so Buzz 1.0's New chat fails; it needs a relay image from 2026-10-15 or later
PASS  WebSocket upgrade (what Buzz joins over)
SKIP  phone pairing: the relay names no pairing service
PASS  Buzz 0.X allowed (CORS; Buzz 1.0 doesn't need it)
[exit 1]
[14:27:25] $ railway service source connect --image ghcr.io/block/buzz:$TAG --service "block/buzz:main"
[exit 0]
[14:27:31] $ for i in $(seq 1 36); do out=$(railway service status -s "block/buzz:main" 2>&1); echo "[$(date +%H:%M:%S)] $(echo "$out" | tr "
" " " | sed -E "s/ +/ /g")"; case $out in *<old id>*) ;; *SUCCESS*|*FAILED*|*CRASHED*|*REMOVED*) break;; esac; sleep 10; done
[14:27:31] Service: block/buzz:main Deployment: <id> Status: DEPLOYING 
[14:27:42] Service: block/buzz:main Deployment: <id> Status: DEPLOYING 
[14:27:53] Service: block/buzz:main Deployment: <id> Status: SUCCESS 
[exit 0]
[14:27:57] $ railway service list

Services in production

block/buzz:main
    status:        ● Online
    image:         ghcr.io/block/buzz:sha-9e8c9fc
    url:           https://<domain>
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

Postgres
    status:        ● Online
    image:         ghcr.io/railwayapp-templates/postgres-ssl:18
    volume:        postgres-volume · /var/lib/postgresql/data · 0 MB / 500 MB
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

Redis
    status:        ● Online
    image:         redis:8.2.1
    volume:        redis-volume · /data · 0 MB / 500 MB
    region:        sfo
    deployment ID: <id>
    service ID:    <id>

[exit 0]
[14:27:58] $ curl -s -H "Accept: application/nostr+json" $ORIGIN/ | grep -o "\"version\":\"[^\"]*\""
"version":"0.2.1"
[exit 0]
[14:27:58] $ bash $SKILL/scripts/check-relay.sh "$ORIGIN"
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  relay identity (Buzz 1.0 needs it to join)
PASS  channel labels (nip-cl): Buzz 1.0 can start chats
PASS  WebSocket upgrade (what Buzz joins over)
SKIP  phone pairing: the relay names no pairing service
PASS  Buzz 0.X allowed (CORS; Buzz 1.0 doesn't need it)
[exit 0]
[14:28:44] $ railway usage projects --project buzz-template-check
Project usage

Workspace:         beige-coffee's Projects
Project:           buzz-template-check
Billing period:    Sep 30, 2026 - Oct 23, 2026
Usage:             $0.0002

Service                 CPU    Memory   Egress   Volume   Backup    Total
Postgres            $0.0000   $0.0001  $0.0000  $0.0000  $0.0000  $0.0001
block/buzz:main     $0.0000   $0.0000  $0.0000 -$0.0000 -$0.0000  $0.0001
Redis               $0.0000   $0.0000  $0.0000  $0.0000  $0.0000  $0.0000
[exit 0]
[14:28:48] $ railway status | grep -E "Project|Environment:"
Workspace:       beige-coffee's Projects
Project:         buzz-template-check
Project ID:      <id>
Environment:     production
[exit 0]
[14:28:53] $ railway delete --project $PROJECT_ID --yes --json
> Select the project to delete buzz-template-check (beige-coffee's Projects)
{"id":"<id>"}
[exit 0]
[14:28:57] $ railway list

beige-coffee's Projects
  buzz-template-check
[exit 0]
[14:28:58] $ railway list --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d), "projects:", [p.get("name") for p in d])'
1 projects: ['buzz-template-check']
[exit 0]
[14:28:58] $ railway api 'query($id: String!) { workspace(workspaceId: $id) { projectCount } }' --raw-var id=<id> --compact
{"data":{"workspace":{"projectCount":0}}}
[exit 0]
[14:29:05] $ railway list --json | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(p.get("name"), "| keys:", sorted(p.keys()), "| deletedAt:", p.get("deletedAt")) for p in d]'
buzz-template-check | keys: ['createdAt', 'deletedAt', 'environments', 'id', 'is_favorite', 'name', 'services', 'updatedAt', 'workspace'] | deletedAt: 2026-10-25T21:28:53.858Z
[exit 0]
[14:29:06] $ railway api 'query($id: String!) { project(id: $id) { name deletedAt } }' --raw-var id=$PROJECT_ID --compact --allow-errors
{"data":{"project":{"deletedAt":"2026-10-25T21:28:53.858Z","name":"buzz-template-check"}}}
[exit 0]
[14:29:16] $ curl -s -m 10 -o /dev/null -w "liveness HTTP %{http_code}
" $ORIGIN/_liveness
liveness HTTP 404
[exit 0]
[14:29:16] $ railway service list 2>&1 | grep -vE "url:|deployment ID|service ID"
Project is deleted. Run `railway link` to connect to a project.
[exit 0]
[14:29:16] $ railway service status -s "block/buzz:main"
Project is deleted. Run `railway link` to connect to a project.
[exit 1]
[14:29:31] $ railway unlink -y
Linked to buzz-template-check
[exit 0]
[14:29:38] $ railway usage projects
Usage by project

Workspace:             beige-coffee's Projects
Billing period:        Sep 30, 2026 - Oct 23, 2026
Projects with usage:   6
Total usage:           $0.0278
Showing:               all projects

Project                        Current Cost
buzz-relay                          $0.0114
  Deleted on Oct 4, 2026
buzz-selfhost-smoke                 $0.0078
  Deleted on Oct 3, 2026
buzz-selfhost-test                  $0.0035
  Deleted on Oct 2, 2026
buzz-pair-test                      $0.0032
  Deleted on Oct 7, 2026
buzz                                $0.0018
  Deleted on Oct 3, 2026
buzz-template-check                 $0.0002
  Deleted on Oct 25, 2026
[14:29:39] $ railway usage | grep -E "Current usage|Billing period"
Billing period:    Sep 30, 2026 - Oct 23, 2026
Current usage:     $0.0276
```
