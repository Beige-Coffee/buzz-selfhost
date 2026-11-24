# Operations: members, backups, restore, upgrades

## Docker Compose

Run these commands from `buzz/deploy/compose`, the bundle's folder. In `private` mode, leave out
`BUZZ_COMPOSE_TLS=true`. That mode has no Caddy, and the flag would start Caddy on the public ports.

- **Add a member.** Each member needs an npub. A member who made their key with nak
  has the npub it printed. Anyone else copies it from the Buzz app: in Buzz 1.0, Settings, Identity,
  then Copy Buzz ID on the Buzz ID card, which copies the npub; in Buzz 0.X, the Join screen. Before
  they've joined, Buzz 1.0 also shows their npub on "This community needs an invite". Check the npub
  with `python3 $SKILL/scripts/npub-to-hex.py <npub>`. Then add the member with
  `./run.sh add-member <npub-or-hex> --role member`. Add people one at a time, with `sleep 1`
  between adds, because two adds in the same second collide. `./run.sh list-members` confirms the
  add. It prints each key in hex. A member added this way isn't added to the starter channels. Add
  them to a channel in Buzz too, or tell them to find channels in Search, Channels. The owner can
  also invite people from Buzz 1.0 without the server. In Settings, Community admin, Membership, the
  Invite tab makes a link that anyone can join with until it expires. In Buzz 1.0.0, the same link
  is under Invite members, then "Invite with a link". Only Buzz 1.0.0 can add an npub there, with
  "Add directly". Every release since 1.0.1 offers only the link (Buzz 0.X: Settings, Invites).
  **To change the owner**, set `OWNER_HEX` from the new owner's npub. Run compose.md step 7's
  command and its check. Then restart the relay with `BUZZ_COMPOSE_TLS=true ./run.sh restart`.
  Members lose the connection for about 20 seconds. Check: `./run.sh list-members` shows the new
  key as `owner` and the old one as `admin`. If the user wants the old owner removed, run
  `./run.sh remove-member <old hex>`, then restart the relay as described below. The current owner
  can't be removed.
  **To remove someone**, use Buzz 1.0 when you can. In Settings, Community admin, Membership,
  choose the … on their row, then Remove. That disconnects them and their agents at once.
  `./run.sh remove-member <npub-or-hex>` only deletes the membership. Their open connection keeps
  reading new messages, private channels included, and it can still post. Remove in Buzz can't end
  that connection afterwards, because it answers "member not found". So after a `remove-member`,
  restart the relay with `BUZZ_COMPOSE_TLS=true ./run.sh restart`. Everyone else reconnects within
  about 20 seconds. Check: `./run.sh list-members` no longer lists them. A removed person can rejoin
  with any invite link that hasn't expired. This guide has no procedure for cancelling one link.
  Banning the person who issued links revokes their v2 invite links, and legacy links work
  differently. Keep links to 1 use and 1 day. A removed person's channel memberships stay. Adding
  them back restores every private channel they were in.
  **To ban someone or time them out**, use Buzz 1.0's Settings, Moderation, on a public setup with
  the moderation console (compose.md). Everywhere else, the owner or an admin uses the `buzz`
  command line that ships with Buzz 1.0 instead. That includes every private network, where Buzz's
  moderation screens can't connect. On a Mac, the command is
  `/Applications/Buzz.app/Contents/Resources/bin/buzz`. It signs with the person's private key.
  They run it in a terminal of their own, never the agent's. First,
  `read -rs BUZZ_PRIVATE_KEY && export BUZZ_PRIVATE_KEY` asks for the key without showing it. Then
  `export BUZZ_RELAY_URL=$ORIGIN`, with the address written out, names the relay. In the commands
  below, `<hex>` is the person's key as `npub-to-hex.py` prints it.

  - `buzz moderation reports` lists reports.
  - `buzz moderation ban --pubkey <hex>` bans someone. A ban disconnects them and their agents, and
    refuses them at any invite link.
  - `buzz moderation timeout --pubkey <hex> --expires-in 3600` stops their posts for an hour.
  - `buzz moderation restricted` lists bans and timeouts. `unban` and `untimeout` lift them.
  - `buzz moderation audit` lists past moderation actions, newest first, with who took each one
    (not tested).
  - `buzz messages delete --event <id>` deletes a message in a channel they own or administer (not
    tested).
- **Local agents.** Buzz 1.0 can run agents on the owner's computer. Each agent has its own key and
  the owner's signed attestation (NIP-OA). The relay admits these agents through the owner's
  membership, because `.env` has `BUZZ_ALLOW_NIP_OA_AUTH=true`. That's the bundle's default, and
  the chart's too. Don't add them as members. They don't appear in Membership. They lose access if
  the owner leaves or is removed, in Buzz or with `remove-member` and a restart. The app adds them to
  the channels and chats it uses them in. In testing, an agent posted in a chat that named it. Its
  key without the attestation was refused, and so was an agent of a non-member. Buzz shows agents as
  online only on an image from 2026-10-13 or later.
  **To approve each agent yourself**, ask the user first. Before the change, add each agent the
  user wants to keep as a member with `./run.sh add-member <agent hex> --role member`. Agents you
  don't add are locked out. Then set `BUZZ_ALLOW_NIP_OA_AUTH=false` in `.env` and restart the relay
  with `BUZZ_COMPOSE_TLS=true ./run.sh restart`. After that, the relay refuses a member's own agent
  that isn't a member itself
  ([`restricted: not a relay member`](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/handlers/auth.rs#L787-L791)).
  Buzz then shows only "Couldn't finish" when someone asks that agent to work. Tell members to ask
  an admin to add their agent. The relay treats an agent added as a member as a person. It records
  no owner for the agent
  ([auth.rs](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-relay/src/handlers/auth.rs#L44-L57)).
  It also gives the agent a person's limit of 60 messages a minute. An agent's limit is 120
  ([rate_limit.rs](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/crates/buzz-auth/src/rate_limit.rs#L90-L103)).
  On Kubernetes, the same setting is the chart's `relay.allowNipOaAuth` value. Add an agent with
  only a key of its own, such as a bot on the buzz CLI or one of Buzz 0.X's, as a member. Also add
  it to every channel it answers in. The relay refuses a reply that mentions a non-member. A key
  without relay membership gets `relay error 403: relay_membership_required`. Unless its profile
  carries the owner's proof or an agent flag, Buzz shows such a bot as a person, and a direct
  message doesn't wake it ([agents.md](agents.md#run-an-agent-on-your-own-server)).
- **Back up** the data that can't be rebuilt, all at once, with the relay stopped. That's Postgres,
  the file store's volume, the git volume and `.env`. Ask the user first, because members lose the
  connection for about half a minute. The file store's volume keeps MinIO's name with Silo too, so
  the commands are the same for every tag. Redis holds nothing that needs keeping. The list `run.sh`
  prints after an upgrade also names Caddy's volumes. They hold only certificates, which Caddy gets
  again on its own. That list also names an owner key that a bootstrap script makes. When the owner
  uses their own npub, from nak or the Buzz app, the owner holds that key themselves.
  Plain `docker compose` works in every mode, because these commands touch only the relay, Postgres
  and the volumes. Each backup gets its own folder in `~/buzz-backup`, named for the day. `BACKUP`
  holds that folder's path. If each command runs in a fresh shell, set `BACKUP` again in each call.
  ```bash
  BACKUP=~/buzz-backup/$(date +%F)
  mkdir -p "$BACKUP" && chmod 700 ~/buzz-backup "$BACKUP"
  docker compose stop relay
  docker compose exec -T postgres pg_dump -U buzz -Fc buzz > "$BACKUP/postgres.dump" < /dev/null
  for v in minio-data git-data; do
    docker run --rm -v buzz-prod_buzz-$v:/data:ro -v "$BACKUP":/backup alpine \
      tar czf /backup/$v.tgz -C /data .
  done
  cp .env "$BACKUP/env"
  docker compose start relay
  ```
  Check: `check-relay.sh` passes again, run the same way the install ran it. It waits the half
  minute the relay takes to start. `ls -la "$BACKUP"` shows four files, none of them empty.
  `git-data.tgz` stays tiny until someone hosts a repository.
  `tar tzf "$BACKUP/minio-data.tgz" | grep -c buzz-media` prints a number above 0. A mistyped volume
  name would have made an empty volume and an empty archive.
  `docker compose exec -T postgres pg_restore -l < "$BACKUP/postgres.dump" | wc -l` prints a number
  in the hundreds, which shows the dump reads back. The backup holds every secret. Ask the user how
  to encrypt it, for example with `gpg --symmetric`, and where the copy off the machine goes. Those
  are their decisions. The server's disk is small. Once the copies are off the server, keep only the
  newest few folders on it. Ask first, because this deletes the older ones.
  `ls -d ~/buzz-backup/20*/ | head -n -4 | xargs -r rm -rf` keeps four (not tested). Tell the user
  what the backup schedule means. With weekly backups, losing the server can lose up to a week of
  messages. The provider's own server backups narrow that gap, and so does a nightly backup
  (compose.md, For a server that runs for months).
- **Restore** a backup into empty volumes. Ask the user first, because it replaces the data. Set
  `BACKUP` to the folder to restore, such as `BACKUP=~/buzz-backup/2026-11-06`.
  `ls ~/buzz-backup` lists the folders. A backup made before backups had dated folders is
  `~/buzz-backup` itself. A single server has no standby. Tell the user that nobody can send or read
  new messages until the restore ends. Before changing anything, check the backup (not tested).
  This command prints nothing when all four files are there and none is empty:
  `for f in postgres.dump minio-data.tgz git-data.tgz env; do [ -s "$BACKUP/$f" ] || echo missing $f; done`.
  A missing file archive would bring the community back without its files. Then
  `grep '^RELAY_URL=' "$BACKUP/env"` must show this community's address, as the user knows it. A
  backup from another install would swap the relay's identity and owner.
  To restore onto a new machine, first stop the old relay if it still runs. Copy the backup's folder
  to the same path on the new machine. Run compose.md steps 3, 4 and 9 there. For step 4, use the
  commit the backup's image was built from. Read it from the image with
  `IMAGE=$(grep '^BUZZ_IMAGE=' "$BACKUP/env" | cut -d= -f2)`, then `docker pull -q "$IMAGE"` and
  `COMMIT=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")`.
  Point the domain's A record at the new machine before the restore below starts the relay. Caddy
  then gets its certificate on the new machine. This guide doesn't cover moving a private-network
  relay to a new machine. Its community's address is the old machine's Tailscale name (compose.md
  step 2P). To restore onto the same machine, stop the relay and delete the volumes that the backup
  replaces.
  ```bash
  BUZZ_COMPOSE_TLS=true ./run.sh stop
  docker volume rm buzz-prod_buzz-postgres-data buzz-prod_buzz-minio-data buzz-prod_buzz-git-data
  ```
  If this machine was upgraded since the backup, move the bundle back to the backup's image before
  the restore below, the way Upgrade moves it. Run Upgrade's two `git checkout` lines, with `COMMIT`
  read from the backup's image as above, then compose.md step 9. Whenever a restore redoes step 9
  and the backup's `env` has `BUZZ_ADMIN_HOST`, add the moderation console's Caddy route again too
  (compose.md, Moderation console). In that case, on a new machine, also move `admin.$DOMAIN`'s
  record with the domain's.
  Then check (not tested) that `docker volume ls -q --filter name=buzz-prod_buzz-postgres-data`
  prints nothing. If it prints the volume, this server still has its database. Stop there. If you
  mean to replace that database, delete the volumes as above first. If the block below runs on a
  live server, it stops the relay before it refuses to restore. In the block,
  `docker compose create` makes the volumes the way Compose expects. Compose then doesn't warn about
  them later.
  ```bash
  cp "$BACKUP/env" .env
  docker compose create
  for v in minio-data git-data; do
    docker run --rm -v buzz-prod_buzz-$v:/data -v "$BACKUP":/backup alpine \
      tar xzf /backup/$v.tgz -C /data
  done
  docker compose up -d --wait postgres
  [ "$(docker compose exec -T postgres psql -U buzz -d buzz -tAc "select count(*) from pg_tables where schemaname = 'public'" < /dev/null)" = 0 ] &&
    docker compose exec -T postgres pg_restore -U buzz -d buzz --exit-on-error --single-transaction < "$BACKUP/postgres.dump" &&
    echo restored && BUZZ_COMPOSE_TLS=true ./run.sh start
  ```
  Check: the block prints `restored` and the relay starts. Then `./run.sh list-members` lists the
  members from before. If `restored` doesn't print, the relay is stopped, and there are two cases.
  If the output has a `pg_restore: error` line, the backup didn't go in and the database is empty
  again. Fix the backup, then run the block again. You don't need to delete anything first. Don't
  start the relay before that, because it would serve a new, empty community. If there's no such
  line, the database wasn't empty, and nothing in it was replaced. The block did copy the backup's
  `env` over `.env`. If `.env` changed since the backup, as it does in an upgrade, put those changes
  back first. Then start the relay again with `BUZZ_COMPOSE_TLS=true ./run.sh start`.
  In testing, messages, files, members, the relay's identity and the community all came back, on the
  same server and on a new one. The move to a new server took 194 seconds, from losing the old
  server to a working new one. The block was also tested as one command. A damaged dump stopped it
  with the database left empty, and the same block then worked with the good dump.
- **Upgrade.** Back up first. Members lose the connection while the relay restarts, and database
  migrations can make that outage longer. The relay migrates its database when it starts. Going
  back means restoring the backup with the old tag, and that loses anything posted after the
  backup. So back up right before upgrading, at a quiet time. Upgrade to the image this skill
  recommends unless the user asks for the newest. Set `TAG`, `DIGEST` and `COMMIT` on the agent's
  machine as SKILL.md section 2 does, then set them on the server. If `grep '^BUZZ_IMAGE=' .env`
  already shows that tag, there's nothing to do. Otherwise, compare the two commits. The running
  image names the commit it was built from.
  ```bash
  OLD=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(grep '^BUZZ_IMAGE=' .env | cut -d= -f2)")
  git fetch -q origin
  git merge-base --is-ancestor "$OLD" "$COMMIT" && echo newer
  ```
  Check: it prints `newer`. If it prints nothing, stop. The new image is older than the running
  one, and its code can't read the migrations the running image already applied. Then check that no
  two open channels share a name, ignoring case and counting archived ones. Images from 2026-11-05
  on don't start on a database where two do (block/buzz#8787). This query works on the database of
  any image (not tested).
  ```bash
  docker compose exec -T postgres psql -U buzz -d buzz -tAc "select lower(name), count(*) from channels c where visibility = 'open' and channel_type in ('stream', 'forum') and deleted_at is null and not coalesce((to_jsonb(c) ->> 'unlisted')::boolean, false) group by community_id, lower(name) having count(*) > 1" < /dev/null
  ```
  It must print nothing. If it prints names, stop. Ask the user to rename those channels in Buzz
  first. Each name stays on the open, unarchived channel. To rename an archived one, unarchive it,
  rename it and archive it again. Then run the query again.
  **Migration 0086.** The recommended image, release 0.3.0, includes migrations 0084 to 0086. An
  upgrade from an older image runs them when the relay starts. Migration 0086 builds an index, with
  a one-second lock limit and a five-second statement limit.
  [Block's note on it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/private-media-index-deployment.md#L3)
  says the relay may run it by itself on a small database. A build that runs out of time records
  nothing. If that happens, start the relay again at a quieter moment. Only a large or busy database
  needs the prebuild that the note describes. In that case, stop and plan the prebuild with the
  user. Keep `BUZZ_MEDIA_READ_MODE=off`. Limiting files to their channels is a rollout of its own
  (SKILL.md). The upgrade was tested from `sha-744f394` on a small test database, where 0086 took a
  quarter of a second. It hasn't been tested on a database with real history.
  From a tag before 2026-10-07 to a later one, the upgrade also replaces MinIO with Silo
  (block/buzz#8023). Silo takes over MinIO's volume as it is, as Silo's
  [migration guide](https://silo.pgsty.com/compatibility/migration/) describes. Either way, list
  what the file store holds, to compare after the upgrade. The list leaves out the git self-test's
  `probe/` objects, which change at every start.
  ```bash
  docker compose run --rm --no-deps -T --entrypoint sh minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc ls --recursive "local/$BUZZ_S3_BUCKET"' < /dev/null | awk '{print $NF}' | grep -v '^probe/' | sort > ~/buzz-files-before.txt
  ```
  Check: `wc -l < ~/buzz-files-before.txt` prints a number above 0. The self-test's `packs/` objects
  count too. In `server` mode, Compose warns about an orphan container, Caddy's. That warning is
  harmless. Next, move the bundle to the new commit. The bundle and the image move together. The
  first line undoes compose.md step 9's edits, which would otherwise block the checkout.
  ```bash
  git checkout compose.yml Caddyfile
  git checkout -q $COMMIT
  ```
  Then redo compose.md step 9. Its greps say which edits are still needed. If `.env` has
  `BUZZ_ADMIN_HOST`, add the moderation console's Caddy route again too (compose.md). To list the
  settings the new bundle added, if any, run
  `comm -13 <(grep -oE '^[A-Z][A-Z0-9_]*=' .env | sort) <(grep -oE '^[A-Z][A-Z0-9_]*=' .env.example | sort)`.
  Copy those lines from `.env.example` into `.env`. For a `CHANGE_ME_RANDOM` value, redo compose.md
  step 5. Ask the user about any other value. Phone notifications may be off. Block's bundle leaves
  them off, and so did this guide's setups before 2026-10-23. If `grep '^BUZZ_PUSH_ENABLED=' .env`
  says `false`, turn them on as compose.md step 8 does, in `server` and `private` modes. Then set the
  new image and upgrade.
  ```bash
  sed -i.bak "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" .env && rm .env.bak
  BUZZ_COMPOSE_TLS=true ./run.sh upgrade
  ```
  Check:

  - `git rev-parse HEAD` prints `$COMMIT`.
  - `docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}' relay minio` shows the new
    relay image, and `pgsty/silo:…` for `minio` on a bundle from 2026-10-07 on. Both are
    `Up … (healthy)`. The version in check-relay.sh often stays the same between commits.
  - `docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/block/buzz:$TAG` prints
    `ghcr.io/block/buzz@$DIGEST`. Skip this check for the newest image.
  - `./run.sh list-members` still lists the members.
  - `check-relay.sh` passes, run the same way the install ran it.

  Then run the relay's partition audit.
  `docker compose exec -T relay /usr/local/bin/buzz-admin partition-audit < /dev/null | grep -m1 '"outcome"'`
  prints `"outcome": "ok",`. After an upgrade from an image before 2026-10-20, it prints
  `"outcome": "degraded",` and keeps printing it (tested from `sha-30873ba`). Older images kept
  every row in one catch-all partition. The audit flags that, but the relay keeps working, so
  `degraded` is harmless there. `unsafe` or `error` is a real problem. Go back, as below, and report
  it. Then check the files. List them again, and read one uploaded file back through the store.
  Each uploaded file's name is its sha256. Skip the last two lines if nobody has uploaded a file yet.
  ```bash
  docker compose run --rm --no-deps -T --entrypoint sh minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc ls --recursive "local/$BUZZ_S3_BUCKET"' < /dev/null | awk '{print $NF}' | grep -v '^probe/' | sort > ~/buzz-files-after.txt
  comm -23 ~/buzz-files-before.txt ~/buzz-files-after.txt | wc -l
  key=$(grep -E '^[0-9a-f]{64}\.[a-z0-9]+$' ~/buzz-files-before.txt | head -1)
  [ "$(docker compose run --rm --no-deps -T --entrypoint sh -e KEY="$key" minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc cat "local/$BUZZ_S3_BUCKET/$KEY"' < /dev/null | sha256sum | cut -c1-64)" = "${key%%.*}" ] && echo intact
  ```
  Check: the block prints `0`, which means nothing from before is missing. Then it prints `intact`.
  If a check fails, go back by restoring the backup, with the bundle moved back to the old tag. If
  the relay's log says migration 0086 timed out, nothing of it was recorded. Start the relay again
  at a quieter moment. If the log says `idx_events_media_edit_target invalid or wrong definition`,
  stop and ask the user. In either case, don't start the old image on this database. Migrations
  0084 and 0085 are already applied, and an older relay refuses migrations it doesn't know. Going
  back means Restore, with the bundle at the old tag.

## Kubernetes

- **Add a member.** Check the npub first with `python3 $SKILL/scripts/npub-to-hex.py <npub>`. Then
  add it with
  `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin add-member --pubkey <npub-or-hex> --role member`.
  Check: `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin list-members`
  lists it. A member added this way isn't added to the starter channels, as on Compose. To ban
  someone or time them out, use the `buzz` command line, as on a private network with Compose
  (above). The chart has no admin name for Buzz's moderation screens. This guide doesn't cover
  those screens on Kubernetes.
- **Back up** the quickstart's four stores into a folder only the user can read. Ask the user
  first. The relay keeps running during the backup.
  ```bash
  BACKUP=~/buzz-backup/$(date +%Y-%m-%d-%H%M%S)
  (
    set -e
    umask 077
    mkdir -p ~/buzz-backup
    mkdir "$BACKUP"
    chmod 700 "$BACKUP"
    kubectl -n buzz exec buzz-postgresql-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U buzz -Fc buzz' > "$BACKUP/buzz.dump"
    kubectl -n buzz exec deploy/buzz-minio -- tar czf - -C /data . > "$BACKUP/minio-data.tgz"
    kubectl -n buzz exec deploy/buzz -c relay -- tar czf - -C /var/lib/buzz/git . > "$BACKUP/git-data.tgz"
    kubectl -n buzz get secret buzz-relay -o yaml > "$BACKUP/buzz-relay-secret.yaml"
  )
  ```
  Check: the block exits successfully, `$BACKUP` has four files that aren't empty, and
  `tar tzf "$BACKUP/minio-data.tgz" | grep -c buzz-media` prints a number above 0. A failure leaves a
  partial backup. Don't use it for a restore, and keep any earlier good backup. The Secret file
  holds the relay key. Encrypt the copies and keep them off the cluster. These live exports aren't
  an atomic snapshot, and they aren't a validated procedure for restoring a whole cluster. Choose a
  coordinated backup and restore process before you rely on this for production recovery.
- **Upgrade.** Back up first, then set `TAG` and `DIGEST` as SKILL.md section 2 does. Upgrade to
  the image this skill recommends unless the user asks for the newest. Images from 2026-11-05 on
  don't start on a database where two open channels share a name, ignoring case and counting
  archived ones (block/buzz#8787). The chart rolls the relay over while the old pod still serves.
  So check first. This query works on the database of any image (not tested).
  ```bash
  echo "select lower(name), count(*) from channels c where visibility = 'open' and channel_type in ('stream', 'forum') and deleted_at is null and not coalesce((to_jsonb(c) ->> 'unlisted')::boolean, false) group by community_id, lower(name) having count(*) > 1" |
    kubectl -n buzz exec -i buzz-postgresql-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U buzz -d buzz -tA'
  ```
  It must print nothing. If it prints names, stop. Ask the user to rename those channels in Buzz
  first, keeping each name on the open, unarchived channel. Then check again.
  **Migration 0086.** The recommended image, release 0.3.0, includes migrations 0084 to 0086. An
  upgrade from an older image runs them when the new pod starts. Migration 0086 builds an index,
  with a one-second lock limit and a five-second statement limit.
  [Block's note on it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/private-media-index-deployment.md#L3)
  says the relay may run it by itself on a small database. It also says that a build that runs out
  of time records nothing. Only a large or busy database needs the prebuild that the note
  describes. In that case, stop and plan the prebuild with the user. Keep
  `BUZZ_MEDIA_READ_MODE=off`. This upgrade hasn't been tested on a real cluster. The Kubernetes test
  installs the recommended image and upgrades it to itself.
  Then, in `buzz-values.yaml`, change `image.tag` to `$TAG` and `image.digest` to `$DIGEST`. A file
  from before these steps pinned the digest has no `digest:` line. In that case, add one under
  `tag:`, with the same indent. Then run
  `helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 -n buzz -f buzz-values.yaml --wait`.
  If `helm upgrade` times out, don't run `helm rollback`, because the database may already have
  changed. Stop and ask the user. If the new pod's log says migration 0086 timed out, nothing of it
  was recorded. The pod tries again when it restarts. Don't go back to the old image on this
  database. Migrations 0084 and 0085 are already applied, and an older relay refuses migrations it
  doesn't know. Going back means restoring the complete backup from before the upgrade, with the
  old image. Check: kubernetes.md step 6's checks pass again, the relay's digest included.
