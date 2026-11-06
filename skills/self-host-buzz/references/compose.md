# Docker Compose: a VPS, your own hardware, or a local test

The official bundle in `deploy/compose` of block/buzz: the relay, Postgres, Redis and an S3 store
for uploaded files, with Caddy in front for HTTPS in `server` and `local` modes. The store is Silo,
a maintained fork of MinIO, in bundles from 2026-10-07 on (block/buzz#8023), and MinIO before. Its
service, container and volume keep MinIO's names either way. Three modes:

- `server`: reachable by anyone with the URL, over HTTPS. Members still need to be added.
- `private`: reachable only over the user's Tailscale network; no public ports. Steps marked
  **P** replace or add to the server steps; 8P applies to `local` too.
- `local`: this machine only, at `https://localhost`, for trying Buzz out. Buzz 1.0 joins only
  `https://` and `wss://` addresses, so Caddy serves it with a certificate from Caddy's own local
  authority, which the user tells this computer to trust (step 12).

Commands run from `buzz/deploy/compose` after step 4. In `server` and `local` modes every `run.sh`
call that starts, stops or inspects services carries `BUZZ_COMPOSE_TLS=true` (it adds Caddy). **In
`private` mode, drop `BUZZ_COMPOSE_TLS=true`** everywhere, including operations: there's no Caddy,
and the flag would start it on the public ports. `add-member` and `list-members` work either way.

A server is Ubuntu 24.04 on x86 with 4 GB of RAM and at least 20 GB of disk, as root or a user
whose sudo doesn't ask for a password: an agent can't type it. (x86 is what's tested. Silo's images
also run on ARM, but a bundle from before 2026-10-07 needs x86: its MinIO image is amd64-only.) A
local test runs on Linux the same way, or on macOS or Windows with Docker Desktop. On an Apple
Silicon Mac the relay runs natively. A bundle from before 2026-10-07 runs MinIO through Docker's
x86 emulation there (tested): Docker warns that the image's platform doesn't match, which is
harmless.

1. **Machine.**
   - Server: `. /etc/os-release; echo $ID $VERSION_ID` → `ubuntu 24.04`. On anything else, stop
     and tell the user this setup expects Ubuntu 24.04. Then
     `command -v cloud-init > /dev/null && cloud-init status --wait; uname -m; free -h; df -h /` →
     `status: done` or `status: disabled` (nothing on a machine without cloud-init), `x86_64`,
     about 3.7Gi or more of memory, and a disk `Size` of 20G or more. The first command waits for
     a new server's first-boot updates, which otherwise hold apt's lock and break the installs
     below. As a user other than root, also `sudo -n true && echo sudo ok` → `sudo ok`. The ports
     this setup uses must be free:
     `ss -ltnH '( sport = :80 or sport = :443 or sport = :3000 or sport = :5000 )'` prints nothing
     (`private` mode needs only 3000 and 5000). If something listens, stop and ask the user: never
     stop or change the program that holds the port.
   - Docker Desktop (`local`): `docker version --format '{{.Server.Version}}'` prints the engine's
     version (it fails when Docker Desktop isn't running), and `docker compose version` → 2.24.4
     or later.
   - `local`, either way: ports 80 and 443 on this machine must be free:
     `python3 -c 'import socket; [print(p, "taken" if socket.socket().connect_ex(("127.0.0.1", p)) == 0 else "free") for p in (80, 443)]'`
     → `80 free` and `443 free`. No `buzz-prod` volumes may be left from an earlier try
     (`docker volume ls -q | grep buzz-prod` prints nothing): they keep the old database
     password, which won't match the new `.env`. If some are left, ask before removing them with
     `docker volume rm`. Then, with Docker Desktop, skip to step 4.
2. **DNS and ports (`server`).** An A record for `$DOMAIN` points at this machine. Check, on the
   server: `python3 -c "import socket; print(sorted({a[4][0] for a in socket.getaddrinfo('$DOMAIN', 443)}))"`
   prints only the machine's public IP, which `curl -4 -s https://checkip.amazonaws.com` shows (and
   its IPv6, if it has one). Anything else is a proxied record or a stray AAAA record, and
   `Name or service not known` means the record hasn't spread yet ([troubleshooting](troubleshooting.md)).
   Run the same check on the agent's machine: if the name pointed somewhere before (a wildcard
   record, a parked page), that computer can keep the old address for half an hour or more.
   Ports 80 and 443
   must reach the machine (Let's Encrypt connects on 80): `sudo ufw status` must be `inactive` or
   allow them, and so must any firewall at the hosting provider. Nothing listens on them until
   step 10; step 11's `check-relay.sh` is the real test. On the user's own hardware, also forward
   80 and 443 on the router to the machine, with the A record at the home IP. Many home internet
   providers block incoming connections (CGNAT); if Let's Encrypt can't reach port 80, ask the
   provider, or use a VPS or the `private` mode instead.
2P. **Join the private network (`private`, instead of step 2).** Ask the user to turn on HTTPS
   for their tailnet (admin console, DNS, Enable HTTPS; this lists the machine's name in public
   certificate logs). The machine's Tailscale name becomes `RELAY_URL` for good: a community can't
   add a public address later (block/buzz#4952), and renaming the machine or the tailnet, or
   removing and re-adding the machine, changes the name.
   Install: `curl -fsSL https://tailscale.com/install.sh | sh`. Then join, one of two ways:
   - In a terminal the user watches: `sudo tailscale up --hostname=buzz --timeout=180s`; the user
     approves the machine at the link it prints, and `--timeout` ends the wait.
   - Without a terminal: ask the user to save an auth key (admin console, Settings, Keys) to a file
     only they can read. Not ephemeral: an ephemeral machine is removed when it goes offline, name
     and all. Pre-approved, if the tailnet requires device approval. A tag on the key turns off
     key expiry, and the policy's grants for that tag then decide who reaches the relay (11P).
     Send it without printing it, in an SSH call of its own (the key takes stdin, so it can't go
     in a `bash -s` script); tested as written:
     ```bash
     ssh <server> 'f=$(mktemp); cat > "$f"; sudo tailscale up --hostname=buzz --timeout=180s --auth-key=file:$f; rm -f "$f"' < <key file>
     ```

   Check: `tailscale status --json | python3 -c 'import json,sys; s=json.load(sys.stdin); print(s["Self"]["DNSName"].rstrip("."), "HTTPS on" if s.get("CertDomains") else "HTTPS off")'`
   prints the name and `HTTPS on`, like `buzz.tail1234.ts.net HTTPS on`. The name is `DOMAIN` and
   `HOST`; confirm it with the user before step 8, unless it's exactly the name they chose (if a machine named `buzz` already exists,
   Tailscale picks `buzz-1`). Without a tag, ask them to turn off key expiry for this machine
   (admin console, Machines, the machine's menu, Disable key expiry): keys expire after 180 days
   by default, and the relay would drop off the network.
3. **Docker (Linux).** Docker Engine and the Compose plugin from Docker's repository:
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl git
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker $USER
   ```
   Over SSH, apt may warn `debconf: unable to initialize frontend`: harmless. Then cap Docker's
   logs, which otherwise grow until the disk fills. If `/etc/docker/daemon.json` already exists, or
   `sudo docker ps -q | wc -l` shows other containers running here (the restart below restarts
   them), ask first:
   ```bash
   [ -e /etc/docker/daemon.json ] || printf '%s\n' '{"log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "5"}}' | sudo tee /etc/docker/daemon.json > /dev/null
   sudo systemctl restart docker
   ```
   Check: `docker compose version` → 2.24.4 or later (the Caddy overlay needs it; Docker's
   repository gives v5, which counts), `sudo docker info --format '{{.LoggingDriver}}'` →
   `json-file`, and `grep -c max-size /etc/docker/daemon.json` → `1` (the log cap is not tested).
   As a user other than root, the docker group applies at the next login: log out and in, or run
   `newgrp docker`, before step 6.
4. **The bundle**, at the commit the image was built from so the two match. It goes in the home
   directory unless the user wants another folder; then use that folder wherever this file says
   `~`. For a local test, keep it somewhere permanent, not under `/tmp` (`/private/tmp` on a
   Mac). `.env` will hold every secret, so it's private from the start.
   ```bash
   cd ~ && git clone https://github.com/block/buzz.git
   cd buzz && git checkout -q ${TAG#sha-} && cd deploy/compose
   cp .env.example .env && chmod 600 .env
   ```
   Check: `git rev-parse HEAD | cut -c1-7` prints the tag without `sha-`, and `ls` shows `Caddyfile`,
   `compose.caddy.yml`, `compose.yml` and `run.sh` among others.
5. **Random secrets.** They must never change after the first start.
   ```bash
   for name in $(grep 'CHANGE_ME_RANDOM' .env | cut -d= -f1); do
     sed -i.bak "s/^${name}=.*/${name}=$(openssl rand -hex 32)/" .env
   done && rm -f .env.bak
   ```
   Check: `grep -c CHANGE_ME_RANDOM .env` → `0`, and each is now 64 hex characters:
   `grep -cE "^($(grep CHANGE_ME_RANDOM .env.example | cut -d= -f1 | paste -sd'|' -))=[0-9a-f]{64}$" .env`
   prints the same number as `grep -c CHANGE_ME_RANDOM .env.example` (5 today).
6. **Relay key**, written without printing it. The first command also pulls the relay's image:
   ```bash
   key=$(docker run --rm --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz:$TAG generate-key | awk '/^Secret key:/ {print $3}')
   sed -i.bak "s/^BUZZ_RELAY_PRIVATE_KEY=.*/BUZZ_RELAY_PRIVATE_KEY=${key}/" .env && rm .env.bak && unset key
   ```
   Check: `grep '^BUZZ_RELAY_PRIVATE_KEY=' .env | cut -d= -f2 | tr -d '\n' | wc -c | tr -d ' '` →
   `64`, and the image is the one SKILL.md section 2 names:
   `docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/block/buzz:$TAG` →
   `ghcr.io/block/buzz@$DIGEST`, the digest SKILL.md section 2 sets (skip this when the user chose
   the newest image). Then tell the user to copy the key into a password manager two maintainers
   can open, by running this in a terminal window of its own, not in the conversation or a terminal
   inside the agent's app, which some agents can read (through `ssh` for a server):
   `ssh <server> "grep '^BUZZ_RELAY_PRIVATE_KEY=' ~/buzz/deploy/compose/.env | cut -d= -f2"`.
   Backups of `.env` hold it too. A local test can skip the copy. The key is the relay's identity:
   never replace it, not even when someone who could read it leaves. A new key splits every
   channel's records today (block/buzz#7357), and Block's chart says not to rotate it. If it leaked,
   treat the server as exposed, and ask in block/buzz before changing it.
7. **Owner.**
   ```bash
   sed -i.bak "s/^RELAY_OWNER_PUBKEY=.*/RELAY_OWNER_PUBKEY=$OWNER_HEX/" .env && rm .env.bak
   ```
   Check: `grep -cE '^RELAY_OWNER_PUBKEY=[0-9a-f]{64}$' .env` → `1` (an unset `OWNER_HEX` would
   write an empty owner), and `grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env` → `0`.
8. **URL and version.** Confirm `$DOMAIN` with the user first, unless it's the name they chose
   (`private`: the name step 2P's check printed; `local` has none). The CORS line
   also admits Buzz 0.X, which calls the relay's HTTP API from `tauri://localhost`
   (`http://tauri.localhost` on Windows); without them, joining from Buzz 0.X fails with
   `Load failed` (block/buzz#2872). Buzz 1.0 makes those calls from the app itself, so CORS
   doesn't affect it.
   ```bash
   sed -i.bak \
     -e "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" \
     -e "s|^BUZZ_DOMAIN=.*|BUZZ_DOMAIN=$HOST|" \
     -e "s|^RELAY_URL=.*|RELAY_URL=$RELAY_URL|" \
     -e "s|^BUZZ_MEDIA_BASE_URL=.*|BUZZ_MEDIA_BASE_URL=$ORIGIN/media|" \
     -e "s|^BUZZ_MEDIA_SERVER_DOMAIN=.*|BUZZ_MEDIA_SERVER_DOMAIN=$HOST|" \
     -e "s|^BUZZ_CORS_ORIGINS=.*|BUZZ_CORS_ORIGINS=tauri://localhost,http://tauri.localhost,$ORIGIN|" \
     .env && rm .env.bak
   ```
   Check: `grep -E '^(BUZZ_IMAGE|BUZZ_DOMAIN|RELAY_URL|BUZZ_MEDIA_BASE_URL|BUZZ_MEDIA_SERVER_DOMAIN|BUZZ_CORS_ORIGINS)=' .env`
   shows the six values. In `server` and `private` modes, also tell the relay where phones pair
   (step 9 adds the service):
   ```bash
   grep -q '^BUZZ_PAIRING_RELAY_URL=' .env || echo "BUZZ_PAIRING_RELAY_URL=wss://$HOST/pair" >> .env
   ```
   Check: `grep '^BUZZ_PAIRING_RELAY_URL=' .env` → `BUZZ_PAIRING_RELAY_URL=wss://$HOST/pair` (one
   line). Also turn on phone notifications: the relay then wakes the Buzz phone app (0.25 or later)
   for direct messages and mentions through Block's gateway, `push.buzz.xyz`. No message text
   passes through it or Apple: the phone fetches messages from this relay. The gateway does see this
   relay's key, its server's address and when it wakes which phone (SKILL.md section 4 has what to
   tell the user):
   ```bash
   sed -i.bak "s/^BUZZ_PUSH_ENABLED=.*/BUZZ_PUSH_ENABLED=true/" .env && rm .env.bak
   ```
   Check: `grep -E '^BUZZ_PUSH_(ENABLED|GATEWAY_DELIVERY_URL)=' .env` → `BUZZ_PUSH_ENABLED=true` and
   `BUZZ_PUSH_GATEWAY_DELIVERY_URL=https://push.buzz.xyz/v1/deliveries/apns`. Bundles from before
   2026-09-15 have neither line: use a newer tag.
8P. **Localhost only (`private` and `local`).** The bundle publishes its ports on every address,
   which on a laptop means the local network. Bind them to localhost, so only Tailscale
   (`private`) or this machine (`local`) reaches them. In `private` mode, the relay's port 3000:
   ```bash
   sed -i.bak "s/^BUZZ_HTTP_PORT=.*/BUZZ_HTTP_PORT=127.0.0.1:3000/" .env && rm .env.bak
   ```
   Check: `grep '^BUZZ_HTTP_PORT=' .env` → `BUZZ_HTTP_PORT=127.0.0.1:3000` (one line).
   In `local` mode, Caddy's ports 80 and 443 (Caddy's overlay doesn't publish the relay's port):
   ```bash
   sed -i.bak -e "s/^CADDY_HTTP_PORT=.*/CADDY_HTTP_PORT=127.0.0.1:80/" \
     -e "s/^CADDY_HTTPS_PORT=.*/CADDY_HTTPS_PORT=127.0.0.1:443/" .env && rm .env.bak
   ```
   Check: `grep -E '^CADDY_HTTPS?_PORT=' .env` → `CADDY_HTTP_PORT=127.0.0.1:80` and
   `CADDY_HTTPS_PORT=127.0.0.1:443`.
9. **Bundle edits.** Up to two edits to tracked files, which upgrades and restores redo
   (operations.md).
   - **MinIO images.** If `grep -n 'image:.*quay.io/minio' compose.yml` finds lines, those images
     are gone from quay.io (block/buzz#7880). If it finds none, skip this edit: bundles from
     2026-10-07 on use Silo's images instead (`grep -c 'image: pgsty/' compose.yml` → `2`). Swap
     in the build Block's own CI uses:
     ```bash
     sed -i.bak \
       -e 's|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|' \
       -e 's|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|' \
       compose.yml && rm compose.yml.bak
     ```
     Check: `grep -c 'image:.*buzz-minio' compose.yml` → `2`. `:latest` can change under you,
     unlike the pinned quay.io images it replaces.
   - **Phone pairing (`server` and `private`).** The phone app joins by scanning a code that the
     desktop app shows, through a pairing service that's in the relay's image but that the bundle
     doesn't start (block/buzz#7721). If `grep -c buzz-pair-relay compose.yml` prints `0`, add it,
     on this machine's port 5000 only:
     ```bash
     printf '%s\n' \
       '  pair-relay:' \
       '    image: ${BUZZ_IMAGE:-ghcr.io/block/buzz:main}' \
       '    entrypoint: ["/usr/local/bin/buzz-pair-relay"]' \
       '    environment: {BUZZ_PAIR_RELAY_BIND_ADDR: "0.0.0.0:5000"}' \
       '    ports: ["127.0.0.1:5000:5000"]' \
       '    restart: unless-stopped' \
       '    networks: [buzz-net]' |
       sed -i.bak '/^services:$/r /dev/stdin' compose.yml && rm compose.yml.bak
     ```
     In `server` mode, Caddy also sends `/pair` to it:
     ```bash
     sed -i.bak 's|^  reverse_proxy relay:3000$|  reverse_proxy /pair* pair-relay:5000\n  reverse_proxy relay:3000|' Caddyfile && rm Caddyfile.bak
     ```
     Check: `grep -c buzz-pair-relay compose.yml` → `1`, and in `server` mode
     `grep -c 'pair-relay:5000' Caddyfile` → `1`.
10. **Start.** `BUZZ_COMPOSE_TLS=true ./run.sh start` in `server` and `local` modes,
    `./run.sh start` in `private` mode (30 to 55 seconds on a fresh 2-CPU server, downloads
    included). Check: `./run.sh status` (with the flag in `server` and `local` modes) shows
    `buzz-prod-relay-1`, `-postgres-1`, `-redis-1` and `-minio-1` (the file store, Silo or MinIO)
    as `Up … (healthy)`, plus `buzz-prod-caddy-1` `Up` in `server` and `local` modes and
    `buzz-prod-pair-relay-1` `Up` in `server` and `private` modes. Caddy starts once the relay is
    healthy, so its uptime is shorter than the others'. `minio-init` runs once and exits, so
    `status` leaves it out; `docker compose ps -a minio-init` shows `Exited (0)`. In `private`
    mode the relay's port reads `127.0.0.1:3000->3000/tcp`, and in `local` mode Caddy's read
    `127.0.0.1:80->80/tcp, 127.0.0.1:443->443/tcp` (step 8P). On a server the containers restart
    on their own after a reboot; with Docker Desktop, only once Docker Desktop is running again.
10P. **Serve on the private network (`private`).** After `./run.sh start`:
    ```bash
    sudo tailscale serve --bg 3000
    sudo tailscale serve --bg --set-path /pair 5000
    ```
    Check: `tailscale serve status` → `https://$HOST (tailnet only)` with
    `|-- /     proxy http://127.0.0.1:3000` and `|-- /pair proxy http://127.0.0.1:5000`.
    `tailscale serve` proxies WebSockets too.
11. **Checks.** `./run.sh list-members` shows `$OWNER_HEX` with the role `owner`. Then run
    `check-relay.sh` from the agent's machine, as SKILL.md section 3 says: with the server's public
    IP in `server` mode, and with the IP and `80 443 3000 5000` in `private` mode, from a device on the
    private network. It waits while Caddy gets its certificate. In `local` mode, step 12 runs it.
    Then join, as SKILL.md section 4 says.
11P. **If other devices time out (`private`)** while `tailscale ping` works, the tailnet's access
    policy blocks them. The default policy allows everything; a customized one needs a grant such
    as `{"src": ["autogroup:member"], "dst": ["autogroup:self"], "ip": ["tcp:443"]}` (the user's
    own devices) or a `tag:buzz` on the relay with `tcp:443` granted to members (for a team). That's the user's policy to change: ask. Members install Tailscale and
    join the tailnet before they join the community, on their phones too: the phone app reaches the
    relay only while Tailscale is on. Known gap: webhooks to tailnet addresses are refused
    (block/buzz#6500).

12. **The local certificate (`local`).** Caddy made a certificate authority of its own for
    `localhost`, kept in its data volume on this machine. Save the authority's certificate next to
    the bundle (it holds no secret), then check the relay against it:
    ```bash
    docker cp buzz-prod-caddy-1:/data/caddy/pki/authorities/local/root.crt local-ca.crt
    CA_FILE=local-ca.crt bash $SKILL/scripts/check-relay.sh https://localhost
    ```
    Check: every line says `PASS`, except `SKIP` for phone pairing and phone notifications: phones
    can't pair with a local test. Buzz 1.0 joins only once this computer trusts the authority. That takes the user's
    password, so the agent never runs it: on a Mac, the user runs this in their own terminal, from
    `buzz/deploy/compose`, and gives their password (macOS may also ask in a window):
    ```bash
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain local-ca.crt
    ```
    Check: `security verify-cert https://localhost` → `...certificate verification successful.`
    Tell the user what it means: this computer then accepts any certificate made with that
    authority's key, which stays in Caddy's volume on this machine. When they're done with the
    local test, they remove both (Removing the local test, below). On Linux, the command is
    `sudo cp local-ca.crt /usr/local/share/ca-certificates/buzz-local-ca.crt && sudo update-ca-certificates`
    (not tested). Then join with `wss://localhost`, as SKILL.md section 4 says.

**Removing the local test (`local`; ask first: it deletes the community).** From
`buzz/deploy/compose`: `BUZZ_COMPOSE_TLS=true ./run.sh stop`, then
`docker volume rm $(docker volume ls -q | grep '^buzz-prod_')`, which deletes the data and Caddy's
authority. The user removes the trust in their own terminal, on a Mac:
`sudo security remove-trusted-cert -d local-ca.crt` and
`sudo security delete-certificate -Z "$(openssl x509 -in local-ca.crt -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :)" /Library/Keychains/System.keychain`.
A new local test makes a new authority, to trust again.

**For a server that runs for months.** A server set up before step 3 capped Docker's logs keeps
uncapped ones: add the file the same way, then `BUZZ_COMPOSE_TLS=true ./run.sh stop` and
`BUZZ_COMPOSE_TLS=true ./run.sh start` (without the flag in `private` mode; members lose the
connection for about half a minute), since only new containers pick it up. Nothing schedules
backups, so offer a nightly one (ask first; not tested). Members lose the connection for about half
a minute each time, so the user picks the hour. Save operations.md's backup block as
`~/buzz-backup.sh`, with `cd ~/buzz/deploy/compose` as its first line and, as its last, a line that
keeps the newest seven folders once the night's backup is whole:
`[ -s "$BACKUP/postgres.dump" ] && [ -s "$BACKUP/env" ] && ls -d ~/buzz-backup/20*/ | head -n -7 | xargs -r rm -rf`.
Then `chmod 700 ~/buzz-backup.sh` and, for 03:30 server time,
`(crontab -l 2>/dev/null; echo '30 3 * * * bash ~/buzz-backup.sh > ~/buzz-backup/last.log 2>&1') | crontab -`.
Check: `crontab -l` shows the line, and the next day `ls ~/buzz-backup` shows a new folder. Copies
off the server stay the user's to make.

**Moderation console (`server`; optional, ask first).** Offer it for a community that strangers
can join (not tested). Without it, members can report a message, but nobody sees reports in Buzz,
and nobody can ban someone, time them out or delete their messages. Remove isn't a ban: a removed
person comes back with any invite link that hasn't expired. Buzz 1.0's Moderation screens do all of
that once the relay serves its admin API at a second name, `admin.$DOMAIN`, which Buzz finds in the
relay's info. Every request to it must be signed by the owner or by staff the owner adds. Buzz
connects to it only at a public address, so a private network moderates with the command line
instead (operations.md). With the user's OK:
- An A record for `admin.$DOMAIN` at the same address as `$DOMAIN` (it changes DNS). Check it on
  the server as step 2 does:
  `python3 -c "import socket; print(sorted({a[4][0] for a in socket.getaddrinfo('admin.$DOMAIN', 443)}))"`
  prints only the machine's public IP.
- The admin name in `.env`, with `BUZZ_ADMIN_AUTH` left unset, which means signed requests, and
  Caddy's route for it. Upgrades and restores reset the Caddyfile, so they add the route again,
  after step 9's edits:
  ```bash
  grep -q '^BUZZ_ADMIN_HOST=' .env || echo "BUZZ_ADMIN_HOST=admin.$HOST" >> .env
  grep -q '^admin\.' Caddyfile || printf '\nadmin.{$BUZZ_DOMAIN} {\n    reverse_proxy relay:3000\n}\n' >> Caddyfile
  ```
  Check: `grep -E '^BUZZ_ADMIN_(HOST|AUTH)=' .env` prints only `BUZZ_ADMIN_HOST=admin.$HOST`, and
  `grep -c '^admin\.' Caddyfile` → `1`.
- Stop and start everything, so the relay reads `.env` and Caddy its file (members lose the
  connection for about half a minute): `BUZZ_COMPOSE_TLS=true ./run.sh stop`, then
  `BUZZ_COMPOSE_TLS=true ./run.sh start`. Check:
  `curl -s -H 'Accept: application/nostr+json' $ORIGIN/ | python3 -c 'import json,sys; print(json.load(sys.stdin).get("admin_api"))'`
  → `https://admin.$HOST`, and
  `curl -s -o /dev/null -w '%{http_code}\n' https://admin.$HOST/api/admin/v1/probe` → `401`: the
  name answers, and asks for a signature. Caddy can take a minute to get its certificate.

Then tell the user: in Buzz 1.0 the owner opens Settings, where Moderation shows Reports, Feedback,
Communities and Staff (Check again refreshes it). Moderators are people the owner adds under Staff,
Add staff, with their npub and the role Moderator: being a community admin isn't enough. From
those screens, staff ban people, time them out and delete messages. A ban disconnects the person
and their agents, and refuses them at any invite link; after Remove, any live link still lets them
back in.

**Optional hardening (`server`; ask first: a wrong SSH rule locks the user out).** Docker
publishes 80 and 443 around `ufw`, so a host firewall mainly guards SSH and anything else on the
machine: `sudo ufw allow from <admin IP> to any port 22 proto tcp`, then `sudo ufw enable`.

**Shutting a server down (`server` and `private`; ask first: it ends the community).** Back up
first (operations.md), with a copy off the server. Then `BUZZ_COMPOSE_TLS=true ./run.sh stop`
(`./run.sh stop` in `private` mode). Before the server goes, delete the domain's A record, and
`admin.$DOMAIN`'s if there is one, or point them at a server the user controls: once the provider
hands the address to someone else, a record left behind lets them get a certificate for the
community's address and answer as the relay. In `private` mode, remove the machine from the tailnet
instead (admin console, Machines). Then destroy the server, with its volumes and the provider's
backups of it (not tested).
