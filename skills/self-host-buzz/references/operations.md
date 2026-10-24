# Operations: members, backups, restore, upgrades

## Docker Compose

Run from `buzz/deploy/compose`. In `private` mode, drop `BUZZ_COMPOSE_TLS=true`.

- **Add a member.** Members copy their npub from the Buzz app: in Buzz 1.0, Settings, Identity,
  "Nostr address (npub)"; in Buzz 0.X, the Join screen. Check it with
  `python3 $SKILL/scripts/npub-to-hex.py <npub>`, then
  `./run.sh add-member <npub-or-hex> --role member`, one at a time with `sleep 1` between adds
  (adds in the same second collide). `./run.sh list-members` confirms; it prints hex. The owner
  can also do it in Buzz 1.0: Settings, Community admin, Membership, Invite members, then "Add
  directly", or "Invite with a link" for a link anyone can join with until it expires (Buzz 0.X:
  Settings, Invites).
  **To change the owner**, set `OWNER_HEX` from the new owner's npub, run compose.md step 7's
  command and check, then `BUZZ_COMPOSE_TLS=true ./run.sh restart` (members lose the connection
  for about 20 seconds). Check: `./run.sh list-members` shows the new key as `owner` and the old one
  as `admin`. `./run.sh remove-member <old hex>` removes the old one, if the user wants; the
  current owner can't be removed.
- **Agents.** Buzz 1.0 runs agents on the owner's computer, each with its own key and the
  owner's signed attestation (NIP-OA). The relay admits them through the owner's membership,
  because `.env` has `BUZZ_ALLOW_NIP_OA_AUTH=true` (the bundle's default, as in the chart and
  Railway's template): don't add them as members. They lose access if the owner leaves or is
  removed, and the app adds them to the channels and chats it uses them in. Tested: an agent
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
  owner key a bootstrap script makes; with the owner's npub from the Buzz app, that key stays in
  their app.
  Plain `docker compose` works in every mode here: these commands touch only the relay, Postgres
  and the volumes.
  ```bash
  mkdir -p ~/buzz-backup && chmod 700 ~/buzz-backup
  docker compose stop relay
  docker compose exec -T postgres pg_dump -U buzz -Fc buzz > ~/buzz-backup/postgres.dump < /dev/null
  for v in minio-data git-data; do
    docker run --rm -v buzz-prod_buzz-$v:/data:ro -v ~/buzz-backup:/backup alpine \
      tar czf /backup/$v.tgz -C /data .
  done
  cp .env ~/buzz-backup/env
  docker compose start relay
  ```
  Check: `check-relay.sh`, run the way the install ran it, passes again (it waits the half minute
  the relay takes to start).
  `ls -la ~/buzz-backup` shows four non-empty files; `git-data.tgz` stays tiny until someone hosts
  a repository. `tar tzf ~/buzz-backup/minio-data.tgz | grep -c buzz-media` is above 0 (a mistyped
  volume name would have made an empty volume and an empty archive), and
  `docker compose exec -T postgres pg_restore -l < ~/buzz-backup/postgres.dump | wc -l` is in the
  hundreds (the dump reads back). The backup holds every
  secret: ask the user how to encrypt it (for example `gpg --symmetric`) and where the off-machine
  copy goes. Those are their decisions.
- **Restore** into empty volumes (ask first: it replaces the data). On a new machine after
  compose.md steps 3, 4 and 9, with the backup's tag for step 4
  (`TAG=$(grep '^BUZZ_IMAGE=' ~/buzz-backup/env | cut -d: -f2)`), or on this one after
  `BUZZ_COMPOSE_TLS=true ./run.sh stop` and
  `docker volume rm buzz-prod_buzz-postgres-data buzz-prod_buzz-minio-data buzz-prod_buzz-git-data`.
  If this one was upgraded since the backup, also move the bundle back to the backup's tag first,
  the way Upgrade moves it (the two `git checkout` lines, then compose.md step 9).
  `docker compose create` makes the volumes the way Compose expects, so it doesn't warn later.
  ```bash
  cp ~/buzz-backup/env .env
  docker compose create
  for v in minio-data git-data; do
    docker run --rm -v buzz-prod_buzz-$v:/data -v ~/buzz-backup:/backup alpine \
      tar xzf /backup/$v.tgz -C /data
  done
  docker compose up -d --wait postgres
  docker compose exec -T postgres pg_restore -U buzz -d buzz < ~/buzz-backup/postgres.dump
  BUZZ_COMPOSE_TLS=true ./run.sh start
  ```
  Tested: messages, files, members, the relay's identity and the community all came back.
- **Upgrade.** Back up first. Members lose the connection for about 10 seconds (half a minute
  when the upgrade swaps MinIO for Silo), and the relay migrates its database on start, so going
  back means restoring the backup with the old tag. Pick the new tag on the agent's machine
  (`python3 $SKILL/scripts/pick-tag.py`) and set `TAG` to it on the server. If
  `grep '^BUZZ_IMAGE=' .env` already shows it, there's nothing to do. Otherwise:
  ```bash
  OLD=$(grep '^BUZZ_IMAGE=' .env | cut -d: -f2)
  git fetch -q origin
  git merge-base --is-ancestor ${OLD#sha-} ${TAG#sha-} && echo newer
  ```
  Check: `newer`. If it prints nothing, stop: the tag is older than the running one, whose
  migrations the old code can't read. From a tag before 2026-10-07 to a later one, the upgrade
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
  Then redo compose.md step 9; its greps say which edits are still needed. Settings the new
  bundle added, if any:
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
  `./run.sh list-members` still lists the members; `check-relay.sh`, run the way the install ran
  it, passes. Then the relay's partition audit:
  `docker compose exec -T relay /usr/local/bin/buzz-admin partition-audit < /dev/null | grep -m1 '"outcome"'`
  → `"outcome": "ok",`. After an upgrade from an image before 2026-10-20 it says
  `"outcome": "degraded",` (tested from `sha-30873ba`): older images kept every row in one
  catch-all partition, which the audit flags while the relay keeps working, so it's harmless.
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
  with the bundle moved back to the old tag.

## Railway

- **Add a member.** Check the npub first: `python3 $SKILL/scripts/npub-to-hex.py <npub>`.
  `railway ssh` needs an SSH key registered with the user's Railway account (ask first):
  `railway ssh keys add --key ~/.ssh/<key>.pub` takes only a key in `~/.ssh`, and names it after
  the key's comment, often the user's email. Then, once, the user confirms the host key of
  `ssh.railway.com` in their own terminal, from the directory linked to the project:
  `railway ssh -s "block/buzz:main" true`. A shell without a terminal can't answer that prompt
  and fails with `Host key verification failed`. After that, from the same directory, this works
  without a terminal (tested):
  `railway ssh -s "block/buzz:main" /usr/local/bin/buzz-admin add-member --pubkey <npub-or-hex> --role member`
  → `added <hex> as member`. Check: `railway ssh -s "block/buzz:main" /usr/local/bin/buzz-admin list-members`
  lists it. Each `railway ssh` first prints the key file it used, with that key's comment.
- **Back up.** Needs `pg_dump` 18 and the AWS CLI locally. `railway run` hands each command its
  service's credentials, so nothing secret is printed or copied. The dump goes through the public
  TCP proxy the template gives Postgres.
  ```bash
  railway run -s Postgres -- sh -c 'pg_dump "$DATABASE_PUBLIC_URL" -Fc -f buzz.dump'
  railway run -s "block/buzz:main" -- sh -c 'AWS_ACCESS_KEY_ID=$BUZZ_S3_ACCESS_KEY \
    AWS_SECRET_ACCESS_KEY=$BUZZ_S3_SECRET_KEY aws s3 sync "s3://$BUZZ_S3_BUCKET" buzz-bucket \
    --endpoint-url "$BUZZ_S3_ENDPOINT" --region "$BUZZ_S3_REGION"'
  ```
- **Restore** (ask first: it replaces the data), into an empty schema: Buzz's partitioned tables
  make `pg_restore --clean` fail on a live database.
  ```bash
  railway down -s "block/buzz:main" -y
  railway run -s Postgres -- sh -c 'psql "$DATABASE_PUBLIC_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
    && pg_restore -d "$DATABASE_PUBLIC_URL" buzz.dump'
  railway run -s "block/buzz:main" -- sh -c 'AWS_ACCESS_KEY_ID=$BUZZ_S3_ACCESS_KEY \
    AWS_SECRET_ACCESS_KEY=$BUZZ_S3_SECRET_KEY aws s3 sync buzz-bucket "s3://$BUZZ_S3_BUCKET" \
    --endpoint-url "$BUZZ_S3_ENDPOINT" --region "$BUZZ_S3_REGION"'
  railway redeploy --from-source -s "block/buzz:main" -y
  ```
- **Upgrade.** Back up, then
  `railway service source connect --image ghcr.io/block/buzz:<tag> --service "block/buzz:main"`,
  and the same with `--service buzz-pair` if phone pairing is set up (railway.md step 6).
  The relay has no volume: what it keeps in `/data/git` is lost on every redeploy.

## Kubernetes

- **Add a member.** Check the npub first: `python3 $SKILL/scripts/npub-to-hex.py <npub>`. Then
  `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin add-member --pubkey <npub-or-hex> --role member`.
  Check: `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin list-members`
  lists it.
- **Back up** the quickstart's four stores (ask first; the relay keeps running), into a folder
  only the user can read:
  ```bash
  kubectl -n buzz exec buzz-postgresql-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U buzz -Fc buzz' > buzz.dump
  kubectl -n buzz exec deploy/buzz-minio -- tar czf - -C /data . > minio-data.tgz
  kubectl -n buzz exec deploy/buzz -c relay -- tar czf - -C /var/lib/buzz/git . > git-data.tgz
  kubectl -n buzz get secret buzz-relay -o yaml > buzz-relay-secret.yaml
  ```
  Check: four non-empty files, and `tar tzf minio-data.tgz | grep -c buzz-media` above 0. The
  Secret file holds the relay key: encrypt the copies.
- **Upgrade.** Change `image.tag` in `buzz-values.yaml`, then
  `helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 -n buzz -f buzz-values.yaml --wait`.
