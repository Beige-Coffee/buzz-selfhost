import skill from "virtual:skill-steps";
import { linkButton } from "../lib/permalink";
import { agentFlows, remoteFlows } from "./agentflow";
import { agentQuestions, remotePrompt, useExampleInstructions } from "./agents";
import { identityFlows, lostFlows } from "./identity";
import { clickThroughHTML, fitMembers, peopleFlows, type Flow } from "./members";
import { promptText, taskHTML } from "./operations";
import { SETUPS } from "../data/decide";
import { TABLER } from "./tabler";
import { copyText, enhanceCode } from "../lib/code";
import { jumpTo, registerAnchors } from "../lib/nav";
import { getValues, onValues, setValues, skillURL, trackHash, trackOf, type Track } from "../lib/values";

/**
 * Running your relay: what we recommend for people, keys, data and the server, and how to set it up.
 * Questions on the left and the answer on the right; on a phone the answer opens under its question.
 * Each answer leads with the recommendation, then shows how: a click-through of Buzz's own screens
 * where it happens in Buzz, a drawing where it happens on the server, and for backing up, restoring
 * and upgrading, the steps for the setup in the Running on box above (operations.ts). The facts the
 * access answers rest on, with sources: docs/access-and-keys.md.
 */

const OWN: Record<string, string> = {
  eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  alert: `<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.01"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  archive: `<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>`,
  list: `<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>`,
  link: `<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>`,
  restore: `<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>`,
  upgrade: `<path d="M12 19V5M5 12l7-7 7 7"/>`,
};
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${OWN[n] ?? TABLER[n]}</svg>`;

// no tick here, or anywhere on the page (the owner's call, 2026-11-18)
const rec = (t: string) => `<div class="fq-rec"><div><b>Recommended</b><p>${t}</p></div></div>`;
const note = (t: string) => `<p class="opx-note">${t}</p>`;
const steps = (rows: [string, string][]) =>
  `<ol class="opx-flow">${rows
    .map(([t, d], i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${t}</p><p class="opx-flow-d">${d}</p></div></li>`)
    .join("")}</ol>`;
/** Where a click-through of Buzz's screens goes; CLICK_THROUGHS has its flows. */
const ct = (name: string) => `<div class="fq-ct" data-ct="${name}"></div>`;

/** On a private network, a new member needs the tailnet too. */
const PRIVATE_PEOPLE =
  "<b>On a private network</b>, each person also joins your Tailscale network, with every device they use Buzz on. A company pays Tailscale for each person, from $8 a month.";

/**
 * The iPhone app's two starter channels (block/buzz mobile/lib/app.dart, the same in mobile-v1.0.0-rc.3,
 * v1.1.0-rc.3 and main). After someone joins with an invite link, it looks for open, unarchived streams
 * named general and welcome-everyone, and creates any that's missing; whoever creates a channel owns it
 * (buzz-db store/channel.rs). If the relay refuses, the join fails with "Starter channels could not be set
 * up". A private channel doesn't hold the name, so the phone adds an open one beside it. An archived
 * channel or a forum does hold it: phones before 0.28 then fail (app.dart:150 at mobile-v0.27.2-rc.1), and
 * later ones fail on an archived holder their channel list doesn't show (app.dart:171-196 at v1.1.0-rc.3).
 */
const chan = (lock: boolean, name: string, tag: string, cls = "") =>
  `<p class="fq-ch${cls}">${icon(lock ? "lock" : "hash")}<span>${name}</span><em>${tag}</em></p>`;
const STARTERS = `<div class="fq-vis fq-starters">
  <div class="fq-side"><span class="fq-tag yes">Do</span>${chan(false, "general", "Open · Starter", " st")}${chan(false, "welcome-everyone", "Open · Starter", " st")}${chan(true, "team", "Private")}</div>
  <div class="fq-side bad"><span class="fq-tag no">Avoid</span>${chan(true, "general", "Private: phones add an open one")}${chan(false, "<s>general</s>", "Archived: phones may fail to join")}${chan(false, "<s>welcome-everyone</s>", "Missing: the first phone owns it")}</div>
</div>`;

const CLICK_THROUGHS: Record<string, Flow[]> = {
  identity: identityFlows,
  lost: lostFlows,
  role: peopleFlows().filter((f) => f.id === "role"),
  // the invite link as we recommend it: a day, and the people you expect. Buzz can't add an npub since 1.0.1.
  add: peopleFlows("1 day", "5").filter((f) => f.id === "link"),
  remove: peopleFlows().filter((f) => f.id === "remove"),
  agents: agentFlows,
  remote: remoteFlows,
};

/**
 * Buzz 1.0's Moderation screens (relay staff) need the relay to advertise an admin address
 * (BUZZ_ADMIN_HOST), which the skill offers on a public Compose setup only: the app refuses private and
 * local addresses (block/buzz-app src-tauri/src/relay_admin/net.rs), and Block's chart has no setting for it.
 * The answers say so in a sentence rather than change with the setup (owner's call, 2026-11-23).
 */
const SCREENS_WHERE = "a VPS or your own hardware, on the internet";

/**
 * Who can do what: the app's own permission rules (block/buzz-app, src/bundled/moderation/api.ts). Any
 * member can report a message. Banning, timing out and deleting others' messages happen in the Moderation
 * screens for relay staff (the owner, as the relay's operator, and whoever is added under Staff), or from
 * the command line for the owner and admins (block/buzz crates/buzz-relay/src/handlers/moderation_authz.rs).
 */
const YES = `<span class="fq-y">Yes</span>`;
const NO = `<span class="fq-n">No</span>`;
const IF_STAFF = `<span class="fq-if">If on Staff</span>`;
const ROLES = `<div class="fq-vis"><table class="fq-roles">
  <thead><tr><th></th><th>${icon("crown")}Owner</th><th>${icon("shield")}Admin</th><th>${icon("user")}Member</th></tr></thead>
  <tbody>
    <tr><td>Make invite links</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Remove members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Add, promote or remove admins</td><td>${YES}</td><td>${NO}</td><td>${NO}</td></tr>
    <tr><td>Report a message</td><td>${YES}</td><td>${YES}</td><td>${YES}</td></tr>
    <tr><td>Ban, time out, delete others' messages</td><td>${YES}</td><td>${YES}</td><td>${IF_STAFF}</td></tr>
    <tr><td>Add someone by npub</td><td colspan="3" class="fq-srv">${icon("server")}On the server, by whoever runs it</td></tr>
    <tr><td>Change the owner</td><td colspan="3" class="fq-srv">${icon("server")}On the server, by whoever runs it</td></tr>
  </tbody></table></div>`;

/** Moderating: in Buzz's screens where the relay can offer them, otherwise with the buzz command line. */
const MODERATION =
  rec(`Ban rather than only remove. On ${SCREENS_WHERE}, turn on Buzz's moderation screens and add your moderators under Staff.`) +
  steps([
    ["Turn on the moderation screens", "Your agent offers this during setup, or ask it later. It takes one more DNS record, for <code>admin.</code> in front of your domain."],
    ["Add your moderators under Staff", "In Buzz, <b>Settings</b>, <b>Moderation</b>, <b>Staff</b>: paste their npub, pick <b>moderator</b>, then choose <b>Add</b>. Being an admin isn't enough: Staff is a list of its own, which the owner manages."],
    ["Work through reports", "Anyone can report a message. Moderators find reports under <b>Settings</b>, <b>Moderation</b>, <b>Reports</b>, where they can delete it, time the person out or ban them."],
  ]) +
  note("<b>Ban, don't only remove.</b> A ban keeps them out, even with an invite link, and cuts off their agents. Someone you only remove can come back with any link that hasn't expired.") +
  note(
    "<b>On a private network, Kubernetes or a local test</b>, Buzz's moderation screens can't reach your relay. So the owner or an admin moderates with the <code>buzz</code> command line that comes with Buzz 1.0 (on a Mac, <code>/Applications/Buzz.app/Contents/Resources/bin/buzz</code>), signed with their own key: <code>buzz moderation</code> lists the reports members send, and bans or times people out, and <code>buzz messages delete</code> removes a message.",
  );

/**
 * Who lets agents in (block/buzz 0.3.0): with BUZZ_ALLOW_NIP_OA_AUTH on, as the bundle and the chart
 * ship it, a member's agents get in with their owner's proof; off, only keys on the member list do
 * (handlers/auth.rs). A key on the list counts as a person: no owner recorded, 60 messages a minute
 * instead of an agent's 120 (buzz-auth rate_limit.rs). Buzz 1.0.5 shows a refused agent's turn as
 * "Couldn't finish" (ActivityOutcome.tsx).
 */
const DOOR = (() => {
  const line = (on: boolean) => `BUZZ_ALLOW_NIP_OA_AUTH=${on}`;
  return (
    note("<b>Approve each agent yourself?</b> A member's own agents get in with them, without anyone adding them. To approve each one, switch that off and add the agents you allow as members.") +
    `<div class="fq-vis fq-door">
      <div><code>${line(true)}</code><p><b>This guide's setting.</b> A member's agents get in with them.</p></div>
      <div class="on"><code>${line(false)}</code><p><b>You approve.</b> Only agents you add as members get in.</p><small>Ask your agent to switch it and restart the relay. On Kubernetes, it's <code>relay.allowNipOaAuth</code> in the chart's values.</small></div>
    </div>` +
    note("Add the agents you keep as members first, or they're locked out. A member's new agent then ends with <b>Couldn't finish</b>, and Buzz doesn't say why, so tell members to ask an admin.") +
    note("An agent added as a member counts as a person: 60 messages a minute instead of an agent's 120, and Buzz doesn't record who owns it.")
  );
})();

/** A lost device: one question decides everything, whether the key is exposed. */
const CASES = `<div class="fq-vis fq-cases">
  <p class="fq-cases-q">${icon("device-mobile")}<span><b>Could someone get into the lost device?</b>It was unlocked, had no disk encryption, or someone knows its password.</span></p>
  <div class="fq-case bad">
    <p class="fq-case-h"><span class="fq-tag no">Yes, or not sure</span><b>The key is exposed: retire it</b></p>
    <ol><li>Have the old identity banned, by the owner or a moderator. Removing it isn't enough: a live invite link lets it back in. If it was the owner's, change the owner on the server first, then remove and ban the old key, which stays an admin until you do.</li><li>Make a new key on the new device. Not the saved copy: whoever has the device has that key too.</li><li>An admin sends a 1-use invite link, or whoever runs the server adds the new npub.</li><li>Pair the phone, start their agents again, and tell any other community they joined.</li></ol>
  </div>
  <div class="fq-case good">
    <p class="fq-case-h"><span class="fq-tag yes">No</span><b>The key is safe: bring it back</b></p>
    <ol><li>Sign in on the new device with the saved copy: <b>Other options</b>, the community's address, <b>Continue</b>, then <b>Use an existing key</b>.</li><li>No local copy? If a Builderlab backup completed, sign in to that account to recover it. With neither backup, make a new identity and have it added again.</li><li>Pair the phone again.</li></ol>
  </div>
</div>`;

/**
 * Two ways to get a key (decision of 2026-11-06): the skill's key script, which the site serves with the
 * rest of the skill, or a Builderlab account, Block's, which can back the key up with Block
 * (block/buzz-app#2325) and, created on Block's hosted page, asks for the person's details (#2579).
 */
const KEYMAKER = skillURL("scripts/new-identity.py");
const ADD_MEMBER = skillURL("references/operations.md");
const KEYS =
  note(
    `There are two ways to get a key. This guide's <a href="${KEYMAKER}">key script</a> makes one on your computer with Python, saves it in a file only you can read and shows only its npub. Or <b>Create account</b> on Buzz's first screen makes one with a Builderlab account, which is Block's: Block can keep a copy of the key, and creating the account asks for your details.`,
  ) +
  `<pre class="cmd">curl -fsSLO ${KEYMAKER} &amp;&amp; python3 new-identity.py</pre>` +
  note(
    "With the script's key, join with <b>Other options</b>, the community's address, <b>Continue</b>, then <b>Use an existing key</b>, and drop the key file on the page. Then save the key in your password manager from <b>Settings</b>, <b>Identity</b>, the Buzz ID card’s <b>More options</b> (…), the masked private-key field, then <b>Copy</b>, and confirm the saved entry is recoverable before deleting the temporary file. Clear the copied key from the clipboard when finished; avoid shared clipboard/history tools. Builderlab can keep a copy of a key made or imported after you sign in to it, and gives it back to whoever signs in to that account: keep work identities in your own private vault in a team-approved password manager instead.",
  );

/** Single sign-on today: two locks in a row, your company's login and Buzz's member list. */
const LOCKS = `<div class="fq-vis fq-locks">
  <div class="fq-lk-who"><span class="fq-av">${icon("user")}</span><b>Someone at your company</b></div>
  <div class="fq-lk"><span class="fq-lk-n">1</span>${icon("lock")}<b>Your company login</b><span>Tailscale signs them in with Google, Microsoft, Okta or GitHub.</span></div>
  <div class="fq-lk"><span class="fq-lk-n">2</span>${icon("users")}<b>The member list</b><span>The relay lets in only the keys on Membership.</span></div>
  <div class="fq-lk-end">${icon("server")}<b>Your relay</b><span>private network</span></div>
</div>`;

/**
 * Two-factor sign-in, researched 2026-11-19: the relay checks no second factor (no amr, acr or step-up
 * in block/buzz 0.3.0 or main). It can require company sign-in through NIP-FI (BUZZ_NIP_FI_MODE,
 * crates/buzz-relay/src/nip_fi_config.rs), but the Buzz apps send that proof only to the sign-in
 * servers built into them: Builderlab for Block-hosted and Builderlab customer addresses (block/buzz-app
 * src-tauri/src/federated_identity/mod.rs server_for; built-in-server.json). So a private network whose
 * login asks for a second factor is what a self-hosted community can use. Drawn: today, and with one.
 */
const tfaStep = (i: string, t: string, d: string) => `<div class="fq-tfa-step"><span class="fq-tfa-i">${icon(i)}</span><div><b>${t}</b><small>${d}</small></div></div>`;
const TWO_FACTOR = `<div class="fq-vis fq-tfa">
  <div class="fq-tfa-col"><p class="fq-tfa-h"><span class="fq-tag no">Buzz today</span>one factor</p>
    ${tfaStep("key", "Their key", "Whoever holds the key signs in as them.")}
  </div>
  <div class="fq-tfa-col good"><p class="fq-tfa-h"><span class="fq-tag yes">With a private network</span>two factors</p>
    ${tfaStep("lock", "Your company login", "A password and a second factor, through Tailscale, before the relay can be reached.")}
    ${tfaStep("key", "Their key", "Then the member list lets them in.")}
  </div>
</div>`;

/**
 * One key per computer account: Buzz on desktop holds one identity for every community ("Your identity
 * is shared across communities", block/buzz-app v1.0.5 src/app/IdentitySettings.tsx), and Remove from
 * device takes it off for all of them (src/features/identity/SignOut.tsx). Names are illustrative.
 */
const keyRow = (who: string, key: string, comms: string[], cls = "") =>
  `<div class="fq-onekey${cls}"><span class="fq-ok-who">${icon("user")}<b>${who}</b></span><span class="fq-ok-key">${icon("key")}${key}</span><span class="fq-ok-arrow" aria-hidden="true">→</span><span class="fq-ok-comms">${comms.map((c) => `<em>${c}</em>`).join("")}</span></div>`;
const ONE_KEY = `<div class="fq-vis fq-onekeys">
  ${keyRow("Your account on this computer", "Key A", ["Your team", "An open community", "Any other"])}
  ${keyRow("A second account, or another device", "Key B", ["The community kept apart"], " b")}
</div>`;

/**
 * A channel's General access, set to View only, as Buzz 1.0.5 draws it: Manage members, then General
 * (block/buzz-app src/bundled/channels/ChannelGeneralAccess.tsx and src/features/channels/general-access.ts).
 * View only keeps the channel open and gives people who join the guest role, who can read but not post
 * or react (block/buzz 0.3.0 crates/buzz-core/src/channel.rs can_post).
 */
const VIEW_ONLY = `<div class="fq-vis"><div class="fq-access"><p class="fq-acc-t">General</p>
  <div class="fq-acc-row"><span class="fq-acc-i">${icon("eye")}</span><div><b>Anyone in the community</b><span>New people can only view.</span></div><em>View only ▾</em></div>
  <div class="fq-acc-menu">
    <div class="fq-radio"><i></i><div><b>Public</b><span>Anyone in the community can participate.</span></div></div>
    <div class="fq-radio on"><i></i><div><b>View only</b><span>Anyone in the community can read.</span></div></div>
    <div class="fq-radio"><i></i><div><b>Private</b><span>Only people you add can access.</span></div></div>
  </div>
</div></div>`;

/** A leak: what to do, by which key leaked. */
const lane = (head: string, cls: string, chips: string[]) =>
  `<div class="fq-lane${cls}"><span class="fq-lane-k">${head}</span>${chips.map((c) => `<span class="fq-chip">${c}</span>`).join("")}</div>`;
const LANES = `<div class="fq-vis fq-lanes">
  ${lane(`${icon("key")}A person's key`, "", ["Ban it", "Add their new identity"])}
  ${lane(`${icon("server")}The relay key`, "", ["Treat the server as exposed", "Ask before a new key"])}
  ${lane(`${icon("alert")}The server itself`, " hot", ["Change its logins", "Assume every message was read"])}
</div>`;

/** A short list to work through in order, numbered: nothing on the page ticks. */
const checklist = (items: [string, string, string?][]) =>
  `<div class="fq-vis"><ol class="fq-check fq-numbered">${items
    .map(
      ([t, d, only], i) =>
        `<li><span class="fq-num" aria-hidden="true">${i + 1}</span><div><b>${t}${only ? ` <span class="fq-only">${only}</span>` : ""}</b><p>${d}</p></div></li>`,
    )
    .join("")}</ol></div>`;

/** The server's door: personal SSH keys, and two-factor sign-in on the hosting account. Keys are illustrative. */
const ACCESS = `<div class="fq-vis fq-access">
  <div class="fq-term"><p class="fq-term-h"><i></i><i></i><i></i><span>the server</span></p>
    <pre><span class="p">$</span> cat ~/.ssh/authorized_keys
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5…Qk2 maya@laptop
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5…7fA sam@laptop</pre></div>
  <div class="fq-card"><p class="fq-card-h">${icon("lock")}Hosting account</p><p><span>Maya</span><em>Two-factor on</em></p><p><span>Sam</span><em>Two-factor on</em></p><p class="fq-dim">Nobody else</p></div>
</div>`;

/** Where the relay key lives: the server's .env, one copy in a shared vault, and encrypted backups. */
const KEY_HOME = `<div class="fq-vis fq-keyhome">
  <div class="fq-card"><p class="fq-card-h">${icon("server")}<code>.env</code> on the server</p><code class="fq-line">BUZZ_RELAY_PRIVATE_KEY=••••••••</code><code class="fq-line">POSTGRES_PASSWORD=••••••••</code><code class="fq-line">REDIS_PASSWORD=••••••••</code></div>
  <span class="fq-arrow">copy</span>
  <div class="fq-card dark"><p class="fq-card-h">${icon("lock")}A shared vault</p><p class="fq-vitem">${icon("key")}<span><b>.env</b><small>buzz.yourteam.org</small></span></p><p class="fq-people"><span>Maya</span><span>Sam</span></p><p class="fq-dim">each with two-factor sign-in</p></div>
  <span class="fq-arrow">and</span>
  <div class="fq-card"><p class="fq-card-h">${icon("archive")}Backups</p><p>Hold <code>.env</code> too.</p><p class="fq-dim">Encrypted before they leave the server</p></div>
</div>`;

/** Who can read what: encrypted on the way, stored as written. */
const READ = `<div class="fq-vis fq-read">
  <div class="fq-rd-apps">${icon("device-desktop")}${icon("device-mobile")}<b>Buzz apps</b></div>
  <div class="fq-rd-wire"><span>${icon("lock")}encrypted on the way</span></div>
  <div class="fq-card"><p class="fq-card-h">${icon("server")}Your server</p>
    <p class="fq-msg"><i># general</i>Release is Friday</p>
    <p class="fq-msg dm"><i>direct message</i>Here are the Q4 numbers.</p>
    <p class="fq-msg"><i>file</i>plan.pdf</p>
    <p class="fq-eye">${icon("eye")}Readable with server, database or backup access</p>
  </div>
</div>`;

/** A record of who did what: the relay's chained audit log, and the hosting provider's own log. */
const entry = (time: string, what: string, hash: string) => `<p class="fq-le"><time>${time}</time><b>${what}</b><code>${hash}</code></p>`;
const LEDGER = `<div class="fq-vis fq-audit">
  <div class="fq-card"><p class="fq-card-h">${icon("list")}Audit log, in the relay's database</p>
    ${entry("09:12", "Leo posted in #release", "a41f…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("09:40", "plan.pdf uploaded", "7c02…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("16:05", "Sam removed Leo", "e9b8…")}
  </div>
  <div class="fq-card"><p class="fq-card-h">${icon("lock")}Your hosting provider's log</p><p class="fq-le"><time>08:58</time><b>Maya signed in to the server</b></p><p class="fq-dim">Who touched the server itself</p></div>
</div>`;

/**
 * What still reaches Block from a self-hosted community: the apps' update checks (block/buzz-app
 * src/features/updates/updates.ts, hourly, installed on restart), push through push.buzz.xyz (the relay's
 * public key, IP and wake timing; a fixed payload, crates/buzz-push-gateway/src/model.rs; docs/buzz-push.md calls it
 * experimental), and Builderlab's key backup and community list (block/buzz-app#2325, known-communities).
 */
const dep = (i: string, t: string, d: string) => `<li><span class="fq-dep-i">${icon(i)}</span><div><b>${t}</b><p>${d}</p></div></li>`;
const DEPS = `<div class="fq-vis"><ul class="fq-check">${[
  dep("download", "Apps and images", "Buzz's apps and the relay's images come from Block. The desktop app checks for updates every hour and downloads them; they install when you restart it."),
  dep(
    "bell",
    "iPhone notifications",
    "They go through Block's gateway, <code>push.buzz.xyz</code>. No message text passes through it, but it sees your relay's public key, your server's IP address and when it wakes which phone, and Apple sees when a phone is woken. Block calls push experimental; <code>BUZZ_PUSH_ENABLED=false</code> turns it off.",
  ),
  dep("user", "Builderlab accounts", "Signing in to Builderlab, Block's service, can give Block a copy of your key, and tells it which communities you join. A key from this guide's key script needs no account."),
].join("")}</ul></div>`;

/**
 * A push notification, drawn by who runs each part: the wake-up leaves your relay through Block's
 * gateway and Apple, and the message itself comes back from your relay once the phone connects
 * (block/buzz docs/buzz-push.md). The answer to "do we need our own gateway and Apple credentials?":
 * no, only the first box is yours.
 */
const pn = (who: string, i: string, t: string, d: string, cls = "") =>
  `<div class="fq-pn${cls}">${who ? `<span class="fq-pn-k">${who}</span>` : ""}${icon(i)}<b>${t}</b><span>${d}</span></div>`;
const PUSH = `<div class="fq-vis fq-push">
  <div class="fq-push-row">
    ${pn("You run", "server", "Your relay", "knows a message is waiting", " mine")}
    ${pn("Block runs", "bell", "Push gateway", "<code>push.buzz.xyz</code>")}
    ${pn("Apple runs", "bolt", "Apple's push service", "wakes the phone")}
    ${pn("", "device-mobile", "A member's locked iPhone", "the App Store's Buzz app", " end")}
  </div>
  <i class="fq-push-u" aria-hidden="true"></i>
  <p class="fq-push-way"><i class="out" aria-hidden="true"></i><span><b>The wake-up</b> goes out through Block and Apple. It carries no message text.</span></p>
  <p class="fq-push-way"><i class="back" aria-hidden="true"></i><span><b>The message</b> comes straight from your relay, once the phone connects.</span></p>
</div>`;
/** mobile.md's sections, by title: the ones a setup needs stay open, the rest fold. A missing one fails loudly. */
const phone = (title: string) => skill.mobile.find((x) => x.title === title)?.html ?? `<p class="fq-missing">mobile.md lost its "${title}" section.</p>`;
const fold = (title: string, html: string) => `<details class="fq-fold"><summary>${title}</summary><div class="fq-mobile">${html}</div></details>`;
const PHONE_OPEN = ["Turn notifications on", "Pair a phone", "Test with the phone locked"];
const PHONE_FOLDED = ["What Block and Apple see", "Android", "Run your own gateway"];
const MOBILE =
  rec("Turn notifications on and use Block's gateway with the App Store's Buzz app. You need no Apple developer account, no Apple push credentials and no gateway of your own.") +
  note("Phones pair on every server setup except Kubernetes on a private network, which this guide doesn't cover yet. A local test can't pair phones.") +
  PUSH +
  // docs/research.md: Block's bundle notes name "the public gateway"; block/buzz#5206 is where self-hosters asked for it
  note(
    `It worked in this guide's tests on 23 and 27 October and on 12 November 2026, the last with relay 0.3.0. Block calls push experimental and promises no level of service (<a href="https://github.com/block/buzz/issues/5206">block/buzz#5206</a>), so run the locked-phone test below before your team relies on it.`,
  ) +
  `<div class="fq-mobile">${PHONE_OPEN.map((x) => `<h4>${x}</h4>${phone(x)}`).join("")}</div>` +
  PHONE_FOLDED.map((x) => fold(x, phone(x))).join("");

interface Question {
  id: string;
  icon: string;
  q: string;
  /** the answer, or for an answer that depends on the setup, how to draw it for one */
  a: string | ((t: Track) => string);
}

const GROUPS: [string, Question[]][] = [
  [
    "People",
    [
      {
        id: "add",
        icon: "users",
        q: "How should we add people?",
        a:
          rec("Send an invite link that expires after a day, limited to the people you expect. To add someone without a link, add their npub on the server.") +
          ct("add") +
          note(
            `Each person needs a key first (<a href="#operations" data-q-link="identity">how to get one</a>). With a link they join by themselves. To be added by npub they send it to you: the key script prints it, and Buzz shows it if they try to join before you add them.`,
          ) +
          // block/buzz-app: v1.0.0's Add directly is off in every release from v1.0.1 (src/bundled/moderation/features.ts)
          note(
            `Buzz can't add an npub itself since 1.0.1. Ask your agent to add it, or run the skill's <a href="${ADD_MEMBER}">add-member command</a> on the server.`,
          ) +
          // starter channels, from block/buzz#8594 (in the pin): invite claims, not buzz-admin add-member
          note("In a public channel's settings, turn on <b>Starter channel for new members</b>: everyone who joins by link joins it. People added on the server don't, so add them to the channels they need.") +
          note("<b>Before the first phone joins</b>, create two open channels named exactly <code>general</code> and <code>welcome-everyone</code>, and turn on Starter channel for new members in both. Buzz on iPhone looks for them by name after someone joins with a link.") +
          STARTERS +
          note("Keep both open, unarchived and not forums. Give a private team channel another name, such as <code>team</code>.") +
          // links last 30 days at most (block/buzz crates/buzz-core/src/invite.rs); nothing revokes one (#8529 open)
          note(
            `For a public project, once you've set up <a href="#operations" data-q-link="moderate">moderation</a>, post an invite link on your site or README with a use limit, and replace it when it fills or expires. A link lasts 30 days at most, and Buzz can't cancel one early. Banning the person who made a link cancels every link they made.`,
          ) +
          note(PRIVATE_PEOPLE),
      },
      {
        id: "welcome",
        icon: "message-circle",
        q: "How should we welcome new members?",
        a:
          rec("Make <code>welcome-everyone</code> a view-only welcome channel, with what a newcomer needs in one message, and keep <code>general</code> open for talk. Phones open <code>welcome-everyone</code> when someone joins.") +
          note("In the channel, choose <b>Manage members</b> at the top, then set <b>General access</b> to <b>View only</b>.") +
          VIEW_ONLY +
          note("People who join can read, and can't post or react. People already in it keep their role, so set it before you invite anyone.") +
          // block/buzz 0.3.0 crates/buzz-workflow/src/schema.rs TriggerDef: message_posted, reaction_added, diff_posted, schedule, webhook
          note("Buzz can't greet people by itself: workflows have no trigger for someone joining. For a personal welcome, have an agent watch for new members and message each one.") +
          note(`Both channels need those exact names, for phones: see <a href="#operations" data-q-link="add">How should we add people?</a>`),
      },
      { id: "notifications", icon: "device-mobile", q: "How do phones and notifications work?", a: MOBILE },
      {
        id: "roles",
        icon: "crown",
        q: "How should we set up roles?",
        a:
          rec("Make the person who runs Buzz the owner, and name at least two admins, so someone can always add or remove people.") +
          ROLES +
          note(`Staff is the moderation screens' list, so it exists only on ${SCREENS_WHERE}. Elsewhere, the owner and admins ban from the command line: see <a href="#operations" data-q-link="moderate">How do we moderate?</a>`) +
          note("<b>Keep invitations to yourself?</b> Make no admins: members can't make invite links.") +
          ct("role") +
          note(`The owner is set on the server, so whoever runs it changes it. The old owner stays on as an admin. Banning is a separate tool: see <a href="#operations" data-q-link="moderate">How do we moderate?</a>`) +
          // block/buzz 0.3.0 crates/buzz-core/src/channel.rs decide_member_put: anyone who can post adds; only owners and admins grant admin
          note("<b>Private channels are separate.</b> Anyone in one can add people to it, except a guest, and only its owners and admins can make someone an admin of it. Keep its members to people you'd trust with its guest list."),
      },
      {
        id: "moderate",
        icon: "shield",
        q: "How do we moderate?",
        a: MODERATION + DOOR,
      },
      {
        id: "leave",
        icon: "logout",
        q: "What do we do when someone leaves?",
        a:
          rec("Run the same checklist on their last day.") +
          checklist([
            ["Remove them in Membership", "As below. It disconnects them and their agents. An invite link that hasn't expired still lets them back in."],
            ["Remove them from Tailscale", "And their devices.", "private network"],
            ["Remove them from Staff", "In <b>Settings</b>, <b>Moderation</b>, <b>Staff</b>.", "if they were on Staff"],
            ["Close the way back in", "A ban keeps them out even with a live link, and cancels every link they made. Buzz can't cancel one link by itself, so keep links short-lived and limited to the people you expect."],
            ["Remove their server and hosting access", "Their SSH key and their account with your hosting provider. Any copy of <code>.env</code> or a backup they kept still holds the server's passwords.", "if they had it"],
            ["Remove them from the shared vault", "It holds <code>.env</code>, with the relay key and the passwords.", "if they had it"],
            ["Hand over ownership first", "Make someone else the owner on the server before removing them.", "if they were the owner"],
          ]) +
          ct("remove") +
          note("Messages already on their devices stay there: Buzz can't wipe a device."),
      },
    ],
  ],
  // the six agent answers live in agents.ts, "How should we run agents?" first
  ["Agents", agentQuestions({ rec, note, ct })],
  [
    "Identity and keys",
    [
      {
        id: "identity",
        icon: "key",
        q: "How should each person set up their identity?",
        a:
          rec("One work identity per person, with its private key in that person's private vault in a team-approved password manager. Make the key with this guide's key script, so no copy goes to Block.") +
          ct("identity") +
          KEYS +
          note("Never put a private key in a chat, an agent prompt, an issue or a screenshot.") +
          note("A saved key or completed Builderlab backup can restore the same identity. Without a recovery copy, create a new identity; changing community ownership does not recover the old key."),
      },
      {
        id: "separate-identity",
        icon: "user",
        q: "Can someone use a different identity in each community?",
        a:
          rec("No: Buzz on desktop uses one key in every community you join. Pick the identity you'll use for Buzz before joining. For one kept apart, use a second user account on your computer, or another device.") +
          ONE_KEY +
          note("Signing out to switch isn't an answer: removing the key takes every community off that computer until you sign in with it again.") +
          note("A key made for Buzz with this guide's key script works in every community, and keeps your other Nostr identity out of it."),
      },
      {
        id: "lost",
        icon: "device-mobile",
        q: "What do we do when a laptop or phone is lost?",
        a:
          rec("First decide whether the key is exposed. If anyone could get into the device, retire the key for a new identity, even if a copy was saved.") +
          CASES +
          ct("lost") +
          note("Buzz can't cut off one device: the key is the identity, so retiring it means a new one. What the old key wrote stays under its name."),
      },
      {
        id: "leak",
        icon: "alert",
        q: "What if a key leaks?",
        a:
          rec(
            `Have a leaked person's key banned in every community it belongs to, then give them a new identity. If the relay key leaked, treat the server as exposed, and ask in block/buzz before replacing it: a new key orphans your channels today (<a href="https://github.com/block/buzz/issues/7357">block/buzz#7357</a>).`,
          ) +
          LANES +
          note("The old key still works in any other community that person joined, since a Buzz identity isn't tied to one community."),
      },
      {
        id: "sso",
        icon: "lock",
        q: "Can we use single sign-on?",
        a:
          rec("Not on your own relay yet: everyone signs in with their own key. The next best thing is a private network, where your company login decides who can reach the relay at all.") +
          `<div class="fq-status"><span class="fq-status-k">${icon("bolt")}In progress in Buzz</span><p>Buzz has company sign-in on a draft standard, <a href="https://github.com/block/buzz/blob/main/docs/nips/NIP-FI.md">NIP-FI</a>: your identity provider vouches for each person's key. The relay supports it behind a setting that's off by default. The app Block publishes uses it only with Block's own sign-in service, for communities Block hosts; another company's sign-in needs a build of the app made for it. So a self-hosted community can't turn it on yet.</p></div>` +
          LOCKS +
          steps([
            ["Run the relay on a private network", `On a VPS, your own hardware or Kubernetes, with <b>Private network</b> on. <a href="#guide" data-go-private>Set it up</a>.`],
            ["Sign up for Tailscale with your identity provider", "Google, Microsoft, Okta or GitHub, among others, so only company accounts can join your network. On Tailscale's paid plans, provisioning from your identity provider, such as Okta, suspends someone in Tailscale when you deactivate them."],
            ["Keep the member list as the second lock", "The network gets someone to the relay; only Membership lets them in. When someone leaves, remove them in both places."],
          ]),
      },
      {
        id: "two-factor",
        icon: "shield",
        q: "Can we require two-factor sign-in?",
        a:
          rec("Not in Buzz yet: a member signs in with their key alone. For a private team, put the relay on a private network whose login asks for a second factor. For an open community, keep anything sensitive out.") +
          TWO_FACTOR +
          steps([
            ["Run the relay on a private network", `With <b>Private network</b> on in the setup. <a href="#guide" data-go-private>Set it up</a>.`],
            ["Make your identity provider ask for a second factor", "Sign up for Tailscale with Google, Microsoft, Okta or GitHub, and require two-factor there. Nobody reaches the relay without it."],
            ["Protect the key too", "It is the first factor: a password manager with two-factor, disk encryption and a screen lock on every device."],
          ]) +
          note("A private network suits a team, not an open community of thousands: each member needs Tailscale on every device.") +
          note(`The relay can require sign-in through a company identity provider, but the Buzz apps people download only do that for communities Block hosts, Builderlab included. See <a href="#operations" data-q-link="sso">Can we use single sign-on?</a>`),
      },
    ],
  ],
  [
    "Data",
    [
      {
        id: "backup",
        icon: "archive",
        q: "How should we back up?",
        a: (t) => rec("Back up at least once a week and before every upgrade, and keep an encrypted copy away from the server.") + taskHTML("backup", t),
      },
      {
        id: "restore",
        icon: "restore",
        q: "How do we restore a backup?",
        a: (t) =>
          rec("Restore the newest verified complete backup and keep the relay's address: members' apps then reconnect by themselves. Anything from after the backup is lost.") +
          taskHTML("restore", t),
      },
      {
        id: "read",
        icon: "eye",
        q: "Who can read our messages?",
        a:
          rec("Anyone with access to the server, its database or its backups can read every message, direct messages included. Protect the server the way you'd protect the messages.") +
          READ +
          note(
            `Keep server access small, turn on your provider's disk encryption, encrypt backups, and consider a private network, where the relay has no public address. Phone notifications carry no message text, but Block's gateway sees your relay's public key, your server's IP address and when it wakes which phone: see <a href="#operations" data-q-link="block">What still depends on Block?</a>`,
          ) +
          // reads check community membership only (block/buzz crates/buzz-relay/src/api/media.rs); #8444 and #9077 start off
          note(
            `Files are shared with the whole community, not one channel. Any member with a file's link can open it, even from a private channel or a direct message they're not in. A link can't be guessed, but removing someone from a channel, or deleting the message, doesn't take a file back. Removing them from the community stops the relay serving it to them, not the copies they saved. The relay this guide installs can limit files to their channels (<a href="https://github.com/block/buzz/pull/9077">block/buzz#9077</a>), but that setting starts off, and turning it on is a rollout of its own. Until it's on and checked, keep files that not every member may see out of Buzz.`,
          ) +
          // block/buzz#8376's buzz_relay::access lines, at info in the bundle's RUST_LOG
          note("The relay's log names each member, by their public key, with what they read, so treat logs like the data."),
      },
      {
        id: "audit",
        icon: "list",
        q: "How do we keep a record of who did what?",
        a:
          rec("Keep the relay's audit log on, back it up with the database, and keep your hosting provider's access logs.") +
          LEDGER +
          note(
            "The audit log is on by default. It records each message, change and upload with who made it, and chains each entry to the last, so a damaged or edited entry shows. Sign-ins aren't in it. Someone who can write to the database could rewrite the chain, so keep copies with your backups, off the server. Buzz has no screen for it yet: whoever runs the server reads it from the database.",
          ),
      },
    ],
  ],
  [
    "Server",
    [
      {
        id: "capacity", icon: "server", q: "What hardware and hosting do we need?",
        a: rec("Start from a supported deployment family, then size storage and recovery for your actual use. A provider name alone does not change the Compose procedure.") +
          steps([
            ["VPS", "The guide's starting configuration is Ubuntu 24.04, x86, 4 GB RAM and at least 20 GB disk. This is a test baseline, not a user-count or throughput promise. Allow space for uploads, git, database growth, logs and backups. Budget for the domain, backups and egress too."],
            ["Your own hardware", "Allow for power failures, sleep, home upload bandwidth, off-site backups and network changes. Public access needs router control and reachable addressing; CGNAT can block it. Tailscale avoids inbound forwarding, but every device needs access to the network."],
            ["Kubernetes", "This guide's single-replica quickstart is for evaluation. Backups alone do not make it a production or high-availability deployment. Managed Postgres, Redis and S3, stable supplied secrets, availability and full restore design belong to the advanced production profile."],
            ["Agents and ARM", "The relay does not need a GPU merely to host conversations. Agent runtimes and model inference have separate compute, credentials and costs. Upstream offers ARM relay images, but this guide's server path is tested on x86; the older Helm storage override is also x86-only."],
          ]) + note(`<a href="https://github.com/block/buzz/blob/e5dee91c90fdc5f81f04fd609b7c99e31fa7570f/deploy/charts/buzz/README.md">Upstream production and GitOps options</a> are available with externally managed secrets. They are outside this guide's validated quickstart; no new provider-specific support is implied.`),
      },
      {
        id: "monitor", icon: "eye", q: "What should we monitor and maintain?",
        a: rec("Name a primary and backup operator. Decide how much data you can lose and how long the community can be unavailable.") +
          checklist([
            ["Availability and capacity", "Check external reachability, database readiness, free disk and growth, resource saturation and certificate expiry. Keep internal metrics and administration ports private."],
            ["Recovery evidence", "Track the age of the last complete off-server backup and the last successful restore rehearsal. A filename or successful liveness check is not recovery evidence."],
            ["Security and access", "Assess security updates promptly. Review members, Staff, plugins, bots, model providers, network and operator access when responsibilities change."],
            ["Phone delivery", "If the team relies on it, repeat a real locked-phone DM and mention test after relay or app changes."],
          ]) + note("Store logs with restricted access and retention: they can name people and the data they read. Set an alert destination and make sure a second operator can act when the primary is unavailable."),
      },
      {
        id: "move", icon: "restore", q: "Can we move or retire the community?",
        a: rec("Choose the permanent address before your first real install. Moving the machine and changing the community address are different operations.") +
          steps([
            ["Move a public server", "Preserve the community URL and relay key, restore all stores and configuration together, and move DNS as the recovery procedure describes. Rehearse before relying on this."],
            ["Change the address or leave hosted Buzz", "Do not edit RELAY_URL as a migration shortcut: this guide's relay identifies the community from that URL. A new URL creates a different community. This guide does not provide a validated hosted-to-self-hosted history migration, or a private-network move to a new machine name."],
            ["Retain or delete data deliberately", "Define retention for messages, uploaded files, logs and backups. A deleted message does not necessarily revoke its file, and copies on other people's devices remain. This guide does not claim a complete retention, export or compliance-erasure workflow."],
            ["Stop paying", "After preserving any required recovery copy, follow the selected setup's shutdown steps and check the provider for remaining disks, load balancers, backups and DNS records. Removing an app or cluster does not prove every billed resource is gone."],
          ]),
      },
      {
        id: "upgrade",
        icon: "upgrade",
        q: "How should we upgrade the relay?",
        a: (t) => rec("Review routine upgrades about monthly, and assess security fixes promptly. Back up and verify app, relay and chart compatibility before changing versions.") + taskHTML("upgrade", t),
      },
      {
        id: "server",
        icon: "terminal-2",
        q: "Who should have access to the server?",
        a:
          rec("Two or three people: whoever runs Buzz and a backup, each with a personal SSH key and two-factor sign-in on the hosting account.") +
          ACCESS +
          note("No shared passwords or shared keys. Whoever can log in can read every message, direct messages included, so remove a person's key the day they leave."),
      },
      {
        id: "relay-key",
        icon: "key",
        q: "Where should we keep the relay key?",
        a:
          rec("On the server, plus one copy in a shared vault that only the server's people can open.") +
          KEY_HOME +
          note(`A <a href="#operations" data-q-link="backup">backup</a> includes <code>.env</code>. On Kubernetes the key is in a Secret.`),
      },
      {
        id: "block",
        icon: "link",
        q: "What still depends on Block?",
        a:
          rec("Your relay runs without Block, but the apps, iPhone notifications and Builderlab accounts come from Block. Make keys with this guide's key script, and turn notifications off if Block mustn't see when your team's phones wake.") +
          DEPS +
          note("If Block stopped, your relay would keep running, without app updates or phone notifications."),
      },
    ],
  ],
];

/** A group's fold mark, turned to point right while the group is folded. */
const CHEV = `<svg class="fq-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

/**
 * The questions, grouped. Each group's label folds it, and the groups start folded except the one
 * holding the open answer, so the list never runs long (the owner's pick of 2026-11-18, from three
 * live options). Opening an answer, by a click or a link, unfolds its group; readers can keep
 * several groups open. A group holds buttons, not tabs: a fold button can't sit inside a tab list.
 */
export function mountFaq(host: HTMLElement): void {
  const all = GROUPS.flatMap(([, qs]) => qs);
  host.innerHTML = `<div class="opx fq">
    <div class="opx-list fq-list" role="group" aria-label="Questions">${GROUPS.map(
      ([group, qs], gi) =>
        `<div class="fq-grp" data-g="${gi}"><button type="button" class="fq-g fq-g-t" aria-expanded="true"><span>${group}</span><em aria-label="${qs.length} questions">${qs.length}</em>${CHEV}</button>${qs
          .map(
            (x) =>
              `<button type="button" class="opx-item" id="fq-tab-${x.id}" data-q="${x.id}" aria-controls="fq-pane"><span class="opx-item-i">${icon(x.icon)}</span><span class="opx-item-t"><b>${x.q}</b></span></button>`,
          )
          .join("")}</div>`,
    ).join("")}</div>
    <div class="fq-pane" id="fq-pane" role="region"></div>
  </div>`;
  const box = host.querySelector<HTMLElement>(".fq")!;
  const list = host.querySelector<HTMLElement>(".fq-list")!;
  const pane = host.querySelector<HTMLElement>(".fq-pane")!;
  // on a phone the answer opens under its question, like an accordion
  const narrow = matchMedia("(max-width: 640px)");
  /**
   * Which answer a link opens: #…&q=<id> as before, a short link, #<id> (#agents), or a part of an
   * answer, #<id>-<part> (#agent-remote-steps). The longest id that fits wins, so #agent-remote is
   * never read as a part of #agents. An element already on the page with the token as its id wins.
   */
  const byLength = [...all].sort((a, b) => b.id.length - a.id.length);
  const target = (token: string): { q: string; part?: string } | null => {
    if (all.some((x) => x.id === token)) return { q: token };
    const owner = byLength.find((x) => token.startsWith(`${x.id}-`));
    return owner ? { q: owner.id, part: token } : null;
  };
  const hashTarget = (): { q: string; part?: string } | null => {
    const h = location.hash.slice(1);
    const q = new URLSearchParams(h).get("q");
    if (q && all.some((x) => x.id === q)) return { q };
    const token = h.split("&")[0];
    return token && !token.includes("=") && !document.getElementById(token) ? target(token) : null;
  };
  const hashQuestion = () => hashTarget()?.q ?? null;
  /** An answer's own link: its id, with the setup when the answer depends on it. Where the id is taken (relay-key), the long form. */
  const linkFor = (x: Question) =>
    document.getElementById(x.id)
      ? `#${trackHash(trackOf())}&to=fq-tab-${x.id}&q=${x.id}`
      : typeof x.a === "function" && x.a.length > 0
        ? `#${x.id}&${trackHash(trackOf())}`
        : `#${x.id}`;
  let open = hashQuestion() ?? all[0].id;
  /** The open answer's own link, in the address bar, so it can be copied from there. */
  const showLink = () => {
    try {
      history.replaceState(null, "", linkFor(all.find((x) => x.id === open)!));
    } catch {
      /* a sandboxed frame may refuse; the link button still works */
    }
  };
  // each click-through's flow and step, from the start again with each new question
  let state: Record<string, [number, number]> = {};
  const draw = (slot: HTMLElement) => {
    const [flow, step] = state[slot.dataset.ct!] ?? [0, 0];
    slot.innerHTML = clickThroughHTML(CLICK_THROUGHS[slot.dataset.ct!], flow, step);
    fitMembers(slot);
  };

  const grps = () => [...list.querySelectorAll<HTMLElement>(".fq-grp")];
  const setShut = (g: HTMLElement, shut: boolean) => {
    g.classList.toggle("shut", shut);
    g.querySelector(".fq-g-t")!.setAttribute("aria-expanded", String(!shut));
  };
  const groupOf = (id: string) => GROUPS.findIndex(([, qs]) => qs.some((q) => q.id === id));

  const show = (id: string, focus = false) => {
    const x = all.find((y) => y.id === id) ?? all[0];
    if (x.id !== open) state = {};
    open = x.id;
    // the open answer's group unfolds; the others stay as the reader left them
    const gi = groupOf(x.id);
    grps().forEach((g) => Number(g.dataset.g) === gi && setShut(g, false));
    list.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => {
      const on = b.dataset.q === x.id;
      b.setAttribute("data-selected", String(on));
      // on a phone the answer opens under its question; beside the list, its question is the current one
      if (narrow.matches) {
        b.removeAttribute("aria-current");
        b.setAttribute("aria-expanded", String(on));
      } else {
        b.removeAttribute("aria-expanded");
        if (on) b.setAttribute("aria-current", "true");
        else b.removeAttribute("aria-current");
      }
      if (on && focus) b.focus();
    });
    pane.setAttribute("aria-labelledby", `fq-tab-${x.id}`);
    pane.innerHTML = `<h3 class="fq-h">${x.q}${linkButton(linkFor(x), "Copy a link to this answer")}</h3>${typeof x.a === "string" ? x.a : x.a(trackOf())}`;
    if (narrow.matches) list.querySelector(`[data-q="${x.id}"]`)!.after(pane);
    else box.appendChild(pane);
    enhanceCode(pane);
    pane.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // a group's label folds or unfolds it, and leaves the open answer as it is
    const fold = t.closest<HTMLButtonElement>(".fq-g-t");
    if (fold) return setShut(fold.closest<HTMLElement>(".fq-grp")!, fold.getAttribute("aria-expanded") === "true");
    const tab = t.closest<HTMLButtonElement>("[data-q]");
    if (tab) {
      show(tab.dataset.q!);
      return showLink();
    }
    // a link from one answer to another
    const jump = t.closest<HTMLElement>("[data-q-link]");
    if (jump) {
      e.preventDefault();
      show(jump.dataset.qLink!, true);
      return showLink();
    }
    // the example beside the instructions blank: a tap opens and closes it; its button fills the blank
    const tipUse = t.closest<HTMLButtonElement>(".ga-tip-use");
    if (tipUse) {
      useExampleInstructions();
      const tip = tipUse.closest<HTMLElement>(".ga-tip")!;
      tip.classList.remove("open");
      tip.querySelector(".ga-tip-b")!.setAttribute("aria-expanded", "false");
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const tipB = t.closest<HTMLButtonElement>(".ga-tip-b");
    if (tipB) {
      const open = tipB.closest<HTMLElement>(".ga-tip")!.classList.toggle("open");
      tipB.setAttribute("aria-expanded", String(open));
      return;
    }
    // the upgrade prompt, for your agent
    const copy = t.closest<HTMLButtonElement>(".ag-copy");
    if (copy) {
      copyText(copy.dataset.prompt === "agent-remote" ? remotePrompt() : promptText(trackOf(), "upgrade"), () => {
        copy.textContent = "Copied";
        window.setTimeout(() => (copy.textContent = "Copy prompt"), 1600);
      });
      return;
    }
    // a click-through's flows, arrows and dots
    const slot = t.closest<HTMLElement>("[data-ct]");
    const flow = t.closest<HTMLButtonElement>("[data-mb-flow]");
    const step = t.closest<HTMLButtonElement>("[data-mb]");
    if (slot && (flow || (step && !step.disabled))) {
      const [f] = state[slot.dataset.ct!] ?? [0, 0];
      state[slot.dataset.ct!] = flow ? [Number(flow.dataset.mbFlow), 0] : [f, Number(step!.dataset.mb)];
      draw(slot);
      return;
    }
    // single sign-on's next best thing: a private setup, then its steps
    if (t.closest("[data-go-private]")) {
      e.preventDefault();
      const path = getValues().path;
      setValues({ path: path === "own" || path === "k8s" ? path : "vps", ownMode: "public", reach: "private" });
      history.replaceState(null, "", `#${trackHash(trackOf())}`);
      jumpTo("guide");
      return;
    }
  });
  // an answer's setup menu: picking one changes the guide's setup too, and onValues redraws the answer
  host.addEventListener("change", (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>(".opx-for-sel");
    if (!sel) return;
    setValues(SETUPS[sel.value as Track].set);
    showLink();
    pane.querySelector<HTMLSelectElement>(".opx-for-sel")?.focus();
  });
  // arrow keys move between questions, unfolding the group of the one they reach
  host.addEventListener("keydown", (e) => {
    if (!(e.target as HTMLElement).closest("[data-q]")) return;
    const i = all.findIndex((x) => x.id === open);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(all[(next + all.length) % all.length].id, true);
    showLink();
  });
  // a link to an answer from elsewhere on the page, such as the limits: open it, then go there
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-q-link]");
    if (!a || host.contains(a)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show(a.dataset.qLink!);
    showLink();
    if (!narrow.matches) return jumpTo("operations");
    // on a phone the answer opens under its question, so land on the question
    const q = list.querySelector<HTMLElement>(`[data-q="${open}"]`)!;
    scrollTo({ top: q.getBoundingClientRect().top + scrollY - 72, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  // the long form, #…&q=<id>; a short link lands through registerAnchors below
  window.addEventListener("hashchange", () => {
    const q = new URLSearchParams(location.hash.slice(1)).get("q");
    if (!q || !all.some((x) => x.id === q)) return;
    show(q);
    const target = list.querySelector<HTMLElement>(`[data-q="${q}"]`);
    if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
  });
  narrow.addEventListener("change", () => show(open));
  // every group starts folded; showing the first answer unfolds its own
  grps().forEach((g) => setShut(g, true));
  show(open);
  // the setup changed, here or in the guide: redraw the answer if it depends on it
  onValues(() => {
    if (typeof all.find((x) => x.id === open)!.a !== "string") show(open);
    else pane.querySelector<HTMLAnchorElement>(".fq-h .hl")?.setAttribute("href", linkFor(all.find((x) => x.id === open)!));
  });
  // a short link to an answer, or to a part of one: open it, then nav.ts lands on it as it does any anchor
  registerAnchors((token) => {
    const t = target(token);
    if (!t) return null;
    if (open !== t.q) show(t.q);
    if (t.part) return document.getElementById(t.part) ? t.part : null;
    return narrow.matches ? `fq-tab-${t.q}` : "fq-pane";
  });
}
