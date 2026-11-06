---
name: self-host-buzz
description: >
  Set up and operate a self-hosted Buzz relay (github.com/block/buzz): the Docker Compose bundle
  on a VPS or your own hardware, a local test on this machine, a relay reachable only over a
  Tailscale network, or Block's Helm chart on Kubernetes. Covers keys, the permanent URL, HTTPS,
  members, backups, restore and upgrades. Use when someone wants to self-host Buzz or run a Buzz
  relay, or to add members to, back up, restore or upgrade one.
license: Apache-2.0
compatibility: Runs from macOS or Linux (Windows isn't tested) with python3, bash and curl. Then Docker, or kubectl and helm, depending on the setup.
metadata:
  tested: "2026-10-23"
  tested-image: sha-744f394
  tested-digest: sha256:b67a32b7b2a274cdbd9a685fe996657fa544a3e981284ab3a8c660a128f36a3d
---

# Self-host a Buzz relay

A Buzz community lives on a relay: a Rust server, plus Postgres (messages, channels, members), an
S3 store for uploaded files (Silo or MinIO), a git folder (repositories), Redis (who's online) and
an `.env` file (the relay key and passwords). This skill installs one, checks every step, and runs
day-two tasks. Every command was run end to end, except where a step says otherwise.

People use the relay from the Buzz desktop app. These steps describe Buzz 1.0
(github.com/block/buzz-app), whose own version numbers start at 0.7, such as 0.7.0-preview.248.1.
Buzz 0.X is the earlier app from block/buzz, versions 0.5 and older, which Block now calls
deprecated. It still works with the same relay; where its screens differ, the steps say so.

## Rules

1. **Never print a secret.** Don't `cat`, `echo`, `grep` or paste `BUZZ_RELAY_PRIVATE_KEY`, any
   secret in `.env`, any Kubernetes value holding a key or password, a Tailscale auth key, the key
   file `new-identity.py` writes, or any secret key. These print every secret at once, so their
   output goes to a file or nowhere, never the screen: `./run.sh config`, `docker compose config`,
   `docker inspect`, `helm get manifest`, `helm get all`, `kubectl get secret -o yaml`. Generate
   keys straight into their file. When a check needs a secret, check its length, never its value.
   Safe to show as is (tested): every check in these files, `run.sh start`, `status` and
   `list-members`, `docker compose ps`, the services' logs except the relay's access lines,
   `kubectl describe`, `helm get values`, `helm install`'s notes, and `run.sh upgrade` (its
   reminder names secrets but never prints them). The relay's log names who read what and from
   where, so show only the lines a check needs:
   `docker logs --tail 300 buzz-prod-relay-1 2>&1 | grep -v 'buzz_relay::access' | tail -40`, or on
   Kubernetes the same filter on `kubectl -n buzz logs deploy/buzz -c relay --tail 300`.
   The user copies the relay key into their password manager themselves, in a terminal window of
   its own: some agents' apps can read their own terminal panel.
2. **Ask first** before anything that costs money, changes DNS, deletes volumes or data, changes a
   firewall, changes the user's account settings, or stops or changes another program on the
   machine. A public server serves ports 80 and 443 to the internet: confirm that when you confirm
   the setup. Use only the access the user gives you:
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

Unless the user already said, ask the guide's four questions, in order, and skip what an answer
settles:

1. **What it's for:** trying Buzz themselves, or a community people will use. Trying it is a local
   test on this computer, and the other three don't apply.
2. **Who looks after it:** one of them, or nobody yet. Every setup here is a server someone keeps
   up, with a backup every week and an upgrade every month, through an agent. With nobody yet,
   tell them that before going further, and offer a local test meanwhile.
3. **Where it runs:** a server they rent (a VPS), a machine they own, or their Kubernetes cluster.
   Anything else isn't covered here; the closest is a VPS.
4. **Who can reach it:** anyone they invite, over the internet, or only their private network
   (Tailscale), where every member runs Tailscale, phones included. On Kubernetes, phones can't
   pair over a private network yet, so for phones there, suggest a private VPS.

Then read only the file for that setup:

| Setup | Read | Mode |
| --- | --- | --- |
| Local test on this machine | [compose.md](references/compose.md) | `local` |
| A VPS or own hardware, public | [compose.md](references/compose.md) | `server` |
| A VPS or own hardware, private network | [compose.md](references/compose.md) | `private` |
| Kubernetes, the chart's quickstart profile, public or private network | [kubernetes.md](references/kubernetes.md) | |

On Kubernetes, the tested install is the chart's quickstart profile (Postgres, Redis and MinIO in
the cluster, one replica); if the user asked for production, say so and point to the chart's
production profile, which isn't tested here. A local test never migrates: a server gets a new URL,
so a new community. For members, backups, restore and upgrades on a running relay, read
[operations.md](references/operations.md).

## 2. Inputs, for every setup

`$SKILL` below is this skill's folder (where this file is): run the scripts by that full path,
from wherever the agent runs. They need `python3`, `bash`, `curl` and internet access, on macOS or
Linux (Windows isn't tested). On a Mac without Apple's developer tools, the first `python3` opens
an installer instead: ask the user to run `xcode-select --install` first.

- **Owner.** The owner's public ID, an npub, in one of three ways. Buzz 1.0 itself makes a key only
  through a Builderlab account, which is Block's, so the first is this skill's own:
  - **A new key, on the owner's computer** (recommended where Buzz isn't set up yet: it holds one
    key per computer, and only Sign out of Buzz removes the one it has). There, never on the
    server, run `python3 $SKILL/scripts/new-identity.py`. It writes the private key to
    `~/buzz-identity.nsec`, a new file only they can read, and prints the npub, then the file's
    path. It never prints the private key and never overwrites a file (`--out <full path>` names
    another). If the agent doesn't run on the computer the owner will use Buzz on, the user runs
    the script there. Never read, print or copy the file: the user imports it into Buzz in
    section 4, and then deletes it.
  - **An identity they already use** in Buzz 1.0: Settings, Identity, "Nostr address (npub)", with
    a copy button, on the computer they'll use. An npub from anywhere else may be an old identity.
    In Buzz 0.X the npub is on the Join screen, and on that computer Buzz 1.0's Other options
    offers to continue with it.
  - **A Builderlab account**, which is Block's: Create account on Buzz 1.0's first screen. Buzz
    makes the key and links it to that account, and Block can keep a copy; creating the account
    asks for their details. When Buzz asks for a community, they quit it, open it again and choose
    Continue without signing in, then ⌘, (Ctrl+, on Windows and Linux), Identity,
    "Nostr address (npub)" (not tested).

  If the user gives an npub without saying where it came from, ask before the step that writes it;
  the steps before it can run meanwhile. Changing the owner later takes a restart, and the old
  owner stays on as an admin (operations.md).
  `OWNER_HEX=$(python3 $SKILL/scripts/npub-to-hex.py <npub>)`. It checks the npub's checksum, so
  a mistyped or cut-off one fails instead of making a stranger the owner.
- **Image.** Use the image this skill recommends, for installs and upgrades alike: `tested-image`
  and `tested-digest` in this file's metadata, which some agents don't show, so read both from the
  file. Block's relay releases are older than what Buzz 1.0 needs, so this skill pins one image
  from main, by its digest.
  ```bash
  TAG=$(awk '/^  tested-image:/ {print $2}' "$SKILL/SKILL.md")
  DIGEST=$(awk '/^  tested-digest:/ {print $2}' "$SKILL/SKILL.md")
  ```
  Check: `echo $TAG $DIGEST` prints a tag like `sha-1a2b3c4` and a `sha256:` digest. Tell the user
  which tag. Once the setup has pulled the image (compose.md step 6, kubernetes.md step 6 or P6),
  its digest must be `DIGEST`; if it isn't, stop: the tag no longer names the image this skill
  recommends. Only if the user asks for the newest image:
  `TAG=$(python3 $SKILL/scripts/pick-tag.py)` prints the newest commit on main that has one, and
  `DIGEST` stays unset. Tell them this skill hasn't run that image, and that the newest has broken
  upgrades before: images from 2026-10-30 to 2026-11-05 looped at start when they upgraded a relay
  with members (block/buzz#8802). Buzz 1.0's New chat needs an image from 2026-10-15 or later,
  which has channel labels; older images, such as `sha-30873ba`, refuse it.
- **Domain.** `server` and Kubernetes need the community's permanent domain, such as
  `buzz.example.org`. `private` uses the machine's Tailscale name, found in its setup, and
  Kubernetes on a private network the name kubernetes.md builds. `local` needs none.

Then:

| Mode | `HOST` | `RELAY_URL` | `ORIGIN` |
| --- | --- | --- | --- |
| `server`, Kubernetes | `$DOMAIN` | `wss://$DOMAIN` | `https://$DOMAIN` |
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
`TAG`, `DIGEST`, `DOMAIN`, `OWNER_HEX`, `HOST`, `RELAY_URL`, `ORIGIN` and, on Kubernetes,
`KUBECONFIG` (without it, `kubectl` falls back to another cluster) again in every call that uses
them, with the values this task started with (`pick-tag.py`, if used, can return a newer tag than
the checkout mid-task). Send a server step as `ssh <server> 'bash -s' <<'EOF' … EOF`, with the
variables set at the top: the quotes keep `$(…)` from running on the agent's machine instead. In
such a script, a command that reads input takes the rest of the script as its input, and the
script ends early: give `< /dev/null` to `apt-get`, `docker compose exec` and the `./run.sh`
commands built on it (`add-member`, `remove-member`, `list-members`), unless the line already
reads a file with `<`. Sending a Tailscale auth key (compose.md 2P) takes stdin for the key, so it
goes in an SSH call of its own.

## 3. Check it, for every setup

Once the setup's own steps pass, run from this machine:

```bash
bash $SKILL/scripts/check-relay.sh "$ORIGIN"                          # Kubernetes
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP>              # public server: 3000 and 5000 closed
bash $SKILL/scripts/check-relay.sh "$ORIGIN" <public IP> 80 443 3000 5000  # private server: nothing public
CA_FILE=local-ca.crt bash $SKILL/scripts/check-relay.sh "$ORIGIN"     # local, from buzz/deploy/compose
```

`<public IP>` is the server's public address, the one you SSH to. On Kubernetes, use the address
and ports kubernetes.md gives. A local test's certificate comes from compose.md step 12. Every
line must say `PASS`: the relay answers, reports its version, names its own identity and has
channel labels (what Buzz 1.0 needs to join and to start chats), takes WebSocket connections
(what Buzz joins over), lets Buzz 0.X in (CORS), phones can reach its pairing service, and it offers
phone notifications. A setup without pairing or notifications prints `SKIP` for that line. A new certificate can take a minute or two on the first
request; the script waits. If this computer still has the domain's old address cached, put
`RESOLVE_IP=<server IP>` before the command to check the server directly.

## 4. Join

Tell the user to open Buzz 1.0 on the owner's computer. On its first screen they choose Other
options, paste `$RELAY_URL` into "Community address or invite link" and choose Continue: Buzz looks
the community up first, so the relay must be running. Under Connect to your community they choose
Use an existing key, drop the key file from section 2 (`~/buzz-identity.nsec`) on the page (its
Browse button looks for `.txt` and `.key` files), check that the "Public identity" it shows is the
owner's npub, and choose Continue with this key. A Builderlab owner on a new computer chooses Sign
in with Builderlab there instead. If Buzz already holds the owner's key, from an identity they use
or the Builderlab account section 2 made, it opens past that screen (after Continue without
signing in, if it asks): with no community yet, on Join a community, where they paste the address
into "Invite link or community URL" and choose Join; otherwise they use the community button, below
(not tested). The `https://` form of the address works too; `ws://` and `http://` addresses
don't. In Buzz 0.X, paste the same address into its Join a community screen. With the key file,
once Buzz has joined, the user saves the key in a password manager (Settings, Identity, Copy
private key), then deletes the file: `rm ~/buzz-identity.nsec`. To join another community later,
it's the community button, then Join a community, whose box takes an address but not an invite
link.

**People.** Each member needs a key. They can make one on their own computer with this skill's
`new-identity.py`, which the guide's site also serves
(https://buzz-selfhost.vercel.app/skills/self-host-buzz/scripts/new-identity.py), or with a
Builderlab account, which is Block's: Create account on Buzz's first screen asks for their details,
and Block can keep a copy of the key. A member sends the owner their npub: the script prints it,
and Buzz 1.0 shows it on "This community needs an invite" before they've joined, and in Settings,
Identity after. The owner adds them ([operations.md](references/operations.md)), or does it in
Buzz 1.0: Settings, Community admin, Membership, Invite members, then "Add directly" with the npub,
or "Invite with a link" and Copy link. Anyone with the link can join until it expires: they paste
it into Other options' "Community address or invite link", or open it and choose Accept invite in
Buzz. In Buzz 0.X, the same things are in Settings, Invites. `Relay request failed (403)` in
Buzz 1.0, or `Not a member yet` in Buzz 0.X, means the relay works but doesn't know that identity
([troubleshooting](references/troubleshooting.md)).

New members join any starter channel an owner or admin turns on: Starter channel for new members,
in a public channel's settings. That covers invite links and Add directly; people added with
`add-member` from the server's command line aren't added to it. Everyone finds open channels in
Search, Channels. Opening Invite members makes a link at once, valid for 3 days with no use limit,
and each change of its expiry or use limit makes another. Nothing cancels a link early, so for one
person choose 1 use and 1 day.

**Removing people.** Remove someone in Buzz 1.0 (Settings, Community admin, Membership, the … on
their row, Remove): that also disconnects them and their agents. `./run.sh remove-member` only
deletes the membership: an open connection keeps reading new messages, private channels included,
and can post, until the relay restarts. So after a command-line removal, restart the relay
([operations.md](references/operations.md)). A removed person can rejoin with any invite link that
hasn't expired; a ban keeps them out, from Buzz 1.0's moderation screens on a public Compose setup
(compose.md, Moderation console) or from the command line elsewhere (operations.md).

**What stays private.** Tell the user, plainly: only members can read, post or open files, but
files are shared with the whole community, not one channel. Any member with a file's link can open
it, even from a private channel or a direct message they aren't in. Removing someone from a
channel, or deleting a message, doesn't take its files back; removing them from the community does.
Buzz is building a setting that limits files to their channels (block/buzz#8444). It starts off
when it ships, so until a release has it and it's turned on, keep files that not every
member may see out of Buzz. Nothing is end-to-end encrypted: whoever runs the server, or holds a
backup, can read every message and file. The relay's log names each member with what they read,
so treat logs like the data.

**Phones.** After joining from the desktop app, the user opens Settings, Pair mobile (Buzz 0.X:
Settings, Mobile). In the Buzz app on the phone they choose Add community, scan the QR code, and
enter the six-digit code the desktop shows (older phones show a code to compare instead). Then
they choose Codes match on the desktop, which sends their identity to the phone. Pairing copies
their private key to the phone: pair where nobody else can see the screen. This
needs the pairing service, which every setup's steps add (`check-relay.sh` says `PASS` for phone
pairing) except Kubernetes on a private network, which isn't covered yet, and the local test. On a
private network the phone needs the Tailscale app on. Every setup's steps turn on phone
notifications (`BUZZ_PUSH_ENABLED=true`): the phone app, 0.25 or later, gets them for direct
messages and mentions (a thread reply notifies only with a mention), through Block's gateway,
`push.buzz.xyz`. Tell the user what that shares: no message text, sender or channel passes through
the gateway or Apple, because the phone fetches messages from this relay; but Block's gateway sees
this relay's key, its server's address and when it wakes which phone, and Apple sees when a phone
is woken. Each member's iPhone signs up on its own while push is on. Block calls push experimental,
and delivery is best effort. `BUZZ_PUSH_ENABLED=false` turns it off. Tested on public VPSs on
2026-10-23 and 2026-10-27.

**Agents.** Buzz 1.0 runs agents on the user's computer, each with its own key that the owner's
identity vouches for. The relay admits them through the owner's membership, which every setup here
allows (`BUZZ_ALLOW_NIP_OA_AUTH=true`), so no agent needs adding as a member
([operations.md](references/operations.md)). Agents answer only while Buzz is open on that computer
and it's awake. Each works in `~/.buzz` unless given its own Workspace, so agents in different
communities share that folder.

**Keys.** Buzz 1.0 keeps a person's private key in that computer's keychain. A key made with
`new-identity.py`, or brought in with Use an existing key without signing in to Builderlab, stays
only there: tell everyone to keep a copy in a password manager (Settings, Identity, Copy private
key). If Buzz later asks to sync the key with Builderlab, "I will manage my own key" keeps it off
Block's servers. With a Builderlab account, Block can keep a copy and gives it back to whoever
signs in to that account. On a new computer they choose Other options, paste the community's
address and choose Continue, then Use an existing key with the saved key; membership stays on the
relay, so nobody has to add them again, and they join each other community again by its address.
Agents can't be moved; they're made again. A lost owner key is recovered on the server by changing
the owner ([operations.md](references/operations.md)).

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
