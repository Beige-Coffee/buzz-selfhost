# Cold test: back up and upgrade

- **When:** 2026-10-01 13:40 PDT, 6 minutes
- **Relay version:** `sha-83aab8c, then sha-16839a0`
- **Commands run:** 11
- **Source:** Claude Code session `42fdf0a6-cce6-4e73-90f4-3f4b52b51822`, agent `a28daf1d52998160b`, exported 2026-10-05

## The agent's report

I backed up the relay and upgraded it from `sha-83aab8c` to `sha-16839a0`. Every check the skill gives passed, and nothing came up that the standing answers didn't cover, so I never had to stop and ask. No secret was printed. I read SKILL.md, `references/operations.md`, `references/compose.md` (operations.md sends you to its steps 5, 9 and 10) and the two scripts I ran. I didn't need `troubleshooting.md` because no check failed.

## 1. Steps and checks

| # | Step | Check and output | Result |
|---|---|---|---|
| 0 | Baseline (my addition, read-only) | check-relay.sh 5×PASS, version 0.2.1; image `sha-83aab8c`; HEAD `83aab8c`; no existing `~/buzz-backup`; bare `docker compose ps` lists the `buzz-prod-*` containers | PASS |
| 1 | `pick-tag.py`, run locally | `sha-16839a0` | PASS |
| 2 | Backup: stop relay, `pg_dump`, tar the MinIO and git volumes, copy `.env`, start relay | every exit=0; stopped 20:42:56Z, started 20:43:07Z | PASS |
| 3 | `curl -fsS $ORIGIN/_liveness`, polled every 5 s | 502, 502, then `ok` at 20:43:17Z (about 21 s down) | PASS |
| 4 | `ls -la ~/buzz-backup` | `env` 3974, `git-data.tgz` 120, `minio-data.tgz` 8915, `postgres.dump` 304809 bytes; folder mode 700 | PASS |
| 5 | `tar tzf … \| grep -c buzz-media` | `23` | PASS |
| 5x | `pg_restore -l` on the dump (my addition) | 646 entries | PASS |
| 6 | `git checkout compose.yml`; fetch; `git checkout -q 16839a0` | `Updated 1 path from the index`, exit=0 | PASS |
| 6x | Ancestry check and `git diff --stat 83aab8c HEAD -- .` (my additions) | `yes`; empty diff, so the bundle didn't change | PASS |
| 7 | Redo compose step 9: the grep found quay.io lines 88 and 106, so I swapped them | `grep -c 'image:.*buzz-minio'` → `2` | PASS |
| 8 | New settings (`comm -13 …`) | empty, none added | PASS |
| 9 | Change `BUZZ_IMAGE` with sed, then `BUZZ_COMPOSE_TLS=true ./run.sh upgrade` | only the relay was recreated, all healthy, exit=0, 20:44:08 to 20:44:31Z | PASS |
| 10 | `git rev-parse HEAD \| cut -c1-7` | `16839a0` | PASS |
| 11 | `BUZZ_COMPOSE_TLS=true ./run.sh status` | relay on `ghcr.io/block/buzz:sha-16839a0`, Up 11 s (healthy); minio, postgres and redis healthy; caddy Up | PASS |
| 12 | `check-relay.sh $ORIGIN 143.198.235.11` | 5×PASS (output in section 3) | PASS |
| 12x | `./run.sh list-members` and the relay log (my additions) | owner still present; log says `Database migrations complete` | PASS |

## 2. Where the skill was unclear, wrong, or made me improvise

Most important first:

1. **Nothing shows from outside that the upgrade happened.** NIP-11 reported `0.2.1` before and after, and check-relay's version line passes either way. Only the IMAGE column of `run.sh status` shows the new tag, and step 10's check only asks for "Up (healthy)". Fix: have the check confirm the relay runs `ghcr.io/block/buzz:$TAG`, and say the version number often doesn't change between commits.
2. **"Redo compose.md step 9 after it" is ambiguous.** "It" could mean after the first git line or after both.
   - If the swap goes between the two lines and `compose.yml` changed upstream, `git checkout <sha>` refuses to run because of the local edit.
   - I did it after both lines.
   - "While block/buzz#7880 is open" suggests checking GitHub, but step 9's own grep already decides, so I relied on that.
3. **The liveness check after the backup is a single command, and Rule 3 says stop at the first failure.** For about 10 s after the relay starts, Caddy returns 502. "About 20 seconds after the start" gives no wait or poll, so I polled. Fix: poll, or reuse check-relay.sh, which already retries. Also say whether to run it from the server or the agent's machine; I used the agent's machine.
4. **`< /dev/null` is inconsistent.** SKILL.md says every `docker` and `./run.sh` command in a piped script needs it. operations.md adds it only to `docker compose exec`, and leaves it off `stop`, `docker run`, `start` and `./run.sh upgrade`. I followed SKILL.md and added it everywhere.
5. **The upgrade's outage and the fact that it can't be undone aren't mentioned before the command.** The backup asks about its outage, but the upgrade also takes the relay down (about 10 s, judging by the log timestamps). "Going back means restoring the backup" appears only after the command, in the check text.
6. **No step reads the current version, and nothing guards against a downgrade.** The skill doesn't say how to find the running tag, or what to do if `pick-tag.py` prints the same tag or an older one. That matters because the database gets migrated on start. Also, the tested image here was the running one, so "stay on a tested version" really means "don't upgrade". I read `BUZZ_IMAGE` and HEAD, and added `git merge-base --is-ancestor`.
7. **Step 10's expected status doesn't fit an upgrade.** It says Caddy's uptime is shorter than the others'. After an upgrade, only the relay is recreated, so the relay has the shortest uptime and Caddy showed 23 minutes.
8. **Plain `docker compose` in the backup isn't explained.** The section opens with the `BUZZ_COMPOSE_TLS` rule, then the backup uses `docker compose` with no flag. I checked it resolves to the `buzz-prod` project before stopping anything. `docker compose ps` isn't on Rule 1's safe list, so I limited its output to names and status. Also not mentioned: `start relay` re-runs the `minio-init` container, which is harmless.
9. **The backup leaves out things the bundle says to keep.** `run.sh upgrade` printed a reminder that also lists Caddy's data and config volumes, plus "the owner private key if bootstrap generated one". The skill doesn't say why it omits them, and the reminder only appears after the upgrade, too late to act on.
10. **The backup and upgrade checks are weak.** "Four non-empty files" doesn't prove the dump can be restored; `pg_restore -l` would. Nothing checks that the community survived the migration; `list-members` would.
11. **Where `TAG` comes from.** operations.md writes `TAG=$(python3 $SKILL/scripts/pick-tag.py)` next to commands that run on the server, but `$SKILL` exists only on the agent's machine. I ran it locally and hard-coded the tag at the top of each server script.
12. **Spotted while reading, not hit:**
    - Step 5's loop ends with `rm .env.bak`, which errors when there's nothing to replace.
    - "Copy those lines from .env.example" doesn't say whether new values need site-specific edits.
    - The backup pulls an unpinned `alpine:latest` image that gets read access to the volumes and write access to the backup folder.
    - There's no free-disk check before the backup and image pull (73 GB was free here).

## 3. Final state

| | Before | After |
|---|---|---|
| Image tag | `sha-83aab8c` | `sha-16839a0` |
| `git rev-parse HEAD \| cut -c1-7` in /root/buzz | `83aab8c` | `16839a0` |
| NIP-11 version | `0.2.1` | `0.2.1` |

- **Backup:** `/root/buzz-backup` on the server, unencrypted, with no off-machine copy, as instructed. It holds the relay key and every other secret.
- **`compose.yml`:** carries the expected local MinIO edit.
- **Old image:** `sha-83aab8c` is still on disk, which helps if you need to roll back.

check-relay.sh after the upgrade (exit 0):
```
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  WebSocket upgrade (what Buzz Desktop joins over)
PASS  Buzz Desktop allowed (CORS)
PASS  port 3000 on 143.198.235.11 closed from outside
```

## 4. Time

I started reading SKILL.md at 20:40:54Z, and the last check passed at 20:44:51Z: about 4 minutes. The relay was down for about 21 s during the backup and about 10 s during the upgrade.

<details><summary>The task it was given</summary>

```text
You are testing an agent skill cold. Act as an AI agent whose only knowledge of Buzz comes from this skill folder:

/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/

Start by reading its SKILL.md, then only the files it points you to. Do not read anything else for instructions: not ~/code/buzz-selfhost (the repo the skill comes from), not other folders in the scratchpad, not other servers. $SKILL is that folder.

## The user's request

"Back up the relay, then upgrade it to the newest image."

## The setup (what the user would tell you if you asked)

- A Buzz relay installed with this skill in `server` mode (public, HTTPS through Caddy), on an Ubuntu 24.04 VPS.
- SSH: `ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11`. Use exactly these options on every ssh call.
- The bundle is at `/root/buzz/deploy/compose`. Domain `143-198-235-11.sslip.io`, so `RELAY_URL=wss://143-198-235-11.sslip.io` and `ORIGIN=https://143-198-235-11.sslip.io`. Public IP 143.198.235.11.

## Standing answers to questions the skill tells you to ask

- The backup's downtime (about half a minute): yes.
- How to encrypt the backup and where the off-machine copy goes: for this test, leave it unencrypted in `~/buzz-backup` on the server, with no off-machine copy. It's a test relay with no real data.
- Upgrading to the newest tag `pick-tag.py` prints: yes.
- Anything else the skill says to ask about: don't guess. Stop at that point and put the question in your report.

## Rules

- Follow the skill's rules, especially: never print a secret, and run every check the skill gives and show its output.
- Don't tear anything down. Don't change anything the request and the skill don't call for.
- Time yourself: note when you start reading SKILL.md and when the last check passes.

## Your report

1. A table of the steps you ran with each check's output and PASS/FAIL.
2. Every place the skill was unclear, wrong, or made you improvise or guess, with what you did instead. Be specific and critical: this report is how the skill gets fixed.
3. Final state: the tag before and after, `git rev-parse HEAD | cut -c1-7` in /root/buzz, the relay version from the NIP-11 document before and after, and the full output of check-relay.sh.
4. Time taken.
```

</details>

<details><summary>Everything it did, in order</summary>

I'll start by noting the time and reading the skill's SKILL.md.

**Record start time and list the skill folder**

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"; ls -la /private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/
```
```
2026-10-01T20:40:54Z
total 16
drwxr-xr-x@ 5 user  wheel   160 Oct  1 13:29 .
drwxr-xr-x@ 3 user  wheel    96 Oct  1 13:35 ..
-rw-r--r--@ 1 user  wheel  6881 Oct  1 13:29 SKILL.md
drwxr-xr-x@ 7 user  wheel   224 Oct  1 13:34 references
drwxr-xr-x@ 5 user  wheel   160 Oct  1 13:31 scripts
```

**Read**

```bash
{
 "file_path": "/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/SKILL.md"
}
```
````
1	---
2	name: self-host-buzz
3	description: >
4	  Set up and operate a self-hosted Buzz relay (github.com/block/buzz): the Docker Compose bundle
5	  on a VPS or your own hardware, a local test on this machine, a relay reachable only over a
6	  Tailscale network, Block's Railway template, or Block's Helm chart on Kubernetes. Covers keys,
7	  the permanent URL, HTTPS, members, backups, restore and upgrades. Use when someone wants to
8	  self-host Buzz or run a Buzz relay, or to add members to, back up, restore or upgrade one.
9	license: Apache-2.0
10	compatibility: Needs python3 and curl. Then Docker, kubectl and helm, or the Railway CLI, depending on the setup.
11	metadata:
12	  tested: "2026-10-01"
13	  tested-image: sha-83aab8c
14	---
15	
[... 86 lines ...]
102	bash $SKILL/scripts/check-relay.sh "$ORIGIN"                          # local, Railway, Kubernetes
103	bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP>              # public server: 3000 closed
104	bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP> 80 443 3000  # private: nothing public
105	```
106	
107	Every line must say `PASS`: the relay answers, reports its version, takes WebSocket connections
108	(what Buzz Desktop joins over), and lets Buzz Desktop in (CORS). A new certificate can take a
109	minute or two on the first request; the script waits.
110	
111	## 4. Join
112	
113	Tell the user to choose *Join a community* in Buzz Desktop and paste `$RELAY_URL` exactly, with
114	the owner's identity. Members send the owner their public ID from the same screen, and the owner
115	adds them ([operations.md](references/operations.md)). Self-hosted relays have no invite links yet.
116	
````

SKILL.md points me to operations.md for backups and upgrades on a running relay. Reading that next.

**Read**

```bash
{
 "file_path": "/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/references/operations.md"
}
```
````
1	# Operations: members, backups, restore, upgrades
2	
3	## Docker Compose
4	
5	Run from `buzz/deploy/compose`. In `private` and `local` modes, drop `BUZZ_COMPOSE_TLS=true`.
6	
7	- **Add a member.** Members copy their public ID from Buzz Desktop's Join screen. Check it with
8	  `python3 $SKILL/scripts/npub-to-hex.py <npub>`, then
9	  `./run.sh add-member <npub-or-hex> --role member`, one at a time with `sleep 1` between adds
10	  (adds in the same second collide). `./run.sh list-members` confirms; it prints hex.
11	- **Agents.** Each agent gets its own key, added as a member of every channel it answers in. A
12	  reply that mentions a non-member is refused, and a key without relay membership gets
13	  `relay error 403: relay_membership_required`.
14	- **Back up** what can't be rebuilt: Postgres, the MinIO and git volumes, and `.env`, together,
15	  with the relay stopped (ask first: members lose the connection for about half a minute). Redis
[... 88 lines ...]
104	  `kubectl -n buzz exec deploy/buzz -c relay -- /usr/local/bin/buzz-admin add-member --pubkey <npub-or-hex> --role member`,
105	  and `… buzz-admin list-members`.
106	- **Back up** the quickstart's four stores (ask first; the relay keeps running), into a folder
107	  only the user can read:
108	  ```bash
109	  kubectl -n buzz exec buzz-postgresql-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U buzz -Fc buzz' > buzz.dump
110	  kubectl -n buzz exec deploy/buzz-minio -- tar czf - -C /data . > minio-data.tgz
111	  kubectl -n buzz exec deploy/buzz -c relay -- tar czf - -C /var/lib/buzz/git . > git-data.tgz
112	  kubectl -n buzz get secret buzz-relay -o yaml > buzz-relay-secret.yaml
113	  ```
114	  Check: four non-empty files, and `tar tzf minio-data.tgz | grep -c buzz-media` above 0. The
115	  Secret file holds the relay key: encrypt the copies. Restoring on Kubernetes is not yet tested.
116	- **Upgrade.** Change `image.tag` in `buzz-values.yaml`, then
117	  `helm upgrade buzz oci://ghcr.io/block/buzz/charts/buzz --version 0.1.10 -n buzz -f buzz-values.yaml --wait`.
118	
````

**List the skill's references and scripts folders**

```bash
ls -la /private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/references/ /private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/scripts/
```
```
/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/references/:
total 72
drwxr-xr-x@ 7 user  wheel    224 Oct  1 13:34 .
drwxr-xr-x@ 5 user  wheel    160 Oct  1 13:29 ..
-rw-r--r--@ 1 user  wheel  11398 Oct  1 13:34 compose.md
-rw-r--r--@ 1 user  wheel   5235 Oct  1 13:34 kubernetes.md
-rw-r--r--@ 1 user  wheel   6793 Oct  1 13:34 operations.md
-rw-r--r--@ 1 user  wheel   2994 Oct  1 13:34 railway.md
-rw-r--r--@ 1 user  wheel   3972 Oct  1 13:34 troubleshooting.md

/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/scripts/:
total 24
drwxr-xr-x@ 5 user  wheel   160 Oct  1 13:31 .
drwxr-xr-x@ 5 user  wheel   160 Oct  1 13:29 ..
-rwxr-xr-x@ 1 user  wheel  2978 Oct  1 13:11 check-relay.sh
-rwxr-xr-x@ 1 user  wheel  1440 Oct  1 12:41 npub-to-hex.py
-rwxr-xr-x@ 1 user  wheel  1783 Oct  1 13:29 pick-tag.py
```

The upgrade section points at compose.md steps 5, 9 and 10, so I need compose.md too.

**Read**

```bash
{
 "file_path": "/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/references/compose.md"
}
```
```
1	# Docker Compose: a VPS, your own hardware, or a local test
2	
3	The official bundle in `deploy/compose` of block/buzz: the relay, Postgres, Redis and MinIO,
4	with Caddy in front for HTTPS in `server` mode. Three modes:
5	
6	- `server`: reachable by anyone with the URL, over HTTPS. Members still need to be added.
7	- `private`: reachable only over the user's Tailscale network; no public ports. Steps marked
8	  **P** replace or add to the server steps.
9	- `local`: this machine only, at `ws://127.0.0.1:3000`, for trying Buzz out.
10	
11	Commands run from `buzz/deploy/compose` after step 4. In `server` mode every `run.sh` call that
12	starts, stops or inspects services carries `BUZZ_COMPOSE_TLS=true` (it adds Caddy). **In `private`
13	and `local` modes, drop `BUZZ_COMPOSE_TLS=true`** everywhere, including operations: there's no
14	Caddy, and the flag would start it on the public ports. `add-member` and `list-members` work
15	either way.
[... 141 lines ...]
157	    team; not yet tested). That's the user's policy to change: ask. Members install Tailscale and
158	    join the tailnet before they join the community. Known gaps: the phone app can't connect to a
159	    private relay (block/buzz#4198), and webhooks to tailnet addresses are refused
160	    (block/buzz#6500).
161	12. **Join**, as SKILL.md section 4 says.
162	
163	**Optional hardening (`server`; ask first: a wrong SSH rule locks the user out).** Docker
164	publishes 80 and 443 around `ufw`, so a host firewall mainly guards SSH and anything else on the
165	machine: `sudo ufw allow from <admin IP> to any port 22 proto tcp`, then `sudo ufw enable`.
166	
167	**Your own hardware, public.** The same steps, plus forwarding ports 80 and 443 on the router to
168	the machine, and an A record at the home IP. Many home internet providers block incoming
169	connections (CGNAT); if Let's Encrypt can't reach port 80, ask the provider, or use a VPS or the
170	`private` mode instead. Router forwarding isn't covered by the tests.
171	
```

I have the procedure. Before running anything, I'll read the two scripts the skill tells me to execute (both are pointed to by SKILL.md), so I know what they do.

**Read the pick-tag and check-relay scripts**

```bash
cat /private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/scripts/pick-tag.py; echo "=================="; cat /private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz/scripts/check-relay.sh
```
```
#!/usr/bin/env python3
"""Print the newest relay image tag: the newest commit on block/buzz main that has an image.

Usage: python3 pick-tag.py

Not every commit on main gets an image (commits that only touch the desktop app don't), so this
walks the last 30 commits and asks ghcr.io which one has `ghcr.io/block/buzz:sha-<7>`.
Needs only python3 and internet access. Prints a tag like `sha-1a2b3c4`.
"""
import json
import sys
import urllib.error
import urllib.request

ACCEPT = ",".join([
[... 82 lines ...]

if [ -n "$IP" ]; then
  for port in $PORTS; do
    # a plain TCP connect: any listener counts as open, whatever it would answer
    state=$(python3 -c 'import socket,sys
s = socket.socket(); s.settimeout(5)
try:
    s.connect((sys.argv[1], int(sys.argv[2]))); print("open")
except OSError:
    print("closed")' "$IP" "$port")
    [ "$state" = closed ] && pass "port $port on $IP closed from outside" ||
      fail "port $port on $IP is open from outside: it should be closed"
  done
fi
exit $failed
```

**Pick newest tag and run baseline relay checks**

```bash
SKILL=/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz
echo "--- pick-tag.py ($(date -u +%H:%M:%SZ))"; python3 $SKILL/scripts/pick-tag.py; echo "exit=$?"
echo "--- check-relay.sh BEFORE ($(date -u +%H:%M:%SZ))"; bash $SKILL/scripts/check-relay.sh "https://143-198-235-11.sslip.io" 143.198.235.11; echo "exit=$?"
echo "--- NIP-11 BEFORE"; curl -fsS -m 10 -H 'Accept: application/nostr+json' https://143-198-235-11.sslip.io/ | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k: d.get(k) for k in ("name","software","version")})'
```
```
--- pick-tag.py (20:42:00Z)
sha-16839a0
exit=0
--- check-relay.sh BEFORE (20:42:01Z)
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  WebSocket upgrade (what Buzz Desktop joins over)
PASS  Buzz Desktop allowed (CORS)
PASS  port 3000 on 143.198.235.11 closed from outside
exit=0
--- NIP-11 BEFORE
{'name': 'Buzz Relay', 'software': 'https://github.com/block/buzz', 'version': '0.2.1'}
```

**Read-only baseline of the server's relay state**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
cd /root/buzz/deploy/compose || exit 1
echo "--- BUZZ_IMAGE in .env"; grep '^BUZZ_IMAGE=' .env
echo "--- git HEAD"; git rev-parse HEAD | cut -c1-7
echo "--- git status --short (tracked changes)"; git status --short --untracked-files=no
echo "--- run.sh status"; BUZZ_COMPOSE_TLS=true ./run.sh status < /dev/null
echo "--- bare docker compose ps (does it resolve to buzz-prod?)"; docker compose ps --format '{{.Name}}\t{{.Status}}' < /dev/null
echo "--- volumes"; docker volume ls -q < /dev/null | grep buzz-prod
echo "--- existing ~/buzz-backup?"; ls -la ~/buzz-backup 2>&1
echo "--- disk"; df -h / | tail -1
EOF
```
```
--- BUZZ_IMAGE in .env
BUZZ_IMAGE=ghcr.io/block/buzz:sha-83aab8c
--- git HEAD
83aab8c
--- git status --short (tracked changes)
 M compose.yml
--- run.sh status
NAME                   IMAGE                             COMMAND                  SERVICE    CREATED          STATUS                    PORTS
buzz-prod-caddy-1      caddy:2-alpine                    "caddy run --config …"   caddy      21 minutes ago   Up 21 minutes             0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
buzz-prod-minio-1      ghcr.io/block/buzz-minio:latest   "minio server /data …"   minio      21 minutes ago   Up 21 minutes (healthy)   
buzz-prod-postgres-1   postgres:17-alpine                "docker-entrypoint.s…"   postgres   21 minutes ago   Up 21 minutes (healthy)   5432/tcp
buzz-prod-redis-1      redis:7-alpine                    "docker-entrypoint.s…"   redis      21 minutes ago   Up 21 minutes (healthy)   6379/tcp
buzz-prod-relay-1      ghcr.io/block/buzz:sha-83aab8c    "/usr/local/bin/buzz…"   relay      21 minutes ago   Up 21 minutes (healthy)   3000/tcp, 8080/tcp, 9102/tcp
--- bare docker compose ps (does it resolve to buzz-prod?)
buzz-prod-caddy-1	Up 21 minutes
buzz-prod-minio-1	Up 21 minutes (healthy)
buzz-prod-postgres-1	Up 21 minutes (healthy)
buzz-prod-redis-1	Up 21 minutes (healthy)
buzz-prod-relay-1	Up 21 minutes (healthy)
--- volumes
buzz-prod_buzz-caddy-config
buzz-prod_buzz-caddy-data
buzz-prod_buzz-git-data
buzz-prod_buzz-minio-data
buzz-prod_buzz-postgres-data
buzz-prod_buzz-redis-data
--- existing ~/buzz-backup?
ls: cannot access '/root/buzz-backup': No such file or directory
--- disk
/dev/vda1        77G  4.2G   73G   6% /
```

**Run the skill's backup on the server, then poll liveness**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
cd /root/buzz/deploy/compose || exit 1
mkdir -p ~/buzz-backup && chmod 700 ~/buzz-backup
date -u +"[%H:%M:%SZ] stopping relay"
docker compose stop relay < /dev/null; echo "stop exit=$?"
docker compose exec -T postgres pg_dump -U buzz -Fc buzz > ~/buzz-backup/postgres.dump < /dev/null; echo "pg_dump exit=$?"
for v in minio-data git-data; do
  docker run --rm -v buzz-prod_buzz-$v:/data:ro -v ~/buzz-backup:/backup alpine \
    tar czf /backup/$v.tgz -C /data . < /dev/null; echo "tar $v exit=$?"
done
cp .env ~/buzz-backup/env; echo "cp env exit=$?"
docker compose start relay < /dev/null; echo "start exit=$?"
date -u +"[%H:%M:%SZ] relay started"
EOF
echo "--- liveness poll from this machine"
for i in $(seq 1 24); do
  out=$(curl -fsS -m 5 https://143-198-235-11.sslip.io/_liveness 2>&1) && { echo "[$(date -u +%H:%M:%SZ)] try $i: $out"; break; }
  echo "[$(date -u +%H:%M:%SZ)] try $i: not yet ($out)"; sleep 5
done
```
```
[20:42:56Z] stopping relay
 Container buzz-prod-relay-1 Stopping 
 Container buzz-prod-relay-1 Stopped 
stop exit=0
pg_dump exit=0
Unable to find image 'alpine:latest' locally
latest: Pulling from library/alpine
6d0606d1815c: Download complete
797dd00a0fc7: Download complete
Digest: sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
Status: Downloaded newer image for alpine:latest
tar minio-data exit=0
tar git-data exit=0
cp env exit=0
 Container buzz-prod-minio-1 Waiting 
[... 4 lines ...]
 Container buzz-prod-minio-init-1 Waiting 
 Container buzz-prod-postgres-1 Waiting 
 Container buzz-prod-redis-1 Waiting 
 Container buzz-prod-postgres-1 Healthy 
 Container buzz-prod-minio-1 Healthy 
 Container buzz-prod-redis-1 Healthy 
 Container buzz-prod-minio-init-1 Exited 
 Container buzz-prod-relay-1 Starting 
 Container buzz-prod-relay-1 Started 
start exit=0
[20:43:07Z] relay started
--- liveness poll from this machine
[20:43:07Z] try 1: not yet (curl: (56) The requested URL returned error: 502)
[20:43:12Z] try 2: not yet (curl: (56) The requested URL returned error: 502)
[20:43:17Z] try 3: ok
```

**Run the skill's backup file checks on the server**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
echo "--- ls -la ~/buzz-backup"; ls -la ~/buzz-backup
echo "--- tar tzf minio-data.tgz | grep -c buzz-media"; tar tzf ~/buzz-backup/minio-data.tgz | grep -c buzz-media
EOF
```
```
--- ls -la ~/buzz-backup
total 328
drwx------ 2 root root   4096 Oct  1 20:43 .
drwx------ 6 root root   4096 Oct  1 20:42 ..
-rw------- 1 root root   3974 Oct  1 20:43 env
-rw-r--r-- 1 root root    120 Oct  1 20:43 git-data.tgz
-rw-r--r-- 1 root root   8915 Oct  1 20:43 minio-data.tgz
-rw-r--r-- 1 root root 304809 Oct  1 20:43 postgres.dump
--- tar tzf minio-data.tgz | grep -c buzz-media
23
```

**Upgrade phase A: move the bundle to the new commit and check it**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
TAG=sha-16839a0
cd /root/buzz/deploy/compose || exit 1
echo "--- [extra] pg_restore -l reads the dump (TOC entries)"; docker compose exec -T postgres pg_restore -l < ~/buzz-backup/postgres.dump | grep -vc '^;'
echo "--- git checkout compose.yml"; git checkout compose.yml; echo "exit=$?"
echo "--- fetch + checkout ${TAG#sha-}"; git fetch -q origin && git checkout -q ${TAG#sha-}; echo "exit=$?"
echo "--- [extra] old commit is ancestor of new?"; git merge-base --is-ancestor 83aab8c HEAD && echo yes || echo NO
echo "--- [extra] what changed in deploy/compose"; git diff --stat 83aab8c HEAD -- . ; echo "(end of diff stat)"
echo "--- step 9: grep -n 'image:.*quay.io/minio' compose.yml"
if grep -n 'image:.*quay.io/minio' compose.yml; then
  sed -i.bak \
    -e 's|image: quay.io/minio/minio:.*|image: ghcr.io/block/buzz-minio:latest|' \
    -e 's|image: quay.io/minio/mc:.*|image: ghcr.io/block/buzz-minio:latest|' \
    compose.yml && rm compose.yml.bak; echo "swap exit=$?"
else
  echo "(no quay.io/minio lines)"
fi
echo "--- step 9 check: grep -c 'image:.*buzz-minio' compose.yml"; grep -c 'image:.*buzz-minio' compose.yml
echo "--- new settings (comm -13)"; comm -13 <(grep -oE '^[A-Z][A-Z0-9_]*=' .env | sort) <(grep -oE '^[A-Z][A-Z0-9_]*=' .env.example | sort); echo "(end of new settings)"
echo "--- git status --short"; git status --short --untracked-files=no
EOF
```
```
--- [extra] pg_restore -l reads the dump (TOC entries)
646
--- git checkout compose.yml
Updated 1 path from the index
exit=0
--- fetch + checkout 16839a0
exit=0
--- [extra] old commit is ancestor of new?
yes
--- [extra] what changed in deploy/compose
(end of diff stat)
--- step 9: grep -n 'image:.*quay.io/minio' compose.yml
88:    image: quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
106:    image: quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727
swap exit=0
--- step 9 check: grep -c 'image:.*buzz-minio' compose.yml
2
--- new settings (comm -13)
(end of new settings)
--- git status --short
 M compose.yml
```

**Upgrade phase B: switch image, run upgrade, check status**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
TAG=sha-16839a0
cd /root/buzz/deploy/compose || exit 1
sed -i.bak "s|^BUZZ_IMAGE=.*|BUZZ_IMAGE=ghcr.io/block/buzz:$TAG|" .env && rm .env.bak; echo "sed exit=$?"
echo "--- [extra] BUZZ_IMAGE now"; grep '^BUZZ_IMAGE=' .env
date -u +"[%H:%M:%SZ] run.sh upgrade"
BUZZ_COMPOSE_TLS=true ./run.sh upgrade < /dev/null; echo "upgrade exit=$?"
date -u +"[%H:%M:%SZ] upgrade returned"
for i in $(seq 1 24); do
  n=$(BUZZ_COMPOSE_TLS=true ./run.sh status < /dev/null | grep -c '(healthy)')
  [ "$n" -ge 4 ] && break
  sleep 5
done
date -u +"[%H:%M:%SZ] healthy count=$n"
echo "--- check: git rev-parse HEAD | cut -c1-7"; git rev-parse HEAD | cut -c1-7
echo "--- check: run.sh status"; BUZZ_COMPOSE_TLS=true ./run.sh status < /dev/null
EOF
```
```
sed exit=0
--- [extra] BUZZ_IMAGE now
BUZZ_IMAGE=ghcr.io/block/buzz:sha-16839a0
[20:44:08Z] run.sh upgrade
 Image postgres:17-alpine Pulling 
 Image caddy:2-alpine Pulling 
 Image ghcr.io/block/buzz:sha-16839a0 Pulling 
 Image ghcr.io/block/buzz-minio:latest Pulling 
 Image redis:7-alpine Pulling 
 Image ghcr.io/block/buzz-minio:latest Pulled 
 Image caddy:2-alpine Pulled 
 44136fa355b3 Already exists 0B
 Image redis:7-alpine Pulled 
 35bb57ea3772 Pulling fs layer 0B
 b2b6af952504 Pulling fs layer 0B
[... 73 lines ...]
- Caddy data/config volumes if using compose.caddy.yml

Keep Postgres + object/git state snapshots from the same maintenance window.
upgrade exit=0
[20:44:31Z] upgrade returned
[20:44:32Z] healthy count=4
--- check: git rev-parse HEAD | cut -c1-7
16839a0
--- check: run.sh status
NAME                   IMAGE                             COMMAND                  SERVICE    CREATED          STATUS                    PORTS
buzz-prod-caddy-1      caddy:2-alpine                    "caddy run --config …"   caddy      24 minutes ago   Up 23 minutes             0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
buzz-prod-minio-1      ghcr.io/block/buzz-minio:latest   "minio server /data …"   minio      24 minutes ago   Up 24 minutes (healthy)   
buzz-prod-postgres-1   postgres:17-alpine                "docker-entrypoint.s…"   postgres   24 minutes ago   Up 24 minutes (healthy)   5432/tcp
buzz-prod-redis-1      redis:7-alpine                    "docker-entrypoint.s…"   redis      24 minutes ago   Up 24 minutes (healthy)   6379/tcp
buzz-prod-relay-1      ghcr.io/block/buzz:sha-16839a0    "/usr/local/bin/buzz…"   relay      19 seconds ago   Up 11 seconds (healthy)   3000/tcp, 8080/tcp, 9102/tcp
```

**Run check-relay.sh and read NIP-11 after the upgrade**

```bash
SKILL=/private/tmp/claude-503/-Users-user-code/42fdf0a6-cce6-4e73-90f4-3f4b52b51822/scratchpad/agent-skills3/self-host-buzz
ORIGIN=https://143-198-235-11.sslip.io
echo "--- check-relay.sh AFTER ($(date -u +%H:%M:%SZ))"; bash $SKILL/scripts/check-relay.sh "$ORIGIN" 143.198.235.11; echo "exit=$?"
echo "--- NIP-11 AFTER"; curl -fsS -m 10 -H 'Accept: application/nostr+json' "$ORIGIN/" | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k: d.get(k) for k in ("name","software","version")})'
date -u +"last check done at %Y-%m-%dT%H:%M:%SZ"
```
```
--- check-relay.sh AFTER (20:44:45Z)
PASS  liveness: ok
PASS  relay version 0.2.1
PASS  WebSocket upgrade (what Buzz Desktop joins over)
PASS  Buzz Desktop allowed (CORS)
PASS  port 3000 on 143.198.235.11 closed from outside
exit=0
--- NIP-11 AFTER
{'name': 'Buzz Relay', 'software': 'https://github.com/block/buzz', 'version': '0.2.1'}
last check done at 2026-10-01T20:44:51Z
```

**Read-only check that members and migrations look intact**

```bash
ssh -i ~/.buzz-test/id_ed25519 -o UserKnownHostsFile=~/.buzz-test/known_hosts -o BatchMode=yes root@143.198.235.11 'bash -s' <<'EOF'
cd /root/buzz/deploy/compose || exit 1
echo "--- [extra] run.sh list-members"; ./run.sh list-members < /dev/null
echo "--- [extra] relay log lines mentioning migrations since the upgrade"; docker compose logs relay --since 5m --no-log-prefix < /dev/null 2>&1 | grep -i -E 'migrat|version|listening' | tail -n 8
EOF
```
```
--- [extra] run.sh list-members
pubkey                                                             role     added_by                                                           created_at
----------------------------------------------------------------------------------------------------------------------------------------------------------------
7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e   owner    -                                                                  2026-10-01T20:20:27Z
--- [extra] relay log lines mentioning migrations since the upgrade
{"event_name":"buzz_process_lifecycle","schema_version":1,"process_boot_id":"04632eac-509a-4ff7-8c36-fd713d20d587","sequence":10,"track":"startup","phase":"metrics_bind","edge":"started","process_started_at_unix_ms":1790887460864,"observed_at_unix_ms":1790887460869,"process_elapsed_ms":5}
{"event_name":"buzz_process_lifecycle","schema_version":1,"process_boot_id":"04632eac-509a-4ff7-8c36-fd713d20d587","sequence":11,"track":"startup","phase":"metrics_bind","edge":"terminal","status":"succeeded","process_started_at_unix_ms":1790887460864,"observed_at_unix_ms":1790887460870,"process_elapsed_ms":6,"phase_elapsed_ms":1}
{"event_name":"buzz_process_lifecycle","schema_version":1,"process_boot_id":"04632eac-509a-4ff7-8c36-fd713d20d587","sequence":12,"track":"startup","phase":"process_telemetry","edge":"terminal","status":"succeeded","process_started_at_unix_ms":1790887460864,"observed_at_unix_ms":1790887460871,"process_elapsed_ms":7,"phase_elapsed_ms":7}
{"timestamp":"2026-10-01T20:44:20.961522Z","level":"INFO","message":"Database migrations complete","target":"buzz_relay"}
{"timestamp":"2026-10-01T20:44:21.170158Z","level":"INFO","message":"Redis cache-invalidation subscriber connected — listening on buzz:*:cache-invalidate","target":"buzz_pubsub::cache_invalidation"}
{"timestamp":"2026-10-01T20:44:21.170581Z","level":"INFO","message":"Redis NIP-FI disconnect subscriber connected — listening on buzz:nip-fi:disconnect","target":"buzz_pubsub::conn_control"}
{"timestamp":"2026-10-01T20:44:21.170639Z","level":"INFO","message":"Redis conn-control subscriber connected — listening on buzz:*:conn-control","target":"buzz_pubsub::conn_control"}
{"timestamp":"2026-10-01T20:44:28.545339Z","level":"INFO","message":"buzz-relay TCP listening","addr":"0.0.0.0:3000","target":"buzz_relay"}
```

</details>
