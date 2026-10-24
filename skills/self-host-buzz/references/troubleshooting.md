# If a step fails

| Symptom | Fix |
| --- | --- |
| `Host key verification failed` | The server's host key isn't saved, and an agent's shell can't confirm it. The user connects once from their own terminal (`ssh <user>@<server> true`); for a server they just made, `-o StrictHostKeyChecking=accept-new` also works (ask first). |
| `Permission denied (publickey)`, or ssh waits for a passphrase | The key has a passphrase or isn't the default one. The user adds it to their SSH agent in their own terminal (`ssh-add <key file>`), or pass `-i <key file>`. An AWS key is the `.pem` file from the console (`chmod 400` it), and the user is `ubuntu`, not `root`. |
| `sudo: a password is required` or `a terminal is required` | The user's sudo asks for a password, which an agent can't type. Use root, or the user allows this account sudo without a password (their call). |
| Step 2's check shows a Cloudflare address (`104.x`, `172.64.x` to `172.71.x`, `2606:4700:…`) | The record is proxied. Set it to DNS only (the grey cloud) in Cloudflare. |
| Step 2's check shows an IPv6 address that isn't the server's | A stray AAAA record, often the registrar's default. Let's Encrypt may try it and fail: delete it. |
| check-relay.sh fails every check from this computer, while step 2's check on the server shows the right address | This computer still has the domain's old address cached: the name pointed somewhere before (a wildcard record, a parked page). It clears when the old record's time-to-live runs out (30 minutes for a Vercel wildcard in testing), or when the user flushes their DNS cache. Meanwhile check the server directly: `RESOLVE_IP=<server IP> bash $SKILL/scripts/check-relay.sh …`. The Buzz app on the same computer can't reach the relay until it clears. |
| Step 2: `Name or service not known` | The record hasn't spread yet, or the name is misspelled. Wait a few minutes and check again. |
| The first `python3` on a Mac opens an installer | Apple's developer tools aren't installed: `xcode-select --install`, then retry. |
| `npub-to-hex.py`: `not a valid npub` | The npub was cut off or mistyped. Copy it again from the Buzz app (Buzz 1.0: Settings, Identity). |
| `pick-tag.py`: GitHub's rate limit | 60 unauthenticated calls an hour. Wait, or use the `tested-image` tag in SKILL.md's header. |
| `ghcr.io/block/buzz:sha-…: not found` | That commit has no image. Pick the tag with `$SKILL/scripts/pick-tag.py`. |
| A script piped over SSH stops partway, with exit 0 | A command in it (`docker compose exec`, `apt-get`) read the rest of the script as its input. Add `< /dev/null` to that line. |
| `BUZZ_COMPOSE_TLS=true: command not found` | The flag was stored in a variable and expanded. Type it before `./run.sh`, or `export BUZZ_COMPOSE_TLS=true`. |
| `docker: 'compose' is not a docker command` | Install Docker from Docker's repository (compose.md step 3). |
| `permission denied` on the Docker socket | The docker group applies at next login: log out and in, or prefix with `sudo`. |
| A check fails right after a long step (Docker's install, the clone, the start) | The step may still be running: the agent's command tool stopped waiting, but the server didn't. Wait for it (`pgrep -a apt-get`, `pgrep -a git`), then rerun the check. |
| `Could not get lock /var/lib/dpkg/lock-frontend` | First-boot updates are still running: `cloud-init status --wait`, then retry. |
| `.env still contains CHANGE_ME placeholders` | `grep -nE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env` shows which step didn't write. |
| An error about `!reset` | Compose is older than 2.24.4. |
| Pull fails for `quay.io/minio/…` | A bundle from before 2026-10-07: do compose.md step 9. Newer bundles use Silo's images from Docker Hub. |
| Relay never turns healthy | `docker logs --tail 100 buzz-prod-relay-1` (`./run.sh logs` follows the log and never returns). `RELAY_OWNER_PUBKEY` must be 64 hex characters, not an npub. |
| TLS error or refused on 443 | DNS doesn't point here yet, or a firewall blocks 80. `docker logs --tail 100 buzz-prod-caddy-1`. |
| 401 when joining | The address pasted in the Buzz app isn't the relay's `RELAY_URL`: another host or port. Buzz 1.0 takes it as `wss://` or `https://`, in any case, with or without a final slash; Buzz 0.X needs it byte for byte. |
| Buzz 1.0: `Relay request failed (403)` when joining, or Buzz 0.X: `Not a member yet` | The relay works; the identity in the app is neither the owner nor a member. Compare its npub (Buzz 1.0: Settings, Identity) with the owner's (`list-members` prints hex; `npub-to-hex.py` converts). Add it, send an invite link, or join with the owner's identity. |
| Buzz 1.0: `Enter a wss:// or https:// relay URL without credentials, a path, query, or fragment.` | The address isn't `wss://` or `https://`, or has a path. Paste `RELAY_URL`. A local test at `ws://127.0.0.1:3000`, from before compose.md's local mode moved to `wss://localhost`, only takes Buzz 0.X. |
| Buzz 1.0: an invite link fails in the community button's Join a community | That box takes only an address. Open the link and choose Accept invite in Buzz, or paste the community's address and then the link's code (the part after `/invite/`). The first screen's box takes the whole link. |
| Buzz 1.0: `Community discovery failed` | The app can't reach the relay over HTTPS. On a local test, this computer doesn't trust the local certificate yet (compose.md step 12). Elsewhere, run `check-relay.sh`. |
| Buzz 1.0: `Relay did not advertise its identity` | The relay has no `BUZZ_RELAY_PRIVATE_KEY`, so its info names no identity (`check-relay.sh` fails its relay identity line). Set it as compose.md step 6 does, before anyone joins. |
| Buzz 1.0: `This community's relay does not support channel labels or system channels yet.` | New chat needs a relay image from 2026-10-15 or later. Upgrade (operations.md). |
| After an upgrade, the partition audit says `degraded` | Expected when the old image is from before 2026-10-20, and harmless (operations.md, Upgrade). |
| Buzz 0.X can't join (`Load failed`), or its GIFs, moderation or invites fail | `BUZZ_CORS_ORIGINS` lacks `tauri://localhost,http://tauri.localhost` (compose.md step 8), then restart. Buzz 1.0 doesn't need them. |
| Pairing a phone: Buzz 1.0 says `Couldn’t connect for pairing`, or Buzz 0.X `WebSocket connection failed: HTTP error: 404 Not Found` | The pairing service isn't running or isn't routed. On Compose: step 9's pairing edit, and 10P on a private network. `check-relay.sh` tests it. A local test has no pairing: the pairing connection trusts only public certificate authorities. |
| The phone gets no notifications | They need the phone app 0.25 or later, notifications allowed for Buzz in the phone's settings, and `check-relay.sh` printing `PASS  phone notifications`; if it prints `SKIP`, set `BUZZ_PUSH_ENABLED=true` (compose.md step 8) and restart. A locked phone is woken for direct messages and mentions only. The relay must reach `https://push.buzz.xyz` over the internet. |
| The phone app: `Relay URL must use HTTPS` or `cannot target private network addresses` | The relay's address is a bare IP like `ws://10.0.0.1` (block/buzz#4198). Use a name with HTTPS: a domain, or the Tailscale name. |
| Compose warns a volume `was not created by Docker Compose` | The restore skipped `docker compose create`. Harmless; the data is fine. |
| Compose warns `Found orphan containers (buzz-prod-caddy-1)` | A plain `docker compose` command in `server` mode, which leaves out Caddy's file. Harmless. Never add `--remove-orphans`: it would remove Caddy. |
| After an upgrade to a Silo bundle, `minio` isn't healthy, or the file checks fail | Silo didn't take over the MinIO volume: `docker logs --tail 50 buzz-prod-minio-1`. Go back: restore the backup with the bundle at the old tag (operations.md), and report it (SKILL.md, When something fails). |
| `pg_restore: cannot drop inherited constraint` | Restoring over a live database. Restore into an empty one (operations.md). |
| Private: other devices time out, `tailscale ping` works | The tailnet's access policy blocks them (compose.md step 11P). |
| Private: the relay vanishes from the tailnet months later | Its Tailscale key expired. Re-authenticate the machine, then disable key expiry for it (compose.md step 2P). |
| Kubernetes: MinIO in `ImagePullBackOff` | The values file lacks the two MinIO image lines (kubernetes.md step 3). |
| Kubernetes or Compose: `here-document … delimited by end-of-file` | A heredoc was indented. Run it unindented. |
| Kubernetes: relay crash-loops with `pool timed out` at first install | Postgres is still starting; it settles within a minute or two. |
| Docker warns `The requested image's platform (linux/amd64) does not match` | Apple Silicon running the amd64 MinIO image of a bundle from before 2026-10-07 through emulation. Harmless. |
| Local: `port is already allocated` on 80 or 443 | Another program uses it, such as a web server. Stop it, then check again with compose.md step 1's command. |
| Local: a step that pulls an image hangs with no output | Docker Desktop's credential helper is waiting, often on a keychain prompt: `pgrep -fl docker-credential` shows `docker-credential-desktop get`. Answer the prompt, or restart Docker Desktop. The images are public, so `DOCKER_CONFIG=$(mktemp -d) docker pull <image>` also pulls one without the helper (seen in testing). |
| Local: `docker cp` says `Could not find the file` | Caddy hasn't made its local authority yet. Wait a few seconds and run it again; `docker logs --tail 20 buzz-prod-caddy-1` shows Caddy's start. |
| Local: Buzz 1.0 can't join after the test was removed and set up again | The new test has a new local authority. Save and trust its `local-ca.crt` (compose.md step 12), and remove the old one's trust (Removing the local test). |
| Postgres refuses the relay's password after an earlier try | Leftover `buzz-prod` volumes keep the old password. Ask, then `docker volume rm` them and start again. |
| Relay logs `transport drop` warnings at start | The git storage self-test. Harmless when it ends with `conformance probe passed`. |
| Railway: `Too many services in project` | The account's live projects already hold as many services as its plan allows, even when deploying into a new project. Deleting a project makes room at once; that, or changing plans, is the user's call. |
| Railway: `Service "block/buzz:main" not found` right after deploying | The services appear 10 to 20 seconds after `railway deploy` returns. Wait and retry. |
| `railway ssh`: `No registered SSH keys found` | `railway ssh keys add` (ask first: it changes the account). It takes only a key in `~/.ssh`. |
| `railway ssh`: `Host key verification failed` | The first connection must confirm Railway's host key, which a shell without a terminal can't. Have the user run `railway ssh -s "block/buzz:main" true` once in their own terminal. |
| `railway redeploy`: `No deployment found for service` | After `railway down`, use `railway redeploy --from-source`. |
