# Tests

These run the guide's commands for real and check the result end to end: members post and
read, a non-member is refused, files upload and download, and a backup survives losing the
server's data. Test identities are made on your laptop, so servers only see public keys.

You need the `buzz` CLI, built from block/buzz (about a minute):

```bash
git clone https://github.com/block/buzz.git && cd buzz
cargo build --release -p buzz-cli --bin buzz
```

## VPS path: `smoke.sh`

On a fresh Ubuntu 24.04 x86 server (4 GB) you can SSH into as root, with a domain that
resolves to it. `<ip>.sslip.io` works without any DNS setup, e.g. `203-0-113-10.sslip.io`.

```bash
BUZZ_CLI=path/to/buzz SSH_KEY=path/to/key bash tests/smoke.sh <server-ip> <domain> [image-tag [upgrade-tag]]
```

It installs with the guide's steps (`smoke-vps.sh install`), then from your laptop: the owner
creates a channel and posts, a member added by npub posts, a stranger is refused, a file goes
up and comes back intact. Then it backs up, deletes the checkout and the data volumes,
restores onto a fresh checkout, and checks that messages, the file, members, the relay's
identity and the community all came back. Last, it upgrades: to `upgrade-tag` if given, moving
the bundle and the image together the way the skill's operations.md says, and checks the same
things again. About 10 minutes.

## Practice path: `smoke-practice.sh`

The laptop path (`ws://127.0.0.1:3000`, no TLS), run on a Linux server that already has Docker,
and reached through an SSH tunnel on your own port 3000:

```bash
BUZZ_CLI=path/to/buzz SSH_KEY=path/to/key bash tests/smoke-practice.sh <server-ip> [image-tag]
```

## Private network: `smoke-private.sh`

The compose bundle on a server that's only on a Tailscale network: the relay bound to localhost,
`tailscale serve` for HTTPS, public ports checked closed. The member side runs from your machine,
which must be on the same tailnet. If your tailnet's access policy isn't the default, it needs a
grant that lets your devices reach port 443 (the guide's "Let your team reach it" step).

```bash
BUZZ_CLI=path/to/buzz SSH_KEY=path/to/key TS_AUTHKEY_FILE=path/to/authkey \
  bash tests/smoke-private.sh <server-ip> [machine-name] [image-tag]
```

## Kubernetes: `smoke-k8s.sh`

Block's Helm chart, quickstart profile, behind an ingress with a Let's Encrypt certificate. Needs a
cluster with an ingress class and a cert-manager ClusterIssuer (the guide's first Kubernetes step
adds Traefik and cert-manager), and a domain at the ingress; `<ip>.sslip.io` works.

```bash
KUBECONFIG=path/to/kubeconfig BUZZ_CLI=path/to/buzz bash tests/smoke-k8s.sh <domain> [image-tag]
```

## Logs

Each script saves what it prints to `runs/<date>-<time>-<setup>-<version>.log`, after `lib/redact.py`
masks anything shaped like a secret. `NO_LOG=1` turns that off. Commit the log with the results.

Agent test runs go in `runs/` too. Claude Code deletes a session's transcripts after 30 days, so copy
them out first:

```bash
python3 tests/lib/export-runs.py ~/.claude/projects/<project>/<session-id>
```

[runs/README.md](runs/README.md) lists every run.

## Railway

No script here yet. The steps and operations were run against projects made with
`railway deploy -t buzz-relay-block`, by hand on 2026-09-30 and by script on 2026-10-01.

## Results, 2026-10-05

Phone pairing, which the skill now adds to the compose bundle (block/buzz#7721):

- VPS: 85 of 85. Installed on `sha-d1b7da4`, then backed up, restored and upgraded to `sha-8746bfe`,
  with the pairing service checked after each.
- Private network: 52 of 52 on `sha-8746bfe`, the pairing service served by `tailscale serve`.
- An iPhone with the App Store app paired from Buzz Desktop on both relays and posted; the pairing
  service logged both pairings. The private one went over Tailscale, so block/buzz#4198 doesn't
  stop Tailscale names.

Logs: [runs/2026-10-05-1043-vps-sha-d1b7da4.log](runs/2026-10-05-1043-vps-sha-d1b7da4.log) and
[runs/2026-10-05-1043-private-sha-8746bfe.log](runs/2026-10-05-1043-private-sha-8746bfe.log).

## Results, 2026-10-01

Scripted, on relay `sha-bd0896f` unless noted:

- VPS: 54 of 54. Then 66 of 66 on `sha-83aab8c` with a real upgrade to `sha-16839a0`: messages,
  the file, members, the relay's identity and the community survived it.
- Local test: 24 of 24 on Linux, 9 of 9 on an Apple Silicon Mac with Docker Desktop.
- Private network: 40 of 40.
- Kubernetes: 21 of 21 on DigitalOcean Kubernetes, chart 0.1.10, Traefik and cert-manager.
- Kubernetes on a private network: 17 of 17, with Tailscale's operator 1.102 as the ingress, no
  load balancer, and every check run from a Mac over the tailnet.
- Railway: 10 of 10, backup and restore 5 of 5, members over Railway SSH 4 of 4.

The skill, cold: an agent given only the skill folder, on `sha-83aab8c` or newer.

- Public VPS twice (about 7 minutes each), Kubernetes (5), Kubernetes on a private network (6),
  local on a Mac (5), private network (9), and back up then upgrade a running relay (4). All
  passed; each run's notes went into the skill.
- Railway (4), once a deleted project made room under the account's service cap.

Buzz Desktop on macOS joined and posted on seven of these relays: two public VPS, the private
network, Kubernetes public and private, Railway and the local Mac.

Not yet tested: a custom domain on Railway, the chart's production profile, and port forwarding
on a home router.

Final pass on the finished text, the same evening, on `sha-d1b7da4`: an agent given only the
skill passed every setup again. A public VPS installed on `sha-83aab8c`, then was backed up and
upgraded (8 minutes); a private network, with the skill's auth-key command as written; Kubernetes
public (5) and private (4); local on a Mac (5); Railway (6), including adding a member over
Railway SSH once the user had confirmed its host key in a terminal. That member then posted, and
a stranger was refused.

## Results, 2026-09-30

- VPS: 54 of 54 on DigitalOcean droplets, relay `sha-53a1210`.
- The skill: four cold installs by an agent given only `SKILL.md`: two on a public server, one
  private, one on Kubernetes. Each found gaps, all since fixed, and each relay passed my checks.
- Practice: 23 of 23 on Linux. Docker Desktop on a Mac is not yet tested.
- Private network: 41 of 41, member checks over the tailnet from a Mac.
- Kubernetes: 21 of 21 on DigitalOcean Kubernetes 1.36, chart 0.1.10, Traefik and cert-manager.
- Railway: deploy, image update, members over `railway ssh`, backup, restore and upgrade.
  The custom-domain step is not yet tested.
- Buzz Desktop: joined the private (Tailscale) relay and posted, on macOS. Not yet tried on the
  other paths.
