# Operations: members, backups, restore, upgrades

## Docker Compose

Run from `buzz/deploy/compose`. In `private` mode, drop `BUZZ_COMPOSE_TLS=true`.

- **Add a member.** A member who made their key with `new-identity.py` has the npub it printed.
  Otherwise they copy it from the Buzz app: in Buzz 1.0, Settings, Identity,
  Copy Buzz ID on the Buzz ID card (it copies the npub); in Buzz 0.X, the Join screen. Before
  they've joined, Buzz 1.0 also shows
  it on "This community needs an invite". Check it with
  `python3 $SKILL/scripts/npub-to-hex.py <npub>`, then
  `./run.sh add-member <npub-or-hex> --role member`, one at a time with `sleep 1` between adds
  (adds in the same second collide). `./run.sh list-members` confirms; it prints hex. A member
  added this way skips the starter channels, so add them to a channel in Buzz too, or tell them
  about Search, Channels. The owner
  can also do it in Buzz 1.0: Settings, Community admin, Membership, Invite members, then "Add
  directly", or "Invite with a link" for a link anyone can join with until it expires (Buzz 0.X:
  Settings, Invites).
  **To change the owner**, set `OWNER_HEX` from the new owner's npub, run compose.md step 7's
  command and check, then `BUZZ_COMPOSE_TLS=true ./run.sh restart` (members lose the connection
  for about 20 seconds). Check: `./run.sh list-members` shows the new key as `owner` and the old one
  as `admin`. `./run.sh remove-member <old hex>` removes the old one, if the user wants (then
  restart, as below); the current owner can't be removed.
  **To remove someone**, use Buzz 1.0 when you can (Settings, Community admin, Membership, the … on
  their row, Remove): it disconnects them and their agents at once.
  `./run.sh remove-member <npub-or-hex>` only deletes the membership: their open connection keeps
  reading new messages, private channels included, and can post, and Remove in Buzz can't end it
  afterwards (it answers "member not found"). So after a `remove-member`, restart the relay:
  `BUZZ_COMPOSE_TLS=true ./run.sh restart` (everyone else reconnects within about 20 seconds).
  Check: `./run.sh list-members` no longer lists them. A removed person can rejoin with an invite
  link that hasn't expired. There is no single-link cancellation procedure here; an issuer ban
  revokes its v2 invites, while legacy links differ. Keep links to 1 use
  and 1 day. Their channel memberships stay, so adding them back restores every private channel
  they were in. Tested on 2026-10-27.
  **To ban someone or time them out**, use Buzz 1.0's Settings, Moderation, on a public setup with
  the moderation console (compose.md). Otherwise, and always on a private network, where Buzz's
  moderation screens can't connect, the owner or an admin uses the `buzz` command line that ships
  with Buzz 1.0 (`/Applications/Buzz.app/Contents/Resources/bin/buzz` on a Mac). They run it in a
  terminal of their own, never the agent's, since it signs with their private key:
  `read -rs BUZZ_PRIVATE_KEY && export BUZZ_PRIVATE_KEY` asks for the key without showing it, and
  `export BUZZ_RELAY_URL=$ORIGIN`, with the address written out, names the relay.
  Then `buzz moderation reports` lists reports; `buzz moderation ban --pubkey <hex>` bans someone,
  which disconnects them and their agents and refuses them at any invite link;
  `buzz moderation timeout --pubkey <hex> --expires-in 3600` stops their posts for an hour;
  `buzz moderation restricted` lists both, and `unban` and `untimeout` lift them. The `<hex>` is
  the person's key as `npub-to-hex.py` prints it. `buzz messages delete --event <id>` deletes a
  message in a channel they own or administer (not tested).
- **Local agents.** Buzz 1.0 can run agents on the owner's computer, each with its own key and the
  owner's signed attestation (NIP-OA). The relay admits them through the owner's membership,
  because `.env` has `BUZZ_ALLOW_NIP_OA_AUTH=true` (the bundle's default, as in the chart):
  don't add them as members. They lose access if the owner leaves or is removed (in Buzz, or with
  `remove-member` and a restart), and the app adds them to the channels and chats it uses them in. Tested: an agent
  posted in a chat that named it, its key without the attestation was refused, and so was an agent
  of a non-member. Showing agents online needs an image from 2026-10-13 or later. An agent with
  only a key of its own, such as a bot on the buzz CLI or one of Buzz 0.X's, is added like a
  member, and to every channel it answers in: a reply that mentions a non-member is refused, and
  a key without relay membership gets `relay error 403: relay_membership_required`.
- **Back up** what can't be rebuilt: Postgres, the file store's and git volumes, and `.env`,
  together, with the relay stopped (ask first: members lose the connection for about half a
  minute). The file store's volume keeps MinIO's name with Silo too, so the commands are the same
  for every tag. Redis holds nothing that needs keeping. The list `run.sh` prints after an upgrade
  also names Caddy's volumes, which hold only certificates Caddy gets again on its own, and an
  owner key a bootstrap script makes; with the owner's own npub, from `new-identity.py` or the Buzz
  app, the owner keeps that key.
  Plain `docker compose` works in every mode here: these commands touch only the relay, Postgres
  and the volumes. Each backup gets a folder of its own in `~/buzz-backup`, named by the day, in
  `BACKUP` (set it again in each call if each command runs in a fresh shell):
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
  Check: `check-relay.sh`, run the way the install ran it, passes again (it waits the half minute
  the relay takes to start).
  `ls -la "$BACKUP"` shows four non-empty files; `git-data.tgz` stays tiny until someone hosts
  a repository. `tar tzf "$BACKUP/minio-data.tgz" | grep -c buzz-media` is above 0 (a mistyped
  volume name would have made an empty volume and an empty archive), and
  `docker compose exec -T postgres pg_restore -l < "$BACKUP/postgres.dump" | wc -l` is in the
  hundreds (the dump reads back). The backup holds every
  secret: ask the user how to encrypt it (for example `gpg --symmetric`) and where the off-machine
  copy goes. Those are their decisions. The disk is small, so once the copies are off the server,
  keep the newest few folders on it (ask first: it deletes the older ones):
  `ls -d ~/buzz-backup/20*/ | head -n -4 | xargs -r rm -rf` keeps four (not tested). Tell the user
  what the schedule means: with weekly backups, losing the server can lose up to a week of
  messages. The provider's own server backups narrow that, or a nightly backup does (compose.md,
  For a server that runs for months).
- **Restore** into empty volumes (ask first: it replaces the data). Set `BACKUP` to the folder to
  restore, such as `BACKUP=~/buzz-backup/2026-11-06` (`ls ~/buzz-backup` lists them; a backup from
  before dated folders is `~/buzz-backup` itself). One server has no standby: tell the user that
  nobody can send or read new messages until the restore ends. Before changing anything, check the
  backup (not tested):
  `for f in postgres.dump minio-data.tgz git-data.tgz env; do [ -s "$BACKUP/$f" ] || echo missing $f; done`
  prints nothing, since a missing file archive would bring the community back without its files,
  and `grep '^RELAY_URL=' "$BACKUP/env"` shows this community's address, as the user knows it:
  another install's backup would swap the relay's identity and owner. On a new machine: stop the
  old relay first if it still runs, copy the backup's folder to the same path there, run compose.md
  steps 3, 4 and 9, with the backup's tag for step 4
  (`TAG=$(grep '^BUZZ_IMAGE=' "$BACKUP/env" | cut -d: -f2)`), and point the domain's A record
  at the new machine before the restore below starts the relay, so Caddy gets its certificate
  there. On a private network a move to a new machine isn't covered: the community's address is
  the old machine's Tailscale name (compose.md step 2P). On this one, stop the relay and delete the
  volumes the backup replaces:
  ```bash
  BUZZ_COMPOSE_TLS=true ./run.sh stop
  docker volume rm buzz-prod_buzz-postgres-data buzz-prod_buzz-minio-data buzz-prod_buzz-git-data
  ```
  If this one was upgraded since the backup, also move the bundle back to the backup's tag first,
  the way Upgrade moves it (the two `git checkout` lines, then compose.md step 9). Wherever this
  redoes step 9 and the backup's `env` has `BUZZ_ADMIN_HOST`, add the moderation console's Caddy
  route again too, and on a new machine move `admin.$DOMAIN`'s record with the domain's.
  Then check (not tested): `docker volume ls -q --filter name=buzz-prod_buzz-postgres-data` prints
  nothing. If it prints the volume, this server still has its database: stop, and delete the
  volumes as above if you mean to replace it. Run on a live server, the block below stops the relay
  before it refuses.
  `docker compose create` makes the volumes the way Compose expects, so it doesn't warn later.
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
  Check: `restored`, then the relay starts, and `./run.sh list-members` lists the members from
  before. If `restored` doesn't print, the relay is stopped. With a `pg_restore: error` line, the
  backup didn't go in and the database is empty again: fix the backup, then run the block again (no
  need to delete anything first). Don't start the relay before that: it would serve a new, empty
  community. With no such line, the database wasn't empty and nothing in it was replaced: start the
  relay again with `BUZZ_COMPOSE_TLS=true ./run.sh start`. The block copied the backup's `env` over
  `.env`, so if `.env` changed since the backup (an upgrade changes it), put those changes back first.
  Tested: messages, files, members, the relay's identity and the community all came back, on this
  server and on a new one (194 seconds from losing the old server to a working new one, on
  2026-10-27). Tested as one command too, on 2026-10-27: a damaged dump stopped it with the database
  left empty, and the same block then worked with the good dump.
- **Upgrade.** Back up first. Members lose the connection while the relay restarts; database
  migrations can extend the outage. The relay migrates its database on start, so going
  back means restoring the backup with the old tag, which loses anything posted after that backup:
  back up right before upgrading, at a quiet time. Upgrade to the image this skill recommends, not
  the newest, unless the user asks: set `TAG` and `DIGEST` on the agent's machine as SKILL.md
  section 2 does, then on the server. If `grep '^BUZZ_IMAGE=' .env` already shows that tag, there's
  nothing to do. Otherwise:
  ```bash
  OLD=$(grep '^BUZZ_IMAGE=' .env | cut -d: -f2)
  git fetch -q origin
  git merge-base --is-ancestor ${OLD#sha-} ${TAG#sha-} && echo newer
  ```
  Check: `newer`. If it prints nothing, stop: the tag is older than the running one, whose
  migrations the old code can't read. Then check that no two open channels share a name, ignoring
  case and counting archived ones: images from 2026-11-05 on don't start on a database where they
  do (block/buzz#8787). The query works on the database of any image (not tested):
  ```bash
  docker compose exec -T postgres psql -U buzz -d buzz -tAc "select lower(name), count(*) from channels c where visibility = 'open' and channel_type in ('stream', 'forum') and deleted_at is null and not coalesce((to_jsonb(c) ->> 'unlisted')::boolean, false) group by community_id, lower(name) having count(*) > 1" < /dev/null
  ```
  It must print nothing. If it prints names, stop: ask the user to rename those channels in Buzz
  first, keeping each name on the open, unarchived channel (unarchive an archived one, rename it,
  and archive it again), then run it again.
  **A newer image than the recommended one.** The recommended `sha-744f394` has no migration
  0086. Newer images do, release 0.3.0 among them: it builds an index when the relay starts, with
  a one-second lock limit and a five-second statement limit.
  [Block's note on it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/private-media-index-deployment.md#L3)
  says small databases may let the relay run it. A build that runs out of time records nothing,
  so start the relay again at a quieter moment. Only a large or busy database needs the prebuild
  that note describes: stop and plan that with the user. Keep `BUZZ_MEDIA_READ_MODE=off`; limiting
  files to their channels is a rollout of its own (SKILL.md). Not tested on a database with real
  history.
  From a tag before 2026-10-07 to a later one, the upgrade
  also swaps MinIO for Silo (block/buzz#8023), which takes over MinIO's volume as it is, as Silo's
  [migration guide](https://silo.pgsty.com/compatibility/migration/) describes. Either way, list
  what the file store holds, to compare after (the git self-test's `probe/` objects change at
  every start, so they're left out):
  ```bash
  docker compose run --rm --no-deps -T --entrypoint sh minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc ls --recursive "local/$BUZZ_S3_BUCKET"' < /dev/null | awk '{print $NF}' | grep -v '^probe/' | sort > ~/buzz-files-before.txt
  ```
  Check: `wc -l < ~/buzz-files-before.txt` prints a number above 0 (the self-test's `packs/`
  objects count too). In `server` mode Compose warns about an orphan container, Caddy's: harmless.
  The bundle and the image move together. The first line undoes compose.md step 9's edits, which
  would block the checkout:
  ```bash
  git checkout compose.yml Caddyfile
  git checkout -q ${TAG#sha-}
  ```
  Then redo compose.md step 9; its greps say which edits are still needed. If `.env` has
  `BUZZ_ADMIN_HOST`, add the moderation console's Caddy route again too (compose.md). Settings the
  new bundle added, if any:
  `comm -13 <(grep -oE '^[A-Z][A-Z0-9_]*=' .env | sort) <(grep -oE '^[A-Z][A-Z0-9_]*=' .env.example | sort)`.
  Copy those lines from `.env.example` into `.env`, redo compose.md step 5 for a
  `CHANGE_ME_RANDOM`, and ask the user about any other value. Relays set up before 2026-10-23
  have phone notifications off: if `grep '^BUZZ_PUSH_ENABLED=' .env` says `false`, turn them on as
  compose.md step 8 does (`server` and `private` modes). Then:
  ```bash
  sed -i.bak "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" .env && rm .env.bak
  BUZZ_COMPOSE_TLS=true ./run.sh upgrade
  ```
  Check: `git rev-parse HEAD | cut -c1-7` prints the tag without `sha-`;
  `docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}' relay minio` shows the new
  relay image, `pgsty/silo:…` for `minio` on a bundle from 2026-10-07 on, and both
  `Up … (healthy)` (the version in check-relay.sh often stays the same between commits);
  `docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/block/buzz:$TAG` →
  `ghcr.io/block/buzz@$DIGEST` (skip it for the newest image);
  `./run.sh list-members` still lists the members; `check-relay.sh`, run the way the install ran
  it, passes. Then the relay's partition audit:
  `docker compose exec -T relay /usr/local/bin/buzz-admin partition-audit < /dev/null | grep -m1 '"outcome"'`
  → `"outcome": "ok",`. After an upgrade from an image before 2026-10-20 it says
  `"outcome": "degraded",` and keeps saying it (tested from `sha-30873ba`): older images kept every
  row in one catch-all partition, which the audit flags while the relay keeps working, so it's
  harmless.
  `unsafe` or `error` is not: go back, as below, and report it. Then the files: list them again,
  and read one uploaded file back through the store (its name is its sha256). Skip the last two
  lines if nobody has uploaded a file yet.
  ```bash
  docker compose run --rm --no-deps -T --entrypoint sh minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc ls --recursive "local/$BUZZ_S3_BUCKET"' < /dev/null | awk '{print $NF}' | grep -v '^probe/' | sort > ~/buzz-files-after.txt
  comm -23 ~/buzz-files-before.txt ~/buzz-files-after.txt | wc -l
  key=$(grep -E '^[0-9a-f]{64}\.[a-z0-9]+$' ~/buzz-files-before.txt | head -1)
  [ "$(docker compose run --rm --no-deps -T --entrypoint sh -e KEY="$key" minio-init -c 'mc alias set local http://minio:9000 "$BUZZ_S3_ACCESS_KEY" "$BUZZ_S3_SECRET_KEY" >/dev/null && mc cat "local/$BUZZ_S3_BUCKET/$KEY"' < /dev/null | sha256sum | cut -c1-64)" = "${key%%.*}" ] && echo intact
  ```
  Check: `0` (nothing from before is missing), then `intact`. If a check fails, go back: Restore,
  with the bundle moved back to the old tag. If the relay's log says migration 0086 timed out,
  nothing of it was recorded: start the relay again at a quieter moment. If it says
  `idx_events_media_edit_target invalid or wrong definition`, stop and ask. Either way, don't start
  the old image on this database: 0084 and 0085 are already applied, and an older relay refuses
  migrations it doesn't know. Going back is Restore, with the bundle at the old tag.

## Kubernetes

- **Add a member.** Check the npub first: `python3 $SKILL/scripts/npub-to-hex.py <npub>`. Then
  `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin add-member --pubkey <npub-or-hex> --role member`.
  Check: `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin list-members`
  lists it. A member added this way skips the starter channels, as on Compose. To ban someone or
  time them out, use the `buzz` command line, as on Compose's private network (above): the chart
  has no admin name for Buzz's moderation screens, so they aren't covered here.
- **Back up** the quickstart's four stores (ask first; the relay keeps running), into a folder
  only the user can read:
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
  Check: the block exits successfully, four non-empty files in `$BACKUP`, and
  `tar tzf "$BACKUP/minio-data.tgz" | grep -c buzz-media` above 0. A failure leaves a partial
  backup; do not use it for a restore or delete an earlier good backup. The
  Secret file holds the relay key: encrypt the copies and keep them off the cluster. These live
  exports are not an atomic snapshot or a validated full-cluster restore procedure; choose a
  coordinated backup and restore process before relying on this for production recovery.
- **Upgrade.** Back up first, then set `TAG` and `DIGEST` as SKILL.md section 2 does. Upgrade to
  the image this skill recommends, not the newest, unless the user asks. Images from 2026-11-05 on
  don't start on a database where two open channels share a name, ignoring case and counting
  archived ones (block/buzz#8787), and the chart rolls the relay over with the old pod still
  serving. So first check, on the database of any image (not tested):
  ```bash
  echo "select lower(name), count(*) from channels c where visibility = 'open' and channel_type in ('stream', 'forum') and deleted_at is null and not coalesce((to_jsonb(c) ->> 'unlisted')::boolean, false) group by community_id, lower(name) having count(*) > 1" |
    kubectl -n buzz exec -i buzz-postgresql-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U buzz -d buzz -tA'
  ```
  It must print nothing. If it prints names, stop: ask the user to rename those channels in Buzz
  first, keeping each name on the open, unarchived channel, then check again.
  **A newer image than the recommended one.** The recommended `sha-744f394` has no migration
  0086. Newer images do, release 0.3.0 among them: it builds an index when the new pod starts,
  with a one-second lock limit and a five-second statement limit.
  [Block's note on it](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/private-media-index-deployment.md#L3)
  says small databases may let the relay run it, and that a build that runs out of time records
  nothing. Only a large or busy database needs the prebuild that note describes: stop and plan
  that with the user. Keep `BUZZ_MEDIA_READ_MODE=off`. Not tested on a real cluster.
  Then change `image.tag` in `buzz-values.yaml` to `$TAG`, and run
  `helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 -n buzz -f buzz-values.yaml --wait`.
  If `helm upgrade` times out, don't run `helm rollback`: the database may already have changed.
  Stop and ask. If the new pod's log says migration 0086 timed out, nothing of it was recorded,
  and the pod tries again when it restarts. Don't go back to the old image on this database: 0084
  and 0085 are already applied, and an older relay refuses migrations it doesn't know. Going back
  is the complete backup from before the upgrade, with the old image. Check: kubernetes.md step
  6's checks pass again, the relay's digest included.
