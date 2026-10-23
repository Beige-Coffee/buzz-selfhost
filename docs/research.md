# Research

What the tests, the agent runs and the upstream research found. Decisions that follow from it are
in [decisions.md](decisions.md). Last updated 2026-10-05.

## Contents

- What's tested
- Agents other than Claude
- The Agent Skills standard
- Open Buzz issues the site links to
- Platform facts worth knowing
- Checked on 2026-10-12
- Buzz 1.0, checked on 2026-10-23
- Found on 2026-10-09, not yet in the skill

## What's tested

Every setup passed both a scripted test and an agent given nothing but the skill.
[tests/README.md](../tests/README.md) has the numbers by date, and [tests/runs/](../tests/runs/)
every run.

| Setup | Scripted | Agent runs | iPhone pairing |
| --- | --- | --- | --- |
| VPS, public | 101 of 101 on `sha-e8781ca`, and 119 of 119 upgrading from `sha-30873ba`; earlier 108 of 108 from MinIO to Silo | Claude, Codex, Goose | Tested, Buzz 0.X and 1.0 |
| VPS, private (Tailscale) | 52 of 52 | Claude, Codex, Goose | Tested |
| Kubernetes, public | 23 of 23 | Claude | Tested |
| Kubernetes, private (Tailscale) | 17 of 17 | Claude | Not covered |
| Railway | Deploy, members, backup, restore, pairing; a fresh deploy on 2026-10-23 | Claude | Tested |
| Local test (macOS, Docker Desktop, `https://localhost`) | 52 of 52 | Claude (the earlier plain mode) | Not applicable |

Buzz 0.X on macOS joined and posted on all seven. Buzz 1.0 joined the VPS and the local test by
hand on 2026-10-23 (see Buzz 1.0, checked on 2026-10-23). On 2026-10-06 a brand-new user's run passed:
a fresh Claude Code session given the site's prompt, a real domain, a non-root user with
passwordless sudo, and the user's own first SSH connection
([record](../tests/runs/2026-10-06-0940-newcomer-digitalocean-real-domain.md)). It found one new
snag: a name that pointed somewhere before stays cached on the user's computer for half an hour
or more after the record changes.

Not tested yet:

- Cloudflare's proxy or a stray AAAA record (a real domain was tested once, on Vercel's DNS)
- AWS, Google Cloud or Hetzner (only DigitalOcean)
- Restoring onto a different server (only onto the same one, after wiping it), and restoring on
  Kubernetes
- A public home server (router port forwarding)
- Railway with a custom domain, and whether a Railway trial has room for one relay (the site says
  three services and a storage bucket, plus one service for phone pairing)
- The chart's production profile
- Phone pairing on Kubernetes on a private network, and on Android
- Buzz on Windows, and the agent running on Windows
- Scheduled backups and Docker log limits for a server that runs for months
- Trusting the local test's authority on Linux or Windows
- Huddles between two Buzz 1.0 users
- Kubernetes and the private network on `sha-e8781ca`

Buzz ships new images daily; the skill was last tested end to end on `sha-d1b7da4`, the Compose
path on `sha-30873ba`, and the VPS and the local test on `sha-e8781ca` (2026-10-23).

## Agents other than Claude

Installed with `npx skills add`, then given the request a user would type:

- **Codex** (GPT-5.6, ChatGPT Plus) passed public and private. Its command tool stops waiting after
  about 30 seconds and it runs commands in parallel, so it checked steps before they'd finished.
  The skill now says to run steps one at a time and to wait for long ones, and the final check
  fits in 30 seconds. Given an empty server address, it stopped and asked.
- **Goose with DeepSeek V4 Pro** (OpenRouter) passed private in one go, for about $0.23.
- **Goose with Gemini 3.8 Flash** passed the public install for $0.17 but ends its turn after each
  step, even when told to continue. Given an empty server address, it used a cloud token it found
  on disk and changed a firewall without asking. The skill now says to ask instead. Not a model to
  recommend for this skill.

## The Agent Skills standard

The skill follows the [Agent Skills specification](https://agentskills.io/specification) and passes
its validator (`skills-ref validate`). Block's own two skills in block/buzz don't: one has a
`version` field the spec doesn't allow, and one's folder name doesn't match its skill name.
Against [Anthropic's authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
still open: a reusable set of eval scenarios, runs on smaller Claude models, and a contents list at
the top of reference files over 100 lines.

## Open Buzz issues the site links to

All open on 2026-10-23; none of the community fixes has merged. Several PRs wait on a Block member
to start a required security review.

| Issue | What breaks | Fix in progress |
| --- | --- | --- |
| [#5206](https://github.com/block/buzz/issues/5206) iPhone push | Only Block's gateway can push to the App Store app, and it doesn't serve self-hosted relays | [#7760](https://github.com/block/buzz/pull/7760): your own signed app and gateway |
| [#6092](https://github.com/block/buzz/issues/6092) Android push | No push notifications on Android at all | None; needs [#3229](https://github.com/block/buzz/issues/3229) |
| [#7721](https://github.com/block/buzz/issues/7721) Phone pairing | The bundle never starts the pairing service | None upstream; the skill adds it |
| [#4198](https://github.com/block/buzz/issues/4198) Phones on private IPs | The app rejects bare private addresses like `ws://10.0.0.1` | [#7266](https://github.com/block/buzz/pull/7266) |
| [#6923](https://github.com/block/buzz/issues/6923), [#4209](https://github.com/block/buzz/issues/4209) Invite links | Nothing on current images: Buzz 1.0 makes links under Settings, Community admin, Membership (made by hand Oct 23), Buzz 0.X has Settings, Invites, and the relay's invite API works (tested Oct 12) | Both still open; [#4311](https://github.com/block/buzz/pull/4311) fixes a nearby bug |
| [#2872](https://github.com/block/buzz/issues/2872) Buzz 0.X and CORS | The bundle's default blocks Buzz 0.X (Buzz 1.0 isn't affected) | [#2888](https://github.com/block/buzz/pull/2888) |
| [#6803](https://github.com/block/buzz/issues/6803) Moving from buzz.xyz | No way to bring a hosted community to your relay | None |
| [#5731](https://github.com/block/buzz/issues/5731) Export and restore | No portable export of a whole workspace | None |
| [#4952](https://github.com/block/buzz/issues/4952) Two addresses | A community answers on one address only | [#5410](https://github.com/block/buzz/pull/5410), [#5674](https://github.com/block/buzz/pull/5674) |
| [#7880](https://github.com/block/buzz/issues/7880) MinIO images | The chart the skill pins (0.1.10) still needs the image override | Fixed for Compose by [#8023](https://github.com/block/buzz/pull/8023), merged Oct 7 |
| [#6500](https://github.com/block/buzz/issues/6500) Webhooks on Tailscale | Workflow webhooks refuse tailnet addresses | [#6553](https://github.com/block/buzz/pull/6553) |

Merged: [#4610](https://github.com/block/buzz/pull/4610) (opening a file needs a member's signature;
Railway's template and the chart's default image predate it, so the skill updates the image first),
[#2862](https://github.com/block/buzz/pull/2862), [#7877](https://github.com/block/buzz/pull/7877),
and [#7869](https://github.com/block/buzz/pull/7869) with [#7870](https://github.com/block/buzz/pull/7870)
(Block's CI uses its own MinIO build; the bundle still doesn't).

## Platform facts worth knowing

- **Railway:** plans cap services across live projects; deleting a project frees room at once, but
  it stays listed for two days. The CLI's `environment edit --service-config … deploy.startCommand`
  answers "No changes to apply", so the pairing service's start command is set in the dashboard. A
  start command overrides the image's entrypoint. `railway ssh` needs a terminal once to accept
  its host key.
- **DigitalOcean:** regions run out of node sizes (sfo3 had no 8 GB nodes on 2026-10-05); deleting
  a Kubernetes cluster leaves its volumes behind.
- **Tailscale:** a machine's name is the relay's address for good; `tailscale logout` leaves the
  machine listed as offline until removed in the admin console; turning on HTTPS lists machine
  names in public certificate logs.
- **Kubernetes:** the chart (0.1.10) runs the pairing service but doesn't route to it; a second
  ingress for `/pair` on the same name and certificate does. Its default image is from June 2026.
- **Buzz images:** the relay and Silo images run on x86 and ARM; `ghcr.io/block/buzz-minio`, which
  bundles before Oct 7 need, is x86 only.

## Checked on 2026-10-12

- **Silo replaced MinIO** in Block's Compose bundle (block/buzz#8023, merged Oct 7 as `d742fc5`).
  Silo is a maintained MinIO fork with x86 and ARM images on Docker Hub, pulled without a login.
  The bundle keeps MinIO's names (service `minio`, volume `buzz-prod_buzz-minio-data`, bucket
  `buzz-media`, `http://minio:9000`), so backups and restores didn't change. Block's bundle doesn't
  move the data; its README points to Silo's migration guide, which reuses the volume in place.
  Tested: `sha-9c6fa14` (MinIO 2025-09-07, `ghcr.io/block/buzz-minio`) upgraded to `sha-30873ba`
  kept every object, a file from before read back intact, and new uploads worked. Going back to the
  pre-upgrade backup on the old tag also worked. ARM servers are untested.
- **The bucket holds more than uploads:** each upload makes a file, a `_meta` record and, for
  images, a thumbnail. The git self-test adds `probe/` and `packs/` objects at every relay start.
- **Invite links work on a self-hosted relay.** The relay's `/api/invites`, which Buzz Desktop's
  Settings, Invites calls, worked on `sha-9c6fa14` and `sha-30873ba`. Desktop's side wasn't tried.
  #6923 and #4209 are still open upstream.
- **The owner can be changed:** a new `RELAY_OWNER_PUBKEY` and a restart make the old owner an
  admin, who `remove-member` can then remove. The current owner can't be removed. Tested on Compose
  only.

## Buzz 1.0, checked on 2026-10-23

Buzz 1.0 (github.com/block/buzz-app, beta; releases are prereleases named `0.0.0-preview.N.1`, so
`/releases/latest` answers 404) is the desktop app the guide now points to. Its macOS build is for
Apple Silicon only. Buzz 0.X, the app from block/buzz, still works with the same relay and is the
one for Intel Macs.

- **What it needs from a relay.** `https://` or `wss://` addresses only (it refuses `ws://` and
  `http://`), the relay's identity in NIP-11 (`self`, from `BUZZ_RELAY_PRIVATE_KEY`), NIPs 29 and
  43, and channel labels (`nip-cl`) for New chat, which images have from 2026-10-15. On
  `sha-30873ba` New chat is refused. Agents show online only on images from 2026-10-13 on. It
  makes its HTTP calls from the app itself, so CORS doesn't affect it; the Tauri entries stay for
  Buzz 0.X. check-relay.sh now checks `self` and `nip-cl`.
- **Which certificates it trusts** (buzz-app at 68ebbfe): the relay's HTTP calls go through
  reqwest 0.13 with rustls-platform-verifier (the system's trust settings), the live connection
  through the window's WebSocket (WebKit, system trust), huddle audio through rustls-native-certs
  (the system's store), and phone pairing through webpki-roots only (public authorities). So a
  local authority the Mac trusts covers everything but pairing.
- **Agents** run on the user's computer, each with its own key and the owner's NIP-OA
  attestation; with `BUZZ_ALLOW_NIP_OA_AUTH=true` (Compose, the chart and Railway's template) the
  relay admits them through the owner's membership. Tested on both VPS runs: an agent posted in a
  chat that named it without being added, its key alone was refused, and an agent of a non-member
  was refused.
- **Partition audit.** After the upgrade from `sha-30873ba` to `sha-e8781ca`,
  `buzz-admin partition-audit` said `degraded`, as block/buzz's monitoring doc expects for images
  before 2026-10-20 (diagnostic only; the relay kept working). A fresh install said `ok`.
- **By hand, 2026-10-23.** The owner joined a VPS (`wss://` on an sslip.io name) and a local test
  (`wss://localhost`, after trusting Caddy's local authority) from Buzz 1.0's first screen, made a
  channel and posted in each, and made an invite link (Settings, Community admin, Membership,
  Invite members, Invite with a link); the link's page answered. An iPhone running the App Store
  app paired with the VPS through Settings, Pair mobile, using the older code check ("Codes
  match"), and posted. New chat wasn't tried by hand: it needs an agent, and the scripted runs
  cover it.
- **UI paths** (from the source; the joins, the invite link and pairing confirmed by hand): npub in
  Settings, Identity, "Nostr address (npub)"; first screen "Join a community" with one field,
  "Invite link or community URL"; invites in Settings, Community admin, Membership, Invite members
  ("Add directly", "Invite with a link"); phones in Settings, Pair mobile, then Add community on
  the phone and a six-digit code. The in-app Join a community (community button) takes only an
  address, not an invite link. Before any community, Settings opens only with ⌘, (unconfirmed at
  runtime). Buzz 1.0 doesn't back up the private key: Settings, Identity, Copy private key.
- **Railway's template** was listed as degraded on 2026-10-23 (success rate 0 over 30 days; its
  2026-10-18 validation failed with "Your workspace has been restricted"), but a fresh deploy
  from the CLI the same day worked. On the template's `sha-788b3c0` every check passed except
  `nip-cl`; after the image update (`pick-tag.py` chose `sha-9e8c9fc`) every check passed. Railway's
  API then listed the template as published, health 92. Cost: $0.0002 of trial credit
  ([record](../tests/runs/2026-10-23-1425-railway-template-check.md)).

## Found on 2026-10-09, not yet in the skill

- **The relay has a built-in admin console**, off by default: moderation reports, bans, timeouts,
  deleting messages, member feedback, and adding moderators. `BUZZ_ADMIN_HOST=admin.<domain>`, with
  that name routed to the relay, turns it on. The owner gets operator access automatically, and
  Buzz Desktop finds it under Settings, Admin (a different host name than the relay's needs one
  click on Save). Tested on a Compose relay on Oct 9. A candidate optional step for the skill.
