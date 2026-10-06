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
  Hetzner) and the catches: the server must be x86, because the MinIO image the bundle needs
  (`ghcr.io/block/buzz-minio`) is amd64-only, which rules out ARM servers like AWS Graviton (the
  relay image itself runs on both); ports 80 and 443 open; a fixed IP.
- **Railway** has the least to run, and the most limits: its own stack, no volume for git
  repositories, a plan cap on services, and phone pairing needs a fifth service.
- **Your own hardware** keeps everything at home. Steer it to Tailscale: reaching a home server
  publicly needs router port forwarding, which isn't tested and which CGNAT can block.
- **Kubernetes** is a different install, so it stays, but as "Already run Kubernetes?", not an
  equal to a VPS: a team without a cluster should never pick it.
- **A local test** on the reader's machine, for trying Buzz out.
- No new platforms (Render, Fly.io, Coolify) until a tester asks: each is more to test and keep up.

## Public or private

A public relay is reachable from anywhere, but only added members can read or post, and files
need a member's signature. A private relay on Tailscale has no public address at all: two locks,
Tailscale for who reaches the server and Buzz for who's in the community. The cost: every device,
phones included, runs Tailscale (a paid seat per user past the free plan), an iPhone runs one VPN
at a time, the `ts.net` name is permanent (block/buzz#4952), and webhooks to tailnet addresses are
refused (block/buzz#6500). For a team that mostly uses phones, recommend public.

## Phones

- **Pairing works.** A member joins from Buzz Desktop, opens Settings, Mobile, and scans the QR
  code with the Buzz app. Block's bundles don't start the pairing service (block/buzz#7721), so the
  skill adds it. Tested with an iPhone on a VPS (public and private), Kubernetes and Railway; not
  yet on Kubernetes on a private network.
- **Push notifications don't**, on any self-hosted relay: the App Store app only takes pushes
  through Block's gateway (block/buzz#5206). The only path in progress is a self-built app plus
  your own gateway (block/buzz#7760). Android has no push at all yet (block/buzz#6092). Say so
  plainly: the app shows new messages while it's open.
- block/buzz#4198 stops only bare private addresses like `ws://10.0.0.1`. Tailscale names pass.

## Getting the skill

Lead with the standard installer, which puts the skill into Claude Code, Codex, Goose and 70-odd
other agents: `npx skills add Beige-Coffee/buzz-selfhost --skill self-host-buzz`. Keep the
download as a fallback. Later, propose the skill to block/buzz at `skills/self-host-buzz/` (the
installer finds a root `skills/` folder), with two separate contributions: the pairing fix for
block/buzz#7721, and a CI job that runs the local setup on every change to the bundle.

## Before testers get the link

In the site as of commit `18a5bee`:

- Kubernetes presented as "Already run Kubernetes?"
- The clouds under VPS, with the x86 catch
- `npx skills add` first
- Apache-2.0 license

Still to do:

- Label what isn't tested: a public home server (port forwarding), Railway with a custom domain,
  the chart's production profile, Buzz Desktop on Windows, phone pairing on Kubernetes on a
  private network.
- Say what it's built on: an Agent Skill in the open standard, validated with `skills-ref`, with a
  link to the repo and the license.
- Mark the site as a test version, not official Block documentation.
- A feedback path for testers (the owner picks the channel), and a short brief: use a throwaway
  server, push notifications aren't covered, expect rough edges.

## Copy and style

- Meta description: "You're a grown-up. Run your own Buzz server."
- No "promises" box and no "Tested on" line in the setup guides.
- No mentions of the Block engineering blog post the guide started from.
- No em dashes; avoid filler such as "just" and "simply".
