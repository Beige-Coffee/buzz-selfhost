import skill from "virtual:skill-steps";
import { linkButton } from "../lib/permalink";
import { agentFlows, harnessFlows, onHostedFlows, onLaptopFlows, onStayFlows, remoteFlows } from "./agentflow";
import { agentQuestions, remotePrompt, showPlace, useExampleInstructions } from "./agents";
import { identityFlows, lostFlows, pairFlows } from "./identity";
import { leakFlows, moderationFlows } from "./moderation";
import { pluginFlows } from "./plugins";
import { clickThroughHTML, fitMembers, peopleFlows, type Flow } from "./members";
import { askHTML, askText, promptText, taskHTML } from "./operations";
import { SETUPS } from "../data/decide";
import { bee } from "../defs";
import type { AskKey, OpTask } from "../data/agent";
import { TABLER } from "./tabler";
import { copyText, enhanceCode } from "../lib/code";
import { jumpTo, registerAnchors } from "../lib/nav";
import { esc, getValues, onValues, setValues, skillURL, trackHash, trackOf, type Track } from "../lib/values";

/**
 * Running your relay: what this guide recommends for people, keys, data and the server, and how to set it up.
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
/**
 * The dark card. Rows split an answer by situation or setup, each with its own label. Its label says
 * Recommended where the advice follows from how Buzz works, and How it works where the card describes
 * rather than advises (the owner's call of 2026-11-24: the guide hasn't worked with enough communities
 * to advise a private team or an open community on how to run itself).
 */
type Cases = [label: string, text: string][];
const rec = (t: string, cases?: Cases, label = "Recommended") =>
  `<div class="fq-rec"><div><b>${label}</b>${t ? `<p>${t}</p>` : ""}${
    cases ? `<dl class="fq-rec-s">${cases.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""
  }</div></div>`;
const note = (t: string) => `<p class="opx-note">${t}</p>`;
const steps = (rows: [string, string][]) =>
  `<ol class="opx-flow">${rows
    .map(([t, d], i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${t}</p><p class="opx-flow-d">${d}</p></div></li>`)
    .join("")}</ol>`;
/** Where a click-through of Buzz's screens goes; CLICK_THROUGHS has its flows. */
const ct = (name: string) => `<div class="fq-ct" data-ct="${name}"></div>`;

/** On a private network, a new member needs the tailnet too. */
const PRIVATE_PEOPLE =
  "<b>On a private network</b>, each person also joins your Tailscale network on every device they use Buzz on. For a company, Tailscale costs from $8 a month for each person.";

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
  <div class="fq-side bad"><span class="fq-tag no">Avoid</span>${chan(true, "general", "It's private. Phones add an open one.")}${chan(false, "<s>general</s>", "It's archived. Phones skip it, so new members miss it.")}${chan(false, "<s>welcome-everyone</s>", "It's missing. The first person to join by phone owns it.")}</div>
</div>`;

const CLICK_THROUGHS: Record<string, Flow[]> = {
  identity: identityFlows,
  lost: lostFlows,
  pair: pairFlows,
  role: peopleFlows().filter((f) => f.id === "role"),
  // the invite link this guide recommends: a day, and the people you expect. Buzz can't add an npub since 1.0.1.
  add: peopleFlows("1 day", "5").filter((f) => f.id === "link"),
  remove: peopleFlows().filter((f) => f.id === "remove"),
  agents: agentFlows,
  "on-laptop": onLaptopFlows,
  "on-stay": onStayFlows,
  "on-hosted": onHostedFlows,
  harness: harnessFlows,
  moderate: moderationFlows,
  leak: leakFlows,
  plugin: pluginFlows,
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
const YES = `<span class="fq-y">${icon("check")}<span class="sr">Yes</span></span>`;
const NO = `<span class="fq-n">${icon("x")}<span class="sr">No</span></span>`;
const IF_STAFF = `<span class="fq-if">If a moderator</span>`;
const ROLES = `<div class="fq-vis"><table class="fq-roles">
  <thead><tr><th></th><th><span class="rl-chip owner">${icon("crown")}Owner</span></th><th><span class="rl-chip admin">${icon("shield")}Admin</span></th><th><span class="rl-chip member">${icon("user")}Member</span></th></tr></thead>
  <tbody>
    <tr><td>Make invite links</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Remove members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Add, promote or remove admins</td><td>${YES}</td><td>${NO}</td><td>${NO}</td></tr>
    <tr><td>Report a message</td><td>${YES}</td><td>${YES}</td><td>${YES}</td></tr>
    <tr><td>Ban, time out, delete others' messages</td><td>${YES}</td><td>${YES}</td><td>${IF_STAFF}</td></tr>
    <tr><td>Add someone by npub</td><td colspan="3" class="fq-srv">${icon("server")}With a command on the server</td></tr>
    <tr><td>Change the owner</td><td colspan="3" class="fq-srv">${icon("server")}With a command on the server</td></tr>
  </tbody></table>
  <p class="fq-roles-k"><b>With a command on the server</b> means these two aren't in Buzz. Whoever can log in to the server does them, whatever their role in Buzz.</p>
  <p class="fq-roles-k"><b>If a moderator</b> means a member can do this only after being added as a moderator, under Staff in Buzz's moderation screens.</p></div>`;

/** Moderating: in Buzz's screens where the relay can offer them, otherwise with the buzz command line. */
const MODERATION =
  // what the tools do, without advice per kind of community (owner's call of 2026-11-24, as for roles)
  rec(
    "You can remove or ban members, time them out and delete their messages. A ban keeps someone out even if they have an invite link, and it disconnects their agents too. Removing someone doesn't keep them out.",
    [
      ["Moderation screens", `On ${SCREENS_WHERE}, Buzz's moderation screens show the owner and Staff the reports members send. From there, they ban someone, time them out or delete a message.`],
      ["Command line", "The screens need an address on the internet, and this guide sets them up on a VPS or your own hardware only. On a private network, Kubernetes or a local test, the owner or an admin moderates with the <code>buzz</code> command line that comes with Buzz."],
    ],
    "How it works",
  ) +
  steps([
    ["Turn on the moderation screens", "Buzz finds the screens at a second address that your relay announces. This guide uses your domain with <code>admin.</code> in front. On Block's Docker Compose bundle, that takes a DNS record for that address, <code>BUZZ_ADMIN_HOST</code> in the relay's <code>.env</code> and a route for it in the Caddyfile. If you set up with this guide's skill, your agent offers this during setup, and you can ask it later."],
    ["Add your moderators under Staff", "In Buzz, open <b>Settings</b>, <b>Moderation</b>, <b>Staff</b>. Paste the person's npub, pick <b>moderator</b> and choose <b>Add</b>. Making someone an admin doesn't put them on Staff. Staff is a separate list. Its operators manage it, and the owner is one."],
    ["Work through reports", "Any member can report a message. Moderators find the reports in <b>Settings</b>, <b>Moderation</b>, <b>Reports</b>. To ban someone, time them out or delete a message, they open <b>Communities</b>, choose the community and use its <b>Actions</b> tab."],
  ]) +
  ct("moderate") +
  note(
    "<b>On a private network, Kubernetes or a local test</b>, Buzz's moderation screens can't reach your relay. There, the owner or an admin moderates with the <code>buzz</code> command line that comes with Buzz 1.0. On a Mac, it's at <code>/Applications/Buzz.app/Contents/Resources/bin/buzz</code>. It signs with their own private key, so they run it in their own terminal. Before the first command, they set <code>BUZZ_PRIVATE_KEY</code> and <code>BUZZ_RELAY_URL</code> in that terminal, as the skill's operations steps show. <code>buzz moderation reports</code> lists the reports members send. <code>buzz moderation ban</code> and <code>buzz moderation timeout</code> ban people or time them out, and <code>buzz moderation audit</code> lists past moderation actions. <code>buzz messages delete</code> removes a message.",
  );


/**
 * The two starter channels, and why: phones look for them by name (block/buzz mobile/lib/app.dart; a
 * missing one is created by the first phone, an archived one or a forum can stop the join), and
 * welcome-everyone doubles as the welcome channel. Starter channels come from invite claims
 * (block/buzz#8594), not from add-member on the server.
 */
/** The phone join bug, in red wherever the two channels come up (block/buzz#9377, filed 2026-11-13). */
const PHONE_JOIN = `<div class="fq-alert" role="note">${icon("alert")}<div><p class="fq-alert-h">Phones can fail to join</p><p>After someone joins with a link, Buzz on iPhone looks for open channels named exactly <code>general</code> and <code>welcome-everyone</code>. Check that both exist before you invite anyone, and keep them open. If a starter channel that a phone created is later made private, every later phone join can stop with "Starter channels could not be set up" (<a href="https://github.com/block/buzz/issues/9377">block/buzz#9377</a>). An archived channel or a forum with either name doesn't stop the join, but the phone then skips that channel. If either one is missing, the first phone that joins creates it, and that person owns it.</p></div></div>`;

const CHANNELS = `<div class="fq-chans">
  <h4 class="ga-h">Create two starter channels before anyone joins</h4>
  <p class="fq-chans-p">Buzz creates an open <code>general</code> channel the first time you open a new community, and makes it a starter channel. Create an open channel named exactly <code>welcome-everyone</code>, and in its settings turn on <b>Starter channel for new members</b>. Everyone who joins with an invite link is then added to both.</p>
  ${PHONE_JOIN}
  <p class="fq-chans-p"><b>Use <code>welcome-everyone</code> as your welcome channel.</b> You can make it view-only, so replies don't bury your welcome. Members can then read what you post there, but they can't reply. See <a href="#operations" data-q-link="welcome">How should you welcome new members?</a></p>
  ${STARTERS}
  <p class="fq-chans-p">People you add by npub on the server don't join the starter channels. Add them in Buzz to the channels they need. Don't give a private channel either starter name. Call a private team channel something else, such as <code>team</code>.</p>
</div>`;

/** A lost device: one question decides everything, whether the key is exposed. */
const CASES = `<div class="fq-vis fq-cases">
  <p class="fq-cases-q">${icon("device-mobile")}<span><b>Could someone get into the lost device?</b>For example, it was unlocked, it had no disk encryption, or someone knows its password.</span></p>
  <div class="fq-case bad">
    <p class="fq-case-h"><span class="fq-tag no">Yes, or not sure</span><b>Treat the key as exposed and retire it</b></p>
    <ol><li>Make a new key on the new device. Don't use the saved copy of the old key, because whoever has the lost device has that key too.</li><li>Ask the owner, an admin or a moderator to ban the old identity. Removing it isn't enough, because a live invite link lets it back in. If it was the owner's key, whoever runs the server first makes the new key the owner. The old key stays an admin after that, so remove it and ban it too.</li><li>On a private network, remove the lost device from your Tailscale network. If a computer you kept still holds the old key, open <b>Settings</b>, <b>Identity</b> there and choose <b>Remove from device</b>, then sign in with the new key after Buzz restarts.</li><li>An admin sends them a 1-use invite link, or whoever runs the server adds the new npub.</li><li>Pair their phone and start their agents again. Ask any other community they joined to ban the old key too.</li></ol>
  </div>
  <div class="fq-case good">
    <p class="fq-case-h"><span class="fq-tag yes">No</span><b>The key is safe, and you can bring it back</b></p>
    <ol><li>Sign in on the new device with the saved copy of the key. In Buzz, choose <b>Other options</b>, enter the community's address, choose <b>Continue</b>, then <b>Use an existing key</b>.</li><li>If you didn't save a copy but a Builderlab backup completed, sign in to that Builderlab account to get the key back. If you have neither, make a new identity and have it added to the community again.</li><li>Pair the phone again.</li></ol>
  </div>
</div>`;

/**
 * Two ways to get a key: nak, the open-source Nostr command-line tool (owner's call of 2026-11-23, replacing
 * the guide's own script; tested with nak v0.22.3), or a Builderlab account, Block's, which can back the key
 * up with Block (block/buzz-app#2325) and, created on Block's hosted page, asks for the person's details (#2579).
 */
const NAK = "https://github.com/fiatjaf/nak";
const NAK_KEY = "(set -C; umask 077; nak key generate | nak encode nsec &gt; ~/buzz-identity.key) &amp;&amp; nak key public &lt; ~/buzz-identity.key | nak encode npub";
const ADD_MEMBER = skillURL("references/operations.md");
const KEYS =
  note(
    `You can get a key in two ways. <a href="${NAK}">nak</a>, the open-source Nostr command-line tool, makes one on your computer. Install it with <code>brew install nak</code>, or download it from its releases page, rename the file to <code>nak</code>, make it executable and put it in a folder on your PATH. The command runs in a macOS or Linux terminal. On Windows, run it in WSL. The command below saves the key in <code>~/buzz-identity.key</code>, a file only you can read, and shows only the npub. It never overwrites a file that's already there. The other way is <b>Create account</b> on Buzz's first screen, which makes a key with a Builderlab account. Builderlab is Block's service. Block keeps a copy of that key, and creating the account asks for your details.`,
  ) +
  `<pre class="cmd">${NAK_KEY}</pre>` +
  note(
    "To join with that key, choose <b>Other options</b> on Buzz's first screen, enter the community's address and choose <b>Continue</b>. Then choose <b>Use an existing key</b> and drop the key file on the page. After you join, save the key in your password manager. In Buzz, open <b>Settings</b>, <b>Identity</b>, then <b>More options</b> (…) on the Buzz ID card, and choose <b>Copy</b> on the masked private-key field. Check that you can open the saved entry before you delete the key file. When you're done, clear the key from the clipboard, and avoid clipboard tools that keep a history or share the clipboard. Builderlab can keep a copy of any key you make or import after you sign in to it, and it gives that key back to whoever signs in to that account. Keep a work identity in your own private vault, in a password manager your team approves.",
  );

/** Single sign-on today: two locks in a row, your company's login and Buzz's member list. */
const LOCKS = `<div class="fq-vis fq-locks">
  <div class="fq-lk-who"><span class="fq-av">${icon("user")}</span><b>Someone at your company</b></div>
  <div class="fq-lk"><span class="fq-lk-n">1</span>${icon("lock")}<b>Your company login</b><span>Tailscale signs them in with Google, Microsoft, Okta or GitHub.</span></div>
  <div class="fq-lk"><span class="fq-lk-n">2</span>${icon("users")}<b>The member list</b><span>The relay lets in only members and their agents.</span></div>
  <div class="fq-lk-end">${icon("server")}<b>Your relay</b><span>on a private network</span></div>
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
    ${tfaStep("lock", "Your company login", "They sign in to Tailscale with a password and a second factor. Tailscale asks again when the device's key expires.")}
    ${tfaStep("key", "Their key", "Then the relay checks their key against the member list.")}
  </div>
</div>`;

/**
 * How Buzz desktop holds a person's key (researched 2026-11-23 in block/buzz-app at v1.0.5): one item in the
 * system's secure store, service xyz.block.buzz.desktop.identity (crates/credential-store), read at launch;
 * every release, preview builds included, ships the same app ID, so a second copy shares the key; one key
 * signs into every community, each with its own profile. The answer says one identity per computer, as most people
 * have one account on theirs. The npub and names are illustrative.
 */
const archBox = (mark: string, t: string, d: string, cls = "") => `<div class="fq-ar-box${cls}">${mark}<b>${t}</b><small>${d}</small></div>`;
const archComm = (name: string, who: string) => `<em>${name}<small><span>${who}</span><mark>npub1qm…8k3a</mark></small></em>`;
const ONE_KEY = `<div class="fq-vis fq-arch">
  <div class="fq-ar-acct">
    <p class="fq-ar-h">${icon("device-desktop")}One identity on this computer</p>
    <div class="fq-ar-row">
      ${archBox(icon("lock"), "The system keychain", "Holds one Buzz key")}
      <span class="fq-ar-arrow">read at launch</span>
      ${archBox(bee('class="fq-ar-bee"'), "Buzz", "Signs in with that key", " dark")}
      <span class="fq-ar-arrow">same key</span>
      <div class="fq-ar-comms">${archComm("Your team", "Maya")}${archComm("An open community", "Maya R.")}</div>
    </div>
  </div>
</div>`;

/**
 * A channel's General access, set to View only, as Buzz 1.0.5 draws it: Manage members, then General
 * (block/buzz-app src/bundled/channels/ChannelGeneralAccess.tsx and src/features/channels/general-access.ts).
 * View only keeps the channel open and gives people who join the guest role, who can read but not post
 * or react (block/buzz 0.3.0 crates/buzz-core/src/channel.rs can_post).
 */
const VIEW_ONLY = `<div class="fq-vis"><div class="fq-gaccess"><p class="fq-acc-t">General</p>
  <div class="fq-acc-row"><span class="fq-acc-i">${icon("eye")}</span><div><b>Anyone in the community</b><span>New people can only view.</span></div><em>View only ▾</em></div>
  <div class="fq-acc-menu">
    <div class="fq-radio"><i></i><div><b>Public</b><span>Anyone in the community can participate.</span></div></div>
    <div class="fq-radio on"><i></i><div><b>View only</b><span>Anyone in the community can read.</span></div></div>
    <div class="fq-radio"><i></i><div><b>Private</b><span>Only people you add can access.</span></div></div>
  </div>
</div></div>`;

/**
 * A situation, then what to do or what happens, in order. A string is a step you take; ["ok", …] is how it
 * ends well, and ["bad", …] is a cost.
 */
type PathItem = string | ["ok" | "bad", string];
const path = (i: string, title: string, items: PathItem[], hot = false) => {
  let n = 0;
  const li = items
    .map((it) =>
      typeof it === "string"
        ? `<li><span class="fq-path-n">${++n}</span><span>${it}</span></li>`
        : `<li class="${it[0]}"><span class="fq-path-n">${it[0] === "ok" ? icon("check") : ""}</span><span>${it[1]}</span></li>`,
    )
    .join("");
  return `<div class="fq-path${hot ? " hot" : ""}"><p class="fq-path-h"><span class="fq-path-i">${icon(i)}</span>${title}</p><ol class="fq-path-s">${li}</ol></div>`;
};

/** A leak: what to do, by which key leaked. */
const LANES = `<div class="fq-vis fq-paths">
  ${path("key", "A person's key", ["Ban it", "Add their new identity"])}
  ${path("server", "The relay key", ["Treat the server as exposed", "Ban keys you don't know in Membership", "Ask in block/buzz before you replace it"])}
  ${path("alert", "The server itself", ["Change its logins", "Assume someone read every message"], true)}
</div>`;

/**
 * Moving, by what changes (researched 2026-11-23 at relay 0.3.0): the relay maps each host to a community and
 * makes a new one for a new RELAY_URL host (migrations/0001, store/community.rs, router.rs); a move that keeps
 * the domain kept everything in the readiness campaign's new-server run.
 */
const MOVE = `<div class="fq-vis fq-paths two">
  ${path("server", "Same domain, new server", ["Back up and stop the old server", "Point the domain at the new one", "Restore the backup there", ["ok", "Everything comes along"]])}
  ${path("world", "A new domain", [["bad", "A new, empty community"], ["bad", "Everyone joins again"], ["bad", "The old one stays at the old address"]], true)}
</div>`;

/** A short list to work through in order, numbered: nothing on the page ticks. */
const checklist = (items: [string, string, string?][]) =>
  `<div class="fq-vis"><ol class="fq-check fq-numbered">${items
    .map(
      ([t, d, only], i) =>
        `<li><span class="fq-num" aria-hidden="true">${i + 1}</span><div><b>${t}${only ? ` <span class="fq-only">${only}</span>` : ""}</b><p>${d}</p></div></li>`,
    )
    .join("")}</ol></div>`;

/** The server's door: personal SSH keys, and two-factor sign-in on the hosting provider's account (not Buzz). Keys are illustrative. */
const ACCESS = `<div class="fq-vis fq-access">
  <div class="fq-term"><p class="fq-term-h"><i></i><i></i><i></i><span>the server</span></p>
    <pre><span class="p">$</span> cat ~/.ssh/authorized_keys
ssh-ed25519 AAAAC3Nz…Qk2 maya@laptop
ssh-ed25519 AAAAC3Nz…7fA sam@laptop</pre></div>
  <div class="fq-card"><p class="fq-card-h">${icon("lock")}Your hosting provider's account</p><p><span>Maya</span><em>Two-factor on</em></p><p><span>Sam</span><em>Two-factor on</em></p><p class="fq-dim">Nobody else can sign in. This is the account at DigitalOcean or another provider, not Buzz.</p></div>
</div>`;

/** Who can read what: encrypted on the way, stored as written. */
const READ = `<div class="fq-vis fq-read">
  <div class="fq-rd-apps">${icon("device-desktop")}${icon("device-mobile")}<b>Buzz apps</b></div>
  <div class="fq-rd-wire"><span>${icon("lock")}encrypted on the way</span></div>
  <div class="fq-card"><p class="fq-card-h">${icon("server")}Your server</p>
    <p class="fq-msg"><i># general</i>Release is Friday</p>
    <p class="fq-msg dm"><i>direct message</i>Here are the Q4 numbers.</p>
    <p class="fq-msg"><i>file</i>plan.pdf</p>
    <p class="fq-eye">${icon("eye")}Anyone with access to the server, its database or a backup can read these</p>
  </div>
</div>`;

/**
 * A record of who did what (owner's ask of 2026-11-24: say what each record holds and how to read it). From
 * block/buzz: the audit log (crates/buzz-audit; migrations/0001 audit_log; written for every stored event,
 * handlers/event.rs, and every upload, api/media.rs; BUZZ_AUDIT_ENABLED, default true, config.rs), the
 * moderation actions (migrations/0006 moderation_actions; GET /moderation/audit, `buzz moderation audit`) and
 * the staff changes (migrations/0039 relay_operator_audit). The hosting provider's log is the host's own.
 */
const entry = (time: string, what: string, hash: string) => `<p class="fq-le"><time>${time}</time><b>${what}</b><code>${hash}</code></p>`;
const LEDGER = `<div class="fq-vis fq-audit">
  <div class="fq-card"><p class="fq-card-h">${icon("list")}The audit log</p>
    ${entry("09:12", "Leo posted in #release", "a41f…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("09:40", "Maya uploaded plan.pdf", "7c02…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("11:03", "Leo deleted a message", "e9b8…")}
    <p class="fq-dim">Every event the relay stores, and every upload. Each entry holds the hash of the one before it.</p>
  </div>
  <div class="fq-audit-side">
    <div class="fq-card"><p class="fq-card-h">${icon("shield")}Moderation actions</p><p class="fq-le"><time>16:05</time><b>Sam banned Leo</b></p><p class="fq-dim">Who acted, on whom, and the reason.</p></div>
    <div class="fq-card"><p class="fq-card-h">${icon("lock")}The server's and your provider's logs</p><p class="fq-le"><time>08:58</time><b>Maya signed in over SSH</b></p><p class="fq-dim">Who reached the server itself.</p></div>
  </div>
</div>`;
/** What each audit log entry holds (crates/buzz-audit/src/entry.rs; the actor rule is handlers/event.rs's). */
const FIELDS: [string, string][] = [
  ["When", "The time the relay recorded it."],
  ["Who", "The public key of whoever did it. For a workflow's post, the person who started the workflow."],
  ["What", "<code>event_created</code>, with the event's kind and channel, or <code>media_uploaded</code>, with the file's type and size."],
  ["Object", "The event's ID, or the file's SHA-256."],
  ["Chain", "A SHA-256 hash of the entry, and the hash of the entry before it."],
];
const FIELDS_HTML = `<dl class="fq-fields">${FIELDS.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/**
 * What still reaches Block from a self-hosted community: the apps' update checks (block/buzz-app
 * src/features/updates/updates.ts, hourly, installed on restart), push through push.buzz.xyz (the relay's
 * public key, IP and wake timing; a fixed payload, crates/buzz-push-gateway/src/model.rs; docs/buzz-push.md calls it
 * experimental), and Builderlab's key backup and community list (block/buzz-app#2325, known-communities).
 */
const svc = (i: string, t: string, d: string, off: string) =>
  `<div class="sv-card"><div class="sv-head"><i>${icon(i)}</i><b>${t}</b></div><p>${d}</p><p class="sv-off">${icon("settings")}<span>${off}</span></p></div>`;
const DEPS = `<div class="fq-vis sv-wrap">
  <p class="sv-banner">${icon("eye-off")}<span><b>None of these services receives your messages or files.</b> Messages, files and the member list stay on your server. An agent Block hosts is the exception, because Block's machines process everything it reads.</span></p>
  <div class="sv-grid">
    ${svc("download", "Apps and images", "Block publishes the Buzz apps and the relay's images. The desktop app checks for updates every hour and downloads them. They install when you restart the app.", "You need the apps to use Buzz.")}
    ${svc("bell", "iPhone notifications", "Notifications go through Block's gateway, <code>push.buzz.xyz</code>. No message text passes through it. The gateway sees your relay's public key, your server's IP address and when it wakes which phone. Each phone also signs up with the gateway, so Block keeps each phone's Apple push token and sees the phone's IP address and which relays it uses. Apple sees when a phone is woken. Block calls push experimental.", "Turn it off with <code>BUZZ_PUSH_ENABLED=false</code> on the relay.")}
    ${svc("user", "Builderlab accounts", "When you sign in to Builderlab, Block's service, Block can get a copy of your key. It also learns which communities you join.", "Make your key with nak, and don't sign in to Builderlab with it.")}
  </div>
</div>`;

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
    ${pn("", "device-mobile", "A member's locked iPhone", "with Buzz from the App Store", " end")}
  </div>
  <i class="fq-push-u" aria-hidden="true"></i>
  <p class="fq-push-way"><i class="out" aria-hidden="true"></i><span><b>The wake-up</b> goes out through Block and Apple. It carries no message text.</span></p>
  <p class="fq-push-way"><i class="back" aria-hidden="true"></i><span><b>The message</b> comes straight from your relay, once the phone connects.</span></p>
</div>`;
/**
 * What Block's push gateway learns, and what it never gets (crates/buzz-push-gateway/src/model.rs: a fixed
 * payload): the relay's public key, the server's IP and wake timing, and no message, sender or channel.
 */
const SEES = `<div class="fq-vis fq-sees">
  <div class="fq-sees-c no"><p class="fq-sees-h">${icon("eye-off")}Block never sees</p><ul><li>What a message says</li><li>Who sent it</li><li>Where it was posted</li><li>Your files</li></ul></div>
  <div class="fq-sees-c yes"><p class="fq-sees-h">${icon("eye")}Block's gateway sees</p><ul><li>Your relay's public key</li><li>Your server's IP address</li><li>When it wakes which phone</li><li>Each phone's Apple push token, its IP address and which relays it uses</li></ul></div>
</div>`;
/** mobile.md's sections, by title: the ones a setup needs stay open, the rest fold. A missing one fails loudly. */
const phone = (title: string) => skill.mobile.find((x) => x.title === title)?.html ?? `<p class="fq-missing">mobile.md lost its "${title}" section.</p>`;
const fold = (title: string, html: string) => `<details class="fq-fold"><summary>${title}</summary><div class="fq-mobile">${html}</div></details>`;
const PHONE_OPEN = ["Turn notifications on"];
/**
 * "Turn notifications on" shows the two settings and what this guide's setups do; how to set them on
 * Compose or Kubernetes folds under "How to set it up" (owner's ask of 2026-11-23).
 */
const foldSetup = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  const kids = [...d.children];
  const code = kids.findIndex((k) => k.matches("pre, .cmd-wrap"));
  if (code < 0 || code + 2 >= kids.length) return html;
  const out = (els: Element[]) => els.map((k) => k.outerHTML).join("");
  return `${out(kids.slice(0, code + 2))}<details class="fq-more fq-setup"><summary><span>How to set it up</span></summary><div class="fq-mobile">${out(kids.slice(code + 2))}</div></details>`;
};
// the locked-phone test folds like the sections after it (owner's ask of 2026-11-24)
const PHONE_FOLDED = ["Test with the phone locked", "What Block and Apple see", "Android", "Run your own gateway"];
const MOBILE =
  rec("Buzz sends notifications through Block's push gateway to the Buzz app from the App Store. Block never sees your messages. You don't need an Apple developer account or a gateway of your own. Notifications work on iPhone, but not on Android yet.", [
    ["Notifications on", "Members get a notification on their phone for direct messages and mentions. Block's gateway sees your relay's public key, your server's IP address and when it wakes which phone. Each phone also signs up with the gateway, so Block sees the phone's IP address and which relays it uses."],
    ["Notifications off", "Nothing goes through Block's gateway. People see new messages the next time they open Buzz."],
  ], "How it works") +
  SEES +
  note(`A phone gets notifications once it's in the community. Pairing puts your identity on the phone, and <a href="#operations" data-q-link="pair">How do you pair a phone?</a> shows each step. A phone that joins with an invite link gets a new identity.`) +
  PUSH +
  // docs/research.md: Block's bundle notes name "the public gateway"; block/buzz#5206 is where self-hosters asked for it
  note(
    `This guide tested notifications with relay 0.3.0 and the App Store's Buzz app on a locked iPhone. Block calls push <a href="https://github.com/block/buzz/blob/relay-v0.3.0/docs/buzz-push.md">experimental</a>. Run the locked-phone test below before your team relies on it.`,
  ) +
  `<div class="fq-mobile">${PHONE_OPEN.map((x) => `<h4>${x}</h4>${x === "Turn notifications on" ? foldSetup(phone(x)) : phone(x)}`).join("")}</div>` +
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
        q: "How should you add people?",
        a:
          rec("Invite people with invite links. A link lasts at most 30 days, and the current relay release, 0.3.0, can't cancel a single link early, so keep links short and limit how many people can use each one. You can also add someone by their npub on the server, without a link.", [
            ["For one person", "Make a link for 1 use that expires after 1 day, and send it to them."],
            ["For a group", "Make a link with a use limit, and make a new one when it fills up or expires. Anyone who gets it can join while it lasts."],
          ]) +
          ct("add") +
          CHANNELS +
          // block/buzz-app: v1.0.0's Add directly is off in every release from v1.0.1 (src/bundled/moderation/features.ts)
          note(
            `Each person needs a key first (<a href="#operations" data-q-link="identity">how to get one</a>). Since version 1.0.1, the Buzz app can't add someone by npub. Whoever runs the server adds the npub there, with the <a href="${ADD_MEMBER}">add-member command</a> from this guide's operations steps. If you set up with this guide's skill, you can ask your agent to do it. Someone who isn't a member yet sees their npub in Buzz when they try to join.`,
          ) +
          // links last 30 days at most (block/buzz crates/buzz-core/src/invite.rs); nothing revokes one (#8529 open)
          note("To cancel every invite link someone made, ban them. A ban cancels all of their links.") +
          note(`Block has added a way to revoke a single link (<a href="https://github.com/block/buzz/pull/9680">block/buzz#9680</a>), and the Buzz 1.0.7 previews have a <b>Revoke</b> button for it. It needs a relay newer than 0.3.0, and no relay release has it yet.`) +
          note(PRIVATE_PEOPLE),
      },
      {
        id: "welcome",
        icon: "message-circle",
        q: "How should you welcome new members?",
        a:
          rec("When someone joins from a phone, Buzz opens <code>welcome-everyone</code> first, so a message posted there is the first thing they see.", [
            ["An open channel", "Members can reply to the welcome and ask questions there."],
            ["A view-only channel", "People who join can read it but can't reply, so replies don't bury the welcome."],
            ["A welcome program", "Buzz's own agents can't greet new members, because they act only on mentions and direct messages. A welcome takes a program of your own that watches for new members, and this guide doesn't include one."],
          ], "How it works") +
          PHONE_JOIN +
          note("To make a channel view-only, open it, choose its name at the top, and set <b>General access</b> to <b>View only</b>. People who join after that can read the channel, but they can't post or react. People already in it keep their role, so set it before you invite anyone.") +
          VIEW_ONLY +
          // block/buzz 0.3.0 crates/buzz-workflow/src/schema.rs TriggerDef: message_posted, reaction_added, diff_posted, schedule, webhook
          note("Buzz can't greet new members by itself, because its workflows have no trigger for someone joining."),
      },
      { id: "notifications", icon: "bell", q: "How do phones and notifications work?", a: MOBILE },
      {
        id: "pair",
        icon: "device-mobile",
        q: "How do you pair a phone?",
        a:
          rec("Pair each phone from the Buzz desktop app. Pairing copies your private key from your computer to the phone. Do it where nobody else can see your screen.", [
            ["On the internet", "The phone reaches your server's pairing service over the internet, so it needs nothing else."],
            ["On a private network", "Connect Tailscale on the phone before you pair, and keep it connected. The phone reaches the pairing service and its messages through your Tailscale network. A phone runs one VPN at a time, so another VPN turns Tailscale off."],
          ]) +
          ct("pair") +
          // mobile.md, Pair a phone: the pairing service at /pair, which Block's Compose bundle doesn't start (block/buzz#7721)
          `<div class="fq-chans">
            <h4 class="ga-h">What your relay needs</h4>
            <p class="fq-chans-p">Pairing goes through a pairing service on your own server, at <code>/pair</code>. Block's Docker Compose bundle doesn't start it (<a href="https://github.com/block/buzz/issues/7721">block/buzz#7721</a>). This guide's setups add it on Docker Compose and on Kubernetes, where the Helm chart's <code>pairingRelay</code> setting turns it on. If you set up with this guide's skill, its <code>check-relay.sh</code> says <code>PASS</code> for phone pairing when the service works.</p>
          </div>` +
          note("For a community Block hosts on Builderlab, the phone also asks you to sign in to Builderlab and to back up your secret key with it. That community requires the backup, and Builderlab can decrypt it. A community on your own server skips both.") +
          note("The push gateway plays no part in pairing. A phone can pair even with notifications off.") +
          note("A phone can't pair with a local test. This guide doesn't cover pairing on Kubernetes on a private network."),
      },
      {
        id: "roles",
        icon: "crown",
        // what each role is and can do, without advice on who should hold it (owner's call of 2026-11-24:
        // the guide hasn't worked with enough communities to recommend a setup)
        q: "What are the membership roles?",
        a:
          rec(
            "Everyone in a Buzz community is the owner, an admin or a member. Staff is a separate list in Buzz's moderation screens, for the people who moderate.",
            [
              ["Owner", "There's one owner, set on the server by whoever runs it. The owner can do everything an admin can, and only the owner can change someone's role."],
              ["Admin", "Admins make invite links and remove members. They can also ban someone, time them out or delete their messages."],
              ["Member", "Members post and report messages. They can't make invite links or remove anyone."],
              ["Staff", "Staff lists operators and moderators. Moderators handle reports, bans and timeouts, and operators also add and remove staff. The owner counts as an operator."],
            ],
            "The roles",
          ) +
          ROLES +
          `<h4 class="ga-h">Change someone's role in Buzz</h4>` +
          ct("role") +
          note(`Staff is a list in Buzz's moderation screens, which work only on ${SCREENS_WHERE}. On other setups, the owner and admins ban people from the command line. See <a href="#operations" data-q-link="moderate">How do you moderate?</a>`) +
          note("With no admins, only the owner can make invite links, because members can't.") +
          note(`The owner is set on the server, so only whoever runs the server can change it. After the change, the old owner stays on as an admin. To keep the old owner out, remove them in Membership and ban them. See <a href="#operations" data-q-link="moderate">How do you moderate?</a>`) +
          // block/buzz 0.3.0 crates/buzz-core/src/channel.rs decide_member_put: anyone who can post adds; only owners and admins grant admin
          note("<b>Private channels have their own rules.</b> Anyone in a private channel can add people to it, except a guest. Only the channel's owners and admins can make someone an admin of it. So anyone you put in a private channel can decide who else joins it."),
      },
      {
        id: "moderate",
        icon: "shield",
        q: "How do you moderate?",
        a: MODERATION + note(`To let only the agents you approve into the community, see <a href="#operations" data-q-link="agent-approve">Can you require approval before an agent joins?</a>`),
      },
      {
        id: "leave",
        icon: "logout",
        q: "What do you do when someone leaves?",
        a:
          rec("", [
            ["They leave on their own", "Buzz needs nothing more from you. If they were an admin, links they made keep working until they expire, and on relay 0.3.0 only a ban cancels them. If they had access to the server, Staff, Tailscale or a shared vault, go through the checklist below."],
            ["You remove them", "Ban them too, because removing them alone lets them rejoin with any invite link that's still active."],
          ]) +
          checklist([
            ["Hand over ownership", "Whoever runs the server makes someone else the owner first. The current owner can't be removed.", "if they were the owner"],
            ["Remove them in Membership", "In Buzz, open <b>Settings</b>, <b>Community admin</b>, <b>Membership</b>, choose the … on their row, then <b>Remove</b>. The click-through below shows each screen. Removing them disconnects them and their agents. They can still come back with any invite link that hasn't expired."],
            ["Remove them from Tailscale", "Remove their devices from your Tailscale network too.", "private network"],
            ["Remove them from Staff", "In Buzz, open <b>Settings</b>, <b>Moderation</b>, <b>Staff</b>, and remove them there.", "if they were on Staff"],
            ["Ban them to keep them out", "A ban keeps them out even if they have a live invite link, and it cancels every link they made. The current relay release, 0.3.0, can't cancel a single link on its own. Keep links short-lived and limited to the people you expect."],
            ["Remove their server and hosting access", "Remove their SSH key from the server and their account with your hosting provider. A copy of <code>.env</code> or a backup they kept holds the server's passwords and the relay key. The passwords work only from inside the server, so removing their access is what protects them.", "if they had it"],
            ["Remove them from the shared password vault", "If your team keeps a copy of the server's <code>.env</code> file in a shared vault in your password manager, take away their access to that vault. The file holds the relay key and the server's passwords, which work only from inside the server.", "if they could open it"],
          ]) +
          ct("remove") +
          note("Buzz can't wipe a device. Messages and files already on their devices stay there."),
      },
    ],
  ],
  // the agent answers live in agents.ts
  ["Agents", agentQuestions({ rec, note, ct })],
  [
    "Identity and keys",
    [
      {
        id: "identity",
        icon: "key",
        q: "How should each person set up their identity?",
        a:
          rec("Each person has a private key, and that key is their identity in Buzz. Anyone who has the key can act as that person.", [
            ["Making a key", "nak, the open-source Nostr tool, makes one on your computer. Block gets no copy unless you later sign in to Builderlab with it. Create account in Buzz makes one with a Builderlab account, and Block keeps a copy."],
            ["Keeping it", "Save the key in a password manager. Without a saved copy, a lost computer means a new identity."],
          ], "How it works") +
          ct("identity") +
          KEYS +
          note("Never put a private key in a chat, an agent prompt, an issue or a screenshot.") +
          note("You can restore the same identity from a saved copy of the key or from a completed Builderlab backup. If you have neither, you have to create a new identity. Changing the community's owner doesn't bring back the old key."),
      },
      {
        id: "separate-identity",
        icon: "user",
        q: "Can someone use a different identity in each community?",
        a:
          rec("No. Buzz allows one identity per computer, and it uses that identity in every community you join. Each community can show its own name and picture for you, but all of them see the same npub, so anyone in two of your communities can tell it's you.") +
          ONE_KEY +
          note("The keychain is the Keychain on a Mac, Credential Manager on Windows and the Secret Service on Linux. Buzz reads the key from there when it starts. It never keeps the key in a file.") +
          note("Preview builds of Buzz use the same keychain entry too. While a key is saved, Buzz won't create or import another one.") +
          note("To use a different name or picture in one community, open <b>Settings</b>, <b>Profile</b> while that community is open. Other communities keep theirs.") +
          note("<b>Remove from device</b>, in <b>Settings</b>, <b>Identity</b>, deletes the key after Buzz restarts, for every community on that computer. Sign in again with a saved copy of the key to get them back."),
      },
      {
        id: "lost",
        icon: "device-mobile",
        q: "What do you do when a laptop or phone is lost?",
        a:
          rec("First, decide whether the key could be exposed. If anyone could get into the device, stop using that key and make a new identity, even if you saved a copy of the old one.") +
          CASES +
          ct("lost") +
          note("Buzz can't cut off a single device. The key is the identity, so retiring the key means making a new identity. Messages the old key wrote stay under its name."),
      },
      {
        id: "leak",
        icon: "alert",
        q: "What if a key leaks?",
        a:
          rec(
            `If a person's key leaks, have it banned in every community it belongs to, and give them a new identity. If the relay key leaks, treat the whole server as exposed. Ask in block/buzz before you replace that key, because a new relay key currently orphans your existing channels (<a href="https://github.com/block/buzz/issues/7357">block/buzz#7357</a>).`,
          ) +
          LANES +
          `<h4 class="ga-h">Ban a person's leaked key in Buzz</h4>` +
          ct("leak") +
          note(`Then let them back in with their new key. An admin sends them a 1-use invite link, as <a href="#operations" data-q-link="add">How should you add people?</a> shows.`) +
          note("A Buzz identity isn't tied to one community. The leaked key still works in any other community that person joined. Ask the owners of those communities to ban it too.") +
          note("A leaked relay key also lets anyone make invite links your relay accepts, because relay 0.3.0 still accepts an older kind of link signed with a key made from it. Check Membership and ban keys you don't know.") +
          note("For the owner's key, whoever runs the server makes a new key the owner first. For someone on Staff, remove them from Staff first, because the moderation screens can't ban Staff. An admin can't ban another admin.") +
          note("On a private network, Kubernetes or a local test, Buzz's moderation screens can't reach your relay. There, the owner or an admin bans the key with the <code>buzz</code> command line instead, as How do you moderate? says."),
      },
      {
        id: "sso",
        icon: "lock",
        q: "Can you use single sign-on?",
        a:
          rec("Not yet. On your own relay, everyone signs in with their own key. The closest option is a private network, where your company login controls who can reach the relay at all.", [
            ["The closest option", "Put the relay on a private network, and sign up for Tailscale with your company's identity provider. Then a person needs their company login and their key."],
          ], "How it works") +
          `<div class="fq-status"><span class="fq-status-k">${icon("bolt")}In progress in Buzz</span><p>Buzz has company sign-in based on a draft standard, <a href="https://github.com/block/buzz/blob/main/docs/nips/NIP-FI.md">NIP-FI</a>. With it, your identity provider vouches for each person's key. The relay supports it behind a setting that's off by default. The Buzz app that Block publishes uses it only with Block's own sign-in service, for communities Block hosts. Another company's sign-in needs a build of the app made for it. A self-hosted community can't turn it on yet.</p></div>` +
          // the owner's framing (2026-11-24): what follows is the next-best option while single sign-on can't be turned on
          `<h4 class="ga-h">Without single sign-on, the next-best option is a private network</h4>` +
          LOCKS +
          steps([
            ["Run the relay on a private network", `Put the relay on a VPS, your own hardware or Kubernetes, and turn on <b>Private network</b> in this guide's setup. <a href="#guide" data-go-private>Set it up</a>.`],
            ["Sign up for Tailscale with your identity provider", "Create your Tailscale network with your company's identity provider, such as Google, Microsoft, Okta or GitHub. Then only company accounts can join it. On Tailscale's paid plans, user provisioning from your identity provider, such as Okta, suspends a person in Tailscale when you deactivate them there."],
            ["Keep the member list as the second lock", "Tailscale decides who can reach the relay. The relay's member list still decides who gets in. When someone leaves, remove them from both."],
          ]),
      },
      {
        id: "two-factor",
        icon: "shield",
        q: "Can you require two-factor sign-in?",
        a:
          rec("Not yet. In Buzz, members sign in with their key only.", [
            ["The closest option", "Put the relay on a private network whose login asks for a second factor. Then a person needs that login and their key."],
          ], "How it works") +
          // the same framing as single sign-on (owner's call, 2026-11-24)
          `<h4 class="ga-h">Without two-factor sign-in, the next-best option is a private network</h4>` +
          TWO_FACTOR +
          steps([
            ["Run the relay on a private network", `Turn on <b>Private network</b> in this guide's setup. The relay then has no public address, and people reach it only through your Tailscale network. <a href="#guide" data-go-private>Set it up</a>.`],
            ["Make your identity provider ask for a second factor", "Sign up for Tailscale with Google, Microsoft, Okta or GitHub, and require two-factor sign-in in that provider. Tailscale asks for it when a device signs in, and again when the device's key expires, after 180 days by default. Shorten the key expiry, and remove a lost device from your Tailscale network at once."],
            ["Protect the key too", "The key is still the first factor. Keep it in a password manager that uses two-factor sign-in, and use disk encryption and a screen lock on every device."],
          ]) +
          note("A private network works for a team. It doesn't work well for an open community of thousands, because each member needs Tailscale on every device.") +
          note(`The relay can require sign-in through a company identity provider. But the Buzz apps people download do that only for communities Block hosts on Builderlab. See <a href="#operations" data-q-link="sso">Can you use single sign-on?</a>`),
      },
    ],
  ],
  [
    "Data",
    [
      {
        id: "backup",
        icon: "archive",
        q: "How should you back up?",
        a: (t) =>
          rec("Back up before every upgrade and at least once a week. Back up daily if losing a day of messages would be a problem. Keep an encrypted copy somewhere other than the server.") +
          taskHTML("backup", t) +
          note(`The relay key is in the backup. On Block's Docker Compose bundle, it's <code>BUZZ_RELAY_PRIVATE_KEY</code> in <code>.env</code>, and every backup includes that file. On Kubernetes, the chart's quickstart keeps it in the <code>buzz-relay</code> Secret, which the backup exports. Anyone who has a backup has the key, so encrypt it.`),
      },
      {
        id: "restore",
        icon: "restore",
        q: "How do you restore a backup?",
        a: (t) =>
          rec("Restore the most recent backup you've checked is complete, and keep the relay's address the same. Anything posted after that backup is lost.") +
          taskHTML("restore", t) +
          note("Members keep the same address, so their apps should connect to the restored relay. This guide hasn't tested that with Buzz 1.0 or a paired phone."),
      },
      {
        id: "read",
        icon: "eye",
        q: "Who can read your messages?",
        a:
          rec("Anyone who can get into the server, its database or its backups can read every message, including direct messages. Protect the server as carefully as you would the messages on it.") +
          READ +
          note(
            `Give as few people as possible access to the server. Turn on your provider's disk encryption, and encrypt your backups. Consider a private network, where the relay has no public address. Phone notifications carry no message text. Block's gateway does see your relay's public key, your server's IP address and when it wakes which phone. See <a href="#operations" data-q-link="block">What still depends on Block?</a>`,
          ) +
          // reads check community membership only (block/buzz crates/buzz-relay/src/api/media.rs); #8444 and #9077 start off
          note(
            `Buzz shares files with the whole community. Any member with a file's link can open it, even if it was posted in a private channel or a direct message they're not in. Nobody can guess a file's link. But removing someone from a channel, or deleting the message, doesn't take the file back. Removing someone from the community stops the relay from serving them files, but they keep any copies they saved. The relay this guide installs can limit files to their channels with the <code>BUZZ_MEDIA_READ_MODE</code> setting (<a href="https://github.com/block/buzz/pull/9077">block/buzz#9077</a>). That setting starts off, and turning it on takes a rollout of its own. Until it's on and checked, keep files that not every member should see out of Buzz.`,
          ) +
          // block/buzz#8376's buzz_relay::access lines, at info in the bundle's RUST_LOG
          note("The relay's log lists what each member reads, by their public key. Protect the logs as carefully as the messages."),
      },
      {
        id: "audit",
        icon: "list",
        q: "How do you keep a record of who did what?",
        a: () =>
          rec("The relay records who did what in its database, in three places. Its audit log has an entry for every event it stores, such as a message, a reaction or a deletion, and for every file upload. Moderation actions and changes to relay staff each have a list of their own. Buzz has no screen for the audit log.", [
            ["To keep them", "Leave the audit log on, which is the default, and include the database in your backups. Keep the server's SSH log and your hosting provider's activity log too, and copy them off the server. They show who reached the server itself."],
          ], "How it works") +
          LEDGER +
          // both fold, so the drawing stays the answer's one visible detail (owner's ask, 2026-11-24)
          `<details class="fq-more fq-fold"><summary><span>What the audit log stores</span></summary>${FIELDS_HTML}<p class="ga-p fq-after">It doesn't hold message text, which stays in the events themselves. It doesn't record sign-ins.</p></details>` +
          `<details class="fq-more fq-fold"><summary><span>How to read the records</span></summary><p class="ga-p">Whoever runs the server reads the audit log from the relay's database. Your agent can do it with this prompt.</p>${askHTML(trackOf(), "audit-read")}<p class="ga-p fq-after">The owner or an admin can list moderation actions with <code>buzz moderation audit</code>, the command line that ships with Buzz. See <a href="#operations" data-q-link="moderate">how to moderate</a>. Buzz's Reports screen lists every report, resolved ones too, with who resolved it and when.</p></details>` +
          note("Each entry stores a SHA-256 hash of its own fields and of the entry before it, so a changed or missing entry breaks the chain. Someone who can write to the database can still rebuild the whole chain, so keep copies with your backups, off the server.") +
          note("<code>BUZZ_AUDIT_ENABLED=false</code> in the relay's <code>.env</code> turns the audit log off. The moderation and staff records continue.") +
          note("Changes to relay staff, its operators and moderators, go to the third list: who granted or revoked a role, and the role before and after.") +
          note("Nothing records who removed a member or changed a role in a community. Sign-ins and reads show only in the relay's own log, which is capped, and which is lost when an upgrade or a restart replaces the relay's container."),
      },
    ],
  ],
  [
    "Server",
    [
      {
        id: "move", icon: "restore", q: "Can you move the community to a different domain?",
        a: rec("Not with its history. The relay ties a community to the domain people connect to. A new domain starts a new, empty community, and everyone has to join it again. To move to a new server, keep the same domain and point it at the new server.", [
            ["New server, same domain", `Make a fresh backup and stop Buzz on the old server. Point the domain at the new server, then restore the backup there, as <a href="#operations" data-q-link="restore">How do you restore a backup?</a> shows. Messages, members, files and invite links come along, because the address and the relay key stay the same.`],
            ["A new domain", "Pick the permanent domain before people join. If you change it anyway, set up the new address as a new community and invite everyone again. The old community stays at its old address, and nothing in Buzz moves it over."],
          ]) +
          MOVE +
          steps([
            ["Move to a new server", "Keep the same domain and relay key. Make a fresh backup, stop Buzz on the old server, and point the domain's DNS at the new server. Then restore the database, the file store, the git data and the configuration together from that backup. Let's Encrypt gives the new server its certificate. Practice the move before you rely on it."],
            ["If you change the domain", "Don't change <code>RELAY_URL</code> on the server that holds your community. The relay would start a new, empty community at the new address, and the old messages would stay in the database where nobody can reach them. Set up the new domain as a separate community instead."],
            ["Tell members what changes", "Buzz on desktop and on phones saves each community by its address. A new domain shows up as a separate community, and a phone that joins it with an invite link makes a new key there."],
          ]) +
          note(`Moving a community from Block's hosting to your own server has no tested path either (<a href="https://github.com/block/buzz/issues/6803">block/buzz#6803</a>). Support for a second address is requested in <a href="https://github.com/block/buzz/issues/4952">block/buzz#4952</a>, which is still open.`) +
          note("This guide tested a move to a new server with an earlier relay image: posts, members, invite links and files all came back. It hasn't tested whether Buzz 1.0 and paired phones reconnect without joining again.") +
          note("On a private network, the community's address is the machine's Tailscale name. This guide doesn't cover moving it to a new machine."),
      },
      {
        id: "upgrade",
        icon: "upgrade",
        q: "How should you upgrade the relay?",
        a: (t) => rec("Your agent upgrades to the relay version this guide has tested. Watch the relay releases in block/buzz on GitHub for security fixes. Back up first, and check that the new relay version works with the Buzz app your members use.") + taskHTML("upgrade", t),
      },
      {
        id: "server",
        icon: "terminal-2",
        q: "Who should have access to the server?",
        a:
          rec("Anyone who can log in to the server can read every message, including direct messages, and every file. Give that access to as few people as possible.") +
          ACCESS +
          checklist([
            ["Give each person their own SSH key", "Add each person's public key to the server, as in the drawing. Never share one key or one password between people. Then you can see who logged in, and remove one person without changing anyone else's access."],
            ["Turn on two-factor sign-in at your hosting provider", "This is the account at DigitalOcean, Hetzner, AWS or wherever the server runs. It isn't your Buzz identity. Anyone who signs in there can open a console on the server or copy its disk, so require two-factor sign-in for everyone on that account."],
            ["Turn off password logins over SSH", "Let people in with their SSH keys only. Put <code>PasswordAuthentication no</code> in a file of its own, <code>/etc/ssh/sshd_config.d/00-no-passwords.conf</code>, because Ubuntu reads that folder first and another file there can turn passwords back on. Restart SSH, and check that <code>sudo sshd -T | grep -i passwordauthentication</code> prints <code>no</code>. Keep your own session open until you've checked that your key still works."],
            ["Remove access the day someone leaves", "Delete their key from the server's <code>authorized_keys</code> and remove them from the hosting account. If they could have copied <code>.env</code> or a backup, they have the server's passwords and the relay key. Those passwords work only from inside the server, so removing their access is what protects them."],
          ]),
      },
      {
        id: "block",
        icon: "link",
        q: "What still depends on Block?",
        a:
          rec("Your relay runs without Block, but the Buzz apps, iPhone notifications and Builderlab accounts all come from Block. None of them gets your messages or files, unless you use an agent Block hosts, whose machines process what it reads.", undefined, "How it works") +
          DEPS +
          note("If Block stopped running these services, your relay would keep running. You would lose app updates and phone notifications."),
      },
    ],
  ],
];

/** Answers taken out, and the answer their old links open: #agents is linked from a post (2026-11-24). */
const MOVED: Record<string, string> = { agents: "agent-safe" };

/** Answers whose details are steps to take; the break before the rest reads "Details". */
const HOW_TO = new Set([
  "add", "welcome", "notifications", "pair", "moderate", "leave",
  "agent-brief", "agent-on", "agent-approve", "agent-remote",
  "identity", "lost", "leak", "sso", "two-factor",
  "backup", "restore", "upgrade", "move",
]);

/**
 * Search: other words people type for what the answers say (owner's ask of 2026-11-23). Each query
 * word also matches these; a plural also matches without its "s".
 */
const ALSO: Record<string, string[]> = {
  kick: ["remove", "ban"], boot: ["remove", "ban"], spam: ["moderat", "ban", "report"], troll: ["ban", "moderat"],
  mod: ["moderat"], mods: ["moderat"], moderator: ["moderat", "staff"],
  "2fa": ["two-factor"], mfa: ["two-factor"], otp: ["two-factor"],
  vpn: ["tailscale", "private network"], sso: ["single sign-on"], okta: ["single sign-on", "identity provider"],
  login: ["sign in", "sign-in"], signin: ["sign in", "sign-in"], password: ["password", "key"],
  invite: ["invite", "link"], onboard: ["welcome", "invite"], onboarding: ["welcome", "invite"],
  offboard: ["leave", "remove"], offboarding: ["leave", "remove"], fire: ["leave", "remove"], quit: ["leave"],
  bot: ["agent"], ai: ["agent"], llm: ["model"], claude: ["claude", "harness"], codex: ["codex", "harness"], goose: ["goose", "harness"],
  push: ["notification"], notify: ["notification"], ios: ["iphone", "phone"], mobile: ["phone"],
  nsec: ["key"], update: ["upgrade"], version: ["upgrade", "version"],
  backup: ["back up", "backup"], price: ["$", "cost"], pricing: ["$", "cost"], cost: ["$", "cost"],
  dm: ["direct message"], privacy: ["read", "private"], hosting: ["host", "server"], k8s: ["kubernetes"],
  docker: ["compose", "docker"], logs: ["log"],
};
/** The query's words, each with what it may match, lowercased. */
const terms = (query: string): string[][] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => [...new Set([w, ...(ALSO[w] ?? []), ...(w.length > 3 && w.endsWith("s") ? [w.slice(0, -1), ...(ALSO[w.slice(0, -1)] ?? [])] : [])])]);
const reEsc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">${TABLER.search}</svg>`;

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
    <div class="opx-list fq-list" role="group" aria-label="Questions">
      <div class="fq-search" role="search"><label class="fq-s-box">${SEARCH_ICON}<input type="search" class="fq-s-in" placeholder="Search the answers" aria-label="Search the answers" aria-controls="fq-results" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></label></div>
      <div class="fq-results" id="fq-results" aria-live="polite" hidden></div>${GROUPS.map(
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
  const input = host.querySelector<HTMLInputElement>(".fq-s-in")!;
  const results = host.querySelector<HTMLElement>(".fq-results")!;

  /**
   * Search every answer: its question, its text for the current setup, what sits in its folds, and
   * every step of its click-throughs. Built on first use, and again when the setup changes.
   */
  const plain = (html: string) => {
    const d = document.createElement("div");
    // a space between neighboring tags, so a label and its text don't run together
    d.innerHTML = html.replace(/></g, "> <");
    // drawings of made-up data (the audit log's entries) aren't advice, so they aren't searched
    d.querySelectorAll("svg, style, script, [aria-hidden='true'], .fq-audit, .fq-rec > div > b").forEach((el) => el.remove());
    return (d.textContent ?? "").replace(/\s+/g, " ").trim();
  };
  const ctText = (html: string) =>
    [...html.matchAll(/data-ct="([^"]+)"/g)]
      .flatMap(([, n]) => (CLICK_THROUGHS[n] ?? []).flatMap((f) => [f.label, ...f.steps.flatMap((st) => [st.k, st.t])]))
      .join(" ");
  let index: { x: Question; text: string; low: string; title: string }[] | null = null;
  const buildIndex = () =>
    all.map((x) => {
      const html = typeof x.a === "string" ? x.a : x.a(trackOf());
      const text = `${plain(html)} ${plain(ctText(html))}`.trim();
      return { x, text, low: text.toLowerCase(), title: x.q.toLowerCase() };
    });
  let words: string[][] = [];
  /** A word of three letters or fewer matches only as a word, with its endings: "ban" finds "banned", not "bandwidth". */
  const pat = (t: string) => (t.length <= 3 && /^\w+$/.test(t) ? `\\b${reEsc(t)}(?:s|es|ed|ned|ing|ning|er)?\\b` : reEsc(t));
  const re1 = (t: string) => new RegExp(pat(t), "g");
  /** One pattern for all of them, capturing the match, case-insensitive. */
  const reAll = (alts: string[]) => new RegExp(`(${alts.map(pat).join("|")})`, "gi");
  const has = (hay: string, t: string) => re1(t).test(hay);
  const count = (hay: string, t: string) => hay.match(re1(t))?.length ?? 0;
  /** Where the first match sits, in a line of about 140 characters, with every match marked. */
  /** The whole query, when it has two words or more and appears as typed: then it's marked, not each word. */
  const phrase = () => input.value.trim().toLowerCase().replace(/\s+/g, " ");
  const marksFor = (low: string) => (phrase().includes(" ") && low.includes(phrase()) ? [phrase()] : words.flat());
  const snippet = (text: string, low: string) => {
    const alts = marksFor(low);
    const at = Math.min(...alts.map((t) => low.search(re1(t))).filter((n) => n >= 0), Infinity);
    if (at === Infinity) return "";
    let from = Math.max(0, at - 50);
    let to = Math.min(text.length, at + 90);
    if (from > 0) from = text.indexOf(" ", from) + 1;
    if (to < text.length) to = Math.max(text.lastIndexOf(" ", to), at + 1);
    const re = reAll(alts);
    return `${from > 0 ? "…" : ""}${esc(text.slice(from, to)).replace(re, "<mark>$1</mark>")}${to < text.length ? "…" : ""}`;
  };
  const find = () => {
    words = terms(input.value);
    if (!words.length) return endSearch(false);
    index ??= buildIndex();
    const hits = index
      .filter((e) => words.every((alts) => alts.some((t) => has(e.title, t) || has(e.low, t))))
      .map((e) => ({ e, score: words.reduce((n, alts) => n + Math.max(...alts.map((t) => (has(e.title, t) ? 6 : 0) + Math.min(count(e.low, t), 5))), 0) }))
      .sort((a, b) => b.score - a.score);
    list.classList.add("searching");
    results.hidden = false;
    results.innerHTML = hits.length
      ? `<p class="fq-r-k">${hits.length} ${hits.length === 1 ? "answer" : "answers"}</p>${hits
          .map(
            ({ e }) =>
              `<button type="button" class="opx-item" data-q="${e.x.id}" aria-controls="fq-pane" data-selected="${e.x.id === open}"><span class="opx-item-i">${icon(e.x.icon)}</span><span class="opx-item-t"><b>${e.x.q}</b><small>${snippet(e.text, e.low)}</small></span></button>`,
          )
          .join("")}`
      : `<p class="fq-none">No answer mentions "${esc(input.value.trim())}". Try fewer or other words.</p>`;
  };
  const endSearch = (clear = true) => {
    if (clear) input.value = "";
    words = [];
    list.classList.remove("searching");
    results.hidden = true;
    results.innerHTML = "";
  };
  /** Whether this text holds the search: the whole phrase, or every word of it. */
  const holds = (low: string) => (phrase().includes(" ") && low.includes(phrase())) || words.every((alts) => alts.some((t) => has(low, t)));
  /**
   * When only a click-through step that isn't drawn holds the search, go to that step, and show its place's
   * steps if they're hidden (How do you keep an agent always online?). What's on screen already wins.
   */
  const toMatchingStep = () => {
    if (holds(pane.innerText.toLowerCase())) return;
    for (const slot of pane.querySelectorAll<HTMLElement>("[data-ct]")) {
      const flows = CLICK_THROUGHS[slot.dataset.ct!] ?? [];
      for (const [fi, f] of flows.entries()) {
        const si = f.steps.findIndex((st) => holds(plain(`${st.k} ${st.t}`).toLowerCase()));
        if (si < 0) continue;
        state[slot.dataset.ct!] = [fi, si];
        const steps = slot.closest<HTMLElement>(".ga-on-p[hidden]");
        if (steps) showPlace(pane, steps.dataset.on!);
        draw(slot);
        return;
      }
    }
  };
  /** In the opened answer, mark what the search matched; open every fold that holds the first, and go to it. */
  const markHits = () => {
    if (!words.length) return;
    toMatchingStep();
    const low = (pane.textContent ?? "").toLowerCase().replace(/\s+/g, " ");
    if (!mark(marksFor(low)) && marksFor(low).length === 1) mark(words.flat());
    const first = pane.querySelector<HTMLElement>(".fq-mark");
    if (!first) return;
    for (let d = first.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    const steps = first.closest<HTMLElement>(".ga-on-p[hidden]");
    if (steps) showPlace(pane, steps.dataset.on!)?.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
    const r = first.getBoundingClientRect();
    if (r.top < 80 || r.bottom > innerHeight - 40)
      first.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  /** Marks every match of these in the open answer's text; says whether there was one. */
  const mark = (alts: string[]) => {
    const re = reAll(alts);
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest("svg, script, style, .fq-h, mark") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const n of nodes) {
      if (!new RegExp(re.source, "i").test(n.data)) continue;
      const span = document.createElement("span");
      span.innerHTML = esc(n.data).replace(re, `<mark class="fq-mark">$1</mark>`);
      n.replaceWith(...span.childNodes);
    }
    return !!pane.querySelector(".fq-mark");
  };
  input.addEventListener("input", find);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      endSearch();
      input.blur();
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      const first = results.querySelector<HTMLButtonElement>("[data-q]");
      if (!first) return;
      e.preventDefault();
      if (e.key === "Enter") first.click();
      else first.focus();
    }
  });
  // "/" anywhere on the page, outside a field, goes to the search
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  // on a phone the answer opens under its question, like an accordion
  // phones and tablets: the answer opens under its question (main.css has the same width)
  const narrow = matchMedia("(max-width: 900px)");
  /**
   * Which answer a link opens: #…&q=<id> as before, a short link, #<id> (#agent-on), or a part of an
   * answer, #<id>-<part> (#agent-remote-steps). The longest id that fits wins, so a longer id is never
   * read as a part of a shorter one. An element already on the page with the token as its id wins.
   * An answer taken out sends its old links to the nearest one (MOVED).
   */
  const byLength = [...all].sort((a, b) => b.id.length - a.id.length);
  const target = (raw: string): { q: string; part?: string } | null => {
    const token = MOVED[raw] ?? raw;
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
    if (list.classList.contains("searching") && !results.querySelector(`[data-q="${x.id}"]`)) endSearch();
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
    // a labeled break between the recommendation and the details
    const recEl = pane.querySelector(".fq-rec");
    if (recEl?.nextElementSibling)
      recEl.insertAdjacentHTML("afterend", `<div class="fq-split"><span>${HOW_TO.has(x.id) ? "How to do it" : "Details"}</span></div>`);
    if (narrow.matches) list.querySelector(`[data-q="${x.id}"]`)!.after(pane);
    else box.appendChild(pane);
    enhanceCode(pane);
    pane.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
    foldNotes();
  };

  /**
   * Notes in a row fold under "Good to know" (the owner's ask of 2026-11-23: more compact), a single
   * note too (2026-11-24: detail notes get in the way). Drawings and click-throughs never fold: they stay
   * visible where the answer puts them (owner's call, 2026-11-23).
   * A click-through measures itself, so one inside a fold is drawn again when the fold opens.
   */
  const isNote = (el: Element | undefined) => !!el?.classList.contains("opx-note");
  const foldNotes = () => {
    const kids = [...pane.children];
    for (let i = 0; i < kids.length; ) {
      if (!isNote(kids[i])) {
        i++;
        continue;
      }
      let j = i;
      while (isNote(kids[j])) j++;
      const group = kids.slice(i, j);
      const fold = document.createElement("details");
      fold.className = "fq-more";
      fold.innerHTML = `<summary><span>Good to know</span><em>${group.filter((el) => isNote(el)).length}</em></summary>`;
      group[0].before(fold);
      fold.append(...group);
      fold.addEventListener("toggle", () => fold.open && fold.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw));
      i = j;
    }
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // a group's label folds or unfolds it, and leaves the open answer as it is
    const fold = t.closest<HTMLButtonElement>(".fq-g-t");
    if (fold) return setShut(fold.closest<HTMLElement>(".fq-grp")!, fold.getAttribute("aria-expanded") === "true");
    const tab = t.closest<HTMLButtonElement>("[data-q]");
    if (tab) {
      show(tab.dataset.q!);
      if (tab.closest(".fq-results")) markHits();
      return showLink();
    }
    // a link from one answer to another
    const jump = t.closest<HTMLElement>("[data-q-link]");
    if (jump) {
      e.preventDefault();
      show(jump.dataset.qLink!, true);
      return showLink();
    }
    // How do you keep an agent always online?: a place shows its own steps under the cards; again, hides them
    const place = t.closest<HTMLButtonElement>(".ga-on-row[data-on]");
    if (place) {
      const steps = showPlace(pane, place.getAttribute("aria-pressed") === "true" ? null : place.dataset.on!);
      if (!steps) return;
      steps.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
      const r = steps.getBoundingClientRect();
      if (r.top > innerHeight - 160) scrollTo({ top: r.top + scrollY - 90, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
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
      copyText(copy.dataset.prompt === "agent-remote" ? remotePrompt() : copy.dataset.ask ? askText(trackOf(), copy.dataset.ask as AskKey) : promptText(trackOf(), (copy.dataset.task ?? "upgrade") as OpTask), () => {
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
    if ((e.target as HTMLElement).closest(".fq-results")) {
      const items = [...results.querySelectorAll<HTMLButtonElement>("[data-q]")];
      const at = items.indexOf(e.target as HTMLButtonElement);
      const to = { ArrowDown: at + 1, ArrowUp: at - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      if (to < 0) return input.focus();
      items[Math.min(to, items.length - 1)].focus();
      return;
    }
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
    index = null;
    if (list.classList.contains("searching")) find();
    if (typeof all.find((x) => x.id === open)!.a !== "string") show(open);
    else pane.querySelector<HTMLAnchorElement>(".fq-h .hl")?.setAttribute("href", linkFor(all.find((x) => x.id === open)!));
  });
  // a short link to an answer, or to a part of one: open it, then nav.ts lands on it as it does any anchor
  registerAnchors((token) => {
    const t = target(token);
    if (!t) return null;
    if (open !== t.q) show(t.q);
    const part = t.part ? document.getElementById(t.part) : null;
    part?.closest<HTMLDetailsElement>("details.fq-more")?.setAttribute("open", "");
    const steps = part?.closest<HTMLElement>(".ga-on-p[hidden]");
    if (steps) showPlace(pane, steps.dataset.on!)?.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
    if (t.part) return part ? t.part : null;
    return narrow.matches ? `fq-tab-${t.q}` : "fq-pane";
  });
}
