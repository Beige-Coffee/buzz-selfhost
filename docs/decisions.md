# Decisions

What was decided for the guide and the skill, and why. Facts behind these are in
[research.md](research.md). Last updated 2026-10-05.

## What the site is

The guide is for people and teams who want their own Buzz relay instead of Block's hosting. It's
agent first: most readers will hand the skill to their coding agent. The step-by-step view stays,
as the transparency view of the same commands, rendered from the skill so the two can't drift.

## The setups, and how to present them

The setups follow the three ways Block ships Buzz: the Compose bundle (`deploy/compose`), the Helm
chart (`deploy/charts/buzz`) and Railway's template. Block publishes nothing else; the "Hostinger
Docker template" people mention is Hostinger's own.

- **A VPS** is the default. Name the clouds people think in (AWS, Google Cloud, DigitalOcean,
  Hetzner) and the catches: x86 is the tested platform, which rules out ARM servers like AWS
  Graviton. Bundles from before 2026-10-07 need it (their MinIO image is amd64-only); Silo also
  runs on ARM, untested. Ports 80 and 443 open; a fixed IP.
- **Railway** has the least to run, and the most limits: its own stack, no volume for git
  repositories, a plan cap on services, and phone pairing needs a fifth service.
- **Your own hardware** keeps everything at home. Steer it to Tailscale: reaching a home server
  publicly needs router port forwarding, which isn't tested and which CGNAT can block.
- **Kubernetes** is a different install, so it stays, but as "Already run Kubernetes?", not an
  equal to a VPS: a team without a cluster should never pick it.
- **A local test** on the reader's machine, for trying Buzz out.
- No new platforms (Render, Fly.io, Coolify) until a tester asks: each is more to test and keep up.
- **Umbrel** isn't a setup here yet. A tested package for Umbrel's App Store lives on the `umbrel`
  branch ([status](https://github.com/Beige-Coffee/buzz-selfhost/blob/umbrel/docs/umbrel.md)) until
  Umbrel accepts it, so `main`, which the site links testers to, shows only what the guide supports.

## Public or private

A public relay is reachable from anywhere, but only added members can read or post, and files
need a member's signature. A private relay on Tailscale has no public address at all: two locks,
Tailscale for who reaches the server and Buzz for who's in the community. The cost: every device,
phones included, runs Tailscale (a paid seat per user past the free plan), an iPhone runs one VPN
at a time, the `ts.net` name is permanent (block/buzz#4952), and webhooks to tailnet addresses are
refused (block/buzz#6500). For a team that mostly uses phones, recommend public.

## Phones

- **Pairing works.** A member joins from Buzz, opens Settings, Pair mobile (Buzz 0.X: Settings,
  Mobile), and scans the QR code with the Buzz app. Block's bundles don't start the pairing service (block/buzz#7721), so the
  skill adds it. Tested with an iPhone on a VPS (public and private), Kubernetes and Railway; not
  yet on Kubernetes on a private network.
- **Push notifications work** since the App Store app 0.25 (2026-10-21): with
  `BUZZ_PUSH_ENABLED=true`, the relay wakes the phone through Block's gateway, `push.buzz.xyz`
  (see "Phone notifications on by default"). Android has no push at all yet (block/buzz#6092).
- block/buzz#4198 stops only bare private addresses like `ws://10.0.0.1`. Tailscale names pass.

## Two desktop apps (2026-10-23)

The guide and the skill describe Buzz 1.0 (block/buzz-app). Buzz 0.X comes up only where it
differs: Intel Macs, which Buzz 1.0 doesn't support; its screens (npub on the Join screen,
Settings, Invites, Settings, Mobile); and the CORS entries it needs. Pairing is now Settings, Pair
mobile, then Add community on the phone. The prompts say where the npub comes from (Settings,
Identity), and Get ready tells people to save their private key, since Buzz 1.0 doesn't back it
up.

## Operations: the right tool for each task (2026-10-25)

Before the site goes to the Buzz team, it gets more minimal, and less agent-first where an agent
isn't needed. Adding people is a click-through of Buzz 1.0's own screens (Settings, Community
admin, Membership, "Add or invite people", the new member's Join screen, the row menu): the owner
and admins do it in the app, with nothing to run on the server. Backing up shows the commands
first, from operations.md, with the skill's notes folded, and on a VPS a line about the provider's
automatic backups; restoring shows the whole procedure, since what to run first depends on where
you restore; both are commands you run. Upgrading stays a prompt for your agent, with its commands
folded: it has the most steps and the most ways to get one wrong. "Run your relay well" is gone:
the skill already does most of it, and the two habits only a person can keep (an encrypted copy
off the server, the relay key where two people can open it) moved into the backup notes.
Later the same day, after the owner's screenshots of Buzz 1.0: adding people became four flows,
add someone, invite with a link, change a role and remove someone, each starting from a looping
click on the profile menu, drawn from those screenshots and the app's source, with Buzz's own
Tabler icons. Backing up and restoring are numbered steps whose commands are the skill's own
blocks; the skill's restore puts its stop-and-clear commands in a block of their own for that.

## Phone notifications on by default (2026-10-23)

A newcomer review named "no push notifications" as the likeliest reason a team would stay on Slack.
The owner tested it the same day: with `BUZZ_PUSH_ENABLED=true` (Block's bundle has carried the
gateway's address, `push.buzz.xyz`, since 2026-09-15) and the App Store app 0.25, a locked iPhone
showed a direct message and a mention from another member, with their text. So the skill turns
notifications on in every setup. They pass through Block's gateway and Apple, which carry only a
fixed "reconnect" signal, never a message (Buzz's push spec requires this); the agent tells the
user so, and that `BUZZ_PUSH_ENABLED=false` turns them off. Tested on a public VPS only; Block
calls push experimental, and block/buzz#5206 is still open.

## The drawings are Buzz 1.0's (2026-10-23)

How it works, the Join screen and the relay key explainer's window draw Buzz 1.0 in light mode,
from the owner's screenshots and block/buzz-app's tokens: a gray track with a white pill for the
open tab, the open channel in solid Citrus (`#beda36`), gray bubbles under each name, round
avatars for people and square ones for agents. The explainer's phone stays as it was: the phone
app didn't change.

## The local test moves to https://localhost (2026-10-23)

Buzz 1.0 refuses `ws://`, so `local` mode now runs the bundle's own Caddy overlay at
`https://localhost`, with a certificate from Caddy's local authority that the user trusts once,
with their password; the agent never runs that command. Chosen over mkcert (nothing more to
install) and over `tailscale serve` on the laptop (needs a tailnet, and the name is permanent).
The authority's key stays in Caddy's volume on that machine; the skill gives the commands to
remove the test and the trust. Phones can't pair with it, since pairing trusts only public
authorities. The old plain test (`ws://127.0.0.1:3000`, Buzz 0.X only) and its script are gone.

## The tested image moves to sha-e8781ca (2026-10-23)

Buzz 1.0's New chat needs channel labels, in images from 2026-10-15. The site's `DEFAULT_TAG`
follows `tested-image`, and a reader still on an older default gets the new one.

## Getting the skill

Lead with the standard installer, which puts the skill into Claude Code, Codex, Goose and 70-odd
other agents: `npx skills add Beige-Coffee/buzz-selfhost --skill self-host-buzz`. Keep the
download as a fallback. Later, propose the skill to block/buzz at `skills/self-host-buzz/` (the
installer finds a root `skills/` folder), with two separate contributions: the pairing fix for
block/buzz#7721, and a CI job that runs the local setup on every change to the bundle.

## Before testers get the link

The owner's call (2026-10-05): the public site carries no "untested" labels and no test-version
label; test status lives in [research.md](research.md). The skill's steps, which the site renders,
leave test status out too. The site's footer links "Source on GitHub" and "Report a problem" (this
repo's issues), and the site's Get ready list covers what a new user needs first: connect over SSH
once yourself, a user whose sudo doesn't ask for a password, DNS only on Cloudflare with no stray
AAAA record, and an agent on a Mac or Linux computer with python3, bash and curl.

Still to do before sharing the link:

1. **Done 2026-10-06, on DigitalOcean instead** (no personal AWS account): it passed, and taught the
   skill and the site about a domain's old address staying cached on the user's computer. The
   original plan: **an agent plays a brand-new user** on AWS with a real domain: Ubuntu 24.04 on a t3.medium, a
   new key pair (`.pem`), the launch wizard's default security group (SSH only), the `ubuntu` user,
   a subdomain on Cloudflare (DNS only, and note what happens left Proxied), the skill installed
   with `npx skills add … -g`, and the site's VPS prompt as written. Nothing preset: no known_hosts
   entry, no prepared SSH command. The point is whether the site's Get ready lines (allow HTTP and
   HTTPS, attach an Elastic IP, connect once, `ssh-add` the `.pem`) are enough. Needs the owner's
   AWS credentials, a Cloudflare token limited to that domain's DNS, and approval to spend; tear
   down the instance, the Elastic IP and the DNS record after.
2. **The owner follows the site by hand** as a new user (planned for 2026-10-06).

## Silo, invites, the owner, reporting problems (2026-10-12)

The skill follows the bundle at the installed tag: older tags keep the MinIO swap, newer ones skip
it. Every Compose upgrade compares the stored files before and after, and going back means the
pre-upgrade backup on the old tag. The skill points to Desktop's Settings, Invites for adding
people and making invite links, and says the owner can be changed. When a check fails and
troubleshooting has no fix, the agent drafts a masked issue and files it only with the user's OK;
the Setup problem form has the same fields. The site follows: Silo in "What's inside your relay",
"One address per community" in place of "No invite links", and `DEFAULT_TAG` at `sha-30873ba`.

## When the skill moves to block/buzz

The site's footer links ("Source on GitHub", "Report a problem", marked by a comment in
`site/index.html`) and the `npx skills add` command (`SKILL_REPO` in `site/src/scenes/agent.ts`)
must point at block/buzz instead of Beige-Coffee/buzz-selfhost.

## Copy and style

- Meta description: "You're a grown-up. Run your own Buzz server."
- No "promises" box and no "Tested on" line in the setup guides.
- No mentions of the Block engineering blog post the guide started from.
- No em dashes; avoid filler such as "just" and "simply".
