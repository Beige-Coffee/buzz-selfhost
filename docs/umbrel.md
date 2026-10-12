# Buzz on Umbrel

Status on 2026-10-12: a working Umbrel App Store package in [`umbrel/buzz/`](../umbrel/buzz/),
tested end to end on umbrelOS 2.0, including Buzz Desktop and a phone. Not yet submitted to Umbrel.

## Why our own package

[getumbrel/umbrel-apps#5928](https://github.com/getumbrel/umbrel-apps/pull/5928) by Pavlenex (July
2026, untested on Umbrel, no review yet) was the starting point. We wrote a new package because
that one:

- turns on Tailscale Funnel by running `docker exec` in Umbrel's Tailscale app from a start hook,
  and Umbrel's rules say an app must not control Umbrel's Docker;
- uses a relay image from before phone pairing and the storage change, MinIO images Docker Hub no
  longer serves, and no pairing service;
- is a 247-line hook and a 486-line setup page to maintain, where Umbrel asks for small hooks.

Credit #5928 when we submit.

## How it works

- **Reaching it:** members connect through Umbrel's Cloudflare Tunnel app, on a domain the owner
  controls. Cloudflare decrypts the traffic, and its free plan refuses uploads over 100 MB, so the
  package caps the relay's uploads at 100 MB. A second option to weigh later: the app's own
  Tailscale node with Funnel, for owners without a domain (a random-looking `ts.net` address).
- **Setup page** (`setup.py.template`, Python's standard library in the official image): asks for
  the owner's public ID and the domain, checks the npub's checksum, refuses a private key, and
  writes the relay's settings. Then it shows whether the relay runs, whether the domain reaches it,
  and whether phones can pair, with the join, members and phone steps. Umbrel's rules require a
  page like this for an app with no web interface of its own.
- **Relay:** waits for the settings, makes its own key on first start, and restarts itself when the
  settings change. The key is random, not derived from Umbrel's seed: Umbrel's rules forbid
  derived private keys.
- **Gateway:** Caddy at `buzz-gateway:80` is what Cloudflare Tunnel points at. `/pair` goes to the
  pairing service, everything else to the relay.
- **Storage:** Silo, as in Block's bundle. Every image is pinned by digest and runs on Intel and ARM.
- **Names:** services reach each other by names without underscores (`buzz-silo`,
  `buzz-gateway`). Silo refuses a hostname with an underscore, like a container name, and a
  Cloudflare dashboard may too.

## Tested

2026-10-09, umbrelOS 2.0.0 in Docker on a DigitalOcean droplet, relay `sha-16eb0b6`, members
reaching it through a Cloudflare quick tunnel (no account or domain needed):

- Umbrel's linter passes with image checks, except the PR link it requires at submission.
- Installed through Umbrel; setup through the app's page, which also refused a bad public ID.
- `check-relay.sh` through Cloudflare: every line passed, phone pairing included.
- Members posted and read, a stranger was refused, and a file went up and came back intact.
- After Umbrel restarted the app: ready again, with the messages and the file.

[Log](../tests/runs/2026-10-09-1430-umbrel-cloudflare-quick-tunnel.log). The scripts are in
[`tests/umbrel/`](../tests/umbrel/).

2026-10-12, a fresh droplet, the same package: 19 of 19 again, then the owner's steps by hand. The
owner joined from Buzz Desktop, added a member by public ID in Settings, Invites (the relay records
the owner as having added it, and that member then posted), and paired an iPhone from Settings,
Mobile and posted from it ([log](../tests/runs/2026-10-12-1305-umbrel-desktop-and-phone.log)).

## Not yet tested

- Umbrel's Cloudflare Tunnel app with a real domain. It needs a Cloudflare account and a domain.
- Opening the app from Umbrel's home screen, which needs an Umbrel login.
- umbrelOS 1.7, an ARM device, and an update from one package version to the next.

## Before submitting

1. Run the untested steps above.
2. Set `submitter` and `submission` in `umbrel-app.yml`; the linter requires the PR link.
3. Settle `version`. The relay has no release, so it's the image's commit for now.
4. Copy the package into a fork of getumbrel/umbrel-apps and open the PR, crediting #5928.

## Testing again

```bash
python3 tests/umbrel/server.py up       # about $0.07 an hour while it exists
bash tests/umbrel/install.sh            # umbrelOS 2.0.0 in Docker, then the app through Umbrel
BUZZ_CLI=path/to/buzz OWNER_HEX=<the owner's hex key> bash tests/umbrel/e2e.sh
python3 tests/umbrel/server.py down     # deletes the droplet and its firewall
```

`e2e.sh` starts a quick tunnel and prints the relay's address for joining from Buzz Desktop. The
address changes whenever the tunnel restarts, and with it the community, so it suits tests only.

## Gotchas found while testing

- With `--network host`, Umbrel's own example, umbrelOS's NetworkManager takes over a cloud
  server's network card and the server drops off the network. `install.sh` uses Docker's bridge
  network and masks NetworkManager.
- `docker cp` can't see `/home/umbrel` inside the umbrelOS container; tar through `docker exec` can.
- An install stuck on a failing service can't be uninstalled until its compose run is stopped.
- `buzz-admin add-member` takes the key with `--pubkey`.
