# Decisions

What was decided for the guide and the skill, and why. Facts behind these are in
[research.md](research.md). Last updated 2026-11-13.

## The public domain moves (2026-11-11)

The owner bought `self-host.buzz` through Vercel and approved connecting it to the existing
`buzz-selfhost` project. It is the production address. Both `www.self-host.buzz` and
`buzz-selfhost.vercel.app` redirect to it with HTTP 308, preserving paths and queries. HTTPS and
the guide, llms.txt, skill archive, key-maker script and Web Analytics script returned 200.
The existing deployment serves the new domain; the reviewed source changes still need approval
to push and deploy. This replaces the earlier Vercel address, not the pending decision about
Block's ownership, name or marks. The owner has not yet received an answer from Block.

## Full-guide overhaul draft (2026-11-11)

The owner requested a complete launch review, better answers to self-hosting questions and a
prominent Security section. The local draft adds that section before setup, separates network
reach from community openness, recommends isolated public-community agents, and distinguishes
personal identity keys from the relay key. It explains official iPhone push through Block's
gateway separately from a custom Apple app/gateway, without promising Android push.

The proposed presentation gives manual setup a visible choice beside the agent route, with the
agent still selected by default. Both read the same commands from the skill. This expands the
older description of the manual route as only a transparency view. It does not replace the skill
with another installer or add support claims for new hosting platforms.

The owner approved concise public versions and coverage limits on 2026-11-11. This explicitly
replaces the October 5 no-test-label decision: the draft shows the review date, stable app,
current relay pin and chart, with a short distinction between source/browser checks and pending
deployment, recovery and real-device evidence. The parser preserves relevant validation notes
beside the affected steps, and links the detailed records. No tested date was advanced. Nothing
in this presentation approval authorizes a pin/chart change, real infrastructure tests, push or
deployment. Those remain separate gates.

## Launch decisions (2026-11-12)

The owner answered the review's open questions one at a time. These are decisions, not yet all
done: the work they call for is listed where it is still owed.

- **Block.** No answer yet on the name, the marks and who hosts the guide. Nothing changes. On
  2026-11-13 the owner chose to publish without waiting, since the live site pointed readers at
  older relay images, and to hold back only A place to ask, the one section that needs Block's
  agreement (below).
- **Nothing about Block's plans.** The Security section's sentence about more advanced security
  features is out, as recorded below.
- **App wording was checked in the running app**, a preview build one day newer than 1.0.0.
  Pairing, Security and Membership are where the guide says. The Buzz ID card's menu was left
  shut, since it holds the private key, and Moderation shows for relay staff only. What was seen
  is in [research.md](research.md).
- **Invite links first.** The people answer and the skill lead with a link that expires after a
  day and is limited to the people expected. Adding by npub follows: from the server's command
  line, which works in every version, or with Add directly, which Buzz 1.0.0 has and preview
  builds after it hide.
- **The relay moves to 0.3.0 before launch.** Done on 2026-11-12, as recorded in the next section:
  the test harness takes the release tag, and the five prepared runs in
  [tests/README.md](../tests/README.md) were run. During the public
  server run the owner does the checks that need hands: pairing a phone (Codes match), a
  notification on a locked phone, and the Staff screen. Servers and costs are approved run by run.
- **Kubernetes pins both images by digest.** Done on 2026-11-12: the relay and the file-store
  image, with the test running the steps' own values block, proved by the Kubernetes run.
- **Upgrades into migration 0086 follow Block's note**, as corrected below.
- **The launch gets a version tag.** Done on 2026-11-13: `v1.0.0` on the commit deployed to
  self-host.buzz that day, after the owner approved publishing.
- **A place to ask** is the page's last section, and in the menu as Ask. It shows how to join
  Block's feedback community for Buzz in three steps, each under a still drawing: Block's invite
  page, Buzz's community list, and the channel. The owner picked the look from three mockups. The
  invite is Block's public one, from the Buzz app's README. Step 1 says what the invite asks: 18
  or older, and Buzz's terms. One line carries the skill's caution about keys: signed in to
  Builderlab, Buzz backs up a key to Block once its owner joins a community Block hosts. Two ways
  round follow: pasting the invite into Join a community, and a GitHub issue for someone who
  would rather not join. Joining needs no Builderlab sign-in for someone who already has a Buzz
  identity: the community's public settings say so and Buzz 1.0.0 follows them
  ([research.md](research.md)), so the section does not ask for one. Held back from the page on
  2026-11-13: the section, its menu entries and `ask` in `site/src/lib/nav.ts` came out in one
  commit, and its code stays, so reverting that commit brings it back. Owed before it returns: the
  channel's real name (`CHANNEL` in `site/src/scenes/ask.ts` is a placeholder, since the channel
  does not exist yet) and Block's agreement to send readers there.
- **Agents get their own group in Running your relay.** People asked what to tell an agent, which
  harness to pick, how to keep one answering, how to keep it safe, and how to run one on a server
  without Buzz, including one that showed as a person and never answered. The owner picked the
  placement and the two drawings from mockups: six answers under Agents, the server answer led by
  a drawing of the same bot with its owner's proof and without, and the instructions answer by a
  labelled example. Their steps, commands and tables live in the skill's new
  `references/agents.md`, which the build parses (`SkillAgents` in `site/build/skill.ts`), so the
  page and the skill can't disagree. The server answer says it is not built into Buzz yet. It
  rests on Block's source and a test on a local relay ([remote-agent-test.md](remote-agent-test.md)).
  Two things are new guidance, flagged to the owner: the ownership proof's risk is stated where the
  reader makes one (no expiry, no revoking, not tied to one community; ban the key if it leaks),
  and a helper meant to answer everyone is set up without a proof, as a member whose profile
  carries Buzz's agent flag. The old line "for a bot that's always on, run it on a server with a
  key of its own, added as a member" is gone: that setup is the one that shows as a person.

## The relay moves to 0.3.0 (2026-11-12)

Every setup now installs and upgrades to Block's relay release 0.3.0. This replaces "One relay
image, by digest" in The launch review, which named `sha-744f394`. What ran, and what it found, is
in [research.md](research.md).

- **The pin is three lines in SKILL.md.** `tested-image: 0.3.0`, `tested-digest` and a new
  `tested-commit`, the block/buzz commit the release was built from. A release's name does not say
  its commit the way an `sha-` tag does, and the Compose bundle is checked out at that commit, so
  the skill records it and checks it against the label the image carries.
- **A pin move is one edit.** SKILL.md's metadata, with the old tag added to `OLD_DEFAULT_TAGS` in
  `site/src/lib/values.ts`. The smoke scripts read their default from SKILL.md and hold no tag.
- **Any other image names its own commit.** Before an upgrade the skill reads the running image's
  commit from its label, and before a restore the backup's. This works for `sha-` tags and
  releases alike, so the steps have one rule and no table of releases to keep.
- **Kubernetes stays on chart 0.1.10**, with the relay pinned through `image.digest` and the file
  store at the digest `ghcr.io/block/buzz-minio:latest` named on 2026-11-12. Chart 0.1.11, which
  moves the file store to Silo with digests of its own, waits for a review of its backup steps and
  a run.
- **The tests turn notifications on**, as compose.md step 8 does. They had not.
- **The upgrade guidance for migration 0086 is unchanged.** Small databases let the relay run it,
  and large or busy ones do Block's prebuild first. Only its framing moved: 0086 now comes with
  the recommended image, where before it came with a newer one.
- **`tested` is 2026-11-12.** All five suites ran on the pin that day, the private and Kubernetes
  ones among them, which the launch review's decision of 2026-11-06 was waiting for.

- **Kubernetes says one node.** The quickstart hung on a restart with two nodes, and Block's chart
  calls it single-node. The owner decided the same day that kubernetes.md says so: step 1 checks
  for one node, says what happens with more, and names Block's setting for more nodes,
  `persistence.git.enabled: false`, as not tested here.

Open, for the owner:

- **One line of site copy.** `site/src/scenes/faq.ts` says the image this guide installs is older
  than the one that can limit files to their channels. With 0.3.0 that is no longer true.

## Security redrawn, and what an independent review corrected (2026-11-11, draft)

A second review, by a different agent, read the overhaul draft below against upstream source and
current documentation. The owner's verdict on the first Security section: too long, too much
text, documentation pasted into large cards. These are local proposals until the owner approves
them; facts and sources are in [research.md](research.md).

- **Security is two practices for a community anyone can join, after the setup.** The heading is
  Security. Its opening says who it is for and that these are today's best practices, in a level
  voice: a fact, then the practice. Each practice has one still drawing and a few lines. "Give your
  agent its own machine" sets your computer apart from the community, drawn as a Buzz window, and
  the machine the agent runs on. "Keep private context out of open communities" is two lists: what
  is fine to share flows into the open community, and what to keep out is struck through and stops
  short. Nothing is operated. The section is about 800 pixels tall on a desktop, from about 3,100,
  and about 1,630 on a phone, from 5,900. On a phone the first drawing is redrawn with the window
  at full width, so its words stay readable.
- **Three versions were rejected on the way, the same day.** One screen per decision with a drawing
  to operate was too much scrolling with too much going on. One panel with three tabs and labelled
  boxes was too simple, and its long notes were too much to fold under it. The owner then cut the
  scope: what an agent can touch and what goes in an open community are the section, and who can
  get in and who holds the keys are not. He picked both drawings from mockups, which stay outside
  this repository.
- **The rest of security is linked, not shown.** A row under the drawings opens the answers in
  Running your relay (moderation, keys, a lost device, a leaked key, someone leaving, server
  access) and links to `references/security.md` in full. Two cautions the folded notes carried
  now sit in the answers they belong to: never put a private key in a chat, an agent prompt, an
  issue or a screenshot (identity), and install only plugins you trust, with the experimental
  protection feature named as not a sandbox (agents). A public address serving members only is
  already on every card in Where to run.
- **The section says nothing about what Block is building.** A draft said the Buzz team is working
  on more advanced security features, with a link to Block's public draft design for agents. It
  spoke for Block's plans, and the owner took it out of the page and the reference.
- **One source for the long version.** `references/security.md` and `references/mobile.md` stay
  the text agents read. The page folds mobile.md's sections by name, and the build fails when one
  is renamed or moved (`site/build/skill.ts`, `SECTIONS`). The Security section is written in its
  own words, so the build also fails when security.md stops saying a sentence the section rests on
  (`SECURITY_SAYS`).
- **The steps collapse as one.** With Security after the setup, the step-by-step commands sit
  between the reader and the rest of the page, and they run to about 9,500 pixels on a desktop for
  Kubernetes. They are one fold now. While they are open, a small "Collapse steps" pill floats at
  the foot of the screen and comes to rest after the last step. Collapsed, the page comes back to
  one line, "Show the 9 steps", the box of values steps aside with the steps, and Security is the
  next thing on screen. Asking for the steps again, or following a link to one, opens them
  (`site/src/scenes/setup.ts`). The owner tried five looks on a scrolling copy of the page and
  picked the pill. He asked for no count of steps done on it, so the count shows only on the
  collapsed line, once a step is ticked, and the thin progress bar above the steps is gone.
- **The version note is one line under the setup's heading**, not a paragraph in Security: the
  review date, the app, the relay image and, on Kubernetes, the chart, with a link to what the
  tests cover (`site/src/scenes/checked.ts`). The image and the chart are read from the skill.
- **Setup's two routes are one switch**, with one line under it for the route picked. The caution
  that the skill is instructions, not a sandbox, sits in that line.
- **Running your relay opens with five things to have true before the team arrives**, each a link
  to its answer, and with "How should we add people?" again, not the phones answer.
- **Phones are drawn by who runs each part**: your relay, Block's gateway, Apple's push service
  and the phone, with the wake-up going out and the message coming back from your relay.
- **Upgrades into migration 0086 follow Block's own note**: a small database lets the relay run it
  and restarts on a timeout; only a large or busy one needs the prebuild. The first overhaul made
  every existing database stop for the large-deployment procedure.
- **Wording that changed for accuracy**: Buzz starts every local agent with no sandbox and no
  approval prompts (not "can"); an agent takes requests from its owner and reads everyone's text;
  Builderlab can decrypt the key copy it holds; pairing is under Settings, Mobile app, and ends
  with Codes match as the app words it; Buzz can't cancel one invite link, and a ban cancels all
  of a person's links; push through Block's gateway is Block's documented path for the bundle,
  with no promised level of service.

Not changed: the relay pin, the chart, the tested date, the hero's four reasons, the setups, the
name and the marks.

## What the site is

The guide is for people and teams who want their own Buzz relay instead of Block's hosting. It's
agent first: most readers will hand the skill to their coding agent. The step-by-step view stays,
as the transparency view of the same commands, rendered from the skill so the two can't drift.

## Railway is out (2026-11-02)

On 2026-10-21 Railway disclosed that someone had reached the systems holding its customers'
environment variables, and had decrypted some of them
([BleepingComputer](https://www.bleepingcomputer.com/news/security/railway-warns-devs-to-rotate-secrets-after-potential-breach/)).
On Railway, the relay key and every password live in those variables. The owner removed Railway
from the guide and the skill: its setup, its operations, its troubleshooting rows and the
picker's "Managed platform" answer. The test records keep its runs as history.

## The launch review (2026-11-06)

A review read the site as a CTO and as an open-source community would, before launch. The owner
decided:

- **Ownership.** The site is offered to the Buzz team to host as theirs. Until Block answers,
  nothing changes its name, its marks or who it says made it.
- **One relay image, by digest.** Every setup installs and upgrades to `sha-744f394`
  (`sha256:b67a32b7b2a274cdbd9a685fe996657fa544a3e981284ab3a8c660a128f36a3d`, block/buzz
  744f3946f, after the #8802 fix). SKILL.md's `tested-image` and `tested-digest` hold it, the
  skill checks the pulled image's digest, and the site reads both. A move is an edit in SKILL.md
  and the smoke scripts, with the old tag added to `OLD_DEFAULT_TAGS` in `site/src/lib/values.ts`.
  The newest image runs only when the user asks: images from 2026-10-30 to 2026-11-05 crash-looped
  on upgrade (#8802). Upgrades past migration 0083 first rename public channels that share a name.
  This replaces "The tested image moves to sha-e8781ca". `tested` stays 2026-10-23 until the
  private and Kubernetes suites run on the pin.
- **Keys.** Buzz 1.0's first screen makes a key only with a Builderlab account, which is Block's.
  The skill's `scripts/new-identity.py` makes one on the person's computer instead, in
  `~/buzz-identity.key` (Buzz's Browse button lists `.key` and `.txt` files, not `.nsec`), and the
  site serves it for members. People join with Other options, the address, Use an existing key and
  the dropped file. Then they copy the key from Settings, Identity, Copy private key into a password
  manager and delete the file, so nobody opens it by hand. Builderlab stays the other way, with
  what Block can keep said plainly.
- **Moderation.** On public Compose setups the skill offers Buzz's Moderation console, at an
  `admin.` name. Elsewhere the owner or an admin uses the `buzz` command line that comes with Buzz
  1.0. "How do we moderate?" says to ban rather than only remove.
- **Limits.** "What it can't do yet" sat above Where to run, as seven one-line cards. The owner
  removed it the same day; the FAQ answers still say what each limit means for a team.
- **Hero and push.** The four reasons stay, reworded to what holds: the relay keeps running without
  Block, and messages and files are stored on your own server. Push text says Block's gateway sees
  the relay's public key, the server's IP address and when it wakes which phone. "What still
  depends on Block?" lists the apps, push and Builderlab. This replaces the 2026-10-26 wording in
  Copy and style.
- **The quiz.** Four questions: what it's for, who will look after it, where it runs and who can
  reach it. The result is a local test, "Find an owner first" (with buzz.xyz, and #6803 for why it
  can't move later), one of the six server setups, or "Not covered here" with the closest VPS. Each
  result says what the setup needs, what you give up and a monthly cost. The skill's first
  questions are the same four.
- **Files.** The site and the skill say plainly that any member with a file's link can open it
  (#8444), and that the relay's log names who read what.
- **Drawings.** Redrawn from block/buzz-app v0.7.0-preview.248.1: the left dock (#2626), the
  account-first first run (#2579) and Codes match (#1597).
- **Reruns.** Before launch, the private and Kubernetes suites run on the pin.

## The setups, and how to present them

The setups follow the ways Block ships Buzz: the Compose bundle (`deploy/compose`) and the Helm
chart (`deploy/charts/buzz`). Block's third, a Railway template, was dropped on 2026-11-02 (see
"Railway is out"). Block publishes nothing else; the "Hostinger Docker template" people mention is
Hostinger's own.

- **A VPS** is the default. Name the clouds people think in (AWS, Google Cloud, DigitalOcean,
  Hetzner) and the catches: x86 is the tested platform, which rules out ARM servers like AWS
  Graviton. Bundles from before 2026-10-07 need it (their MinIO image is amd64-only); Silo also
  runs on ARM, untested. Ports 80 and 443 open; a fixed IP.
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
  skill adds it. Tested with an iPhone on a VPS (public and private) and Kubernetes; not
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

Since 2026-10-26 the site's own copy launches with Buzz 1.0 and names only "Buzz" and "the Buzz
app": no Buzz 0.X (the Intel Mac note is gone from Get ready), no older phone apps, and no MinIO
history in How it works. How it works shows both repositories: the relay in block/buzz, the app in
block/buzz-app. The skill still covers 0.X, older phone apps and bundles from before Silo, for
agents on older setups; `site/build/skill.ts` (`CURRENT`) takes those notes out of the skill text the
site shows, and the build fails if one gets through.

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

## Access and keys (2026-10-27)

A section after Operations for the questions a team asks before trusting Buzz with people and keys:
identity and keys, people and roles, agents, and the server. It's a how-to FAQ, not an explainer: each
answer leads with what we recommend, then the steps in Buzz's own words, with a picture only where
one helps (who can do what, a lost device, the invite link's settings, the leaving checklist, where
the relay key lives). Two explainer versions, a scrolling story and a click-through, were tried and
dropped: people setting this up want what to do. Sources for every fact:
[access-and-keys.md](access-and-keys.md).

Since 2026-10-27 every answer shows its how: a click-through of Buzz's own screens where it happens
in Buzz (identity, a lost device, roles, adding and removing people, agents), reusing the people
click-through from Operations, and a drawing where it happens on the server. The click-throughs
assume Buzz is installed; how to get it changes too often to draw.

## Running your relay: one FAQ (2026-10-27)

Operations and Access and keys merged into one section, "Running your relay" (still `#operations`,
"Operations" in the menu): two sections answered overlapping questions, and the tabs of one sat
next to the questions of the other. The Running on box stays on top; fifteen questions in four
groups, People, Identity and keys, Data and Server, each group a card of its own so they read
apart. Each answer leads with what we recommend. Backing up, restoring and upgrading keep their
setup-specific steps and commands (`site/src/scenes/operations.ts`); the rest are the access
answers (`site/src/scenes/faq.ts`). Our cadences: back up at least weekly and before every
upgrade, upgrade about once a month, since new app features can need a recent relay.

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
follows `tested-image`, and a reader still on an older default gets the new one. Replaced on
2026-11-06 by the pin in The launch review.

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
- The hero says why to run your own (2026-10-26), in one row of four under the buttons:
  independent of Block (it keeps running if Block moves on), no lock-in (your data, your
  decisions, free to switch to a fork), yours to customize (build a feature instead of waiting
  for one), private (everything can run on your hardware, behind your firewall). A call with
  Spiral's open-source PMs asked for the why up front; a longer two-by-two version took too much
  room. Reworded on 2026-11-06 (The launch review).
- The site never talks about testing (2026-10-25): the tests are why its advice can be trusted,
  not part of the advice. The skill and these docs keep their test notes, since agents and
  maintainers use them; `site/build/skill.ts` (`UNTESTED`) strips them from the skill text the
  site shows.
- No mentions of the Block engineering blog post the guide started from.
- No em dashes; avoid filler such as "just" and "simply".
