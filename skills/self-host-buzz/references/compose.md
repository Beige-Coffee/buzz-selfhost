# Docker Compose: a VPS, your own hardware, or a local test

The official bundle in `deploy/compose` of block/buzz: the relay, Postgres, Redis and MinIO,
with Caddy in front for HTTPS in `server` mode. Three modes:

- `server`: reachable by anyone with the URL, over HTTPS. Members still need to be added.
- `private`: reachable only over the user's Tailscale network; no public ports. Steps marked
  **P** replace or add to the server steps; 8P applies to `local` too.
- `local`: this machine only, at `ws://127.0.0.1:3000`, for trying Buzz out.

Commands run from `buzz/deploy/compose` after step 4. In `server` mode every `run.sh` call that
starts, stops or inspects services carries `BUZZ_COMPOSE_TLS=true` (it adds Caddy). **In `private`
and `local` modes, drop `BUZZ_COMPOSE_TLS=true`** everywhere, including operations: there's no
Caddy, and the flag would start it on the public ports. `add-member` and `list-members` work
either way.

A server is Ubuntu 24.04 on x86 with 4 GB of RAM, as root or a user with sudo. (x86 for now: the
MinIO image the bundle needs is amd64-only.) A local test runs on Linux the same way, or on macOS
or Windows with Docker Desktop. On an Apple Silicon Mac the relay runs natively and MinIO runs
through Docker's x86 emulation (tested): Docker warns that the image's platform doesn't match,
which is harmless.

1. **Machine.**
   - Server: `cloud-init status --wait; uname -m; free -h` → `status: done`, `x86_64`, and about
     3.7Gi or more. The first command waits for a new server's first-boot updates, which
     otherwise hold apt's lock and break the installs below.
   - Docker Desktop (`local`): `docker version --format '{{.Server.Version}}'` prints the engine's
     version (it fails when Docker Desktop isn't running), and `docker compose version` → 2.24.4
     or later.
   - `local`, either way: port 3000 must be free (`lsof -nP -iTCP:3000 -sTCP:LISTEN` prints
     nothing), and no `buzz-prod` volumes may be left from an earlier try
     (`docker volume ls -q | grep buzz-prod` prints nothing): they keep the old database
     password, which won't match the new `.env`. If some are left, ask before removing them with
     `docker volume rm`. Then, with Docker Desktop, skip to step 4.
2. **DNS and ports (`server`).** An A record for `$DOMAIN` points at this machine. Check, on the
   server: `python3 -c "import socket; print(socket.gethostbyname('$DOMAIN'))"` prints the
   machine's public IP, which `curl -4 -s https://checkip.amazonaws.com` shows. Ports 80 and 443
   must reach the machine (Let's Encrypt connects on 80): `sudo ufw status` must be `inactive` or
   allow them, and so must any firewall at the hosting provider. Nothing listens on them until
   step 10; step 11's `check-relay.sh` is the real test. On the user's own hardware, also forward
   80 and 443 on the router to the machine, with the A record at the home IP. Many home internet
   providers block incoming connections (CGNAT); if Let's Encrypt can't reach port 80, ask the
   provider, or use a VPS or the `private` mode instead. Router forwarding isn't covered by the
   tests.
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
   Over SSH, apt may warn `debconf: unable to initialize frontend`: harmless. Check:
   `docker compose version` → 2.24.4 or later (the Caddy overlay needs it; Docker's
   repository gives v5, which counts). As a user other than root, the docker group applies at the
   next login: log out and in, or run `newgrp docker`, before step 6.
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
6. **Relay key**, written without printing it:
   ```bash
   key=$(docker run --rm --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz:$TAG generate-key | awk '/^Secret key:/ {print $3}')
   sed -i.bak "s/^BUZZ_RELAY_PRIVATE_KEY=.*/BUZZ_RELAY_PRIVATE_KEY=${key}/" .env && rm .env.bak && unset key
   ```
   Check: `grep '^BUZZ_RELAY_PRIVATE_KEY=' .env | cut -d= -f2 | tr -d '\n' | wc -c | tr -d ' '` →
   `64`. Then tell the user to copy the key into a password manager two maintainers can open, by
   running this in their own terminal, not in the conversation (through `ssh` for a server):
   `ssh <server> "grep '^BUZZ_RELAY_PRIVATE_KEY=' ~/buzz/deploy/compose/.env | cut -d= -f2"`.
   Backups of `.env` hold it too. A local test can skip the copy.
7. **Owner.**
   ```bash
   sed -i.bak "s/^RELAY_OWNER_PUBKEY=.*/RELAY_OWNER_PUBKEY=$OWNER_HEX/" .env && rm .env.bak
   ```
   Check: `grep -cE '^RELAY_OWNER_PUBKEY=[0-9a-f]{64}$' .env` → `1` (an unset `OWNER_HEX` would
   write an empty owner), and `grep -cE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env` → `0`.
8. **URL and version.** Confirm `$DOMAIN` with the user first, unless it's the name they chose
   (`private`: the name step 2P's check printed; `local` has none). The CORS line
   also admits Buzz Desktop, which calls the relay's HTTP API from `tauri://localhost`
   (`http://tauri.localhost` on Windows). Without them, joining from Desktop fails with
   `Load failed` (block/buzz#2872).
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
   line).
8P. **Localhost only (`private` and `local`).** The bundle publishes port 3000 on every address,
   which on a laptop means the local network. Bind it to localhost, so only Tailscale (`private`)
   or this machine (`local`) reaches it:
   ```bash
   sed -i.bak "s/^BUZZ_HTTP_PORT=.*/BUZZ_HTTP_PORT=127.0.0.1:3000/" .env && rm .env.bak
   ```
   Check: `grep '^BUZZ_HTTP_PORT=' .env` → `BUZZ_HTTP_PORT=127.0.0.1:3000` (one line).
9. **Bundle edits.** Two edits to tracked files, which upgrades and restores redo
   (operations.md).
   - **MinIO images.** If `grep -n 'image:.*quay.io/minio' compose.yml` finds lines, those images
     are gone from quay.io (block/buzz#7880); if it finds none, skip this edit. Swap in the build
     Block's own CI uses:
     ```bash
     sed -i.bak \
       -e 's|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|' \
       -e 's|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|' \
       compose.yml && rm compose.yml.bak
     ```
     Check: `grep -c 'image:.*buzz-minio' compose.yml` → `2`. `:latest` can change under you,
     unlike the pinned quay.io images it replaces.
   - **Phone pairing (`server` and `private`).** The phone app joins by scanning a code that Buzz
     Desktop shows, through a pairing service that's in the relay's image but that the bundle
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
10. **Start.** `BUZZ_COMPOSE_TLS=true ./run.sh start` in `server` mode, `./run.sh start` otherwise
    (35 to 55 seconds on a fresh 2-CPU server, downloads included). Check: `./run.sh status`
    (with the flag in `server` mode) shows `buzz-prod-relay-1`, `-postgres-1`, `-redis-1` and
    `-minio-1` as `Up … (healthy)`, plus `buzz-prod-caddy-1` `Up` in `server` mode and
    `buzz-prod-pair-relay-1` `Up` in `server` and `private` modes. Caddy starts
    once the relay is healthy, so its uptime is shorter than the others'. `minio-init` runs once
    and exits, so `status` leaves it out; `docker compose ps -a minio-init` shows `Exited (0)`.
    In `private` and `local` modes the relay's port reads
    `127.0.0.1:3000->3000/tcp` (step 8P). On a server
    the containers restart on their own after a reboot; with Docker Desktop, only once Docker
    Desktop is running again.
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
    private network. It waits while Caddy gets its certificate. Then join, as SKILL.md section 4
    says.
11P. **If other devices time out (`private`)** while `tailscale ping` works, the tailnet's access
    policy blocks them. The default policy allows everything; a customized one needs a grant such
    as `{"src": ["autogroup:member"], "dst": ["autogroup:self"], "ip": ["tcp:443"]}` (the user's
    own devices; tested) or a `tag:buzz` on the relay with `tcp:443` granted to members (for a
    team; not yet tested). That's the user's policy to change: ask. Members install Tailscale and
    join the tailnet before they join the community, on their phones too: the phone app reaches the
    relay only while Tailscale is on. Known gap: webhooks to tailnet addresses are refused
    (block/buzz#6500).

**Optional hardening (`server`; ask first: a wrong SSH rule locks the user out).** Docker
publishes 80 and 443 around `ufw`, so a host firewall mainly guards SSH and anything else on the
machine: `sudo ufw allow from <admin IP> to any port 22 proto tcp`, then `sudo ufw enable`.
