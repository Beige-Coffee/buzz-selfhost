# Research

What the tests, the agent runs and the upstream research found. Decisions that follow from it are
in [decisions.md](decisions.md). Last updated 2026-10-05.

## Contents

- What's tested
- Agents other than Claude
- The Agent Skills standard
- Open Buzz issues the site links to
- Platform facts worth knowing

## What's tested

Every setup passed both a scripted test and an agent given nothing but the skill.
[tests/README.md](../tests/README.md) has the numbers by date, and [tests/runs/](../tests/runs/)
every run.

| Setup | Scripted | Agent runs | iPhone pairing |
| --- | --- | --- | --- |
| VPS, public | 85 of 85, through backup, restore and upgrade | Claude, Codex, Goose | Tested |
| VPS, private (Tailscale) | 52 of 52 | Claude, Codex, Goose | Tested |
| Kubernetes, public | 23 of 23 | Claude | Tested |
| Kubernetes, private (Tailscale) | 17 of 17 | Claude | Not covered |
| Railway | Deploy, members, backup, restore, pairing | Claude | Tested |
| Local test (Linux, Apple Silicon) | Passed | Claude | Not applicable |

Buzz Desktop on macOS joined and posted on all seven. On 2026-10-06 a brand-new user's run passed:
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
- Buzz Desktop on Windows, and the agent running on Windows
- Scheduled backups and Docker log limits for a server that runs for months Buzz ships new images daily; the skill was last tested end to end on `sha-d1b7da4`, and
the Compose path again on `sha-fd885b5`.

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

All open on 2026-10-05; none of the community fixes has merged. Several PRs wait on a Block member
to start a required security review.

| Issue | What breaks | Fix in progress |
| --- | --- | --- |
| [#5206](https://github.com/block/buzz/issues/5206) iPhone push | Only Block's gateway can push to the App Store app, and it doesn't serve self-hosted relays | [#7760](https://github.com/block/buzz/pull/7760): your own signed app and gateway |
| [#6092](https://github.com/block/buzz/issues/6092) Android push | No push notifications on Android at all | None; needs [#3229](https://github.com/block/buzz/issues/3229) |
| [#7721](https://github.com/block/buzz/issues/7721) Phone pairing | The bundle never starts the pairing service | None upstream; the skill adds it |
| [#4198](https://github.com/block/buzz/issues/4198) Phones on private IPs | The app rejects bare private addresses like `ws://10.0.0.1` | [#7266](https://github.com/block/buzz/pull/7266) |
| [#6923](https://github.com/block/buzz/issues/6923), [#4209](https://github.com/block/buzz/issues/4209) Invite links | No invite screen for self-hosted communities | None; [#4311](https://github.com/block/buzz/pull/4311) fixes a nearby bug |
| [#2872](https://github.com/block/buzz/issues/2872) Desktop and CORS | The bundle's default blocks Buzz Desktop | [#2888](https://github.com/block/buzz/pull/2888) |
| [#6803](https://github.com/block/buzz/issues/6803) Moving from buzz.xyz | No way to bring a hosted community to your relay | None |
| [#5731](https://github.com/block/buzz/issues/5731) Export and restore | No portable export of a whole workspace | None |
| [#4952](https://github.com/block/buzz/issues/4952) Two addresses | A community answers on one address only | [#5410](https://github.com/block/buzz/pull/5410), [#5674](https://github.com/block/buzz/pull/5674) |
| [#7880](https://github.com/block/buzz/issues/7880) MinIO images | The bundle and chart point at images quay.io no longer serves | Drafts [#7875](https://github.com/block/buzz/pull/7875), [#8023](https://github.com/block/buzz/pull/8023) |
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
- **Buzz images:** the relay image runs on x86 and ARM; `ghcr.io/block/buzz-minio` is x86 only.
