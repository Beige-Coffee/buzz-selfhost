# If a step fails

| Symptom | Fix |
| --- | --- |
| `npub-to-hex.py`: `not a valid npub` | The npub was cut off or mistyped. Copy it again from Buzz Desktop. |
| `pick-tag.py`: GitHub's rate limit | 60 unauthenticated calls an hour. Wait, or use the `tested-image` tag in SKILL.md's header. |
| `ghcr.io/block/buzz:sha-…: not found` | That commit has no image. Pick the tag with `$SKILL/scripts/pick-tag.py`. |
| A script piped over SSH stops partway, with exit 0 | A command in it (`docker compose exec`, `apt-get`) read the rest of the script as its input. Add `< /dev/null` to that line. |
| `BUZZ_COMPOSE_TLS=true: command not found` | The flag was stored in a variable and expanded. Type it before `./run.sh`, or `export BUZZ_COMPOSE_TLS=true`. |
| `docker: 'compose' is not a docker command` | Install Docker from Docker's repository (compose.md step 3). |
| `permission denied` on the Docker socket | The docker group applies at next login: log out and in, or prefix with `sudo`. |
| `Could not get lock /var/lib/dpkg/lock-frontend` | First-boot updates are still running: `cloud-init status --wait`, then retry. |
| `.env still contains CHANGE_ME placeholders` | `grep -nE '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' .env` shows which step didn't write. |
| An error about `!reset` | Compose is older than 2.24.4. |
| Pull fails for `quay.io/minio/…` | Do compose.md step 9. |
| Relay never turns healthy | `docker logs --tail 100 buzz-prod-relay-1` (`./run.sh logs` follows the log and never returns). `RELAY_OWNER_PUBKEY` must be 64 hex characters, not an npub. |
| TLS error or refused on 443 | DNS doesn't point here yet, or a firewall blocks 80. `docker logs --tail 100 buzz-prod-caddy-1`. |
| 401 when joining | The URL pasted in Buzz Desktop differs from `RELAY_URL`, byte for byte. |
| Buzz Desktop: `Not a member yet` | The relay works; the npub Buzz Desktop shows is neither the owner nor a member. Compare it with the owner's (`list-members` prints hex; `npub-to-hex.py` converts). Add it, or join with the owner's identity. |
| Desktop can't join (`Load failed`), or its GIFs, moderation or invites fail | `BUZZ_CORS_ORIGINS` lacks `tauri://localhost,http://tauri.localhost` (compose.md step 8), then restart. |
| Pairing a phone: Desktop says `WebSocket connection failed: HTTP error: 404 Not Found` | The pairing service isn't running or isn't routed. On Compose: step 9's pairing edit, and 10P on a private network. `check-relay.sh` tests it. |
| The phone app: `Relay URL must use HTTPS` or `cannot target private network addresses` | The relay's address is a bare IP like `ws://10.0.0.1` (block/buzz#4198). Use a name with HTTPS: a domain, or the Tailscale name. |
| Compose warns a volume `was not created by Docker Compose` | The restore skipped `docker compose create`. Harmless; the data is fine. |
| `pg_restore: cannot drop inherited constraint` | Restoring over a live database. Restore into an empty one (operations.md). |
| Private: other devices time out, `tailscale ping` works | The tailnet's access policy blocks them (compose.md step 11P). |
| Private: the relay vanishes from the tailnet months later | Its Tailscale key expired. Re-authenticate the machine, then disable key expiry for it (compose.md step 2P). |
| Kubernetes: MinIO in `ImagePullBackOff` | The values file lacks the two MinIO image lines (kubernetes.md step 3). |
| Kubernetes or Compose: `here-document … delimited by end-of-file` | A heredoc was indented. Run it unindented. |
| Kubernetes: relay crash-loops with `pool timed out` at first install | Postgres is still starting; it settles within a minute or two. |
| Docker warns `The requested image's platform (linux/amd64) does not match` | Apple Silicon running the amd64 MinIO image through emulation. Harmless. |
| Local: `port is already allocated` on 3000 | Another program uses port 3000. Stop it, or change `BUZZ_HTTP_PORT`, `RELAY_URL`, `BUZZ_MEDIA_BASE_URL` and `BUZZ_CORS_ORIGINS` together. |
| Postgres refuses the relay's password after an earlier try | Leftover `buzz-prod` volumes keep the old password. Ask, then `docker volume rm` them and start again. |
| Relay logs `transport drop` warnings at start | The git storage self-test. Harmless when it ends with `conformance probe passed`. |
| Railway: `Too many services in project` | The account's live projects already hold as many services as its plan allows, even when deploying into a new project. Deleting a project makes room at once; that, or changing plans, is the user's call. |
| Railway: `Service "block/buzz:main" not found` right after deploying | The services appear 10 to 20 seconds after `railway deploy` returns. Wait and retry. |
| `railway ssh`: `No registered SSH keys found` | `railway ssh keys add` (ask first: it changes the account). It takes only a key in `~/.ssh`. |
| `railway ssh`: `Host key verification failed` | The first connection must confirm Railway's host key, which a shell without a terminal can't. Have the user run `railway ssh -s "block/buzz:main" true` once in their own terminal. |
| `railway redeploy`: `No deployment found for service` | After `railway down`, use `railway redeploy --from-source`. |
