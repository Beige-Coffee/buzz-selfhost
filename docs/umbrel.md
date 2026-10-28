# Buzz on Umbrel

Status on 2026-10-26: a working Umbrel App Store package in [`umbrel/buzz/`](../umbrel/buzz/), on
relay `sha-9e8c9fc`. On 2026-10-23 it passed for Buzz 1.0 on umbrelOS 2.0 and 1.7, through an
update from the previous package, with both address options of the time. Since then the setup page
was rebuilt as a guided onboarding: its own sign-in, three ways for members to reach the community
(a private Tailscale network is new), a guarded address change, and phone notifications on by
default with a setting to turn them off. The rebuilt page passed real tests on Docker Desktop and
in a browser, but hasn't run on umbrelOS yet (see Not yet tested). Not yet submitted to Umbrel. It lives on this `umbrel` branch, not on `main`, until Umbrel accepts it.

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

- **Reaching the community is separate from joining it.** Every option keeps the community
  private: the relay requires membership, so only people the owner adds can read or post. The
  options differ in how members' apps reach the Umbrel.
  - **Your own domain (recommended):** Umbrel's Cloudflare Tunnel app connects the name to
    `http://buzz-gateway:80`, with no router ports opened. The page lists the public hostname's
    values with copy buttons, then checks DNS, the tunnel (Cloudflare's 1033 and 502 errors get
    their own hints), that the name reaches this Umbrel's relay and not another, and pairing. The
    owner can move the community to another server later and keep it. Cloudflare serves HTTPS, so
    it can read the traffic it carries, and its free plan refuses uploads over 100 MB, so the
    package caps uploads at 100 MB. A tunnel hides the home address, but Buzz is still reachable
    from the internet.
  - **A free Tailscale address:** the app's own Tailscale machine publishes the gateway to the
    internet with Tailscale Funnel, so members don't need Tailscale. Traffic passes through
    Tailscale encrypted and HTTPS ends on the Umbrel. The address belongs to the owner's Tailscale
    account, so a later move to their own domain starts a new community.
  - **Only devices on your Tailscale network (new):** the same machine, published to the tailnet
    alone with `tailscale serve`, with Tailscale's trusted certificate for the ts.net name. Nothing
    is reachable from the internet. Each member needs the Tailscale app on every device, access to
    the tailnet (an invite, or the `buzz` machine shared with them; port 443 allowed if the
    tailnet's access rules aren't the default), and Buzz membership. The page checks, from the
    browser, whether the device it's open on reaches Buzz.
- **The address is the community.** The relay keeps one community per address: at start it creates
  one for its address if there isn't one, and each request's Host picks the community. So an
  address the community hasn't used starts a separate, empty community, and the old messages, files
  and members stay stored and come back on switching back (tested locally, below). Buzz can't move
  a community to a new address yet ([block/buzz#4952](https://github.com/block/buzz/issues/4952));
  the package doesn't try, by SQL or otherwise. Moving to another server is different: with the
  same address and Buzz's data restored, the community comes along. The page explains this before
  setup and needs a tick to create; changing the address later needs the current address typed
  exactly and a tick. The Tailscale name is taken once, so a renamed machine never moves the
  community.
- **Its own sign-in.** The page asks for the app's password, which Umbrel shows the owner
  (`deterministicPassword`). Umbrel's login guards the page in a browser, but every app on an Umbrel
  shares one Docker network, and Umbrel's proxy passes on no identity the page could check, so
  without a password any app's container could post to the page and take the community over. A
  signed session cookie (HttpOnly, SameSite=Strict, 30 days, keyed per install in `exports.sh`)
  keeps the owner signed in. Ten wrong passwords in ten minutes from one address pause sign-in;
  behind Umbrel's proxy all browsers share that address. Browsers count another port on the same
  host as the same site and send it the cookie, so forms from another app's page are refused by
  their `Sec-Fetch-Site`, which doesn't depend on the Host Umbrel's proxy forwards. Anyone Umbrel
  shows the password to (its users, and agents given the app) can sign in.
- **Its own Tailscale machine, not Umbrel's Tailscale app.** Umbrel's Tailscale app offers other
  apps no interface: using it means `docker exec` into another app, which Umbrel's rules forbid
  (#5928 did this). So the package runs its own userspace Tailscale machine, `buzz`, with no extra
  privileges, only while a Tailscale option is chosen; choosing the domain stops it. Its state stays
  in the app's data. Reviewers may ask about a second Tailscale machine on an Umbrel that has the
  Tailscale app.
- **Buzz 1.0 needs HTTPS.** Buzz 1.0 joins only https and wss addresses, and phones pair through the
  relay's `pairing_relay_url`, a WebSocket that trusts public certificate authorities only.
  Cloudflare's certificate and Tailscale's Let's Encrypt certificate for ts.net names both qualify
  (pairing through Funnel passed on 2026-10-12 and 2026-10-23); a home-network name can't, so the
  page refuses `.local` and similar names. Only Buzz and pairing are published: the setup page,
  Umbrel and other apps stay off the public route.
- **Phone notifications are on by default**, as the skill does since 2026-10-23 (tested there on a
  public VPS): the relay wakes iPhones with the Buzz app 0.25 or later for direct messages and
  mentions, through Block's push service (`push.buzz.xyz`), which passes Apple a fixed "reconnect"
  signal, never a message. Block's service sees when a phone is woken, and the Umbrel's internet
  address, which a Cloudflare tunnel otherwise keeps from members. Umbrel owners can't set
  environment variables, so the page's Settings has the switch the skill gives as
  `BUZZ_PUSH_ENABLED=false`; the page writes it into the relay's settings, which win over the
  compose file's default. Android has no push yet (block/buzz#6092).
- **The relay's health and metrics ports** listen on every interface, with no setting to change it
  yet ([block/buzz#7989](https://github.com/block/buzz/issues/7989); the fix is
  [block/buzz#8004](https://github.com/block/buzz/pull/8004)). Other apps on Umbrel's network can
  read them: readiness, counters, the community's host name and reasons for refused sign-ins, but
  no messages, keys or secrets. Low risk, not none. Once #8004 lands, bind them to 127.0.0.1. The
  page doesn't use them: it checks readiness on the relay's main port and the community's NIP-11.
- **Setup page** (`setup.py.template`, Python's standard library in the official image), styled
  after the guide site: three steps (the owner, how members reach it, the acknowledgement), with
  the npub's checksum checked and a private key refused. Then a status list that refreshes every
  five seconds, and the steps for the chosen option: the Cloudflare values, or Tailscale's sign-in,
  machine approval and consent links. Once live: the join address, adding members, pairing phones
  (with Tailscale on, for the private option), and phone notifications. Settings: change the owner
  (the old one becomes an admin), turn phone notifications off or on, change the address, and how
  moving servers works. Umbrel's rules require a page like this for an app with no web interface of its
  own.
- **Relay:** waits for the settings, makes its own key on first start, and restarts itself when the
  settings change (it compares the file's content: two saves within a second share a modification
  time). The key is random, not derived from Umbrel's seed: Umbrel's rules forbid derived private
  keys.
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
- Then by hand with Buzz 1.0 on that address: the setup page handed the community to a person (the
  test owner became an admin), who joined from Buzz 1.0 and posted, made an invite link (a new
  test identity claimed it, joined and posted), and paired an iPhone from Settings, Pair mobile,
  which then posted.

2026-10-25, the rebuilt setup page, on a Mac without umbrelOS and at no cost
([log](../tests/runs/2026-10-25-1332-umbrel-setup-page-local.log)):

- **Real:** the package's own containers on Docker Desktop, run by
  [`tests/umbrel/local/`](../tests/umbrel/local/) with umbrelOS's container names, shared network
  and data ownership, but no Umbrel proxy, login or lifecycle. `check.py`, 39 of 39:
  - a request from another container on the shared network can't save settings or read status, and
    a form from another app's page is refused;
  - a wrong password is refused, the right one signs in;
  - setup refuses a missing acknowledgement, a bad npub and a home-network name, and the relay
    starts with the page's owner and address;
  - all of it survives a restart of every container;
  - a new owner makes the old one an admin;
  - an address change needs the current address typed and the tick, starts a separate community,
    and switching back brings the first one back, its admin included;
  - both Tailscale options reach a real sign-in link (nobody signed in), and choosing the domain
    stops Tailscale, which starts again when chosen again.
- **Real:** `e2e.sh`'s updated setup section (sign-in, acknowledgement, a request without the
  password refused) against the same kind of run, through a helper container standing in for
  umbrelOS: 6 of 6.
- **Real:** a browser walkthrough: sign-in, setup with the keyboard alone, the connecting screen,
  a guarded address change. It caught a bug: with `Referrer-Policy: no-referrer`, the browser sent
  the page's own forms as `Origin: null`, and the first version refused every sign-in. Fixed.
- **Mocked:** `render.py` renders 123 page states from the page's own code with the settings,
  Tailscale and network checks faked; `preview.py` serves the screens a local run can't reach
  without a sign-in (live, Funnel consent, private network, no tunnel) for screenshots.
- Umbrel's linter with image checks: only the PR link it requires at submission.

2026-10-26, phone notifications on by default, the same way ([log](../tests/runs/2026-10-26-1355-umbrel-push-local.log)): `check.py` 45 of 45, adding that
the relay offers notifications after setup, that turning them off restarts it without them and
survives an owner change, and that turning them on offers them again. No phone was involved.

## Not yet tested

- The rebuilt page on umbrelOS: forms and sign-in through Umbrel's proxy, where Umbrel shows the
  app's password, and an update from the previous package (the setup should carry over, with one
  sign-in).
- Tailscale past the sign-in with the rebuilt Tailscale service: Funnel turning on, and the private
  option end to end (a device on the tailnet joins, one off it can't, a phone pairs with Tailscale
  on). It needs a sign-in to a test tailnet. The service tells the two apart by `Funnel on` and
  `tailnet only` in `tailscale serve status`, which match v1.104.2's source but haven't been seen
  live.
- Phone notifications from an Umbrel install to a real iPhone (the local checks only see the relay
  offer them), and on the private option, where the phone fetches the message over Tailscale.
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
the ARM test ran on an Apple Silicon Mac. Umbrel then opens at http://localhost:8080 and its apps on
their own ports, on this computer only; `UMBREL_PUBLISH` changes the list, and empty publishes none,
for a second Umbrel beside the first. Another umbrelOS version runs beside the first: `UMBREL_CONTAINER=umbrelos-17 bash
tests/umbrel/install.sh 1.7.4`, then `e2e.sh` with the same `UMBREL_CONTAINER` and its own
`DOMAIN_FILE`.

`e2e.sh` starts a quick tunnel and prints the relay's address for joining from Buzz Desktop. The
address changes whenever the tunnel restarts, and with it the community, so it suits tests only.

The setup page on this machine, with no umbrelOS and no cost (Docker, and a Python with PyYAML for
`make.py`):

```bash
PYTHON=path/to/python bash tests/umbrel/local/up.sh   # the page at http://127.0.0.1:8090
python3 tests/umbrel/local/check.py                   # real checks; leaves the community set up
python3 tests/umbrel/local/render.py                  # mocked: every page state
python3 tests/umbrel/local/preview.py 8711 private-live   # mocked screens, one per port
bash tests/umbrel/local/down.sh                       # removes the run, data included
```

The local run's password is `local-test-only`. `check.py` expects a fresh run: `down.sh`, then
`up.sh`.

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
- umbrelOS 2.0 sends app ports to its sign-in gateway with an nftables `fib` rule, which Docker
  Desktop's kernel can't run: no app page opens, and `umbreld` logs "Failed waiting for app gateway".
  `install.sh` swaps in a rule that matches the container's network interfaces instead. Opening an
  app also needs port 2000, Umbrel's sign-in page for apps.
- `docker inspect <name>` also finds a volume of that name, so `install.sh` asks for the container.
- An install stuck on a failing service can't be uninstalled until its compose run is stopped.
- `buzz-admin add-member` takes the key with `--pubkey`.
- With `Referrer-Policy: no-referrer`, browsers send a page's own form posts with `Origin: null`.
- Browsers send a host's cookies to all its ports, and count another port as the same site, so
  SameSite=Strict doesn't stop another Umbrel app's page from posting this page's forms.
  `Sec-Fetch-Site: same-site` marks those posts.
