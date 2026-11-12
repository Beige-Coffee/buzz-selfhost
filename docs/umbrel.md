# Buzz on Umbrel

Status on 2026-10-30: a working Umbrel App Store package in [`umbrel/buzz/`](../umbrel/buzz/), on
relay `sha-a38fedb`, the version the readiness review picked for launch. On 2026-10-23 it passed for Buzz 1.0 on umbrelOS 2.0 and 1.7, through an
update from the previous package, with both address options of the time. Since then the setup page
was rebuilt as a guided onboarding: its own sign-in, three ways for members to reach the community
(a private Tailscale network is new), a guarded address change, and phone notifications on by
default with a setting to turn them off. The rebuilt page passed real tests on Docker Desktop and
in a browser, and on 2026-10-28 ran on umbrelOS 2.0.0 on a Mac, where a community went live with
the free Tailscale address. On 2026-10-30, after a review of every screen's copy, it passed a
longer unattended run on Intel and ARM: a load, a reboot, Umbrel's own backup restored onto a fresh
Umbrel, and a reinstall. On 2026-11-01, for Umbrel's reviewers, Cloudflare's sign-in moved to a
folder of its own, four services got an init process, and the port moved to 3025; `pre-submit.sh`
then passed 96 of 96 on an Intel droplet. Submitted to Umbrel on 2026-11-01 as
[getumbrel/umbrel-apps#6291](https://github.com/getumbrel/umbrel-apps/pull/6291). On 2026-11-09,
after a red-team review (below), its fixes, Buzz 1.0's sign-in on the owner step and relay
`sha-744f394` went in, and `pre-submit.sh`, now attacking the app as another app on the Umbrel
would, passed 115 of 115 on an Intel droplet. On 2026-11-10 Umbrel's reviewer ran it on umbrelOS 2.0.1
(arm64), asked to drop `migrate()` and to delete Cloudflare's sign-in once it's set up, and suggested an
image for the setup page; Buzz 1.0 came out the same day. On 2026-11-11 all three went in, with relay
0.3.0, Block's first versioned release, the page's steps and drawings for Buzz 1.0, and safety tips on
the live page. `pre-submit.sh` passed 115 of 115 on an Intel droplet with the relay and the page's
image. It lives on this `umbrel` branch, not on `main`, until Umbrel accepts it.

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

- **It's the server, so it's listed as Buzz Relay,** as in #5928 and #5993; its app ID stays `buzz`.
  Members, the owner included, chat in Buzz Desktop and the iPhone app. Block ships no browser
  version to run on Umbrel: the relay's own web pages are invite pages and a code browser.
- **For Buzz 1.0 only.** The package ships once Buzz 1.0 is out, so the page names its menus and
  no others. Dropdowns show Buzz 1.0.0's own screens, drawn from its source (block/buzz-app
  v1.0.0): where to find the public ID, under the owner's field, and, once the community is live,
  how to join it, add members and pair a phone. Redraw them when Buzz's screens change. Buzz's
  next release already changes the invite dialog and drops adding members by public ID
  ([block/buzz-app#3147](https://github.com/block/buzz-app/pull/3147)), so the page leads with
  invite links.
- **Reaching the community is separate from joining it.** Every option keeps the community
  members-only: the relay requires membership, so only people the owner invites, and the agents they
  bring, can read or post. The
  options differ in how members' apps reach the Umbrel.
  - **Your own domain (recommended):** the owner types a name (`buzz` unless changed or cleared)
    and the domain in two boxes. The app's own Cloudflare tunnel connects the name to
    `http://buzz-gateway:80`, with no router ports opened. The owner signs in to Cloudflare from
    the page with `cloudflared tunnel login` and chooses the domain; the `cloudflared` service then
    creates a tunnel, adds the name to the domain's DNS (refusing a name that already has a
    record, and catching a domain chosen wrong), and runs it. The tunnel token stays in
    `data/cloudflare`, which no other service mounts. The sign-in certificate (`cert.pem`) can
    create, route and delete tunnels in the owner's account, so the service deletes it once the
    name is routed, and Umbrel's backups skip its folder; changing the address later asks for a new
    sign-in (asked for in Umbrel's review). Its image is the connector of
    Umbrel's Cloudflare Tunnel app (Radiokot/umbrel-cloudflared), Alpine with Cloudflare's own
    `cloudflared`; the official image has no shell to wait in, so it would restart every minute
    until set up. With another option chosen, the service waits. Owners who already run Umbrel's
    Cloudflare Tunnel app can point a public hostname at the same address instead. The page then
    checks DNS, the tunnel (Cloudflare's 1033 and 502 errors get their own hints), that the name
    reaches this Umbrel's relay and not another, and pairing. The owner can move the community to
    another server later and keep it. Cloudflare serves HTTPS, so
    it can read the traffic it carries, and its free plan refuses uploads over 100 MB, so the
    package caps files and videos at 100 MB, in every option for one rule (images stop at Buzz's
    own 50 MiB). Git pushes keep Buzz's 500 MB, so a push over 100 MB fails at Cloudflare with its
    own error page; capping it needs `BUZZ_GIT_MAX_PACK_BYTES` and `BUZZ_GIT_MAX_REPO_BYTES`
    together, since the repo limit defaults to twice the push limit. Left for later. A tunnel hides
    the home address, but Buzz is still reachable from the internet.
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
  same address and Buzz's data restored, the community comes along. On Umbrel, its own backup
  restored onto another Umbrel did that (tested on 2026-10-30, below); the page offers no move of its
  own. The page explains this before setup and needs a tick to create; changing
  the address later needs the current address typed exactly, or a tick when there's none yet. The
  Tailscale name is taken once, so a renamed machine never moves the community. On a domain, the
  gateway answers only the current address, so an old address that still points at the tunnel
  reaches nothing until the owner switches back to it.
- **Its own sign-in.** The page asks for the app's password, which Umbrel shows the owner
  (`deterministicPassword`). Umbrel's login guards the page in a browser, but every app on an Umbrel
  shares one Docker network, and Umbrel's proxy passes on no identity the page could check, so
  without a password any app's container could post to the page and take the community over. A
  signed session cookie (HttpOnly, SameSite=Strict, 30 days, keyed per install in `exports.sh`)
  keeps the owner signed in. Ten wrong passwords in ten minutes from one address pause sign-in;
  behind Umbrel's proxy all browsers share that address. Browsers count another port on the same
  host as the same site and send it the cookie, so forms from another app's page are refused by
  their `Sec-Fetch-Site`, which doesn't depend on the Host Umbrel's proxy forwards, and no response
  can be shown inside another page. Forms over 20 KB are refused before they're read, an idle
  connection is dropped after 20 seconds, and without a password no session is valid. Anyone Umbrel
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
- **Members' agents** get in through their owner (owner attestation, `BUZZ_ALLOW_NIP_OA_AUTH`, set
  as in Block's compose example). Buzz 1.0 never adds an agent as a member, so without it no agent
  could join, the owner's own included. Most agents made in Buzz 1.0 act only on their owner's
  mentions, but they run on that person's computer without approval prompts and read what others
  post. So the live page's tips say to treat a community anyone can join as public and to keep
  agents on personal computers out of it.
- **The relay's health and metrics ports** listen on every interface, with no setting to change it
  yet ([block/buzz#7989](https://github.com/block/buzz/issues/7989); the fix is
  [block/buzz#8004](https://github.com/block/buzz/pull/8004)). Other apps on Umbrel's network can
  read them: readiness, counters, the community's host name and reasons for refused sign-ins, but
  no messages, keys or secrets. Low risk, not none. Once #8004 lands, bind them to 127.0.0.1. The
  page doesn't use them: it checks readiness on the relay's main port and the community's NIP-11.
- **Setup page** ([`umbrel/setup-page/setup.py`](../umbrel/setup-page/), Python's standard library)
  in its own image, `ghcr.io/beige-coffee/buzz-umbrel-setup`. The
  [workflow](../.github/workflows/umbrel-setup-page.yml) runs the page's tests on every push and,
  from a tag `umbrel-setup-vX.Y.Z`, builds it for Intel and ARM with build provenance; the package
  pins it by digest. Umbrel's review suggested the image: the store package stays small, and the
  page keeps its tests and CI here. Styled after the guide site: three steps (the owner, how
  members reach it, the acknowledgement), with the npub's checksum checked and a private key
  refused. The owner step points new owners to a key of their own, made with an open-source tool
  such as nak or a Nostr app, and brought into Buzz with Other options, then Use an existing key,
  as nsec1 (nak prints hex; the page says to convert it with `nak encode nsec`). Buzz 1.0 on a
  computer otherwise makes a key only with a Builderlab account (Block's, which keeps a backup
  Block can decrypt). New owners wait to set up Buzz until the community is live: first run's
  Connect to a community page has no skip, so a Buzz set up first can't reach Settings to copy
  its Buzz ID. Owners who already use Buzz with Builderlab can use that
  Buzz ID. Either way the page takes only the public ID, and Change the owner is the way back
  from a lost key. Then a status list that refreshes every
  five seconds, and the steps for the chosen option: the Cloudflare values, or Tailscale's sign-in,
  machine approval and consent links. Once live: the join address, with an Open in Buzz button
  (`buzz://connect?relay=wss://…`, Buzz 1.0's link that opens its join screen with the address filled
  in, as Pavlenex's package did), adding members, pairing phones
  (with Tailscale on, for the private option), phone notifications, and collapsed tips for keeping
  a community safe, most of all one anyone can join. Settings: change the owner
  (the old one becomes an admin), turn phone notifications off or on, change the address, and how
  moving servers works. Umbrel's rules require a page like this for an app with no web interface of its
  own.
- **Relay:** waits for the settings, makes its own key on first start, and restarts itself when the
  settings change (it compares the file's content: two saves within a second share a modification
  time). The key is random, not derived from Umbrel's seed: Umbrel's rules forbid derived private
  keys. It reads its settings as plain KEY=value lines, and only the names the page writes, never
  as a script, so nothing in the file can run a command or turn off the relay's checks. Routine
  access lines name members on every request, so they're logged at `warn` only: refusals, errors
  and aborted requests. Relay 0.3.0 changes the database at its first start (migrations 0084 to
  0086), and an older relay then refuses it, so an update to 0.3.0 can't be undone.
- **Gateway:** Caddy at `buzz-gateway:80` is what Cloudflare Tunnel and Tailscale point at. `/pair`
  goes to the pairing service, everything else to the relay. On a domain it answers only the
  community's current address, read from the relay's settings, and starts again when they change,
  since Caddy's admin API stays off; on a Tailscale address it answers every request. Request
  headers must arrive within 10 seconds.
- **Settings folders:** `data/settings` holds the relay's settings and the page's own; only the page
  writes it, and the relay and the gateway read it. The page shares `data/tailscale-control` with the
  Tailscale service and `data/cloudflare-control` with the Cloudflare service, one each, for the
  option chosen and what each reports back. So neither can change the relay's settings, and the
  relay doesn't see Tailscale's list of the tailnet's devices. `data/cloudflare` (Cloudflare's
  sign-in), `data/tailscale` (Tailscale's state) and `data/secrets` (the relay's key) belong to one
  service each.
- **Storage:** Silo, as in Block's bundle. Every image is pinned by digest and runs on Intel and ARM.
- **Names:** services reach each other by names without underscores (`buzz-silo`,
  `buzz-gateway`). Silo refuses a hostname with an underscore, like a container name, and a
  Cloudflare dashboard may too.
- **Stopping:** the page, gateway, relay, pairing and Tailscale services run with `init: true`. Python and
  the pairing service ignore Docker's stop signal as a container's first process, so without it
  each stop waited out Docker's 10 seconds.
- **Uninstalling** removes the app's data from the Umbrel, but not what it made in the owner's
  accounts: the Cloudflare tunnel and DNS name, or the `buzz` machine in Tailscale. Installing again
  then finds the name taken, or Tailscale names the new machine `buzz-1`. The App Store description
  says to remove them first.
- **Support** in the listing points at this repo's issues, since we maintain the package; Buzz's
  own bugs go on to Block.

## Security review

On 2026-11-09 three reviewers attacked the package as it was: the setup page, the settings files and
containers, and what the internet can reach. No stranger could read or post anything. Fixed then:

- The relay read its settings by running the file as a script, and the Tailscale and Cloudflare
  services could write it. A compromised helper, or a crafted Tailscale machine name, could have run
  commands in the relay or turned its checks off. Now the relay reads plain values from a list of
  names, each helper has its own folder, and the page checks Tailscale's name and links.
- An old domain kept serving its community to its members after an address change, while the page
  said the community was parked. Now the gateway answers only the current address.
- The page read a request of any size, kept idle connections open, could be shown inside another
  app's page (where a few clicks could have switched a private community to a public address), and
  would have accepted a forged session had its password ever been unset.
- A free Tailscale address still waiting for the owner to allow Funnel could turn Funnel on after
  the owner switched to the private network. Now the switch drops the waiting request and its link.
- The relay's routine access logs, at our log level, named members on every request.

Left, with the reason:

- The Tailscale service still runs as root in its container. It has no extra privileges and sees
  only its own folders; running it as another user needs a real Tailscale sign-in to test.
- The relay uses Silo's root credentials; a user limited to its bucket can come later.
- Signing out doesn't end other copies of the same session; sessions expire after 30 days.
- A member can fill the Umbrel's disk with uploads: Buzz has no per-member storage limit yet.

On 2026-11-11, from Umbrel's review: Cloudflare's sign-in (`cert.pem`, an account-wide API token,
with the tunnel's credentials file) is deleted once the name is routed, and Umbrel's backups skip
its folder. Deleting the file doesn't revoke the token: it stays in the owner's Cloudflare profile
(My Profile, API Tokens) until deleted there.

What the live page's safety tips state, from Buzz 1.0.0 and relay 0.3.0: in the relay's default
media mode any member with a file's link can open it, one from a private channel included
([block/buzz#9077](https://github.com/block/buzz/pull/9077) adds an enforce mode, off by default);
invite links last 3 days with no use limit by default, 30 days at most, and can't be canceled;
removing a member isn't a ban, and Buzz 1.0 offers the owner of a self-hosted community no ban.

`tests/umbrel/local/security.py` checks the fixes on a Mac without Docker,
`tests/umbrel/local/cloudflare.py` runs the Cloudflare service's script with a stand-in
`cloudflared`, and `pre-submit.sh` tries the app's services as another app on the Umbrel would.

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

2026-10-28, umbrelOS 2.0.0 in Docker Desktop on an Apple Silicon Mac (`UMBREL_LOCAL=1`), relay
`sha-9e8c9fc` on its ARM image:

- Installed through Umbrel. Opening the app, Umbrel showed its password under Default
  credentials, and the page's forms and sign-in worked through Umbrel's proxy.
- By hand: setup with the free Tailscale address. The owner signed in to Tailscale from the
  page's link, Funnel turned on (`Funnel on` seen live in `tailscale serve status`), and the page
  went live: the relay answered at the ts.net address from the internet, and pairing was reachable.
- Found and fixed: Docker Desktop's kernel can't run umbrelOS 2.0's nftables `fib` rule, so no app
  page opened (see Gotchas); and the connecting page kept showing "Starting Tailscale" after
  Tailscale had its sign-in link, until a reload.
- After the page's redesign (drawn how-tos for joining, members and phones, a shorter address
  change, plainer words): `check.py` 45 of 45 on Docker Desktop without umbrelOS
  ([log](../tests/runs/2026-10-28-1437-umbrel-dropdowns-local.log)), and 243 page states rendered.
- By hand, your own domain with the app's own Cloudflare tunnel, after an update that added it: the
  owner signed in to Cloudflare from the page's link and chose a new domain; the service created
  the tunnel and the name, and the page went live: the relay answered at the domain from the
  internet, and pairing was reachable. Then the owner joined from Buzz Desktop and paired an
  iPhone; with the phone locked, a direct message and a mention from a second identity each
  showed up as a notification, and Block's push service accepted both wake-ups.
- By hand, the private option: switched from the domain, it went live on the tailnet, and
  `tailscale serve status` showed `(tailnet only)` live for the first time. Through Tailscale's
  public entry point the name is refused. The owner joined from Buzz Desktop on the tailnet and
  paired an iPhone with Tailscale on; with the phone locked, a direct message and a mention each
  showed up as a notification, the message fetched over Tailscale. With Tailscale off, the phone
  couldn't connect.
- Moved to relay `sha-a38fedb`, the launch version the readiness review picked: `check.py` 48 of 48
  ([log](../tests/runs/2026-10-28-1610-umbrel-a38fedb-local.log)), and an update on umbrelOS kept the private
  community, its members and notifications (Block's push service accepted a mention's wake-up).
- Intel, unattended with `droplet-run.sh`: umbrelOS 2.0.0 in Docker on a DigitalOcean droplet
  (x86_64), relay `sha-a38fedb` and the other images on their Intel builds. Installed through Umbrel;
  `e2e.sh` 36 of 36 (setup through the page and its sign-in, members, a stranger refused, files,
  invites, Buzz 1.0's New chat with an agent, and a restart through Umbrel); the app's Cloudflare
  tunnel and both Tailscale options up to their sign-in links, 6 of 6
  ([log](../tests/runs/2026-10-28-1656-umbrel-intel-droplet.log)). A run before it failed in Umbrel's own
  app environment step, on the first install; the script now saves Umbrel's log and retries once.

2026-10-30, unattended, before the PR: relay `sha-a38fedb` with the reviewed copy, on Intel
(umbrelOS 2.0.0 in Docker on a DigitalOcean droplet) and ARM (umbrelOS 2.0.0 in Docker Desktop on an
Apple Silicon Mac) ([Intel log](../tests/runs/2026-10-30-1130-umbrel-intel-droplet-confidence.log),
[ARM log](../tests/runs/2026-10-30-1130-umbrel-arm-local-confidence.log)). These checks ran as
one-off scripts; they're now [`pre-submit.sh`](../tests/umbrel/pre-submit.sh), which passed 85 of 85 on
the Mac's umbrelOS ([log](../tests/runs/2026-10-30-1333-umbrel-pre-submit-arm-local.log)). Its restart
and restore run only on a droplet, and first ran in script form on 2026-11-01.

- Installed through Umbrel, then `e2e.sh` 36 of 36 on both.
- Memory, the app's containers together: about 130 MiB on Intel and 180 MiB on ARM installed but not
  set up, 230 and 300 MiB with a community. On Intel, 20 members sent 200 messages, ten at a time,
  in 23 s, every one read back, and memory, sampled during and after, stayed under 330 MiB. App
  data: 72 MB.
- Files: a 20 MB image went up in 4 s. Images stop at 50 MiB, Buzz's default; its CLI refuses a
  101 MB image before sending. On ARM, a real 96 MB video went up through Cloudflare in 12 s and
  another member downloaded it intact, with memory under 340 MiB; one of 100.5 MB was refused by
  the relay, at the package's 100 MB limit for videos and files. Buzz takes only H.264 MP4 videos
  without metadata, as its apps make them.
- The community's public address shows only the relay: the setup page's paths answer 404.
- No setting's secret value shows up in the app's container logs, on either chip.
- Restarting the whole Umbrel: back in 25 s, every table and the setup the same.
- Umbrel's own backup, to a network share, restored onto a fresh umbrelOS 2.0.0 that was never set
  up: the backup took 8 s. After the restore, the new Umbrel started Buzz on its own, with every
  table as at backup time, the same setup, the relay serving the community's address, and the
  stored 20 MB file byte for byte the same. Umbrel copies Postgres's files while it runs, so
  Postgres recovered on its first start, as after a power cut, with no errors.
- Uninstalling removed the app's data. Installing again started at a fresh setup page, and `e2e.sh`
  passed 36 of 36 on it.
- In the test setup only: umbrelOS in Docker on a droplet uses Ubuntu's kernel, which needs
  `linux-modules-extra` before Umbrel can mount a network share.

2026-11-01, unattended, after three changes for Umbrel's reviewers (Cloudflare's sign-in in its own
folder, `init: true`, port 3025): `pre-submit.sh` on a fresh DigitalOcean droplet (Intel), relay
`sha-a38fedb`, passed 96 of 96 ([log](../tests/runs/2026-11-01-0937-umbrel-pre-submit-intel-droplet.log)).

- Cloudflare's sign-in folder is mounted by its own service alone, the page, relay, pairing and
  Tailscale services run under an init process, and the page stops in under a second.
- `e2e.sh` 36 of 36, before and after a reinstall. Memory with a community: 237 MiB.
- Restarting the whole Umbrel: back in 25 s, every table and the setup the same. Umbrel's backup
  took 14 s; the second Umbrel ran Buzz from it after 85 s, with every table, the setup and the
  stored files the same.
- ARM wasn't run again: none of the three changes depends on the chip, and every image is the one
  that passed 85 of 85 on ARM on 2026-10-30.

2026-11-09, unattended, after the red-team review's fixes, Buzz 1.0's sign-in on the owner step, and
relay `sha-744f394`: `pre-submit.sh` on a fresh DigitalOcean droplet (Intel) passed 115 of 115
([log](../tests/runs/2026-11-09-0954-umbrel-pre-submit-intel-droplet.log)).

- Another app's container on Umbrel's network, with no password or key: the setup page answered
  only its sign-in, refused a bad-length request at once and 20 half-sent ones after its time limit;
  the relay refused a request claiming the owner's key in a header; the gateway answered nothing
  for another name; file storage, the database and Redis refused it. The relay's metrics port
  answered, with counts only (block/buzz#8004).
- Lines added to the relay's settings, a command and a setting that would turn off membership
  checks, ran nothing and changed nothing; the relay came back with the page's own settings.
- Each settings folder is mounted where it should be and nowhere else, and the relay can't see
  Tailscale's status. Cloudflare's and Tailscale's sign-in links, and the switch to the private
  network, still work.
- `e2e.sh` 36 of 36 before and after a reinstall. Memory: 128 MiB before setup, 295 MiB with a
  community, 366 MiB while 20 members sent 200 messages in 24 s. A 96 MB video went up in 14 s.
  Restarting the whole Umbrel: back in 28 s. Umbrel's backup took 15 s, and the second Umbrel ran
  Buzz from it after 87 s with every table, the setup and the stored files the same.
- Not run again on ARM: the changes are in scripts, the page and the gateway's config, none of them
  chip-specific, and the new relay image is built for both.

2026-11-11, unattended, after Umbrel's review (no `migrate()`, Cloudflare's sign-in deleted once
routed), relay 0.3.0 and the setup page in its own image, `ghcr.io/beige-coffee/buzz-umbrel-setup:1.0.0`
pinned by digest: `pre-submit.sh` on a fresh DigitalOcean droplet (Intel) passed 115 of 115
([log](../tests/runs/2026-11-11-2129-umbrel-pre-submit-intel-droplet.log)).

- Umbrel installed the app with the page's image from GitHub's registry. The page signed in with the
  app password and saved the owner and domain; the attacks from another app's container got the same
  answers as on 2026-11-09.
- `e2e.sh` 36 of 36 before and after a reinstall, on relay 0.3.0 with its new migrations. Memory:
  128 MiB before setup, 305 MiB with a community, 388 MiB while 20 members sent 200 messages in 23 s.
  A 96 MB video went up in 16 s. Restarting the whole Umbrel: back in 25 s. Umbrel's backup took
  13 s, and the second Umbrel ran Buzz from it after 81 s with every table, the setup and the stored
  files the same.
- Before it: the page's local tests (291 page states, 28 security checks, 37 Cloudflare checks with
  a stand-in `cloudflared`) on this Mac and in GitHub Actions, and the published image served the
  page on this Mac, as user 1000, from the tagged `setup.py`.
- Not run again on ARM: the image is built for both chips and the page is the same Python file.
  Umbrel's reviewer ran the previous round on ARM (umbrelOS 2.0.1).

## Not yet tested

- An update from the previous package on umbrelOS: the setup should carry over, with one sign-in.
- The new Cloudflare steps against a real account (deleting the sign-in once routed, a new
  sign-in after an address change): so far only with a stand-in `cloudflared`.
- Relay 0.3.0's migration 0086 on a large database on slow ARM storage: it builds an index with a
  5-second limit, and the relay won't start if that runs out.
- A real Raspberry Pi: ARM itself passed on a Mac, but not the Pi's slower processor and storage.
  Umbrel asks for the chip type to be tested, not a particular device.

## Submitted

[getumbrel/umbrel-apps#6291](https://github.com/getumbrel/umbrel-apps/pull/6291), opened on 2026-11-01 from the fork
`Beige-Coffee/umbrel-apps`, branch `add-buzz-relay`, which holds only `buzz/`. Umbrel's linter
found no issues once the PR link was set. To change the PR, change the package here, copy
`umbrel/buzz/` over the fork's `buzz/` without `__pycache__`, run
`npm run lint:apps -- buzz --check-images` there, and push. The setup page isn't in the PR: to
change it, push a tag `umbrel-setup-vX.Y.Z`, then pin the new image's digest in
`docker-compose.yml`. Nate Fretz (nmfretz) reviewed it on 2026-11-10 and holds his own end-to-end
test, with real Cloudflare and Tailscale accounts, until we say the PR is final. The PR credits #5928 and says how it
differs from [#5993](https://github.com/getumbrel/umbrel-apps/pull/5993).

## Testing again

```bash
python3 tests/umbrel/server.py up       # about $0.07 an hour while it exists
bash tests/umbrel/install.sh            # umbrelOS 2.0.0 in Docker, then the app through Umbrel
BUZZ_CLI=path/to/buzz OWNER_HEX=<the owner's hex key> bash tests/umbrel/e2e.sh
BUZZ_CLI=path/to/buzz MEMBER_KEYS=<a member's key file> bash tests/umbrel/update.sh <tag> <digest>
python3 tests/umbrel/server.py down     # deletes the droplet and its firewall
```

Or all of it, unattended, deleting the droplet at the end: `BUZZ_CLI=path/to/buzz bash
tests/umbrel/droplet-run.sh`. The droplet gets the test SSH key at first boot when the key isn't on
the DigitalOcean account.

Before a submission or an update to it, the longer test, also unattended on a droplet:
`BUZZ_CLI=path/to/buzz bash tests/umbrel/pre-submit.sh`. Beyond `e2e.sh` it measures memory, runs a
load of 20 members, sends a 20 MB image and a real 96 MB video (with ffmpeg on this machine) and
checks the size limits, checks what the public address shows and the logs for secrets, restarts
the whole Umbrel, restores Umbrel's own backup onto a second umbrelOS, and reinstalls. With
`UMBREL_LOCAL=1` it runs on this machine's umbrelOS, without the restart and the restore.

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
`up.sh`. The local run serves the page from this checkout on the image's own base, so it tests
edits before any image is published; the droplet runs use the published image.

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
- On a Mac that's on the tailnet, umbrelOS in Docker Desktop reaches tailnet names through the Mac,
  so it can't stand in for a device off the tailnet. A phone with Tailscale off can.
- With a new domain, the page's own checks, made before the name existed, left this Umbrel's
  resolver holding "no such name" for up to half an hour after Cloudflare published it. The checks
  now look names up through Cloudflare's public DNS, and reach the address it gives.
- Buzz's command-line tool tags nobody unless asked: a direct message it sends wakes no phone
  without `--mention`, since a phone registers for messages that tag it.
- macOS keeps the "no such name" from a lookup made before a new domain existed, and Buzz Desktop
  can't join until it's cleared: `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder`,
  or a wait. The page says to try again in a few minutes.
- An update copies an app's compose file and templates, not new data folders, so a service added
  in a later update has to keep its files in a folder that already exists. Before the first
  submission, the Cloudflare service moved out of `settings/cloudflare` into a folder of its own.
- The manifest's port must be unique in the store, and Umbrel's linter checks only what's merged.
  3024 was free there but claimed by an open submission
  ([#5907](https://github.com/getumbrel/umbrel-apps/pull/5907)), so the app moved to 3025, free
  on master and in every open pull request on 2026-11-01.
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
