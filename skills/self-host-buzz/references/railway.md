# Railway

Block's Railway template deploys four pieces: the relay (a service named `block/buzz:main`),
Postgres 18, Redis and a Railway bucket for files. It sets `RELAY_URL`, CORS and the media URLs
from the `*.up.railway.app` name Railway assigns. The relay gets no volume of its own, so git
repositories pushed to it are lost on every redeploy.

Every `railway` command acts on the project linked to the directory it runs in. Run them all from
the directory step 2 links (`cd` there in every call if each runs in a fresh shell), and check
that `railway status` names the project before changing anything.

Plans cap the services an account's live projects can hold. The template adds 3 services and a
bucket, and phone pairing (step 6) one more; past the cap the deploy fails with `Too many services in project`, even into a new
project. `railway list` shows names, not the services that count, so deploy, and if it fails
that way, stop and ask: deleting a project the user doesn't need (it makes room at once, though
deleted projects stay listed for two days) or changing plans is their call. Volume sizes follow
the plan too: `railway volume list` showed 500 MB each for Postgres and Redis on the tested
account. Tell the user; growing them is a plan change.

1. **Name.** Ask first: keep the `*.up.railway.app` name Railway assigns, or use the user's own
   domain (step 4)? Either way, it's the permanent URL once anyone joins.
2. **Deploy.** Ask the user to open https://railway.com/deploy/buzz-relay-block and deploy it. It
   asks for `RELAY_OWNER_PUBKEY`: give them `$OWNER_HEX` (hex, not the npub). Or, with the Railway
   CLI logged in (ask first: it creates a project that costs money), from a new directory, which
   the CLI links to the project, with a name not already in `railway list`:
   ```bash
   railway init --name buzz --workspace <workspace ID>
   railway deploy -t buzz-relay-block -v RELAY_OWNER_PUBKEY=$OWNER_HEX
   ```
   The workspace IDs, without the user's email that `railway whoami --json` also prints:
   `railway whoami --json | python3 -c 'import json,sys; [print(w["id"], w["name"]) for w in json.load(sys.stdin)["workspaces"]]'`.
   `deploy` returns at once, and the services appear 10 to 20 seconds later. Check:
   `railway service status -s "block/buzz:main"` → `Status: SUCCESS` within a few minutes; retry
   while it says `not found`, `NO DEPLOYMENT`, `QUEUED` or `DEPLOYING`. The relay's name:
   `railway domain list --service "block/buzz:main"`; set `DOMAIN` to it, and `ORIGIN` and
   `RELAY_URL` as SKILL.md section 2 says.
3. **Relay key and settings.** The template generates `BUZZ_RELAY_PRIVATE_KEY` into Railway's
   variables. Ask the user to copy it from the relay service's Variables into a password manager
   two maintainers can open. Never print the variables yourself: most of them are secrets. This
   prints only the URL, the owner and the key's length:
   ```bash
   railway variable list -s "block/buzz:main" --json | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v["RELAY_URL"], v["RELAY_OWNER_PUBKEY"], len(v["BUZZ_RELAY_PRIVATE_KEY"]))'
   ```
   Check: `wss://$DOMAIN $OWNER_HEX 64`.
4. **The user's domain**, if they chose it in step 1. Relay service, Settings, Networking, custom
   domain, then the CNAME record Railway shows. Then set the URLs on the relay (it redeploys) and
   set `DOMAIN` to it.
   ```bash
   railway variable set -s "block/buzz:main" RELAY_URL=wss://$DOMAIN BUZZ_MEDIA_BASE_URL=https://$DOMAIN/media \
     BUZZ_MEDIA_SERVER_DOMAIN=$DOMAIN BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,https://$DOMAIN
   ```
5. **Update the image before anyone uploads.** The template pins `sha-788b3c0` (relay 0.2.0),
   from before block/buzz#4610 made reading a file require a member's signature: on it, anyone
   with a file's link can open it. The second command prints nothing when it works.
   ```bash
   curl -s -H 'Accept: application/nostr+json' $ORIGIN/ | grep -o '"version":"[^"]*"'
   railway service source connect --image ghcr.io/block/buzz:$TAG --service "block/buzz:main"
   ```
   Check: `railway service status -s "block/buzz:main"` goes through `DEPLOYING` and back to
   `SUCCESS` (the old deployment's `SUCCESS` shows first, so wait for the change), and
   `railway service list` shows `image: ghcr.io/block/buzz:$TAG` under `block/buzz:main`. The
   first command shows `0.2.0` before; the version afterwards often stays the same between tags.
6. **Phone pairing.** Phones join by scanning a code from Buzz Desktop, through a pairing service
   the template doesn't run. Add it as a fifth service, from the same image, with its own Railway
   name (it counts against the plan's services):
   ```bash
   railway add --image ghcr.io/block/buzz:$TAG --service buzz-pair --variables "BUZZ_PAIR_RELAY_BIND_ADDR=0.0.0.0:5000"
   railway domain --service buzz-pair --port 5000
   ```
   Set `PAIR` to the `*.up.railway.app` name the second command prints. Then the service must run
   the pairing program instead of the relay: ask the user to open the `buzz-pair` service,
   Settings, Deploy, and set Custom Start Command to `/usr/local/bin/buzz-pair-relay` (the CLI's
   `railway environment edit --service-config buzz-pair deploy.startCommand …` answered `No
   changes to apply` in testing). It redeploys on its own. Check:
   `railway service logs -s buzz-pair | tail -3` shows `buzz-pair-relay listening on 0.0.0.0:5000`,
   not `BUZZ_RELAY_PRIVATE_KEY must be set`. Then tell the relay where it is (it redeploys):
   ```bash
   railway variable set -s "block/buzz:main" BUZZ_PAIRING_RELAY_URL=wss://$PAIR
   ```
   Check: once `railway service status -s "block/buzz:main"` is back to `SUCCESS`, check-relay.sh
   prints `PASS  phone pairing at wss://$PAIR`. An image upgrade moves both services:
   `railway service source connect --image ghcr.io/block/buzz:$TAG --service buzz-pair` too.

Then check it, as SKILL.md section 3 says, with no IP, and join, as section 4 says.
