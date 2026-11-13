# Research

What the tests, the agent runs and the upstream research found. Decisions that follow from it are
in [decisions.md](decisions.md). Last updated 2026-11-12.

## Relay 0.3.0, run on 2026-11-12

The pin moved to Block's relay release 0.3.0 after the five prepared runs. Where this section
disagrees with the ones below about the pin, the Kubernetes gaps or what is tested, this one is
current. Results by run, with logs: [tests/README.md](../tests/README.md).

- **Results.** Local 55 of 55, on a Linux server. Public VPS 112 of 112. VPS upgrade from
  `sha-744f394` 134 of 134. Kubernetes 28 of 28 on one node, after a first try on two nodes
  failed. Private network 55 of 55. The owner's checks on the public server passed: Staff as owner, pairing with
  Codes match, and two notifications on a locked iPhone. About $0.39 on DigitalOcean.
- **The pin.** `ghcr.io/block/buzz:0.3.0` at
  `sha256:84f34c5b801192665b1a05939518d746f25184babf4d6e927d0de7e12e9c5674`, built from
  `75d38b6c2d5f357348288ded8c15aba15f765ea5`. Three sources agree on that commit: the image's
  `org.opencontainers.image.revision` label, Block's git tag `relay-v0.3.0`, and the provenance
  the launch review verified. `sha-75d38b6` is the same source in another build, with another
  digest; it was not run.
- **An image names its commit.** That label is on every relay image checked: all seven pins since
  2026-09-30 and releases 0.1.1 to 0.3.0, where it matches Block's `relay-v*` tags. A release's
  name says nothing about its source, so SKILL.md records the recommended image's commit
  (`tested-commit`), and the skill reads any other image's commit from the image: the running one
  before an upgrade, a backup's before a restore. Every Compose run checked that the pulled image
  names the commit the bundle is at.
- **The bundle did not change.** `deploy/compose` is byte-identical at `744f394` and `75d38b6`:
  the same blob for each of its seven files. The release is 80 commits ahead of the old pin and
  none behind, and adds migrations 0084 to 0086.
- **Migration 0086, measured once.** On the upgrade run the relay went from 0.2.1 to 0.3.0 and
  applied 0084, 0085 and 0086 at start, in 6, 6 and 243 ms, on 36 events, 2 channels and 3
  members. `idx_events_media_edit_target` is valid and ready, `BUZZ_MEDIA_READ_MODE` was unset,
  and the partition audit said `ok`. That is Block's small-database case. Nothing here ran the
  concurrent prebuild or a database with real history.
- **Kubernetes pins both images now.** Chart 0.1.10 renders `image.digest` as
  `repository@digest`, and takes the file store's two images as whole strings. With the steps'
  values, every image in the quickstart is a digest reference: the relay and its pairing service,
  `ghcr.io/block/buzz-minio` three times, and the chart's own Postgres and Redis. The file store
  is pinned at `sha256:71f235d6aa0c39517b9864d8524546607ccdde40b83742e0dd8d4fb52b3be6dd`, what
  `:latest` has named since 2026-10-07. It is still one x86 manifest that Block builds for its
  test runners. `tests/smoke-k8s.sh` runs kubernetes.md step 3's own block, so the test and the
  steps cannot differ again, and the steps' push settings ran on a cluster for the first time.
  This closes "Kubernetes gaps, not fixed here" below. Chart 0.1.11 is still not adopted.
- **The quickstart is for one node, and kubernetes.md now says so.** It did not before this run. On a
  two-node cluster the relay's restart hung: the chart rolls the relay with `maxSurge: 1` and
  `maxUnavailable: 0`, so the new pod starts first, and its git volume is ReadWriteOnce, so a new
  pod on the other node waits in `Init:0/1` with `FailedAttachVolume`. The same would happen on an
  upgrade. Block's chart says both halves of the answer: its README calls the quickstart
  "single-node", and its values say `persistence.git.enabled: false` is right for more than one
  node, since that disk is scratch space. Neither was tested here. The rerun on one node passed.
- **DigitalOcean.** From Kubernetes 1.36 on, `doctl kubernetes cluster create` makes a paid
  highly available control plane unless given `--ha=false`. A new cluster's API server dropped
  connections for a while after it reported running: Helm left Traefik and cert-manager
  `pending-install`, which a second install fixed. Deleting the cluster with its associated
  resources removed the load balancer and left all four volumes, as kubernetes.md already warns.
- **Notifications on 0.3.0.** With compose.md step 8's line the relay offered `buzz-push-v1`, the
  owner's iPhone published its lease 5 seconds after pairing, and Block's gateway accepted both
  wakes in 0.21 and 0.10 seconds. The locked phone showed both with their text. Two details for
  whoever tests this next: `buzz messages send` puts no `p` tag on a DM, so a DM sent that way to
  a phone that has not yet seen the DM wakes nothing, and the relay refuses a mention of someone
  who is not in the channel.
- **The moderation console's steps work on 0.3.0.** The relay named its admin address, an
  unsigned probe got 401, and the Staff list answered 200 to the owner's signed request. The owner
  saw Reports, Feedback, Communities and Staff. Not shown: that the other three load. The only
  Reports requests in the relay's log were unsigned and got 401.
- **The harness.** Every driver reads its default image from SKILL.md, so no script holds a tag.
  A release that is not the recommended image needs its digest and its 40-character commit, and
  the offline checks cover both refusals. `smoke-vps.sh` now runs step 8's notification line,
  which it had left out.
- **The saved logs do not show the digest.** `redact.py --private` masks every 64-character hex
  string, image digests included, so the committed logs read `sha256:<hex>`. The drivers refuse
  any other digest, so a pass means the digest above, but a log cannot show that by itself.
  Follow-up: keep `sha256:` digests readable.
- **Tools.** This Mac's `kubectl` is 1.30.5, six minor versions behind the cluster. It warned and
  worked. The `buzz` command line was the one inside the Buzz app, preview build
  0.7.0-preview.270.2.
- **Still open on 0.3.0.** Docker Desktop on a Mac; a desktop join over the trusted local
  certificate; importing a key file; Android; a populated database through 0086; Kubernetes from
  the old pin, on more than one node, and a complete restore there; the source links in
  security.md and mobile.md, which still point at the old pin's commit.

## Independent review, checked on 2026-11-11

A second review reread the two sections below against upstream source (the app at v1.0.0,
`4fb386b`; the relay at the pin `744f394`, at release 0.3.0 `75d38b6` and at main `4c60be6`) and
against live documentation. Where it disagrees with them, this section is the current one. Nothing
here ran on real infrastructure, a real phone or the released app.

- **Agents run without a sandbox, always.** Buzz 1.0 starts Codex with
  [`approvalPolicy: "never"` and `sandbox: "danger-full-access"`](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/codex/runtime.ts#L2529)
  and Claude with [`--permission-mode bypassPermissions`](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/claude-code/claude.ts#L298);
  Goose and Pi are the same, and no setting changes it. "Can run with broad permissions"
  understated this. A Workspace is the starting folder only.
- **Who can start an agent, and what it reads.** Only the owner's mentions and direct messages
  start conversation work ([owner check](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/features/agents/owner-attestation.ts#L142)),
  plus the agent's own watches and timers, and any key the owner authorizes under Settings,
  Security ([help](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/buzz-help.md#L130)). The agent then reads recent messages from
  anyone: "Watched events are observed data and can come from anyone"
  ([Codex notes](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/codex/README.md#L122)). The site's agent drawing shows exactly
  this: the owner asks, a stranger's file rides along.
- **Hosted agents are isolated from your computer.** A Builderlab agent
  ["cannot open files on your computer"](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/builderlab/README.md#L9) and shares one
  remote runtime with the person's other agents by default. "Moving it to someone else's server
  does not itself establish isolation" was too broad.
- **Builderlab's key backup.** The copy is sealed to a key the service supplies
  ([crypto](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src-tauri/src/nsec_backup/crypto.rs#L54)), so the service can decrypt it and
  return it to whoever signs in. Signed in, membership of a Block-hosted community
  [saves the backup choice with no prompt](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L1044). "An encrypted backup"
  alone understated who holds recovery.
- **Plugins.** ["Plugins are trusted code... They are not sandboxed"](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/plugin-architecture.md#L358).
- **Labels.** The Settings entry for pairing is
  ["Mobile app" in a build with Builderlab sign-in, "Pair mobile" otherwise](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/pairing/index.tsx#L21);
  the released app offers Builderlab sign-in, so the guide now says Mobile app. The control that
  removes a key is [Remove from device](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/app/IdentitySettings.tsx#L391), not Sign out.
  Both were read from source; Mobile app has since been seen on screen (below). Claude and Codex agents
  [need macOS or Linux](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/README.md#L112).
- **Add directly is going away.** Previews from 0.7.0-preview.265.1 and main hide adding a member
  by npub in the app (`DIRECT_MEMBER_ADD_ENABLED = false`, src/bundled/moderation/features.ts). The
  app updates itself, so "Add people you know by their npub" loses its screen at the next stable
  release; the server's `add-member` stays. The people answer and the skill now lead with the
  invite link and say which builds have Add directly.
- **Seen in the running app, 2026-11-12.** Settings in preview build `0.7.0-preview.270.2`
  (v1.0.0 plus 38 commits), signed in as an admin of a local community. Under Community: Mobile
  app, whose page is headed Pair mobile and names Add community on the phone and Codes match on
  the desktop. Under Community admin: Membership, with Members and Invite tabs and no Add
  directly. Under Buzz: Identity, with the Buzz ID card and its menu, and Security, with
  Authorize external identity. Visiting the Invite tab mints a link at once, as
  [the source says](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/moderation/CommunityAdmin.tsx#L555):
  looking at that screen is not free of effect. Not seen: the Buzz ID card's menu (it holds the
  private key), so Remove from device stays read from source; Moderation, which
  [shows for relay staff only](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/relay-staff/index.tsx#L24);
  and Codes match as a button, which needs a phone.
- **Block's feedback community, checked 2026-11-12.** The Buzz app's README
  [publishes its address and a public invite](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/README.md#L58).
  Its invite page, opened without pressing anything, asks the visitor to confirm they are 18 or
  older and to agree to Buzz's Terms of Service and Privacy Policy before Accept invite in Buzz
  works; the relay's public join policy says the same (`age_attestation_required`). The relay
  reports version 0.3.0 and `requires_nip_fi: false`. That flag is the relay's statement of
  [whether sign-in evidence is mandatory for admission](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/nips/NIP-FI.md#L908),
  and Buzz 1.0.0 [follows it](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src-tauri/src/federated_identity/assertion.rs#L208):
  false means supported, not required. So someone who already has a Buzz identity can join
  without a Builderlab sign-in. A new install that starts from a Block-hosted address is
  different: first run [signs in at once](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L114).
  Read from source and the relay's public info, not tried by joining: the invite asks a person to
  accept Block's terms. The community is on
  `*.communities.buzz.xyz`, the host rule the app's own tests give the public Builderlab build
  ([`bb-public`](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src-tauri/src/federated_identity/access.rs#L616));
  the real list is compiled into each build and can't be read from the source. If it matches,
  Block's identity design applies: for someone signed in to Builderlab, membership in a community
  it hosts [saves automatic key backup with no prompt](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/identity.md#L1044),
  unless a choice was already saved. A section that sends readers there has to say so.
- **Join a community takes a whole invite link.** Since
  [2026-11-09](https://github.com/block/buzz-app/commit/58116b826171d190a7376fc57b0509c32c507dde), which both 1.0.0
  betas and 1.0.0 include, the community button's box accepts a pasted invite link. The list of
  fixes said it takes only an address. That row is now about older preview builds, and the page
  leaves it out.
- **A build rule clipped "Buzz 1.0.0".** The page says "Buzz" where the skill says "Buzz 1.0".
  The rule also matched the full version number added on 2026-11-12 and left "Buzz.0" in the
  page's data. It now leaves a full version alone (`site/build/skill.ts`, `CURRENT` and `OLD`).
- **The pin and the newer release.** `sha-744f394` still resolves to its recorded digest, for
  amd64 and arm64, with verified provenance; it was built on 2026-11-06, after the skill's
  `tested` date, and no committed run names it. `0.3.0` is the newest relay release and its facts
  below hold; `sha-75d38b6` is the same source as a SHA-tagged build with its own digest
  (`sha256:2a8078b6...e18f`), which today's test harness accepts.
- **The security fixes after the pin do not reach this guide's setups.** `rmcp` (#9287) is not
  linked into the binaries the image builds. `hickory` (#9351) is linked only through the relay
  mesh, which is off by default ([config](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/config.rs#L812)) and which
  no setup here turns on. No access-control fix was found in the 80 commits between the pin and
  0.3.0. So the pin's age is a reason to keep a pin-move routine, not a launch blocker. Not shown:
  whether hickory is reachable with the mesh on.
- **Migration 0086, for a small database.** Block's note:
  ["Small databases may use migration 0086 with auto-migration; large deployments with auto-migration off prebuild concurrently"](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/private-media-index-deployment.md#L3),
  and a build that runs out of time "aborts the migration without recording 0086; retry after the
  contention clears". The gate added below made every existing database stop for the
  large-deployment prebuild; operations.md now follows the note. The rollback warning stands: an
  older relay refuses migrations it doesn't know ([database notes](https://github.com/block/buzz/blob/75d38b6c2d5f357348288ded8c15aba15f765ea5/docs/database.md#L294)).
- **Kubernetes gaps, not fixed here.** kubernetes.md sets `image.tag` only, though chart 0.1.10
  takes `image.digest` and `tests/smoke-k8s.sh` uses it, so the test and the steps differ. The
  chart's MinIO override is a floating, x86-only image Block builds for its test runners. Both
  need a real cluster run to change.
- **Tailscale.** Free for up to 6 users and non-commercial use, $8 a user on Standard
  ([pricing](https://tailscale.com/pricing)): as the guide says. Added from the docs: tailnets made
  since 2025-05-22 hold new users for
  [approval](https://tailscale.com/docs/features/access-control/user-approval), and on an iPhone
  connecting another VPN
  [switches Tailscale off until it is turned on again](https://tailscale.com/docs/features/client/ios-vpn-on-demand).
  Flux installs with Helm's SDK, not `helm template`; the advice to supply the Secret is right for
  both. Not covered by the guide, and worth a test before a team relies on private mode: replacing
  a dead private-network machine under the same name.
- **Prices.** DigitalOcean's 4 GB server at $24, weekly backups at 20%, volumes at $0.10 a GiB and
  load balancers from $12 were read from its pricing pages again.
- **Does Block run a gateway self-hosters can use?** Yes, by Block's own notes for the bundle:
  ["To use the public gateway, keep the template's explicit `BUZZ_PUSH_GATEWAY_DELIVERY_URL` and set `BUZZ_PUSH_ENABLED=true`"](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/deploy/compose/README.md#L41).
  The gateway's code has no list of allowed relays: a phone running Block's app vouches for a
  relay's key when it signs up, and the gateway then takes wake requests signed by that key
  ([delivery request](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-push-gateway/src/model.rs#L15), one fixed payload, no
  message field). A self-hoster needs no Apple account, and a gateway of their own could not
  serve the App Store's app. What is not settled: Block names no level of service, other upstream
  pages still say the gateway was never deployed beyond development and that push has not
  shipped (stale, by this guide's October tests), and [#5206](https://github.com/block/buzz/issues/5206),
  where self-hosters reported it not working as late as 2026-10-15, is open with no answer from
  Block. Nothing here was sent to the gateway. A current locked-phone test is still owed.
- **Pairing.** The app's own words: "If your phone asks for a code, enter these digits... If it
  shows a code, check that the digits match. Then choose Codes match here to send your Buzz
  identity" (src/bundled/pairing/PairingSettings.tsx at v1.0.0). The overhaul's "compare the
  confirmation on both devices" was not what current phones show; the skill says the app's
  version again.
- **Access, as the pinned relay does it.** Before a client signs in, the relay answers only
  ["auth-required"](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/handlers/req.rs#L95); the info document, handle
  lookup, invite claim and pairing service are public. The bundle turns membership on with
  `BUZZ_REQUIRE_AUTH_TOKEN` and `BUZZ_REQUIRE_RELAY_MEMBERSHIP`
  ([.env.example](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/deploy/compose/.env.example#L15)). File reads check
  [community membership only](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-relay/src/api/media.rs#L900), links are content
  hashes, and responses are cacheable for a year, so removal stops serving but recalls nothing.
  [No end-to-end encryption](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/VISION.md#L100).
- **Invites.** 30 days at most, 1 to 10,000 uses or unlimited
  ([limits](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-core/src/invite.rs#L12)). No route cancels one link. A ban
  [revokes every link the person made](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-db/src/store/relay_invite/revocation.rs#L12),
  permanently; removing or demoting them does not.
- **Owner and relay key.** Each start makes the configured owner the owner and
  [demotes any other owner to admin](https://github.com/block/buzz/blob/744f3946f6fe1ff7a649c132638d5af608900dbd/crates/buzz-db/src/store/relay_members.rs#L598), so an
  exposed owner key must still be removed and banned after a handover. #7357 (a new relay key
  orphans channels) is open, with no maintainer reply. "Old signatures still verify" was true and
  misleading: the app follows records signed by the relay's current key.
- **Android push.** #6092 and #3229 are open; the phone app's push path is iPhone only.
- **Shared links landed in the wrong place, some of the time.** On a desktop, roughly one fresh
  load in four put a link to a section or an answer a screen or more off, in the overhaul draft
  as well: `document.fonts.ready` can resolve before the fonts start loading, and the page grows
  afterwards. The page now lands again while it settles, until the reader scrolls
  (`site/src/lib/nav.ts`). 38 of 38 loads landed after the change.
- **Browser checks on this draft.** All seven setups in both routes, all 21 answers (147 states
  at each of 1440 and 390 pixels), the new links between sections, every case of the three
  Security drawings at four widths with no change in height between cases, and axe with every
  fold open: no failures, no page overflow, no console errors. Not checked: a real screen reader,
  Safari and Firefox.
- **Installer.** `npx skills add` shows no way to install from a tag or a commit, so a pinned
  release of this skill would be a tagged archive with a checksum; the download the site serves
  can carry one. Not confirmed from the installer's source.

## Launch review, checked on 2026-11-11

This section supersedes current-status statements in the dated notes below. Those notes preserve
what was checked at the time; they do not establish coverage of today's relay pin.

- **Stable app.** [Buzz v1.0.0](https://github.com/block/buzz-app/releases/tag/v1.0.0), published
  2026-11-10, is not a prerelease. Its source is `4fb386b0be5966f5ad9e930a33d1c75b432625fb`.
  It offers signed/notarized Apple Silicon and Intel macOS builds, an unsigned Windows x64
  installer, and Linux x64 deb/AppImage builds. The guide now links to the stable latest release.
  Source comparison covered every drawn screen. Identity is a Buzz ID card: Copy Buzz ID copies
  the npub; More options, the masked private-key field, Copy backs up the private key. Activity
  moved into Messages' sidebar. First-agent and invite drawings also changed. Key import still
  accepts `.txt`, `.key` and plain-text files, at most 1024 bytes, with an nsec on the first
  nonblank line. Importing a file, the Builderlab route, Staff and Codes match still need a real
  app walkthrough. Source inspection is not a runtime pass.
- **Relay.** The pin remains `sha-744f394` at its recorded digest. Its public image still matches.
  A later check found the published Git tag `relay-v0.3.0`, source
  `75d38b6c2d5f357348288ded8c15aba15f765ea5`, and `ghcr.io/block/buzz:0.3.0` at
  `sha256:84f34c5b801192665b1a05939518d746f25184babf4d6e927d0de7e12e9c5674`.
  This supersedes the earlier e5dee91 candidate. The registry manifest, amd64/arm64 entries,
  signed provenance and deployment eligibility were verified; the compatible chart is 0.1.11.
  The [release build](https://github.com/block/buzz/actions/runs/43114277737) succeeded, but
  there is no GitHub Releases object for this tag. The separately built `sha-75d38b6` image has
  a different digest; do not interchange the builds. The new candidate includes
  [hickory security fixes](https://github.com/block/buzz/pull/9351), the
  [MCP dependency update](https://github.com/block/buzz/pull/9287), subscription fixes and
  migrations 0084-0086. [Migration 0086](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/docs/private-media-index-deployment.md)
  needs a preflight/index-build procedure on existing databases. No pin or tested date was changed.
- **Upgrade gate follow-up.** Operations now stop populated-database upgrades into 0086 until
  the target's concurrent index prebuild and exact verification complete. Both upstream SQL
  files must stay together because the prebuild includes the verifier by relative path. The
  verifier can build a missing index, so it is not a read-only preflight. An 0086 failure can
  follow committed 0084/0085 migrations; rollback still means the complete backup and matching
  old image. The fixed downtime estimate was removed. These are source-reviewed safeguards,
  not evidence that the database procedure or candidate upgrade ran successfully.
- **File privacy.** [#9077](https://github.com/block/buzz/pull/9077) merged after the pin, even
  though #8444 remains open. `BUZZ_MEDIA_READ_MODE` supports off, shadow and enforce, default off.
  The guide now distinguishes the shipped feature from its older pin. Do not enable it without
  [Block's rollout and client compatibility checks](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/docs/operator-private-media.md).
- **Bundles.** Compose is unchanged between pin and candidate. Paths, variables, Silo names,
  Caddy overlay and the need for a pairing sidecar still match. Published Helm 0.1.10 and 0.1.11
  artifacts exist. The skill still uses 0.1.10, whose values match its commands; 0.1.11 switches
  storage images to Silo and is the candidate's declared compatible chart. Moving the chart needs
  a backup-tool check and real rerun, not a version-only edit.
- **Test evidence.** No committed `tests/runs` record mentions 744f394. In particular, the private
  and Kubernetes reruns requested on November 6 remain open. No infrastructure tests ran in this
  review. `tested` intentionally stays 2026-10-23. The parser, key-script self-test and syntax
  checks are local checks, not substitutes for those suites.
- **Launch documentation.** [buzz.xyz/support](https://buzz.xyz/support#open-source) now
  explains open-source versus hosted operation, identity recovery, phones and hosted community
  limits. It is not an end-to-end Compose/Helm operator runbook. The upstream README still
  promotes Railway under hosted relay, but also links the production Compose bundle under
  Quick start ([README](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/README.md#L182)).
  Saying Block only documents Railway is too broad. The guide's decision to omit Railway stays.
- **Builderlab and hosted pricing.** The launched [identity guide](https://buzz.xyz/support#identity)
  confirms automatic encrypted backup after signed-in identity setup/import, and no automatic
  Builderlab backup for independent import. The [pricing page](https://buzz.xyz/pricing) lists
  100 GB of shared data usage each month, no payment method to start, $0.15 per GB-month stored
  or GB delivered above the allowance, $0.65 per vCPU-hour for remote agents, and model-specific
  inference. Paid remote agents/inference are US-only. Hosted communities have 365-day retention
  and a 50-community account limit ([hosted guide](https://buzz.xyz/support#hosted-community)).
  The hosted [terms](https://buzz.xyz/terms-of-service), dated October 30, say they exclude
  independently self-hosted instances; connected hosted services retain their own terms.
  These are reported policy statements, not an interpretation of anyone's legal obligations.
- **Mobile.** The launch site's Get the app menu and [phone guide](https://buzz.xyz/support#mobile)
  link both the iPhone App Store and Android Google Play. Android app availability is separate
  from Android push support: #6092 and #3229 remain open. The guide's existing iPhone push
  evidence does not establish Android push or every private-network configuration.
- **Links and prices.** Every Block issue/PR used by the site or skill was read. Other than the
  shipped media replacement, open limitations remain open. All 32 collected external links and
  three changed destinations returned HTTP 200; the GitHub issue form redirects to sign-in.
  DigitalOcean still lists 4 GiB at $24/month, weekly backups at 20% extra, load balancers from
  $12/month and volumes at $0.10/GiB/month. Tailscale Personal allows six users for noncommercial
  use; Standard is $8/user/month. The guide now identifies the backup rate as weekly.
- **Repository security.** Read-only GitHub checks found main unprotected, no rulesets or tagged
  releases, and secret scanning/push protection disabled. The alerts endpoint cannot establish a
  zero-alert count when scanning is disabled. Gitleaks 8.30.1 (official archive checksum checked)
  scanned public history and all local refs with full redaction. Its 17 generic-key findings were
  16 WebSocket handshake nonces and one public NIP-42 challenge, not confirmed credentials.
  A supplemental tracked-file token/nsec/private-key scan returned zero matches. This does not
  prove absence. All 105 commits on the published main history use non-noreply author addresses;
  new review commits use GitHub noreply addresses. No history or GitHub settings were changed.
- **Browser and local checks.** The build, parser, all 13 identity self-tests, eight shell
  syntax checks and dependency audit passed (Vite 7.3.8, zero audit vulnerabilities). Chromium at
  desktop and phone widths exercised all ten quiz outcomes, seven setup tracks, all 21 FAQs and
  every click-through step. Final checks found no console errors, missing ordinary anchors,
  horizontal page overflow or axe violations in the checked states. Fixed the phone home-link
  name, mobile FAQ semantics, scrollable code focus and story contrast. The new 1200 by 630 OG
  image is local until deployment. `skills-ref` was not installed, so no validator pass is claimed.
- **Domain.** The existing Vercel production deployment serves `https://self-host.buzz`. Both
  `www.self-host.buzz` and the old Vercel domain redirect with 308 and preserve path/query.
  HTTPS returned 200 for `/`, `/llms.txt`, `/skills/self-host-buzz.tar.gz`,
  `/skills/self-host-buzz/scripts/new-identity.py` and `/_vercel/insights/script.js`.
  The reviewed source changes await permission to push and deploy; connecting the domain did not
  publish them.

## Full-guide overhaul, checked on 2026-11-11

The owner requested a full content, security and usability review after launch, including a real
question about whether self-hosters need an Apple developer account for phone notifications.
These changes are local; the production guide still serves the prior deployment.

- **Approach.** Keep one command source in the skill and expose a visible manual route beside the
  agent route. The skill is a distribution format, not a sandbox or proof of safe execution.
  Security and mobile prose now also render from shared references. No new deployment family was
  added: provider-neutral VPS, own hardware, local evaluation and existing Kubernetes cover the
  main choices. The guide explains capacity assumptions, GPU/model separation, home-server
  availability, managed services, GitOps secrets and evaluation versus production Kubernetes.
- **Agent security.** Stable app source launches ordinary Codex with broad access and Claude
  with bypassed per-action approvals. A Workspace folder does not isolate files or accounts.
  The new Security section recommends a separate device/VM for public-community agents, only
  intended files and scoped credentials, separate public/private context, and human review for
  consequential actions. It distinguishes internet reach, membership and channel access.
  [Codex runtime](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/codex/runtime.ts#L2529),
  [Claude launch](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/src/bundled/claude-code/claude.ts#L298),
  [experimental protection](https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md).
- **Keys.** Separate personal identity recovery in a private vault from relay recovery in a
  restricted shared operations vault. Verify the saved identity entry before deleting its
  temporary file; avoid shared clipboard history. Builderlab recovery requires a completed
  backup and access to that account. Exposed identities need ban/retirement, not only removal.
  The pin already revokes durable v2 invitations when their issuer is banned; per-link
  cancellation is not documented here and legacy links differ. Restoring a relay's original
  key is not rotation; old signatures remain verifiable under the original public key.
- **Phones.** The official iPhone app can use Block's gateway; self-hosters do not need their own
  Apple credentials for that route. Both `BUZZ_PUSH_ENABLED` and `BUZZ_PUSH_GATEWAY_DELIVERY_URL`
  must reach the relay process. The bundle supplies the latter; the relay parser has no fallback.
  The phone selects its gateway at build time, with no Settings URL field. An operator-owned
  gateway requires a matching custom app/Apple identity. Pairing, wake-ups and content retrieval
  are drawn separately. A capability advertisement is now labelled as such, not delivery proof.
  The recorded October 23 iPhone 0.25 test is historical evidence; fresh physical-phone testing
  remains open. Test a DM and explicit mention; other notification eligibility depends on client
  subscriptions/preferences. Android messaging availability does not establish Android push.
  [Bundle](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/deploy/compose/.env.example#L23),
  [phone gateway selection](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/mobile/lib/shared/relay/relay_provider.dart#L68),
  [custom gateway](https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/docs/push-gateway-deployment.md).
- **Recovery.** Removed the unvalidated nightly backup/pruning example. The Kubernetes export
  block now stops on failure, uses a new private directory and refuses overwrite. Three offline
  tests cover command failure, permissions and working-directory preservation. Separate live
  exports are not an atomic snapshot; a complete Kubernetes restore procedure remains open.
  The human flow says so explicitly. Backup files alone are not evidence of successful recovery.
- **Browser.** The expanded pass covers 21 FAQs across seven tracks at desktop and phone widths
  (294 FAQ states), all ten quiz outcomes and 476 diagram frames. Targeted desktop/tablet/phone
  checks cover manual deep links, preserved setup context and shareable FAQ links. No page errors,
  horizontal overflow or axe findings appeared in the checked states. Build and offline checks
  do not validate deployment or native app behavior.
- **Presentation decision.** The owner approved a concise public version/coverage note, replacing
  the prior no-test-label rule. The site names the reviewed stable app, retained relay pin and
  chart, and distinguishes source/browser checks from pending deployment/recovery/device work.
  Relevant validation limits remain in the rendered steps. No test date or support claim was
  advanced by this presentation change.

## Contents

- What's tested
- Agents other than Claude
- The Agent Skills standard
- Open Buzz issues the site links to
- Platform facts worth knowing
- Checked on 2026-10-12
- Buzz 1.0, checked on 2026-10-23
- Found on 2026-10-09, not yet in the skill

## What's tested

Every setup passed both a scripted test and an agent given nothing but the skill.
[tests/README.md](../tests/README.md) has the numbers by date, and [tests/runs/](../tests/runs/)
every run.

| Setup | Scripted | Agent runs | iPhone pairing |
| --- | --- | --- | --- |
| VPS, public | 101 of 101 on `sha-e8781ca`, and 119 of 119 upgrading from `sha-30873ba`; earlier 108 of 108 from MinIO to Silo | Claude, Codex, Goose | Tested, Buzz 0.X and 1.0, and notifications |
| VPS, private (Tailscale) | 52 of 52 | Claude, Codex, Goose | Tested |
| Kubernetes, public | 23 of 23 | Claude | Tested |
| Kubernetes, private (Tailscale) | 17 of 17 | Claude | Not covered |
| Railway | Deploy, members, backup, restore, pairing; a fresh deploy on 2026-10-23 | Claude | Tested |
| Local test (macOS, Docker Desktop, `https://localhost`) | 52 of 52 | Claude (the earlier plain mode) | Not applicable |

Buzz 0.X on macOS joined and posted on all seven. Buzz 1.0 joined the VPS and the local test by
hand on 2026-10-23 (see Buzz 1.0, checked on 2026-10-23). On 2026-10-06 a brand-new user's run passed:
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
- Buzz on Windows, and the agent running on Windows
- Scheduled backups and Docker log limits for a server that runs for months
- Trusting the local test's authority on Linux or Windows
- Huddles between two Buzz 1.0 users
- Kubernetes and the private network on `sha-e8781ca`
- Phone notifications anywhere but a public VPS (Railway, Kubernetes, the private network), and
  on Android, which has no push upstream yet (block/buzz#6092)

Buzz ships new images daily; the skill was last tested end to end on `sha-d1b7da4`, the Compose
path on `sha-30873ba`, and the VPS and the local test on `sha-e8781ca` (2026-10-23).

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

All open on 2026-10-23; none of the community fixes has merged. Several PRs wait on a Block member
to start a required security review.

| Issue | What breaks | Fix in progress |
| --- | --- | --- |
| [#5206](https://github.com/block/buzz/issues/5206) iPhone push | Still open, but it works now: with the App Store app 0.25 and `BUZZ_PUSH_ENABLED=true`, Block's gateway served a self-hosted relay (tested Oct 23) | `buzz-push-v1` ([#8206](https://github.com/block/buzz/pull/8206)); [#7760](https://github.com/block/buzz/pull/7760) for your own app and gateway |
| [#6092](https://github.com/block/buzz/issues/6092) Android push | No push notifications on Android at all | None; needs [#3229](https://github.com/block/buzz/issues/3229) |
| [#7721](https://github.com/block/buzz/issues/7721) Phone pairing | The bundle never starts the pairing service | None upstream; the skill adds it |
| [#4198](https://github.com/block/buzz/issues/4198) Phones on private IPs | The app rejects bare private addresses like `ws://10.0.0.1` | [#7266](https://github.com/block/buzz/pull/7266) |
| [#6923](https://github.com/block/buzz/issues/6923), [#4209](https://github.com/block/buzz/issues/4209) Invite links | Nothing on current images: Buzz 1.0 makes links under Settings, Community admin, Membership (made by hand Oct 23), Buzz 0.X has Settings, Invites, and the relay's invite API works (tested Oct 12) | Both still open; [#4311](https://github.com/block/buzz/pull/4311) fixes a nearby bug |
| [#2872](https://github.com/block/buzz/issues/2872) Buzz 0.X and CORS | The bundle's default blocks Buzz 0.X (Buzz 1.0 isn't affected) | [#2888](https://github.com/block/buzz/pull/2888) |
| [#6803](https://github.com/block/buzz/issues/6803) Moving from buzz.xyz | No way to bring a hosted community to your relay | None |
| [#5731](https://github.com/block/buzz/issues/5731) Export and restore | No portable export of a whole workspace | None |
| [#4952](https://github.com/block/buzz/issues/4952) Two addresses | A community answers on one address only | [#5410](https://github.com/block/buzz/pull/5410), [#5674](https://github.com/block/buzz/pull/5674) |
| [#7880](https://github.com/block/buzz/issues/7880) MinIO images | The chart the skill pins (0.1.10) still needs the image override | Fixed for Compose by [#8023](https://github.com/block/buzz/pull/8023), merged Oct 7 |
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
- **Buzz images:** the relay and Silo images run on x86 and ARM; `ghcr.io/block/buzz-minio`, which
  bundles before Oct 7 need, is x86 only.

## Checked on 2026-10-12

- **Silo replaced MinIO** in Block's Compose bundle (block/buzz#8023, merged Oct 7 as `d742fc5`).
  Silo is a maintained MinIO fork with x86 and ARM images on Docker Hub, pulled without a login.
  The bundle keeps MinIO's names (service `minio`, volume `buzz-prod_buzz-minio-data`, bucket
  `buzz-media`, `http://minio:9000`), so backups and restores didn't change. Block's bundle doesn't
  move the data; its README points to Silo's migration guide, which reuses the volume in place.
  Tested: `sha-9c6fa14` (MinIO 2025-09-07, `ghcr.io/block/buzz-minio`) upgraded to `sha-30873ba`
  kept every object, a file from before read back intact, and new uploads worked. Going back to the
  pre-upgrade backup on the old tag also worked. ARM servers are untested.
- **The bucket holds more than uploads:** each upload makes a file, a `_meta` record and, for
  images, a thumbnail. The git self-test adds `probe/` and `packs/` objects at every relay start.
- **Invite links work on a self-hosted relay.** The relay's `/api/invites`, which Buzz Desktop's
  Settings, Invites calls, worked on `sha-9c6fa14` and `sha-30873ba`. Desktop's side wasn't tried.
  #6923 and #4209 are still open upstream.
- **The owner can be changed:** a new `RELAY_OWNER_PUBKEY` and a restart make the old owner an
  admin, who `remove-member` can then remove. The current owner can't be removed. Tested on Compose
  only.

## Buzz 1.0, checked on 2026-11-06

Checked in block/buzz-app's source at v0.7.0-preview.248.1, and block/buzz at 744f3946f (the pin).

- **First run is account-first** (#2579, first in 248.1): Create account and Sign in are for a
  Builderlab account. Other options takes a community's address, then Connect to your community
  offers Sign in with Builderlab or Use an existing key. Buzz makes a new key only through an
  account.
- **Key import** (KeyImport.tsx, key-import.ts): paste the nsec, or drop or browse to a small
  file whose first line is one. Browse lists `.txt`, `.key` and plain-text files only.
- **One key per computer.** Only Sign out of Buzz removes it. Settings, Identity, Copy private key
  copies it without revealing it (PrivateKey.tsx). A computer with a key and no community opens on
  Join a community; one set up through Builderlab first asks Sign in or Continue without signing
  in.
- **The dock** (#2626, from 246.1): Activity, Messages and Agents down the left, the community
  button and the profile picture at its foot, Search across the top.
- **Pairing** ends with Codes match on the computer (#1597).
- **The `buzz` command line** comes with the app (`Contents/Resources/bin/buzz` on a Mac, built from
  block/buzz e3a0f3d59). The app's own key provider refuses moderation and deletion kinds, so
  moderating from it needs `BUZZ_PRIVATE_KEY`.
- **Intel Macs** are supported from 247.1 (#1825).

## Buzz 1.0, checked on 2026-10-23

Buzz 1.0 (github.com/block/buzz-app, beta; releases are prereleases named `0.0.0-preview.N.1`, so
`/releases/latest` answers 404) is the desktop app the guide now points to. Its macOS build is for
Apple Silicon only. Buzz 0.X, the app from block/buzz, still works with the same relay and is the
one for Intel Macs.

- **What it needs from a relay.** `https://` or `wss://` addresses only (it refuses `ws://` and
  `http://`), the relay's identity in NIP-11 (`self`, from `BUZZ_RELAY_PRIVATE_KEY`), NIPs 29 and
  43, and channel labels (`nip-cl`) for New chat, which images have from 2026-10-15. On
  `sha-30873ba` New chat is refused. Agents show online only on images from 2026-10-13 on. It
  makes its HTTP calls from the app itself, so CORS doesn't affect it; the Tauri entries stay for
  Buzz 0.X. check-relay.sh now checks `self` and `nip-cl`.
- **Which certificates it trusts** (buzz-app at 68ebbfe): the relay's HTTP calls go through
  reqwest 0.13 with rustls-platform-verifier (the system's trust settings), the live connection
  through the window's WebSocket (WebKit, system trust), huddle audio through rustls-native-certs
  (the system's store), and phone pairing through webpki-roots only (public authorities). So a
  local authority the Mac trusts covers everything but pairing.
- **Agents** run on the user's computer, each with its own key and the owner's NIP-OA
  attestation; with `BUZZ_ALLOW_NIP_OA_AUTH=true` (Compose, the chart and Railway's template) the
  relay admits them through the owner's membership. Tested on both VPS runs: an agent posted in a
  chat that named it without being added, its key alone was refused, and an agent of a non-member
  was refused.
- **Partition audit.** After the upgrade from `sha-30873ba` to `sha-e8781ca`,
  `buzz-admin partition-audit` said `degraded`, as block/buzz's monitoring doc expects for images
  before 2026-10-20 (diagnostic only; the relay kept working). A fresh install said `ok`.
- **By hand, 2026-10-23.** The owner joined a VPS (`wss://` on an sslip.io name) and a local test
  (`wss://localhost`, after trusting Caddy's local authority) from Buzz 1.0's first screen, made a
  channel and posted in each, and made an invite link (Settings, Community admin, Membership,
  Invite members, Invite with a link); the link's page answered. An iPhone running the App Store
  app paired with the VPS through Settings, Pair mobile, using the older code check ("Codes
  match"), and posted. New chat wasn't tried by hand: it needs an agent, and the scripted runs
  cover it.
- **UI paths** (from the source; the joins, the invite link and pairing confirmed by hand): npub in
  Settings, Identity, "Nostr address (npub)"; first screen "Join a community" with one field,
  "Invite link or community URL"; invites in Settings, Community admin, Membership, Invite members
  ("Add directly", "Invite with a link"); phones in Settings, Pair mobile, then Add community on
  the phone and a six-digit code. The in-app Join a community (community button) takes only an
  address, not an invite link. Before any community, Settings opens only with ⌘, (unconfirmed at
  runtime). Buzz 1.0 doesn't back up the private key: Settings, Identity, Copy private key.
- **Phone notifications work on a self-hosted relay.** Block's bundle has carried
  `BUZZ_PUSH_ENABLED=false` and `BUZZ_PUSH_GATEWAY_DELIVERY_URL=https://push.buzz.xyz/v1/deliveries/apns`
  since 2026-09-15 (#7261), and the App Store app 0.25 (2026-10-21) has the new `buzz-push-v1`
  push (#8206). Neither the gateway nor the app limits which relay can use it. On a public VPS
  (`sha-e8781ca`) with push on, the relay advertised `buzz-push-v1` and the phone published a
  kind 30350 lease that wakes it for messages that tag the user. A direct message and a mention
  from another member each produced one wake that the gateway accepted, and the locked iPhone
  showed both with their text. A plain channel message matched no lease and sent no wake, yet the
  owner saw a notification for it too; what showed it is unconfirmed. The wake itself is a
  constant "reconnect" signal (NIP-PL): no message passes through Block or Apple
  ([record](../tests/runs/2026-10-23-1641-push-check.md)).
- **Railway's template** was listed as degraded on 2026-10-23 (success rate 0 over 30 days; its
  2026-10-18 validation failed with "Your workspace has been restricted"), but a fresh deploy
  from the CLI the same day worked. On the template's `sha-788b3c0` every check passed except
  `nip-cl`; after the image update (`pick-tag.py` chose `sha-9e8c9fc`) every check passed. Railway's
  API then listed the template as published, health 92. Cost: $0.0002 of trial credit
  ([record](../tests/runs/2026-10-23-1425-railway-template-check.md)).

## Found on 2026-10-09, not yet in the skill

- **The relay has a built-in admin console**, off by default: moderation reports, bans, timeouts,
  deleting messages, member feedback, and adding moderators. `BUZZ_ADMIN_HOST=admin.<domain>`, with
  that name routed to the relay, turns it on. The owner gets operator access automatically, and
  Buzz Desktop finds it under Settings, Admin (a different host name than the relay's needs one
  click on Save). Tested on a Compose relay on Oct 9. A candidate optional step for the skill.
