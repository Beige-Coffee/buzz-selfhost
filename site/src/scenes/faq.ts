import { agentFlows } from "./agentflow";
import { identityFlows, lostFlows } from "./identity";
import { clickThroughHTML, fitMembers, peopleFlows, type Flow } from "./members";
import { promptText, runningOnHTML, taskHTML } from "./operations";
import { TABLER } from "./tabler";
import { copyText, enhanceCode } from "../lib/code";
import { jumpTo } from "../lib/nav";
import { getValues, isPrivate, onValues, setValues, trackHash, trackOf, type Track } from "../lib/values";

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
  "Your relay is on a private network, so each person also joins your Tailscale network, with every device they use Buzz on. On Tailscale's paid plans, each person takes a seat.";

const CLICK_THROUGHS: Record<string, Flow[]> = {
  identity: identityFlows,
  lost: lostFlows,
  role: peopleFlows().filter((f) => f.id === "role"),
  // the invite link as we recommend it: a day, and the people you expect
  add: peopleFlows("1 day", "5").filter((f) => f.id === "add" || f.id === "link"),
  remove: peopleFlows().filter((f) => f.id === "remove"),
  agents: agentFlows,
};

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

/** A lost device: one question decides everything, whether the key is exposed. */
const CASES = `<div class="fq-vis fq-cases">
  <p class="fq-cases-q">${icon("device-mobile")}<span><b>Could someone get into the lost device?</b>It was unlocked, had no disk encryption, or someone knows its password.</span></p>
  <div class="fq-case bad">
    <p class="fq-case-h"><span class="fq-tag no">Yes, or not sure</span><b>The key is exposed: retire it</b></p>
    <ol><li>Remove the old key in Membership, now.</li><li>Create a new identity on the new device. Not the saved copy: whoever has the device has that key too.</li><li>An admin adds the new npub.</li><li>Pair the phone, start their agents again, and tell any other community they joined.</li></ol>
  </div>
  <div class="fq-case good">
    <p class="fq-case-h"><span class="fq-tag yes">No</span><b>The key is safe: bring it back</b></p>
    <ol><li>Sign in on the new device with the saved copy, or Restore from backup with a Block account.</li><li>No copy? Then it's a new identity, added again.</li><li>Pair the phone again.</li></ol>
  </div>
</div>`;

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
  ${lane(`${icon("key")}A person's key`, "", ["Remove it in Membership", "Add their new identity"])}
  ${lane(`${icon("server")}The relay key`, "", ["A new key in <code>.env</code>", "Restart the relay"])}
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
    <p class="fq-eye">${icon("eye")}Readable by anyone who can log in</p>
  </div>
</div>`;

/** A record of who did what: the relay's chained audit log, and the hosting provider's own log. */
const entry = (time: string, what: string, hash: string) => `<p class="fq-le"><time>${time}</time><b>${what}</b><code>${hash}</code></p>`;
const LEDGER = `<div class="fq-vis fq-audit">
  <div class="fq-card"><p class="fq-card-h">${icon("list")}Audit log, in the relay's database</p>
    ${entry("09:12", "Leo signed in", "a41f…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("09:40", "plan.pdf uploaded", "7c02…")}<span class="fq-ln">${icon("link")}</span>
    ${entry("16:05", "Sam removed Leo", "e9b8…")}
  </div>
  <div class="fq-card"><p class="fq-card-h">${icon("lock")}Your hosting provider's log</p><p class="fq-le"><time>08:58</time><b>Maya signed in to the server</b></p><p class="fq-dim">Who touched the server itself</p></div>
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
          rec("Add people you know by their npub. For a group, use an invite link that expires after a day, limited to the people you expect.") +
          ct("add") +
          (isPrivate(t) ? note(PRIVATE_PEOPLE) : ""),
      },
      {
        id: "roles",
        icon: "crown",
        q: "How should we set up roles?",
        a:
          rec("Make the person who runs Buzz the owner, and name at least two admins, so someone can always add or remove people.") +
          ROLES +
          ct("role") +
          note("The owner is set on the server, so whoever runs it changes it. The old owner stays on as an admin."),
      },
      {
        id: "leave",
        icon: "logout",
        q: "What do we do when someone leaves?",
        a:
          rec("Run the same checklist on their last day.") +
          checklist([
            ["Remove them in Membership", "As below. Their agents lose access too."],
            ["Remove them from Tailscale", "And their devices.", "private network"],
            ["Remove their server and hosting access", "Their SSH key and their account with your hosting provider.", "if they had it"],
            ["Replace the relay key", "A new key in <code>.env</code>, then restart the relay.", "if they could read .env"],
            ["Hand over ownership first", "Make someone else the owner on the server before removing them.", "if they were the owner"],
          ]) +
          ct("remove") +
          note("Messages already on their devices stay there: Buzz can't wipe a device."),
      },
      {
        id: "agents",
        icon: "robot",
        q: "How should we run agents?",
        a:
          rec("Run each agent from the Buzz app of the person responsible for it. It gets in through that person's membership, and loses access when they leave.") +
          ct("agents") +
          note("A shared bot with only a key of its own, such as one on the buzz command-line tool, is added like a member; keep its key in the shared vault. The relay's settings limit how fast agents post, apart from people."),
      },
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
          rec("One work identity per person, made in the Buzz app, with a copy of its private key in your company's password manager.") +
          ct("identity") +
          note("Nobody can reset a Buzz key. Without the saved copy, a lost key means a new identity."),
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
          rec("Remove a leaked person's key right away. Replace a leaked relay key, and treat the server as exposed.") +
          LANES +
          note("The old key still works in any other community that person joined, since a Buzz identity isn't tied to one community."),
      },
      {
        id: "sso",
        icon: "lock",
        q: "Can we use single sign-on?",
        a:
          rec("Not today: Buzz has no single sign-on, and everyone signs in with their own key. The next best thing is a private network, where your company login decides who can reach the relay at all.") +
          `<div class="fq-status"><span class="fq-status-k">${icon("bolt")}In progress in Buzz</span><p>Buzz is building company sign-in on a draft standard, <a href="https://github.com/block/buzz/blob/main/docs/nips/NIP-FI.md">NIP-FI</a>: your identity provider vouches for each person's key. The relay already understands it, behind a setting that's off by default, and the desktop app's side is open work (<a href="https://github.com/block/buzz-app/pull/1424">block/buzz-app#1424</a>). There's no date yet, and a self-hosted community can't turn it on.</p></div>` +
          LOCKS +
          steps([
            ["Run the relay on a private network", `On a VPS, your own hardware or Kubernetes, with <b>Private network</b> on. <a href="#guide" data-go-private>Set it up</a>.`],
            ["Sign up for Tailscale with your identity provider", "Google, Microsoft, Okta or GitHub, among others, so only company accounts can join your network."],
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
          rec("Restore the newest backup and keep the relay's address: members' apps then reconnect by themselves. Anything from after the backup is lost.") +
          taskHTML("restore", t),
      },
      {
        id: "read",
        icon: "eye",
        q: "Who can read our messages?",
        a:
          rec("Anyone with access to the server, its database or its backups can read every message, direct messages included. Protect the server the way you'd protect the messages.") +
          READ +
          note("Keep server access small, turn on your provider's disk encryption, encrypt backups, and consider a private network, where the relay has no public address. Phone notifications pass through Block only as a \"reconnect\" signal."),
      },
      {
        id: "audit",
        icon: "list",
        q: "How do we keep a record of who did what?",
        a:
          rec("Keep the relay's audit log on, back it up with the database, and keep your hosting provider's access logs.") +
          LEDGER +
          note("The audit log is on by default and chains each entry to the last, so an edit would show. Buzz has no screen for it yet: whoever runs the server reads it from the database."),
      },
    ],
  ],
  [
    "Server",
    [
      {
        id: "upgrade",
        icon: "upgrade",
        q: "How should we upgrade the relay?",
        a: (t) => rec("About once a month, at a quiet time: new features in the Buzz app can need a recent relay.") + taskHTML("upgrade", t),
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
          note(`A <a href="#operations" data-q-link="backup">backup</a> includes <code>.env</code>. On Railway the key is in Railway's variables; on Kubernetes, in a Secret.`),
      },
    ],
  ],
];

export function mountFaq(host: HTMLElement): void {
  const all = GROUPS.flatMap(([, qs]) => qs);
  host.innerHTML = `${runningOnHTML(trackOf())}<div class="opx fq">
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
  let open = all[0].id;
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
    list.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => {
      const on = b.dataset.q === x.id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    pane.setAttribute("aria-labelledby", `fq-tab-${x.id}`);
    pane.innerHTML = `<h3 class="fq-h">${x.q}</h3>${typeof x.a === "string" ? x.a : x.a(trackOf())}`;
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
  narrow.addEventListener("change", () => show(open));
  show(open);
  // the Running on box changed: redraw it, and the answer if it depends on the setup
  onValues(() => {
    host.querySelector(".opx-ctx")!.outerHTML = runningOnHTML(trackOf());
    if (typeof all.find((x) => x.id === open)!.a !== "string") show(open);
  });
}
