---
name: self-host-buzz
description: >
  Set up and operate a self-hosted Buzz relay (github.com/block/buzz): the Docker Compose bundle
  on a VPS or your own hardware, a local test on this machine, a relay reachable only over a
  Tailscale network, Block's Railway template, or Block's Helm chart on Kubernetes. Covers keys,
  the permanent URL, HTTPS, members, backups, restore and upgrades. Use when someone wants to
  self-host Buzz or run a Buzz relay, or to add members to, back up, restore or upgrade one.
license: Apache-2.0
compatibility: Needs python3 and curl. Then Docker, kubectl and helm, or the Railway CLI, depending on the setup.
metadata:
  tested: "2026-10-01"
  tested-image: sha-d1b7da4
---

# Self-host a Buzz relay

A Buzz community lives on a relay: a Rust server, plus Postgres (messages, channels, members),
MinIO (uploaded files), a git folder (repositories), Redis (who's online) and an `.env` file (the
relay key and passwords). This skill installs one, checks every step, and runs day-two tasks.
Every command was run end to end, except where a step says otherwise.

## Rules

1. **Never print a secret.** Don't `cat`, `echo`, `grep` or paste `BUZZ_RELAY_PRIVATE_KEY`, any
   secret in `.env`, any Railway or Kubernetes value holding a key or password, a Tailscale auth
   key, or any secret key. These print every secret at once, so their output goes to a file or
   nowhere, never the screen: `./run.sh config`, `docker compose config`, `docker inspect`,
   `railway variables` (or `railway variable list`), `helm get manifest`, `helm get all`,
   `kubectl get secret -o yaml`. Generate keys straight into their file. When a check needs a
   secret, check its length, never its value. Safe to show as is (tested): every check in these
   files, `run.sh start`, `status` and `list-members`, `docker compose ps`, the services' logs,
   `kubectl describe`, `helm get values`, `helm install`'s notes, `railway deploy`, and
   `run.sh upgrade` (its reminder names secrets but never prints them). The user copies the relay
   key into their password manager themselves.
2. **Ask first** before anything that costs money, changes DNS, deletes volumes or data, changes a
   firewall, or changes the user's account settings. A public server serves ports 80 and 443 to
   the internet: confirm that when you confirm the setup.
3. **Check every step.** Run the step's check and show its output. A check passes when its output
   matches, whatever the exit status (`grep -c` exits 1 when it counts 0). At the first failing
   check, stop and look it up in [troubleshooting](references/troubleshooting.md).
4. **The URL is permanent.** The relay keys the community on the exact `RELAY_URL`; changing it
   later starts an empty community. Confirm the domain with the user before it's written. Names
   derived from an IP address (`203-0-113-10.sslip.io`, `nip.io`) die with that address: use them
   only for tests.

## 1. Pick the setup

Unless the user already said, ask: a local test or production; on their own hardware, a rented
VPS, Railway or an existing Kubernetes cluster; and reachable from the public internet or only
over a private network (Tailscale). Then read only the file for that setup:

| Setup | Read | Mode |
| --- | --- | --- |
| Local test on this machine | [compose.md](references/compose.md) | `local` |
| A VPS or own hardware, public | [compose.md](references/compose.md) | `server` |
| A VPS or own hardware, private network | [compose.md](references/compose.md) | `private` |
| Railway | [railway.md](references/railway.md) | |
| Kubernetes, the chart's quickstart profile, public or private network | [kubernetes.md](references/kubernetes.md) | |

Railway runs only public relays here; a private relay on it isn't tested, so offer a VPS or
Kubernetes on a private network instead. On Kubernetes, the tested install is the chart's
quickstart profile (Postgres, Redis and MinIO in the cluster, one replica); if the user asked for
production, say so and point to the chart's production profile, which isn't tested here. A local
test never migrates: a server gets a new URL, so a new community. For members, backups, restore
and upgrades on a running relay, read [operations.md](references/operations.md).

## 2. Inputs, for every setup

`$SKILL` below is this skill's folder (where this file is): run the scripts by that full path,
from wherever the agent runs. They need `python3`, `bash`, `curl` and internet access.

- **Owner.** Ask for the owner's public ID (npub) as Buzz Desktop shows it on its Join screen, on
  the device they'll use: an npub from anywhere else may be an old identity. If the user gives one
  without saying where it came from, ask before the step that writes it; the steps before it can
  run meanwhile. The owner can't be changed or removed later.
  `OWNER_HEX=$(python3 $SKILL/scripts/npub-to-hex.py <npub>)`. It checks the npub's checksum, so
  a mistyped or cut-off one fails instead of making a stranger the owner.
- **Image tag.** `TAG=$(python3 $SKILL/scripts/pick-tag.py)` prints the newest commit on main that
  has an image, like `sha-83aab8c`. Not every commit gets one. Tell the user which tag, and that
  this skill was last tested with the `tested-image` in its header, if they'd rather stay on a
  tested version.
- **Domain.** `server` and Kubernetes need the community's permanent domain, such as
  `buzz.example.org`. Railway assigns one at deploy, or takes the user's (railway.md). `private` uses the machine's Tailscale name, found in its setup, and
  Kubernetes on a private network the name kubernetes.md builds. `local` needs none.

Then:

| Mode | `HOST` | `RELAY_URL` | `ORIGIN` |
| --- | --- | --- | --- |
| `server`, Railway, Kubernetes | `$DOMAIN` | `wss://$DOMAIN` | `https://$DOMAIN` |
| `private` | the Tailscale name | `wss://<name>` | `https://<name>` |
| `local` | `127.0.0.1` | `ws://127.0.0.1:3000` | `http://127.0.0.1:3000` |

**One shell per command?** If each command runs in a fresh shell (one SSH call per command),
nothing carries over: `cd ~/buzz/deploy/compose` in every call once it exists, and set `SKILL`,
`TAG`, `DOMAIN`, `OWNER_HEX`, `HOST`, `RELAY_URL`, `ORIGIN` and, on Kubernetes, `KUBECONFIG`
(without it, `kubectl` falls back to another cluster) again in every call that uses them, with
the values this task started with (`pick-tag.py` can return a newer tag than the checkout
mid-task). Send a server step as `ssh <server> 'bash -s' <<'EOF' … EOF`, with the
variables set at the top: the quotes keep `$(…)` from running on the agent's machine instead. In
such a script, a command that reads input takes the rest of the script as its input, and the
script ends early: give `< /dev/null` to `apt-get`, `docker compose exec` and the `./run.sh`
commands built on it (`add-member`, `remove-member`, `list-members`), unless the line already
reads a file with `<`. Sending a Tailscale auth key (compose.md 2P) takes stdin for the key, so it
goes in an SSH call of its own.

## 3. Check it, for every setup

Once the setup's own steps pass, run from this machine:

```bash
bash $SKILL/scripts/check-relay.sh "$ORIGIN"                          # local, Railway
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP>              # public server: 3000 closed
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP> 80 443 3000  # private server: nothing public
```

`<public IP>` is the server's public address, the one you SSH to. On Kubernetes, use the address
and ports kubernetes.md gives. Every line must say `PASS`: the relay answers, reports its version, takes WebSocket connections
(what Buzz Desktop joins over), lets Buzz Desktop in (CORS), and phones can reach its pairing
service. A setup without one prints `SKIP` for that line. A new certificate can take a minute or
two on the first request; the script waits.

## 4. Join

Tell the user to choose *Join a community* in Buzz Desktop and paste `$RELAY_URL` exactly, with
the owner's identity. Members send the owner their public ID from the same screen, and the owner
adds them ([operations.md](references/operations.md)). Self-hosted relays have no invite links yet.
`Not a member yet` means the relay works but doesn't know that identity
([troubleshooting](references/troubleshooting.md)).

**Phones.** After joining from Desktop, the user opens Settings, Mobile, scans the QR code with
the Buzz app on their phone, and confirms the matching code. This needs the pairing service, which compose.md sets up
(`check-relay.sh` says `PASS` for phone pairing; on Railway and Kubernetes it isn't set up here
yet), and on a private network the phone needs the Tailscale app on. A self-hosted relay can't send push notifications to the App Store app
(block/buzz#5206): the app shows new messages while it's open.
