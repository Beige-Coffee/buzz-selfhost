---
name: self-host-buzz
description: >
  Set up and operate a self-hosted Buzz relay (github.com/block/buzz): the Docker Compose bundle
  on a VPS or your own hardware, a local test on this machine, a relay reachable only over a
  Tailscale network, Block's Railway template, or Block's Helm chart on Kubernetes. Covers keys,
  the permanent URL, HTTPS, members, backups, restore and upgrades. Use when someone wants to
  self-host Buzz or run a Buzz relay, or to add members to, back up, restore or upgrade one.
license: Apache-2.0
compatibility: Runs from macOS or Linux (Windows isn't tested) with python3, bash and curl. Then Docker, kubectl and helm, or the Railway CLI, depending on the setup.
metadata:
  tested: "2026-10-23"
  tested-image: sha-e8781ca
---

# Self-host a Buzz relay

A Buzz community lives on a relay: a Rust server, plus Postgres (messages, channels, members), an
S3 store for uploaded files (Silo or MinIO), a git folder (repositories), Redis (who's online) and
an `.env` file (the relay key and passwords). This skill installs one, checks every step, and runs
day-two tasks. Every command was run end to end, except where a step says otherwise.

People use the relay from the Buzz desktop app. These steps describe Buzz 1.0
(github.com/block/buzz-app). Buzz 0.X, the earlier app from block/buzz, still works with the same
relay and is the one for Intel Macs, which Buzz 1.0 doesn't support; where its screens differ, the
steps say so.

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
   the internet: confirm that when you confirm the setup. Use only the access the user gives you:
   if a server's address or login is missing or doesn't work, ask, rather than looking it up with
   cloud credentials found on the machine.
3. **Check every step.** Run the step's check and show its output. A check passes when its output
   matches, whatever the exit status (`grep -c` exits 1 when it counts 0). At the first failing
   check, stop and look it up in [troubleshooting](references/troubleshooting.md); if it isn't
   there, see [When something fails](#when-something-fails). Run the steps one at a time, in
   order, and each check only after its step has finished: a check run alongside its step fails
   for no reason. Some steps take minutes (Docker's install, the clone, the first start): if your
   command tool stops waiting first, the server keeps going, so wait for the step to end before
   its check.
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
from wherever the agent runs. They need `python3`, `bash`, `curl` and internet access, on macOS or
Linux (Windows isn't tested). On a Mac without Apple's developer tools, the first `python3` opens
an installer instead: ask the user to run `xcode-select --install` first.

- **Owner.** Ask for the owner's public ID (npub) as the Buzz app shows it, on the computer
  they'll use: an npub from anywhere else may be an old identity. In Buzz 1.0 it's in Settings,
  Identity, "Nostr address (npub)", with a copy button; before the app has joined a community,
  ⌘, (Ctrl+, on Windows and Linux) opens Settings. On first launch, "Continue with your Buzz
  identity" keeps the identity of Buzz 0.X on the same computer, and "Create a new identity" makes
  a new one. In Buzz 0.X the npub is on the Join screen. If the user gives one without saying where
  it came from, ask before the step that writes it; the steps before it can run meanwhile.
  Changing the owner later takes a restart, and the old owner stays on as an admin
  (operations.md).
  `OWNER_HEX=$(python3 $SKILL/scripts/npub-to-hex.py <npub>)`. It checks the npub's checksum, so
  a mistyped or cut-off one fails instead of making a stranger the owner.
- **Image tag.** `TAG=$(python3 $SKILL/scripts/pick-tag.py)` prints the newest commit on main that
  has an image, like `sha-83aab8c`. Not every commit gets one. Tell the user which tag, and that
  this skill was last tested with `sha-e8781ca` (`tested-image` in its metadata, which some agents
  don't show), if they'd rather stay on a tested version. Buzz 1.0's New chat needs an image from
  2026-10-15 or later, which has channel labels; older images, such as `sha-30873ba`, refuse it.
- **Domain.** `server` and Kubernetes need the community's permanent domain, such as
  `buzz.example.org`. Railway assigns one at deploy, or takes the user's (railway.md). `private` uses the machine's Tailscale name, found in its setup, and
  Kubernetes on a private network the name kubernetes.md builds. `local` needs none.

Then:

| Mode | `HOST` | `RELAY_URL` | `ORIGIN` |
| --- | --- | --- | --- |
| `server`, Railway, Kubernetes | `$DOMAIN` | `wss://$DOMAIN` | `https://$DOMAIN` |
| `private` | the Tailscale name | `wss://<name>` | `https://<name>` |
| `local` | `localhost` | `wss://localhost` | `https://localhost` |

**SSH to a server.** An agent's shell can't answer SSH's questions: the new server's fingerprint,
or a key's passphrase. Before the first server step, ask the user to connect once from their own
terminal (`ssh <user>@<server> true`), which saves the server's host key. A key with a passphrase
goes into their SSH agent first (`ssh-add <key file>`); an AWS key is the `.pem` file from the
console, and its user is `ubuntu`. For a server the user created minutes ago,
`-o StrictHostKeyChecking=accept-new` on the first call also works; ask first. Then put
`-o BatchMode=yes` on every ssh call, so a missing key fails at once instead of waiting for input.

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
bash $SKILL/scripts/check-relay.sh "$ORIGIN"                          # Railway
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP>              # public server: 3000 and 5000 closed
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP> 80 443 3000 5000  # private server: nothing public
CA_FILE=local-ca.crt bash $SKILL/scripts/check-relay.sh "$ORIGIN"     # local, from buzz/deploy/compose
```

`<public IP>` is the server's public address, the one you SSH to. On Kubernetes, use the address
and ports kubernetes.md gives. A local test's certificate comes from compose.md step 12. Every
line must say `PASS`: the relay answers, reports its version, names its own identity and has
channel labels (what Buzz 1.0 needs to join and to start chats), takes WebSocket connections
(what Buzz joins over), lets Buzz 0.X in (CORS), and phones can reach its pairing service. A setup
without one prints `SKIP` for that line. A new certificate can take a minute or two on the first
request; the script waits. If this computer still has the domain's old address cached, put
`RESOLVE_IP=<server IP>` before the command to check the server directly.

## 4. Join

Tell the user to open Buzz 1.0 with the owner's identity. On its first screen, Join a community,
they paste `$RELAY_URL` into "Invite link or community URL" and choose Join. The `https://` form of
the same address works too; `ws://` and `http://` addresses don't. To join another community later,
it's the community button at the top right, then Join a community, whose box takes an address but
not an invite link. In Buzz 0.X, paste the same address into its Join a community screen.

**People.** A member sends the owner their npub (Settings, Identity in Buzz 1.0), and the owner
adds them ([operations.md](references/operations.md)), or does it in Buzz 1.0: Settings, Community
admin, Membership, Invite members, then "Add directly" with the npub, or "Invite with a link" and
Copy link. Anyone with the link can join until it expires: they paste it into the first screen's
"Invite link or community URL", or open it and choose Accept invite in Buzz. In Buzz 0.X, the same
things are in Settings, Invites. `Relay request failed (403)` in Buzz 1.0, or `Not a member yet` in
Buzz 0.X, means the relay works but doesn't know that identity
([troubleshooting](references/troubleshooting.md)).

**Phones.** After joining from the desktop app, the user opens Settings, Pair mobile (Buzz 0.X:
Settings, Mobile). In the Buzz app on the phone they choose Add community, scan the QR code, and
enter the six-digit code the desktop shows (older phones show a code to compare instead). This
needs the pairing service, which every setup's steps add (`check-relay.sh` says `PASS` for phone
pairing) except Kubernetes on a private network, which isn't covered yet, and the local test. On a
private network the phone needs the Tailscale app on. A self-hosted relay can't send push
notifications to the App Store app (block/buzz#5206): the app shows new messages while it's open.

**Agents.** Buzz 1.0 runs agents on the user's computer, each with its own key that the owner's
identity vouches for. The relay admits them through the owner's membership, which every setup here
allows (`BUZZ_ALLOW_NIP_OA_AUTH=true`), so no agent needs adding as a member
([operations.md](references/operations.md)).

## When something fails

If a check fails and [troubleshooting](references/troubleshooting.md) has no fix, draft a GitHub
issue for Beige-Coffee/buzz-selfhost, so the skill gets fixed: the setup and mode, the cloud or
hardware, the agent and model, the image tag, the failing step, and the command with its check
output. Mask IP addresses, domains, npubs and keys first (`<ip>`, `<domain>`, `npub1<masked>`,
`<hex>`), and leave out every secret (rule 1). Show the draft to the user, and file it only with
their OK. If `gh auth status` shows them signed in to GitHub:

```bash
gh issue create --repo Beige-Coffee/buzz-selfhost --title "Setup problem: <step>" --body-file <draft file>
```

Otherwise give them the text and https://github.com/Beige-Coffee/buzz-selfhost/issues/new, where
the Setup problem form asks for the same things.
