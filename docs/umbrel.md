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
0.3.0, Block's tagged release, in place of a build of main, the page's steps and drawings for Buzz 1.0,
and safety tips on the live page. `pre-submit.sh` passed 115 of 115 on an Intel droplet with the relay and the page's
image. On 2026-11-12 the page gained two features for its next image, 1.1.0, not yet published: when Cloudflare's
page saves `cert.pem` in the browser instead of passing it to the app, the owner can upload that file, and an owner
on their own domain can turn on moderation (below). Both passed the page's local tests and the package's containers on Docker; the
package still pins the 1.0.0 image. On 2026-11-13, also for 1.1.0 and from approved mockups, the live page's next steps became a
guide and its checks one card, and while connecting the checks became a progress bar; they passed the same local tests, and so
did the fixes from four reviews of them, the same day, with a new test in a browser (Tested, below). It lives on this `umbrel`
branch, not on `main`, until Umbrel accepts it.

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
  no others. Drawings of Buzz 1.0.0's own screens, from its source (block/buzz-app v1.0.0), show
  where to find the public ID, in a dropdown under the owner's field. Once the community is live, a
  guide of next steps shows how to join it, invite people and pair a phone: one step at a time, each
  with two drawings and a caption under each, and Previous and Next between them. Redraw them when
  Buzz's screens change. Buzz's next release already changes the invite dialog and drops adding
  members by public ID ([block/buzz-app#3147](https://github.com/block/buzz-app/pull/3147)), so the
  page leads with invite links.
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
    sign-in (asked for in Umbrel's review). If Cloudflare's page says the sign-in worked but saves
    `cert.pem` in the browser instead
    ([cloudflare/cloudflared#1252](https://github.com/cloudflare/cloudflared/issues/1252)), the owner
    uploads that file on the page. The page checks it and passes it on unchanged, through the folder
    it shares with the service, where Umbrel's backups skip it. The service checks it again, the same
    way, and takes it as its sign-in within seconds. Both take exactly the same files: one ARGO TUNNEL
    TOKEN block of base64 JSON with a zone, an account and an API token, and other fields as
    Cloudflare adds them (`cloudflare_cert` in the page, `signin_file` in the service). From there it's
    handled like any sign-in, deleted once the name is routed. The page never shows the file, and asks
    the owner to delete their copy and, once live, its token in Cloudflare. Its image is the connector of
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
    tailnet's access rules aren't the default), and Buzz membership. Once the community is live, the
    page checks, from the browser, whether the device it's open on reaches Buzz: one look at a time,
    and only the newest look's answer shows. Before then a failure would say nothing about the device,
    so the progress bar leaves it out.
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
  from a lost key. Then the checks, which refresh every five seconds, and the steps for the chosen
  option: the Cloudflare values, or Tailscale's sign-in, machine approval and consent links. While
  connecting, the checks are a progress bar of the option's stages, such as Sign in to Cloudflare or
  Phones can pair. The first, Set up on this Umbrel, is done: the setup is saved by then. Each check
  sits in the stage it blocks: Buzz starting, in the stage where the name or address answers, and
  Cloudflare's tunnel and DNS record, which come after the sign-in, in Cloudflare publishes the name;
  a domain chosen wrong stays with the sign-in, since its fix is a new one. The current stage is the
  earliest one not done, and only it shows it's at work, or YOU when it waits on the owner. A problem
  turns the stage it blocks red, with its hint under the bar, and the current stage's checks that still
  wait show there quietly, as on the live card, unless it's the owner's turn: then the section below
  says what to do. Screen readers get each check's full sentence, and one
  short sentence when the checks change. Once live: the join address, and the checks as one card that
  says Everything works and opens to the full list. A problem shows above it with its hint, and a check
  still waiting shows there too, quietly. Then the next steps as a guide, wider than the page on a
  computer: join, invite people and pair a phone down the left, with a link to the self-hosting guide's
  homepage, and on the right one step at a time, its drawings one at a time with a stepper. Joining has
  an Open in Buzz button (`buzz://connect?relay=wss://…`, Buzz 1.0's link that opens its join screen
  with the address filled in, as Pavlenex's package did) and Copy the address, with a line under them
  on what Open in Buzz does. The phone step says the phone needs Tailscale too on the private option,
  and whether phones get notifications. When the page opens itself again at a new phase, the guide
  stays at the reader's step and drawing. Without scripts every step shows, one after the other, and
  the copy buttons hide; `#join`, `#invite` and `#phone` open a step. Then collapsed
  tips for keeping a community safe, most of all one anyone can join. Settings: change the owner
  (the old one becomes an admin), turn phone notifications off or on, turn moderation on or off on the
  owner's own domain, change the address, and how moving servers works. Umbrel's rules require a page
  like this for an app with no web interface of its own.
- **Relay:** waits for the settings, makes its own key on first start, and restarts itself when the
  settings change (it compares the file's content: two saves within a second share a modification
  time). The key is random, not derived from Umbrel's seed: Umbrel's rules forbid derived private
  keys. It reads its settings as plain KEY=value lines, and only the names the page writes, never
  as a script, so nothing in the file can run a command or turn off the relay's checks. At start
  the page finishes a save that a stop cut short: if the relay's settings say something other than
  `setup.json` does, its last save runs again. Routine
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
  option chosen and what each reports back, and for an uploaded sign-in in the seconds before the
  Cloudflare service takes it. So neither can change the relay's settings, and the
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

## Moderation, on the owner's own domain, off by default

Buzz 1.0 gives the owner of a self-hosted community no ban of its own. Relay 0.3.0 has an admin API,
and Buzz on a computer shows it as **Moderation** in Settings (Reports, Feedback, Communities and
Staff): reports, ban or time out members, delete messages. The page's Settings has a Moderation row
that turns it on. Built for the page's image 1.1.0, not yet published.

- **What turning it on does.** The page stores `"moderation": true` in `setup.json` and adds one line,
  `BUZZ_ADMIN_HOST=<domain>:8443`, to the relay's settings, which restarts the relay, as phone
  notifications do. The relay then serves its admin API at `https://<domain>:8443` and advertises that
  address in its NIP-11 (`admin_api`), where Buzz finds it. It arrives through the same tunnel and name:
  Cloudflare proxies port 8443, and the gateway matches the name without its port, so the request
  reaches the relay with Host `<domain>:8443`. Nothing changes in Cloudflare, the gateway or the
  backups. Tested by hand on a real domain on 2026-11-12 (below), with the line in the compose file.
- **Who gets in.** Signed requests only (NIP-98, the relay's default): `BUZZ_ADMIN_AUTH` stays unset,
  never `disabled`, which would serve every moderation read to anyone. `RELAY_OPERATOR_PUBKEYS` stays
  unset too, so the owner set on the page is the only built-in operator (the relay's owner fallback).
  The owner adds staff in Buzz. The relay checks each signature against `https://<domain>:8443`, then the
  roster, then the request's Host (`authorize_staff` in `api/admin/auth.rs`): a member's signature gets 403
  because they aren't staff, and the owner's, sent to the community's own address, gets 403 from the Host
  check.
- **The relay's entrypoint** unsets `BUZZ_ADMIN_HOST`, `BUZZ_ADMIN_AUTH`, `BUZZ_ADMIN_TOKEN`,
  `RELAY_OPERATOR_PUBKEYS` and `BUZZ_ADMIN_WEB_DIR` before it reads the settings, and its settings
  reader takes `BUZZ_ADMIN_HOST` alone of them. So the page is the only source: nothing in the compose
  file, the image or the environment reaches the relay. It then keeps `BUZZ_ADMIN_HOST` only if it
  equals `<the gateway's address>:8443`, read and tested as the gateway does (its first `BUZZ_DOMAIN`
  line, plain lowercase letters, digits, dots and hyphens, not a ts.net name), and only if the relay's
  own address is that one too. So it never points at an old address, a Tailscale name or another host,
  and wherever the gateway answers every Host there's no admin host.
- **Block's browser dashboard stays off.** The image sets `BUZZ_ADMIN_WEB_DIR` to it
  (relay `Dockerfile`), and with an admin host it would answer browsers at `https://<domain>:8443/`.
  Unset, the relay serves no web directory there (`config.rs`: unset or empty is none), and the
  admin host's `/` answers 404 with its own security policy. Buzz's Moderation doesn't use it.
- **What the owner and staff can read**, as the row says before it's turned on: reports with who sent
  them, feedback, and any message stored on this Umbrel by its ID, deleted ones included, in private
  channels and direct messages, in every community the relay keeps, earlier addresses' included.
  Members don't see this in Buzz, so while it's on the safety tips say it, for the owner to share.
- **Bans and staff outlive the switch.** Turning it off removes the line and the relay restarts
  without the admin API. Bans and timeouts stay enforced; lifting them needs moderation on again.
  Staff rows stay in the database and come back with it, also after Change the owner, where the new
  owner becomes the operator and the old one no longer is. Staff with the operator role keep one power
  while it's off: relay 0.3.0 lets an operator rename any listed open channel, whatever their role in it,
  with no admin host (`operator_may_rename` in `handlers/side_effects.rs`, through `is_relay_operator`).
  So once it has been on, `setup.json` keeps `"moderation": false` when it's off. The row then warns that
  earlier staff return and that operators can rename public channels meanwhile; the Owner form says the
  same. While it's on, the row and the Owner form say to remove staff the owner no longer trusts first,
  and the Owner form says the owner loses Moderation with the change. A missing key means it was never
  on. A ban keeps one identity, and the agents that join through it, out of one community, even with an
  invite link; a person can come back under a new identity, and the page's texts say so.
- **Addresses.** It's offered once the community is live on the owner's own domain. Moving to another
  domain keeps it on, at the new name: the line follows the domain at every save. A Tailscale option
  turns it off, and back on a domain it stays off until the owner turns it on again. On the Tailscale
  options the row says why it isn't there: Buzz opens moderation only at addresses that resolve to
  public ones, and a ts.net name resolves to a tailnet address on the owner's own devices. Funnel on
  port 8443 is untested.
- **The page's check.** The checks get a row while the community's NIP-11 loads: turning on,
  turning off, reachable, or not reachable with a hint. The NIP-11 the page already fetches every
  refresh says whether the relay advertises `https://<domain>:8443`. Once it does, the page asks that
  address once: `GET /` with the NIP-11 Accept and no User-Agent, as Buzz's admin client sends its
  requests, at the address Cloudflare's DNS gives, and only if every address it gives is public. The
  relay's admin host answers 404 with its own security policy; a Cloudflare refusal, a Host that lost
  its port (the community's NIP-11 comes back), or nothing on 8443 each get a hint. The look runs beside
  the other checks on a page load, never in the 5-second refresh, which marks it due and opens the page
  again. An answer that works is kept until the relay's settings change or a save; one that doesn't is
  asked again by a page load after 30 seconds. Each look is one warning line in the relay's log. The
  page never shows what NIP-11 advertises: it compares it with its own address.
- **When Buzz's check fails**, Buzz keeps Moderation out of Settings without a word and says why only in
  Settings, Plugins, Manage plugins, Moderation, and even there only as a tooltip: the plugin says
  "Unavailable", and pointing at its button shows the reason (`src/app/Settings.tsx`). The row says so, and
  explains Buzz 1.0.0's three messages (Could not check access; Access is unavailable in this build or on
  this relay; Select a community on a relay where you have staff access) and what each likely means here.
  Buzz shows the third for any 401 or 403 that isn't an HTML page (`relay-staff/staff.ts`), so also for
  Cloudflare's plain-text refusal and the relay's refusal of a Host that lost its port: the row sends the
  owner to the page's own check first.

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
removing a member isn't a ban, and Buzz 1.0 offers the owner of a self-hosted community no ban unless
Moderation is on, which the page offers on the owner's own domain. There the tips say how to ban an
identity, and that a person can still join under a new one; while it's on, they say the owner and
their staff can open any stored message by its ID, private ones included.

On 2026-11-12 a review of the designs for the page's image 1.1.0, the upload and moderation, found no
hole another app on the Umbrel could use: both new forms sit behind the page's sign-in, its size limit
and its same-site check. Its fixes went in with the features:

- Texts that promised more than the relay gives: the tips said direct messages are for the people in
  them while moderation could read them, and the ban texts said a ban keeps a person out.
- Turning moderation on would also have served Block's browser dashboard to anyone at
  `https://<domain>:8443/`. The entrypoint unsets it.
- Staff added before came back without a word when moderation was turned on again, even under a new
  owner. Now `setup.json` keeps that it was on, and the page warns.
- The relay's guard and the gateway now use the same test for an address, and a stop in the middle of
  a save is finished at the page's next start.
- An uploaded sign-in that fails to save gets a fixed sentence and leaves no file, and the page asks
  the owner to delete the sign-in's token in Cloudflare once live.

Left, with the reason:

- While moderation is on, its admin API faces the internet. It honors staff signatures alone, but
  nothing limits how fast requests come, and Block hasn't confirmed this public use with NIP-98 yet.
- The owner and staff can read any stored message by its ID while it's on; members learn it only if
  the owner shares the tips.
- Staff and bans outlive the switch and owner changes, and staff with the operator role can rename public
  channels while it's off. The page warns, but it can't list the staff.
- Cloudflare accounts with stricter security settings may turn away Buzz's admin client, which sends
  no User-Agent. The page can check only from the Umbrel's side.
- The page's other writes into the folders it shares with the helpers (`write_atomic`) open their
  temporary files with a plain open, which follows a link; the upload's write refuses one. A
  compromised helper could make the page overwrite its own settings with its own content: a denial of
  service. A separate change.

Then a review of the built code, the same day. Fixed:

- The Cloudflare service tested an uploaded file and then read it by name, so whatever can write the
  shared folder, a compromised page included, could swap in a pipe between the two and hold the
  service's loop: no reset, address change or switch to Tailscale until a restart. The read now has 5
  seconds (busybox's `timeout`, in the image), and `cloudflare.py` checks a read that never returns.
- Texts that said more than Buzz or the relay does. The private-channel tip's lead still promised
  privacy while moderation is on. Staff with the operator role can rename public channels while it's
  off, which the page now says wherever it says staff come back. The Owner form didn't say the owner
  loses Moderation with the change, and offered a review in Buzz on a Tailscale option. Buzz's reason
  for hiding Moderation is a tooltip, and its third message also comes from Cloudflare or a lost port.
- Tests the design planned: `tests/umbrel/moderation.sh` for the real-domain run, and in `check.py`
  and `e2e.sh`, a banned identity's invite claim refused, a lifted ban, and moderation still on after a
  restart.

`tests/umbrel/local/security.py` checks the fixes on a Mac without Docker, the relay's entrypoint
included (run with a stand-in relay that writes down the admin settings it got),
`tests/umbrel/local/cloudflare.py` runs the Cloudflare service's script with a stand-in
`cloudflared`, and `pre-submit.sh` tries the app's services as another app on the Umbrel would, and
adds admin settings to the relay's settings file to see that none reach the relay.

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

2026-11-12, the update from the PR's last push, on umbrelOS 2.0.2, Umbrel's newest (its reviewer
ran 2.0.1). Last round's package (relay `sha-744f394`, the page bind-mounted) was installed through
Umbrel and set up, then Umbrel updated it to this round.

- ARM, umbrelOS 2.0.2 in Docker Desktop on an Apple Silicon Mac, with a quick tunnel and a test owner
  ([log](../tests/runs/2026-11-12-1313-umbrel-update-and-pre-submit-arm-local.log)): `update.sh` 14 of
  14 (the message, the file and the member from before), `e2e.sh` 31 of 31 on the updated install,
  then `pre-submit.sh` 107 of 107 on this round, without the restart and the restore, which need a
  droplet. Memory: 145 MiB before setup, 311 MiB with a community, 393 MiB while 20 members sent 200
  messages in 23 s. A 96 MB video went up in 9 s. The first install failed inside umbrelOS: its own
  startup and the install both created Tor's container. A retry installed it.
- Intel, umbrelOS 2.0.2 on a droplet, on the owner's own domain with a real Cloudflare account
  ([log](../tests/runs/2026-11-12-1313-umbrel-update-real-cloudflare-moderation-intel-droplet.log)):
  `update.sh` 14 of 14. After the update, the page ran from its image and the owner's page session
  still opened it, with no new sign-in. The Cloudflare service deleted `cert.pem` and the
  credentials file at its first start, since the name was already routed, and the tunnel kept running
  on its token. The relay's own key, the tunnel and its name carried over, and all 86 of relay
  0.3.0's migrations had run.
- An address change on that droplet: Settings, Address said first that moving asks for a new
  Cloudflare sign-in. After the sign-in the new name was routed, `cert.pem` was deleted again, and the
  old name answered 404.
- Found: the first sign-in said it had worked, but Cloudflare saved `cert.pem` to the owner's Downloads
  instead of handing it to `cloudflared`
  ([cloudflare/cloudflared#1252](https://github.com/cloudflare/cloudflared/issues/1252)), so setup
  waited. Copying the file into the service's folder by hand let it carry on. The second sign-in
  reached `cloudflared` as it should.
- Owner moderation, by hand on that droplet: with `BUZZ_ADMIN_HOST=<name>:8443` in the relay's
  environment, requests to `https://<name>:8443` reached the relay with the port intact through
  Cloudflare, the tunnel and the gateway, and Cloudflare let through a request with no User-Agent, as
  Buzz's admin client sends it. Moderation showed in Buzz (a preview build with 1.0.0's admin client)
  for the owner, who banned a test member. The relay then refused that member's posts and reads; a
  member who wasn't banned still posted.
- Umbrel's update left last round's `setup.py` and its template in the app's folder, unused.

2026-11-12, the page's next image (1.1.0, not published), with the `cert.pem` upload and moderation, on
this Mac at no cost ([log](../tests/runs/2026-11-12-2000-umbrel-setup-page-1.1.0-local.log)):

- **Mocked:** `render.py` 1067 page states, every moderation row and status row among them;
  `security.py` 103, among them the switch behind the page's sign-in, moderation never pointing at an old
  name, when the page looks at moderation's address and what it makes of each answer, the start-up
  reconcile, and the relay's whole entrypoint with a stand-in relay (only the page's own line reaches it,
  never the image's dashboard or anything from the environment); `cloudflare.py` 60 with the stand-in
  `cloudflared`; and `preview.py`'s 11 screens, the two for moderation among them. `render.py` also passed
  on Python 3.13, the image's, on Linux. So did `security.py`, with bash 5, before the relay's guard also
  checked the relay's own address (100 there: no dash to compare, and as root no unwritable folder).
- **Real:** the package's containers on Docker Desktop, `check.py` 75 of 75. On relay 0.3.0's image, the
  page turned moderation on; through the gateway, `<name>:8443` was the relay's admin host, with no
  dashboard for a browser; an unsigned request got 401, another key 403, the test owner 200 as the
  operator, and 403 at the community's own address. The owner banned a member, whose next post was
  refused, and the ban held once moderation was off. It stayed on through an owner change (the old
  owner then got 403), turned off on a Tailscale option and stayed off back on the domain.
- By hand: `e2e.sh`'s moderation helpers, taken out of the script, worked against those containers.
  `e2e.sh` itself and `pre-submit.sh` weren't run: they need umbrelOS and the published image.

Later the same evening, after the review of the built code (Security review, above), the same way
([log](../tests/runs/2026-11-12-2150-umbrel-setup-page-1.1.0-review-local.log)):

- **Mocked:** `render.py` 1067 page states, also on the image's Python 3.13 on Linux; each of the
  review's text fixes, undone in a copy of the page, made it fail. `security.py` 103. `cloudflare.py` 63,
  also on Linux with busybox's `timeout`, among them a read of the upload that never returns, which the
  package without the time limit fails. `preview.py`'s 11 screens.
- **Real:** `check.py` 78 of 78, adding that a banned identity's claim of the owner's invite link is
  refused (`invite_restricted`) while a new identity joins with it, that a lifted ban lets the member post
  again, and that moderation is still on after a restart of every container.
- By hand, against those containers, with the gateway standing in for the public address: `e2e.sh`'s
  whole moderation section and its new step after the restart, 25 of 25, and `moderation.sh`'s probes,
  `on`, `off`, `status` and `add-member`. The review's race, a pipe swapped in over a plain file while
  the Cloudflare service took uploads, no longer holds the service: 25 takes each with `sh` and `dash`,
  the longest 6 s.

2026-11-13, the live page's next steps as a guide and its checks as a card, and the checks while
connecting as a progress bar, for the page's image 1.1.0 (not published), on this Mac at no cost
([log](../tests/runs/2026-11-13-1255-umbrel-setup-page-guide-local.log)):

- **Mocked:** `render.py` 1884 page states, also on the image's Python 3.13 on Linux: the guide on 86 live
  pages, each with its 3 steps and 6 drawings (774 states), the card in 6 states, 34 connecting stages of the
  three options through the page's own checks with the network mocked, and each option live. `security.py`
  107, adding that status.json sends the page's own checks and their signature, which changes with a check,
  that every link opening a new tab has `rel=noopener`, and that the address reaches both copy buttons
  through a data attribute. `cloudflare.py` 63. `preview.py`'s 14 screens, three of them new.
- **Browser:** headless Chrome 157 on the previews, with the page's script: `#join`, `#invite` and `#phone`
  each open their step alone, and on the private network, off the tailnet, the device check shows as a
  problem above the card. By hand in a Chromium browser: the stepper and the keyboard across steps, with
  focus kept and each drawing announced; the device check's answer both ways; the refresh leaving an open
  list open; a new phase opening the page again; no sideways scroll at 375 pixels. Without scripts, every
  step shows.
- **Real:** `check.py` 80 of 80 on the package's containers on Docker Desktop, with the page on the image's
  Python 3.13, adding that the progress bar marks Cloudflare's and Tailscale's sign-ins as the owner's turn,
  and that status.json sends the page's own bar.
- Umbrel's linter with image checks: no issues. Screenshots 04 to 06 retaken (Gotchas, below).

2026-11-13, fixes from four reviews of the guide, the card and the bar (correctness, accessibility, texts and
security), for the page's image 1.1.0 (not published), on this Mac at no cost
([log](../tests/runs/2026-11-13-1414-umbrel-setup-page-review-fixes-local.log)):

- **Mocked:** `render.py` 1889 page states, also on the image's Python 3.13 on Linux: 39 connecting stages of
  the three options, each with what shows under the bar, the bar's rule tested rather than restated, and the
  texts brought back. `security.py` 110, adding names with quotes, an element or a script written straight into
  the page's files, which show as text on a live page, while connecting and in status.json; status.json refusing
  a visitor without a session with neither the checks nor their signature; and helpers' logs with bytes that
  aren't UTF-8, which broke the page before. `cloudflare.py` 63. `preview.py`'s 14 screens, with what shows under
  each bar.
- **Browser:** `browser.py`, new, 20 of 20 in headless Chrome 157, ten runs in a row, with the page's timers and
  the device check's requests held by the test: the stepper across steps and at its ends, a step opened by the
  address or kept across a new phase, focus moving to a step's heading, the refresh keeping an open list open and
  focus on it and saying what changed, the device check through the reviewers' race, and the page without
  scripts. On the page before these fixes, 15 of its checks fail, the race among them.
- **Real:** `check.py` 80 of 80 on the package's containers on Docker Desktop, with the page on the image's Python
  3.13, now comparing the page with status.json only while the checks hold still.
- Umbrel's linter with image checks: no issues. Screenshots 01 and 03 to 06 retaken; 02 didn't change.

## Not yet tested

- The page's image 1.1.0 on umbrelOS: it isn't published yet. Then `pre-submit.sh`, whose `e2e.sh` now
  turns moderation on and off on the page, asks the admin API through the gateway, bans a member, checks
  the ban against an invite link, lifts it and keeps moderation on through a restart, and whose tamper
  step adds admin settings to the relay's settings file.
- The live page's guide and checks card, and the progress bar, behind Umbrel's proxy, in Safari and
  Firefox, on a real phone, and with a screen reader: so far a Chromium browser and headless Chrome on a
  Mac, and the page's own tests.
- The private network's device check passing on a real tailnet, as the card shows it: so far its
  failure off the tailnet, and answers held back and let through in headless Chrome (`browser.py`).
- An upload of a real `cert.pem` that Cloudflare saved in the browser, by hand: so far made-up files,
  in a browser and on the real Cloudflare service, which Cloudflare refused.
- Umbrel's backup skipping an uploaded sign-in, the new `backupIgnore` line: `pre-submit.sh`'s markers
  check it on a droplet, and it hasn't run since the line went in.
- Moderation turned on from the page on a real domain, then Buzz's Moderation, a ban and turning it off:
  the by-hand test of 2026-11-12 set the line in the compose file, with the dashboard on.
  `tests/umbrel/moderation.sh` has the steps, and hasn't run on a real domain in its committed form.
- Whether a quick tunnel (`*.trycloudflare.com`) carries port 8443: `e2e.sh` prints what it gets as INFO.
- Moderation through Umbrel's Cloudflare Tunnel app instead of the app's own tunnel, and on Cloudflare
  accounts with Bot Fight Mode or other stricter security settings.
- "Sign in to Cloudflare again" after a failed step, with a real account: so far only with a
  stand-in `cloudflared`.
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
`docker-compose.yml`. While `docker-compose.yml` still pins the page's 1.0.0 image, don't copy
`umbrel/buzz/` to the fork: the App Store description already says the owner can turn on moderation
from the app's page, which only 1.1.0 can do. Nate Fretz (nmfretz) reviewed it on 2026-11-10 and holds
their own end-to-end test, with real Cloudflare and Tailscale accounts, until we say the PR is final. The PR credits #5928 and says how it
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

Its moderation section turns moderation on with the page's own form, then asks the relay's admin API
through the gateway from inside umbrelOS, with the Host a request for `<name>:8443` has when the app's
tunnel delivers it, so it doesn't depend on whether a quick tunnel carries port 8443. An unsigned
request gets 401, a member's signature 403, and the test owner's 200 (signed with `tests/lib/nip98.py`).
The owner bans a member through the admin API. The member's next post, made with `tests/lib/event.py`
without the buzz CLI, is refused, and so is their claim of the owner's new invite link, which a new
identity then joins with. The ban holds once moderation is off. Turned on again, the owner lifts the ban
and the member posts again; moderation stays on through the restart through Umbrel, then goes off. With a
real owner (`OWNER_HEX`), the owner's checks, the ban and the lift are skipped. On an Umbrel already set
up on a Tailscale option (`SKIP_SETUP=1`, `DOMAIN` its ts.net name), it checks only that the page refuses
to turn it on: the section follows the option saved on the page, and setup would refuse a ts.net name
on the own-domain option. It runs with `UMBREL_LOCAL=1` too.

On a real domain, [`tests/umbrel/moderation.sh`](../tests/umbrel/moderation.sh) asks what Buzz asks, from
this computer through Cloudflare: whether NIP-11 advertises moderation, whether `https://<name>:8443`
reaches the relay with its port, and how the admin API answers no credential, no User-Agent, a member's
signature and a test owner's. `on` and `off` use the page's switch, from inside the page's container on
the test Umbrel, and `status` shows the switch, the relay's settings and the relay process's admin
settings by name. Its probes are those of the by-hand run of 2026-11-12; with the gateway standing in for
Cloudflare, all of it but `post` passed against the local containers.

```bash
bash tests/umbrel/moderation.sh check <name> <member keys> [<owner keys>]   # before turning it on, and after
bash tests/umbrel/moderation.sh on <name>                  # the page's switch, on the test Umbrel
BUZZ_CLI=path/to/buzz bash tests/umbrel/moderation.sh post <name> <member keys>   # POSTED, then BANNED once banned in Buzz
bash tests/umbrel/moderation.sh off <name>
```

The setup page on this machine, with no umbrelOS and no cost (Docker, and a Python with PyYAML for
`make.py`):

```bash
PYTHON=path/to/python bash tests/umbrel/local/up.sh   # the page at http://127.0.0.1:8090
python3 tests/umbrel/local/check.py                   # real checks; leaves the community set up
python3 tests/umbrel/local/render.py                  # mocked: every page state
python3 tests/umbrel/local/security.py                # mocked: the page's limits, the relay's entrypoint
python3 tests/umbrel/local/cloudflare.py              # the Cloudflare service, with a stand-in cloudflared
python3 tests/umbrel/local/browser.py                 # the page's scripts in headless Chrome, on the previews
python3 tests/umbrel/local/preview.py 8711 private-live   # mocked screens, one per port
bash tests/umbrel/local/down.sh                       # removes the run, data included
```

`preview.py`'s `domain-moderation` and `domain-moderation-blocked` show the live page with moderation on,
reachable or turned away by Cloudflare, and `domain-moderation-starting` a check still waiting on a live
page. `domain-working` and `private-consent` show the progress bar with a stage at work and with the private
network's HTTPS consent. On a live page, `#join`, `#invite` and `#phone` open that step of the next steps.
`check.py` turns moderation on and off with the page's form on
the real relay image and asks its admin API through the gateway, with test keys it makes and keeps in
memory.

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
- Installing right after umbrelOS starts can fail: umbrelOS's own startup and the install both create
  Tor's container, and one gets "name already in use". Install again a minute later;
  `droplet-run.sh` and `pre-submit.sh` retry once.
- Cloudflare's sign-in can say it worked and save `cert.pem` in the browser instead of handing it to
  `cloudflared`, which keeps logging "Waiting for login..." until its link runs out
  ([cloudflare/cloudflared#1252](https://github.com/cloudflare/cloudflared/issues/1252)). It happened on
  the first of two real sign-ins on 2026-11-12, and copying the file into `data/cloudflare/.cloudflared/`
  by hand let the setup carry on. The page now takes that file as an upload, under "Cloudflare saved a
  file named cert.pem instead?". In local tests the service takes it like one that arrived; a real one
  isn't tested yet (Not yet tested, above).
- An install stuck on a failing service can't be uninstalled until its compose run is stopped.
- `buzz-admin add-member` takes the key with `--pubkey`.
- With `Referrer-Policy: no-referrer`, browsers send a page's own form posts with `Origin: null`.
- Browsers send a host's cookies to all its ports, and count another port as the same site, so
  SameSite=Strict doesn't stop another Umbrel app's page from posting this page's forms.
  `Sec-Fetch-Site: same-site` marks those posts.
- Headless Chrome 157's `--screenshot` of an address with an anchor, such as `#invite`, scrolls the page
  but draws it unscrolled, with everything above the scrolled view blank. Compositor flags don't help.
  `06-add-members.png` is cropped from a capture tall enough not to scroll, at the place Chrome scrolls
  to at 1440 by 900 (432 pixels down).
- The submission's screenshots 01 to 03 come from DevTools on a Chrome started without `--disable-gpu`,
  and 04 to 06 from Chrome's `--screenshot` with it. Each way draws text a little differently, so to
  compare pixels, retake each the way it was taken. Without `--disable-gpu`, the setup page's numbered
  circles also come out a few pixels different from one capture to the next.
