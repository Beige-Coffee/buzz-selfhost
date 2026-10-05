# Operations: members, backups, restore, upgrades

## Docker Compose

Run from `buzz/deploy/compose`. In `private` and `local` modes, drop `BUZZ_COMPOSE_TLS=true`.

- **Add a member.** Members copy their public ID from Buzz Desktop's Join screen. Check it with
  `python3 $SKILL/scripts/npub-to-hex.py <npub>`, then
  `./run.sh add-member <npub-or-hex> --role member`, one at a time with `sleep 1` between adds
  (adds in the same second collide). `./run.sh list-members` confirms; it prints hex.
- **Agents.** Each agent gets its own key, added as a member of every channel it answers in. A
  reply that mentions a non-member is refused, and a key without relay membership gets
  `relay error 403: relay_membership_required`.
- **Back up** what can't be rebuilt: Postgres, the MinIO and git volumes, and `.env`, together,
  with the relay stopped (ask first: members lose the connection for about half a minute). Redis
  holds nothing that needs keeping. The list `run.sh` prints after an upgrade also names Caddy's
  volumes, which hold only certificates Caddy gets again on its own, and an owner key a bootstrap
  script makes; with the owner's npub from Buzz Desktop, that key stays in their Buzz Desktop.
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
- **Upgrade.** Back up first. Members lose the connection for about 10 seconds, and the relay
  migrates its database on start, so going back means restoring the backup with the old tag. Pick
  the new tag on the agent's machine (`python3 $SKILL/scripts/pick-tag.py`) and set `TAG` to it on
  the server. If `grep '^BUZZ_IMAGE=' .env` already shows it, there's nothing to do. Otherwise:
  ```bash
  OLD=$(grep '^BUZZ_IMAGE=' .env | cut -d: -f2)
  git fetch -q origin
  git merge-base --is-ancestor ${OLD#sha-} ${TAG#sha-} && echo newer
  ```
  Check: `newer`. If it prints nothing, stop: the tag is older than the running one, whose
  migrations the old code can't read. The bundle and the image move together. The first line
  undoes compose.md step 9's edits, which would block the checkout:
  ```bash
  git checkout compose.yml Caddyfile
  git checkout -q ${TAG#sha-}
  ```
  Then redo compose.md step 9; its greps say which edits are still needed. Settings the new
  bundle added, if any:
  `comm -13 <(grep -oE '^[A-Z][A-Z0-9_]*=' .env | sort) <(grep -oE '^[A-Z][A-Z0-9_]*=' .env.example | sort)`.
  Copy those lines from `.env.example` into `.env`, redo compose.md step 5 for a
  `CHANGE_ME_RANDOM`, and ask the user about any other value. Then:
  ```bash
  sed -i.bak "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" .env && rm .env.bak
  BUZZ_COMPOSE_TLS=true ./run.sh upgrade
  ```
  Check: `git rev-parse HEAD | cut -c1-7` prints the tag without `sha-`;
  `docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}' relay` shows the new image and
  `Up … (healthy)` (the version in check-relay.sh often stays the same between commits);
  `./run.sh list-members` still lists the members; `check-relay.sh`, run the way the install ran
  it, passes.

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
  Secret file holds the relay key: encrypt the copies. Restoring on Kubernetes is not yet tested.
- **Upgrade.** Change `image.tag` in `buzz-values.yaml`, then
  `helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 -n buzz -f buzz-values.yaml --wait`.
