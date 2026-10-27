import { TABLER } from "./tabler";

/**
 * Access and keys: what we recommend for keys, people and the server, and how to set it up. Questions
 * on the left and the answer on the right, as in Operations; on a phone the answer opens under its
 * question. Each answer leads with the recommendation, then the steps, with a picture only where one
 * says it faster. The facts each one rests on, with sources: docs/access-and-keys.md.
 */

const OWN: Record<string, string> = {
  key: `<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2.5 2.5"/>`,
  lock: `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  alert: `<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.01"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  vault: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/>`,
  archive: `<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>`,
  list: `<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>`,
};
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${OWN[n] ?? TABLER[n]}</svg>`;

const rec = (t: string) => `<div class="fq-rec"><span class="fq-rec-i">${icon("check")}</span><div><b>Recommended</b><p>${t}</p></div></div>`;
const note = (t: string) => `<p class="opx-note">${t}</p>`;
const steps = (rows: [string, string][]) =>
  `<ol class="opx-flow">${rows
    .map(([t, d], i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${t}</p><p class="opx-flow-d">${d}</p></div></li>`)
    .join("")}</ol>`;
const menu = (...items: string[]) => items.map((i) => `<b>${i}</b>`).join(", ");

/** Who can do what: the app's own permission rules (block/buzz-app, src/bundled/moderation/api.ts). */
const YES = `<span class="fq-y" aria-label="Yes">${icon("check")}</span>`;
const NO = `<span class="fq-n" aria-label="No">${icon("x")}</span>`;
const ROLES = `<div class="fq-vis"><table class="fq-roles">
  <thead><tr><th></th><th>${icon("crown")}Owner</th><th>${icon("shield")}Admin</th><th>${icon("user")}Member</th></tr></thead>
  <tbody>
    <tr><td>Add members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Make invite links</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Remove members</td><td>${YES}</td><td>${YES}</td><td>${NO}</td></tr>
    <tr><td>Add, promote or remove admins</td><td>${YES}</td><td>${NO}</td><td>${NO}</td></tr>
    <tr><td>Change the owner</td><td colspan="3" class="fq-srv">${icon("server")}On the server, by whoever runs it</td></tr>
  </tbody></table></div>`;

const LOST = `<div class="fq-vis fq-tree">
  <div class="fq-node start">${icon("device-mobile")}A laptop or phone is lost</div>
  <div class="fq-q">Was it locked, with its disk encrypted?</div>
  <div class="fq-branches">
    <div class="fq-br"><span class="fq-tag no">No, or not sure</span><div class="fq-node act">${icon("x")}<span>Remove their key now<small>Settings, Community admin, Membership</small></span></div></div>
    <div class="fq-br"><span class="fq-tag yes">Yes</span><div class="fq-node">${icon("check")}<span>Keep it on the list for now</span></div></div>
  </div>
  <div class="fq-q">Did they save a copy of the key?</div>
  <div class="fq-branches">
    <div class="fq-br"><span class="fq-tag yes">Yes</span><div class="fq-node">${icon("key")}<span>Sign in with it on the new device<small>Use an existing key, or Restore from backup with a Block account</small></span></div></div>
    <div class="fq-br"><span class="fq-tag no">No</span><div class="fq-node act">${icon("plus")}<span>New identity, added again by an admin<small>and the old key removed</small></span></div></div>
  </div>
  <div class="fq-node end">${icon("device-mobile")}Pair the phone again: Settings, Pair mobile</div>
</div>`;

/** Invite with a link, as Buzz draws its two settings: expiry 1, 3, 7 or 30 days, and a use limit. */
const INVITE = `<div class="fq-vis fq-invite">
  <p class="fq-cap">Invite with a link, set like this</p>
  <div class="fq-field"><span>Expires after</span><b>1 day ${icon("chevron-down")}</b></div>
  <div class="fq-field"><span>Limit number of uses</span><b>5 ${icon("chevron-down")}</b><i>the number of people you expect</i></div>
  <div class="fq-link"><span>https://buzz.yourteam.org/invite/…</span><b>Copy link</b></div>
</div>`;

const checklist = (items: [string, string, string?][]) =>
  `<div class="fq-vis"><ul class="fq-check">${items
    .map(
      ([t, d, only]) =>
        `<li><button type="button" class="fq-box" aria-pressed="false" aria-label="Done: ${t}">${icon("check")}</button><div><b>${t}${only ? ` <span class="fq-only">${only}</span>` : ""}</b><p>${d}</p></div></li>`,
    )
    .join("")}</ul></div>`;

const KEY_HOME = `<div class="fq-vis fq-keyhome">
  <div class="fq-kh">${icon("server")}<b>The server</b><span><code>.env</code></span></div>
  <span class="fq-arrow">copy</span>
  <div class="fq-kh hot">${icon("vault")}<b>A shared vault</b><span>the operator and one backup, each with two-factor sign-in</span></div>
  <span class="fq-arrow">and</span>
  <div class="fq-kh">${icon("archive")}<b>Backups</b><span>encrypted before they leave the server</span></div>
</div>`;

interface Question {
  id: string;
  icon: string;
  q: string;
  a: string;
}

const GROUPS: [string, Question[]][] = [
  [
    "Identity and keys",
    [
      {
        id: "identity",
        icon: "key",
        q: "How should each person set up their identity?",
        a:
          rec("One work identity per person, made in the Buzz app, with a copy of its private key in your company's password manager.") +
          steps([
            ["Install Buzz and create an identity", "From Block's releases page. On first launch, choose <b>Create a new identity</b>."],
            ["Save the private key", `${menu("Settings", "Identity", "Copy private key")}. Paste it into the person's own item in your password manager.`],
            ["Send the npub to an admin", `${menu("Settings", "Identity", "Nostr address (npub)")}. It's public, so any channel works.`],
            ["Lock the devices", "Disk encryption and a screen lock on the computer and on the paired phone."],
          ]) +
          note("Nobody can reset a Buzz key. Without the saved copy, a lost key means a new identity."),
      },
      {
        id: "sso",
        icon: "lock",
        q: "Can we use single sign-on?",
        a:
          rec("Not inside Buzz yet. On a private network, your identity provider guards the door: only people signed in to your Tailscale network can reach the relay.") +
          steps([
            ["Sign in to Tailscale with your identity provider", "Google, Microsoft, Okta and GitHub, among others."],
            ["Keep the member list as the second lock", "The network gets someone to the relay. Only the member list lets them in."],
            ["Remove people in both places", "When someone leaves, remove them from your identity provider and from Membership."],
          ]) +
          note("Buzz has a draft standard for single sign-on, NIP-FI. It's off by default, and the app side is planned for enterprise builds."),
      },
      { id: "lost", icon: "device-mobile", q: "What do we do when a laptop or phone is lost?", a: rec("Treat the key as stolen until you know the device was locked and encrypted.") + LOST },
      {
        id: "leak",
        icon: "alert",
        q: "What if a key leaks?",
        a:
          rec("Remove a leaked person's key right away. Replace a leaked relay key, and treat the server as exposed.") +
          steps([
            ["A person's key: remove it", "Then add their new identity. The old key still works in any other community they joined, so they should tell those too."],
            ["The relay key: replace it", "Put a new key in <code>.env</code> and restart the relay."],
            ["The server itself: lock it down", "Change its logins, and assume whoever got in could read every message."],
          ]),
      },
    ],
  ],
  [
    "People and roles",
    [
      {
        id: "roles",
        icon: "crown",
        q: "How should we set up roles?",
        a:
          rec("Make the person who runs Buzz the owner, and name at least two admins, so someone can always add or remove people.") +
          ROLES +
          note(`The owner is set on the server. <a href="#operations">Operations</a> shows how to change it.`),
      },
      {
        id: "add",
        icon: "users",
        q: "How should we add people?",
        a:
          rec("Add people you know by their npub. For a group, use an invite link with the shortest expiry and a use limit.") +
          INVITE +
          steps([
            ["Known people: add by npub", `${menu("Settings", "Community admin", "Membership", "Invite members")}, then <b>Add directly</b>.`],
            ["A group: a short-lived link", "<b>Invite with a link</b>, set as above, then <b>Copy link</b>."],
            ["On a private network: Tailscale first", "Each person, and each of their devices, joins your Tailscale network."],
          ]),
      },
      {
        id: "leave",
        icon: "logout",
        q: "What do we do when someone leaves?",
        a:
          rec("Run the same checklist on their last day.") +
          checklist([
            ["Remove them in Membership", `${menu("Settings", "Community admin", "Membership")}. Their agents lose access too.`],
            ["Remove them from Tailscale", "And their devices.", "private network"],
            ["Remove their server and hosting access", "Their SSH key and their account with your hosting provider.", "if they had it"],
            ["Replace the relay key", "Put a new key in <code>.env</code> and restart the relay.", "if they could read .env"],
            ["Hand over ownership first", "Make someone else the owner on the server before removing them.", "if they were the owner"],
          ]) +
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
          rec("Run each agent from the Buzz app of the person responsible for it. It gets in through that person's membership, and loses access when they leave.") +
          steps([
            ["Start agents from Buzz", "Each gets its own key, vouched for by its owner. Don't add these as members."],
            ["Shared bots: add them like a member", "A bot with only a key of its own, such as one on the buzz command-line tool, needs adding. Keep its key in the shared vault."],
            ["Limit how fast agents post, if needed", "The relay's settings limit agents separately from people."],
          ]),
      },
    ],
  ],
  [
    "The server",
    [
      {
        id: "server",
        icon: "terminal-2",
        q: "Who should have access to the server?",
        a:
          rec("Two or three people: whoever runs Buzz and a backup, each with their own login.") +
          steps([
            ["Personal SSH keys only", "No shared passwords or shared keys. Remove a person's key when they leave."],
            ["Two-factor sign-in on the hosting account", "DigitalOcean, Hetzner, AWS and Google Cloud all offer it."],
            ["Keep the list short", "Whoever can log in can read every message, direct messages included."],
          ]),
      },
      {
        id: "relay-key",
        icon: "key",
        q: "Where should we keep the relay key?",
        a:
          rec("On the server, plus one copy in a shared vault that only the server's people can open.") +
          KEY_HOME +
          steps([
            ["Make a shared vault", "In your password manager, one that only the operator and the backup can open."],
            ["Save a copy of .env in it", `The relay key is in it. A backup from <a href="#operations">Operations</a> includes <code>.env</code>.`],
            ["Encrypt backups", "They hold <code>.env</code> too."],
          ]) +
          note("On Railway the key is in Railway's variables; on Kubernetes, in a Secret."),
      },
      {
        id: "read",
        icon: "eye",
        q: "Who can read our messages?",
        a:
          rec("Anyone with access to the server, its database or its backups can read every message, direct messages included. Protect the server the way you'd protect the messages.") +
          steps([
            ["Keep server access small", "Two or three people, as above."],
            ["Encrypt the disks and the backups", "Turn on your provider's disk encryption, and encrypt backups before storing them elsewhere."],
            ["Consider a private network", "With Tailscale, the relay has no public address at all."],
          ]) +
          note(`Between the apps and your relay, traffic is encrypted. Phone notifications pass through Block only as a "reconnect" signal, never message content.`),
      },
      {
        id: "audit",
        icon: "list",
        q: "How do we keep a record of who did what?",
        a:
          rec("Keep the relay's audit log on, back it up with the database, and keep your hosting provider's access logs.") +
          steps([
            ["Leave the audit log on", "It's on by default. It records sign-ins, removals, deletions and uploads, chained so an edit would show."],
            ["Back up the database", `The log lives in Postgres, so the backups in <a href="#operations">Operations</a> keep it.`],
            ["Keep your provider's access logs", "They show who signed in to the server and the hosting account."],
          ]) +
          note("Buzz has no screen for the audit log yet: whoever runs the server reads it from the database."),
      },
    ],
  ],
];

export function mountAccess(host: HTMLElement): void {
  const all = GROUPS.flatMap(([, qs]) => qs);
  host.innerHTML = `<div class="opx fq">
    <div class="opx-list fq-list" role="tablist" aria-label="Questions" aria-orientation="vertical">${GROUPS.map(
      ([group, qs]) =>
        `<p class="fq-g">${group}</p>${qs
          .map(
            (x) =>
              `<button type="button" role="tab" class="opx-item" id="fq-tab-${x.id}" data-q="${x.id}" aria-controls="fq-pane" aria-selected="false" tabindex="-1"><span class="opx-item-i">${icon(x.icon)}</span><span class="opx-item-t"><b>${x.q}</b></span></button>`,
          )
          .join("")}`,
    ).join("")}</div>
    <div class="fq-pane" id="fq-pane" role="tabpanel"></div>
  </div>`;
  const box = host.querySelector<HTMLElement>(".fq")!;
  const list = host.querySelector<HTMLElement>(".fq-list")!;
  const pane = host.querySelector<HTMLElement>(".fq-pane")!;
  // on a phone the answer opens under its question, like an accordion
  const narrow = matchMedia("(max-width: 640px)");
  let open = all[0].id;

  const show = (id: string, focus = false) => {
    const x = all.find((y) => y.id === id) ?? all[0];
    open = x.id;
    list.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => {
      const on = b.dataset.q === x.id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    pane.setAttribute("aria-labelledby", `fq-tab-${x.id}`);
    pane.innerHTML = `<h3 class="fq-h">${x.q}</h3>${x.a}`;
    if (narrow.matches) list.querySelector(`[data-q="${x.id}"]`)!.after(pane);
    else box.appendChild(pane);
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>("[data-q]");
    if (tab) return show(tab.dataset.q!);
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
  narrow.addEventListener("change", () => show(open));
  show(open);
}
