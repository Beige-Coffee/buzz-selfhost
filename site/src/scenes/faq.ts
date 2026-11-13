import skill from "virtual:skill-steps";
import { linkButton } from "../lib/permalink";
import { agentFlows } from "./agentflow";
import { agentQuestions } from "./agents";
import { identityFlows, lostFlows } from "./identity";
import { clickThroughHTML, fitMembers, peopleFlows, type Flow } from "./members";
import { promptText, runningOnHTML, taskHTML } from "./operations";
import { TABLER } from "./tabler";
import { copyText, enhanceCode } from "../lib/code";
import { jumpTo } from "../lib/nav";
import { getValues, isPrivate, onValues, setValues, skillURL, trackHash, trackOf, type Track } from "../lib/values";

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

const rec = (t: string) => `<div class="fq-rec"><span class="fq-rec-i">${icon("check")}</span><div><b>Recommended</b><p>${t}</p></div></div>`;
const note = (t: string) => `<p class="opx-note">${t}</p>`;
const steps = (rows: [string, string][]) =>
  `<ol class="opx-flow">${rows
    .map(([t, d], i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${t}</p><p class="opx-flow-d">${d}</p></div></li>`)
    .join("")}</ol>`;
/** Where a click-through of Buzz's screens goes; CLICK_THROUGHS has its flows. */
const ct = (name: string) => `<div class="fq-ct" data-ct="${name}"></div>`;

/** On a private network, a new member needs the tailnet too. */
const PRIVATE_PEOPLE =
  "Your relay is on a private network, so each person also joins your Tailscale network, with every device they use Buzz on. A company pays Tailscale for each person, from $8 a month.";

const CLICK_THROUGHS: Record<string, Flow[]> = {
  identity: identityFlows,
  lost: lostFlows,
  role: peopleFlows().filter((f) => f.id === "role"),
  // the invite link as we recommend it, first: a day, and the people you expect. Adding by npub follows.
  add: ["link", "add"].map((id) => peopleFlows("1 day", "5").find((f) => f.id === id)!),
  remove: peopleFlows().filter((f) => f.id === "remove"),
  agents: agentFlows,
};

/**
 * Buzz 1.0's Moderation screens (relay staff) need the relay to advertise an admin address
 * (BUZZ_ADMIN_HOST), which the skill offers on a public Compose setup only: the app refuses private and
 * local addresses (block/buzz-app src-tauri/src/relay_admin/net.rs), and Block's chart has no setting for it.
 */
const hasConsole = (t: Track) => t === "vps" || t === "own-public";

/**
 * Who can do what: the app's own permission rules (block/buzz-app, src/bundled/moderation/api.ts). Any
 * member can report a message. Banning, timing out and deleting others' messages happen in the Moderation
 * screens for relay staff (the owner, as the relay's operator, and whoever is added under Staff), or from
 * the command line for the owner and admins (block/buzz crates/buzz-relay/src/handlers/moderation_authz.rs).
 */
const YES = `<span class="fq-y" aria-label="Yes">${icon("check")}</span>`;
const NO = `<span class="fq-n" aria-label="No">${icon("x")}</span>`;
const IF_STAFF = `<span class="fq-if">If on Staff</span>`;
const roles = (t: Track) => `<div class="fq-vis"><table class="fq-roles">
  <thead><tr><th></th><th>${icon("crown")}Owner</th><th>${icon("shield")}Admin</th><th>${icon("user")}Member</th></tr></thead>
  <tbody>
    <tr><td>Add members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Make invite links</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Remove members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Add, promote or remove admins</td><td>${YES}</td><td>${NO}</td><td>${NO}</td></tr>
    <tr><td>Report a message</td><td>${YES}</td><td>${YES}</td><td>${YES}</td></tr>
    <tr><td>Ban, time out, delete others' messages</td><td>${YES}</td>${hasConsole(t) ? `<td>${IF_STAFF}</td><td>${IF_STAFF}</td>` : `<td>${YES}</td><td>${NO}</td>`}</tr>
    <tr><td>Change the owner</td><td colspan="3" class="fq-srv">${icon("server")}On the server, by whoever runs it</td></tr>
  </tbody></table></div>`;

/** Moderating: in Buzz's screens on a public Compose relay, otherwise with the buzz command line. */
const NO_CONSOLE: Partial<Record<Track, string>> = {
  k8s: "Block's Helm chart has no setting yet for the address Buzz's moderation screens need.",
  practice: "Buzz's moderation screens can't reach a local test.",
};
const moderation = (t: Track) =>
  hasConsole(t)
    ? rec("Turn on Buzz's moderation screens, add your moderators under Staff, and ban rather than only remove.") +
      steps([
        ["Turn on the moderation screens", "Your agent offers this during setup, or ask it later. It takes one more DNS record, for <code>admin.</code> in front of your domain."],
        ["Add your moderators under Staff", "In Buzz, <b>Settings</b>, <b>Moderation</b>, <b>Staff</b>: paste their npub, pick <b>moderator</b>, then choose <b>Add</b>. Being an admin isn't enough: Staff is a list of its own, which the owner manages."],
        ["Work through reports", "Anyone can report a message. Moderators find reports under <b>Settings</b>, <b>Moderation</b>, <b>Reports</b>, where they can delete it, time the person out or ban them."],
        ["Ban, don't only remove", "A ban keeps them out, even with an invite link, and cuts off their agents. Someone you only remove can come back with any link that hasn't expired."],
      ])
    : rec("Ban rather than only remove: a ban keeps someone out and cuts off their agents. Someone you only remove can come back with any invite link that hasn't expired.") +
      note(
        `${NO_CONSOLE[t] ?? "On a private network, Buzz's moderation screens can't reach your relay."} So the owner or an admin moderates with the <code>buzz</code> command line that comes with Buzz 1.0 (on a Mac, <code>/Applications/Buzz.app/Contents/Resources/bin/buzz</code>), signed with their own key: <code>buzz moderation</code> lists the reports members send, and bans or times people out, and <code>buzz messages delete</code> removes a message.`,
      );

/** A lost device: one question decides everything, whether the key is exposed. */
const CASES = `<div class="fq-vis fq-cases">
  <p class="fq-cases-q">${icon("device-mobile")}<span><b>Could someone get into the lost device?</b>It was unlocked, had no disk encryption, or someone knows its password.</span></p>
  <div class="fq-case bad">
    <p class="fq-case-h"><span class="fq-tag no">Yes, or not sure</span><b>The key is exposed: retire it</b></p>
    <ol><li>Have the old identity banned, by the owner or a moderator. Removing it isn't enough: a live invite link lets it back in. If it was the owner's, change the owner on the server first, then remove and ban the old key, which stays an admin until you do.</li><li>Make a new key on the new device. Not the saved copy: whoever has the device has that key too.</li><li>An admin adds the new npub.</li><li>Pair the phone, start their agents again, and tell any other community they joined.</li></ol>
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

/** A leak: what to do, by which key leaked. */
const lane = (head: string, cls: string, chips: string[]) =>
  `<div class="fq-lane${cls}"><span class="fq-lane-k">${head}</span>${chips.map((c) => `<span class="fq-chip">${c}</span>`).join("")}</div>`;
const LANES = `<div class="fq-vis fq-lanes">
  ${lane(`${icon("key")}A person's key`, "", ["Ban it", "Add their new identity"])}
  ${lane(`${icon("server")}The relay key`, "", ["Treat the server as exposed", "Ask before a new key"])}
  ${lane(`${icon("alert")}The server itself`, " hot", ["Change its logins", "Assume every message was read"])}
</div>`;

const checklist = (items: [string, string, string?][]) =>
  `<div class="fq-vis"><ul class="fq-check">${items
    .map(
      ([t, d, only]) =>
        `<li><button type="button" class="fq-box" aria-pressed="false" aria-label="Done: ${t}">${icon("check")}</button><div><b>${t}${only ? ` <span class="fq-only">${only}</span>` : ""}</b><p>${d}</p></div></li>`,
    )
    .join("")}</ul></div>`;

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
const mobile = (t: Track) =>
  rec("Turn notifications on and use Block's gateway with the App Store's Buzz app. You need no Apple developer account, no Apple push credentials and no gateway of your own.") +
  (t === "practice"
    ? note("A local test can't pair phones. Use a server setup to try this.")
    : t === "k8s-private"
      ? note("Pairing a phone on private Kubernetes isn't covered by this guide yet. The private VPS setup is.")
      : "") +
  PUSH +
  // docs/research.md: Block's bundle notes name "the public gateway"; block/buzz#5206 is where self-hosters asked for it
  note(
    `It worked in this guide's tests on 23 and 27 October 2026. Block calls push experimental and promises no level of service (<a href="https://github.com/block/buzz/issues/5206">block/buzz#5206</a>), so run the locked-phone test below before your team relies on it.`,
  ) +
  `<div class="fq-mobile">${PHONE_OPEN.map((x) => `<h4>${x}</h4>${phone(x)}`).join("")}</div>` +
  PHONE_FOLDED.map((x) => fold(x, phone(x))).join("");

/**
 * Before the team arrives: five things to have true, each a link to the answer that says how. The
 * boxes tick, for working down the list, like the leaving checklist.
 */
const PRELAUNCH: [id: string, title: string, text: string][] = [
  ["server", "Two operators", "A primary and a backup, each with their own way in."],
  ["add", "A working door", "A second member gets in. A stranger does not."],
  ["backup", "Keys and a backup", "Both keys saved, and a backup off the server that you have restored once."],
  ["notifications", "Phones", "A locked phone shows a real notification."],
  ["moderate", "An open community", "Moderators named, and agents on a machine of their own."],
];
const prelaunchHTML = () => `<div class="pl" role="group" aria-labelledby="pl-k">
  <p class="pl-k" id="pl-k">Before the team arrives</p>
  <ul class="pl-list">${PRELAUNCH.map(
    ([id, title, text]) =>
      `<li><button type="button" class="fq-box" aria-pressed="false" aria-label="Done: ${title}">${icon("check")}</button><div><a href="#operations" data-q-link="${id}">${title}</a><p>${text}</p></div></li>`,
  ).join("")}</ul>
</div>`;

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
        a: (t) =>
          rec("Send an invite link that expires after a day, limited to the people you expect. To add someone without a link, add their npub.") +
          ct("add") +
          note(
            `Each person needs a key first (<a href="#operations" data-q-link="identity">how to get one</a>). With a link they join by themselves. To be added by npub they send it to you: the key script prints it, and Buzz shows it if they try to join before you add them.`,
          ) +
          // block/buzz-app: v1.0.0's dialog has Add directly; from v0.7.0-preview.265.1 on, moderation/features.ts turns it off
          note(
            `<b>Add directly</b> is in Buzz 1.0.0. Preview builds after it show <b>Members</b> and <b>Invite</b> tabs in Membership and offer only the link. If yours has no Add directly, ask your agent to add the npub, or run the skill's <a href="${ADD_MEMBER}">add-member command</a> on the server.`,
          ) +
          // starter channels, from block/buzz#8594 (in the pin): invite claims and adds in Buzz, not buzz-admin add-member
          note("In a public channel's settings, turn on <b>Starter channel for new members</b>: everyone who joins by link, or whom you add in Buzz, joins it. People added from the server's command line aren't.") +
          // links last 30 days at most (block/buzz crates/buzz-core/src/invite.rs); nothing revokes one (#8529 open)
          note(
            `For a public project, once you've set up <a href="#operations" data-q-link="moderate">moderation</a>, post an invite link on your site or README with a use limit, and replace it when it fills or expires. A link lasts 30 days at most, and Buzz can't cancel one early. Banning the person who made a link cancels every link they made.`,
          ) +
          (isPrivate(t) ? note(PRIVATE_PEOPLE) : ""),
      },
      { id: "notifications", icon: "device-mobile", q: "How do phones and notifications work?", a: mobile },
      {
        id: "roles",
        icon: "crown",
        q: "How should we set up roles?",
        a: (t) =>
          rec("Make the person who runs Buzz the owner, and name at least two admins, so someone can always add or remove people.") +
          roles(t) +
          ct("role") +
          note(`The owner is set on the server, so whoever runs it changes it. The old owner stays on as an admin. Banning is a separate tool: see <a href="#operations" data-q-link="moderate">How do we moderate?</a>`),
      },
      {
        id: "moderate",
        icon: "shield",
        q: "How do we moderate?",
        a: moderation,
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
  [
    "Agents",
    [
      {
        id: "agents",
        icon: "robot",
        q: "How should we run agents?",
        a:
          rec("Choose the agent's environment before connecting it. For a community anyone can join, use an isolated device or virtual machine with only that project's files and scoped credentials.") +
          note(`<a href="#security">See what an agent can touch</a>, drawn in Security. A Workspace folder is not a sandbox. Keep personal accounts, private repositories and production credentials off a machine whose agent reads an open community.`) +
          ct("agents") +
          // block/buzz-app v1.0.0, src/features/agents/owner-attestation.ts: the owner's messages start an agent's work
          note(
            `An agent made in Buzz answers its owner, not every member. Next: <a href="#operations" data-q-link="agent-brief">what to tell it</a>, <a href="#operations" data-q-link="agent-model">which harness and model</a>, <a href="#operations" data-q-link="agent-on">keeping it answering</a> and <a href="#operations" data-q-link="agent-safe">keeping it safe</a>.`,
          ),
      },
      ...agentQuestions({ rec, note }),
    ],
  ],
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
            `Files are shared with the whole community, not one channel. Any member with a file's link can open it, even from a private channel or a direct message they're not in. A link can't be guessed, but removing someone from a channel, or deleting the message, doesn't take a file back. Removing them from the community stops the relay serving it to them, not the copies they saved. Newer relay images can limit files to their channels (<a href="https://github.com/block/buzz/pull/9077">block/buzz#9077</a>); the image this guide installs is older, and the setting starts off. Until it's on and checked, keep files that not every member may see out of Buzz.`,
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

export function mountFaq(host: HTMLElement): void {
  const all = GROUPS.flatMap(([, qs]) => qs);
  host.innerHTML = `${prelaunchHTML()}${runningOnHTML(trackOf())}<div class="opx fq">
    <div class="opx-list fq-list" role="tablist" aria-label="Questions" aria-orientation="vertical">${GROUPS.map(
      ([group, qs]) =>
        `<div class="fq-grp" role="none"><p class="fq-g">${group}</p>${qs
          .map(
            (x) =>
              `<button type="button" role="tab" class="opx-item" id="fq-tab-${x.id}" data-q="${x.id}" aria-controls="fq-pane" aria-selected="false" tabindex="-1"><span class="opx-item-i">${icon(x.icon)}</span><span class="opx-item-t"><b>${x.q}</b></span></button>`,
          )
          .join("")}</div>`,
    ).join("")}</div>
    <div class="fq-pane" id="fq-pane" role="tabpanel"></div>
  </div>`;
  const box = host.querySelector<HTMLElement>(".fq")!;
  const list = host.querySelector<HTMLElement>(".fq-list")!;
  const pane = host.querySelector<HTMLElement>(".fq-pane")!;
  // on a phone the answer opens under its question, like an accordion
  const narrow = matchMedia("(max-width: 640px)");
  const hashQuestion = () => new URLSearchParams(location.hash.slice(1)).get("q");
  let open = all.some((x) => x.id === hashQuestion()) ? hashQuestion()! : all[0].id;
  // each click-through's flow and step, from the start again with each new question
  let state: Record<string, [number, number]> = {};
  const draw = (slot: HTMLElement) => {
    const [flow, step] = state[slot.dataset.ct!] ?? [0, 0];
    slot.innerHTML = clickThroughHTML(CLICK_THROUGHS[slot.dataset.ct!], flow, step);
    fitMembers(slot);
  };

  const show = (id: string, focus = false) => {
    const x = all.find((y) => y.id === id) ?? all[0];
    if (x.id !== open) state = {};
    open = x.id;
    list.setAttribute("role", narrow.matches ? "group" : "tablist");
    if (narrow.matches) list.removeAttribute("aria-orientation");
    else list.setAttribute("aria-orientation", "vertical");
    pane.setAttribute("role", narrow.matches ? "region" : "tabpanel");
    list.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => {
      const on = b.dataset.q === x.id;
      b.setAttribute("role", narrow.matches ? "button" : "tab");
      b.setAttribute("data-selected", String(on));
      if (narrow.matches) {
        b.removeAttribute("aria-selected");
        b.setAttribute("aria-expanded", String(on));
      } else {
        b.removeAttribute("aria-expanded");
        b.setAttribute("aria-selected", String(on));
      }
      b.tabIndex = narrow.matches || on ? 0 : -1;
      if (on && focus) b.focus();
    });
    pane.setAttribute("aria-labelledby", `fq-tab-${x.id}`);
    pane.innerHTML = `<h3 class="fq-h">${x.q}${linkButton(`#${trackHash(trackOf())}&to=fq-tab-${x.id}&q=${x.id}`, "Copy a link to this answer")}</h3>${typeof x.a === "string" ? x.a : x.a(trackOf())}`;
    if (narrow.matches) list.querySelector(`[data-q="${x.id}"]`)!.after(pane);
    else box.appendChild(pane);
    enhanceCode(pane);
    pane.querySelectorAll<HTMLElement>("[data-ct]").forEach(draw);
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>("[data-q]");
    if (tab) return show(tab.dataset.q!);
    // a link from one answer to another
    const jump = t.closest<HTMLElement>("[data-q-link]");
    if (jump) {
      e.preventDefault();
      return show(jump.dataset.qLink!, true);
    }
    // the upgrade prompt, for your agent
    const copy = t.closest<HTMLButtonElement>(".ag-copy");
    if (copy) {
      copyText(promptText(trackOf(), "upgrade"), () => {
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
    // the leaving checklist ticks off, for working through it
    const tick = t.closest<HTMLButtonElement>(".fq-box");
    if (tick) tick.setAttribute("aria-pressed", String(tick.getAttribute("aria-pressed") !== "true"));
  });
  // arrow keys move between questions, as in any tab list
  host.addEventListener("keydown", (e) => {
    if (!(e.target as HTMLElement).closest("[data-q]")) return;
    const i = all.findIndex((x) => x.id === open);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(all[(next + all.length) % all.length].id, true);
  });
  // a link to an answer from elsewhere on the page, such as the limits: open it, then go there
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-q-link]");
    if (!a || host.contains(a)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    show(a.dataset.qLink!);
    if (!narrow.matches) return jumpTo("operations");
    // on a phone the answer opens under its question, so land on the question
    const q = list.querySelector<HTMLElement>(`[data-q="${open}"]`)!;
    scrollTo({ top: q.getBoundingClientRect().top + scrollY - 72, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  window.addEventListener("hashchange", () => {
    const q = hashQuestion();
    if (!q || !all.some((x) => x.id === q)) return;
    show(q);
    const target = list.querySelector<HTMLElement>(`[data-q="${q}"]`);
    if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
  });
  narrow.addEventListener("change", () => show(open));
  show(open);
  // the Running on box changed: redraw it, and the answer if it depends on the setup
  onValues(() => {
    host.querySelector(".opx-ctx")!.outerHTML = runningOnHTML(trackOf());
    if (typeof all.find((x) => x.id === open)!.a !== "string") show(open);
    else pane.querySelector<HTMLAnchorElement>(".fq-h .hl")?.setAttribute("href", `#${trackHash(trackOf())}&to=fq-tab-${open}&q=${open}`);
  });
}
