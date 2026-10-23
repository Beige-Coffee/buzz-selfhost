# Buzz on Umbrel

Status on 2026-10-23: a working Umbrel App Store package in [`umbrel/buzz/`](../umbrel/buzz/), on
relay `sha-9e8c9fc`, retested for Buzz 1.0 on umbrelOS 2.0 and 1.7, through an update from the
previous package, with both address options. Not yet submitted to Umbrel. It lives on this `umbrel` branch, not on
`main`, until Umbrel accepts it.

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

- **The address, two options.** The address is permanent: Buzz can't change a community's
  address yet ([block/buzz#4952](https://github.com/block/buzz/issues/4952)), so a different address
  later starts a new, empty community. The setup page says so before anything starts.
  - **Your own domain (recommended):** routed here by Umbrel's Cloudflare Tunnel app. The owner can
    move the community to another server later and keep it. Cloudflare decrypts the traffic, and its
    free plan refuses uploads over 100 MB, so the package caps the relay's uploads at 100 MB.
  - **Free Tailscale address (to try it out):** the app's own Tailscale machine, published with
    Tailscale Funnel, so members don't need Tailscale. It stays the same until the owner changes it,
    but it belongs to their Tailscale account and can't become their own domain later, so Save
    stays disabled until they tick a box that says so. The machine runs in userspace (no extra
    privileges) and never touches Umbrel's own Tailscale app.
- **Setup page** (`setup.py.template`, Python's standard library in the official image): asks for
  the owner's public ID and the address, checks the npub's checksum, refuses a private key, and
  writes the relay's settings. For the Tailscale address it shows Tailscale's sign-in link, then
  Tailscale's link to turn on Funnel, and takes the machine's address once it's signed in (only
  once: a renamed machine never moves the community). Then it shows whether the relay runs,
  whether the address reaches it, and whether phones can pair, with the join, members and phone
  steps. Umbrel's rules require a page like this for an app with no web interface of its own.
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

2026-10-12, both address options on a fresh droplet ([log](../tests/runs/2026-10-12-1550-umbrel-two-address-options.log)):
the own-domain path 19 of 19; then the same install switched to the free Tailscale address. The
owner signed in with the page's link and turned Funnel on with Tailscale's link, and the address
answered publicly within 15 seconds. 17 of 17 through it, including a restart through Umbrel that
kept the address, the messages and the file. The owner then joined from Buzz Desktop at the
Tailscale address and paired an iPhone without Tailscale on it; both posted.
Then, the same day:

- The owner opened the app from Umbrel's home screen, behind Umbrel's login: the setup page showed
  all three checks green and the join address. The home screen shows a placeholder icon, since
  Umbrel adds icons from its own assets repo.
- Updating through Umbrel: the package moved to relay `sha-30873ba` under a new manifest version,
  and the message, the file, the settings and the member from before all survived, 12 of 12
  ([log](../tests/runs/2026-10-12-1350-umbrel-update.log)).
- umbrelOS 1.7.4, beside the 2.0 install on the same droplet: 19 of 19
  ([log](../tests/runs/2026-10-12-1405-umbrel-os-1.7.log)).
- ARM: umbrelOS 2.0.0's arm64 image in Docker Desktop on an Apple Silicon Mac, the relay on its arm64
  image: 19 of 19 ([log](../tests/runs/2026-10-12-1450-umbrel-arm64-mac.log)). Docker Desktop needed
  nothing beyond `install.sh`'s bridge network and masked NetworkManager.

2026-10-23, for Buzz 1.0 ([log](../tests/runs/2026-10-23-1539-umbrel-buzz-1.0-retest.log)). Buzz 1.0
([block/buzz-app](https://github.com/block/buzz-app), beta) needs channel labels (`nip-cl`) for New
chat, which relay images have from 2026-10-15, so the package moved from `sha-16eb0b6` to
`sha-9e8c9fc`; the setup page now names Buzz 1.0's menus, with Buzz 0.X's noted. With a test owner,
so the owner-side checks run:

- Updating through Umbrel from the previous package: the message, the file and the member from
  before survived, and the relay then had its identity and channel labels, 14 of 14. (The first
  try failed 5 checks because the test posted before the relay had restarted after setup;
  `update.sh` now waits.)
- The full test on that updated install, 31 of 31: the relay checks, members, a file, invite links
  (the owner makes one, a member can't, a new identity joins with it and posts), Buzz 1.0's New
  chat with an agent admitted through its owner, and a restart.
- umbrelOS 1.7.4, a fresh install: 33 of 33.
- The free Tailscale address on the updated install: 31 of 31. The owner signed in with the page's
  link; Funnel was still allowed on the tailnet from the earlier test.

## Not yet tested

- Buzz 1.0 by hand against the package: joining, an invite link, and pairing a phone (Settings,
  Pair mobile). The scripted checks cover the relay's side of each.
- Umbrel's Cloudflare Tunnel app with a real domain. It needs a Cloudflare account and a domain.
- ARM on relay `sha-9e8c9fc`. The image is built for ARM; the package's ARM run was on `sha-16eb0b6`.
- A real Raspberry Pi: ARM itself passed on a Mac, but not the Pi's slower processor and storage.
  Umbrel asks for the chip type to be tested, not a particular device.

## Before submitting

1. Run the untested steps above.
2. Set `submitter` and `submission` in `umbrel-app.yml`; the linter requires the PR link.
3. Settle `version`. The relay has no release, so it's the image's commit for now.
4. Copy the package into a fork of getumbrel/umbrel-apps and open the PR, crediting #5928 and
   [#5993](https://github.com/getumbrel/umbrel-apps/pull/5993), a second submission (Aug 15, no
   review). Neither has been reviewed or updated since August.

## Testing again

```bash
python3 tests/umbrel/server.py up       # about $0.07 an hour while it exists
bash tests/umbrel/install.sh            # umbrelOS 2.0.0 in Docker, then the app through Umbrel
BUZZ_CLI=path/to/buzz OWNER_HEX=<the owner's hex key> bash tests/umbrel/e2e.sh
BUZZ_CLI=path/to/buzz MEMBER_KEYS=<a member's key file> bash tests/umbrel/update.sh <tag> <digest>
python3 tests/umbrel/server.py down     # deletes the droplet and its firewall
```

`UMBREL_LOCAL=1` runs the same scripts on this machine's Docker instead of the droplet, which is how
the ARM test ran on an Apple Silicon Mac. Another umbrelOS version runs beside the first: `UMBREL_CONTAINER=umbrelos-17 bash
tests/umbrel/install.sh 1.7.4`, then `e2e.sh` with the same `UMBREL_CONTAINER` and its own
`DOMAIN_FILE`.

`e2e.sh` starts a quick tunnel and prints the relay's address for joining from Buzz Desktop. The
address changes whenever the tunnel restarts, and with it the community, so it suits tests only.

## Gotchas found while testing

- The Tailscale image's own startup, containerboot, gives an interactive sign-in 60 seconds, then
  restarts with a new link, so a sign-in that takes longer never sticks. The package starts
  `tailscaled` and `tailscale up` itself, which wait with no time limit.
- `tailscale funnel` on a network without Funnel prints a one-click consent link
  (`https://login.tailscale.com/f/funnel?node=<ID>`), waits, and finishes on its own once the owner
  turns Funnel on. The setup page shows that link.

- With `--network host`, Umbrel's own example, umbrelOS's NetworkManager takes over a cloud
  server's network card and the server drops off the network. `install.sh` uses Docker's bridge
  network and masks NetworkManager.
- `docker cp` can't see `/home/umbrel` inside the umbrelOS container; tar through `docker exec` can.
- An install stuck on a failing service can't be uninstalled until its compose run is stopped.
- `buzz-admin add-member` takes the key with `--pubkey`.
