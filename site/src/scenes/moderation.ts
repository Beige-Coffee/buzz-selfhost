import { CLAUDE_MARK, MK_BL } from "./agentflow";
import { settingsModal, ti, type Flow } from "./members";

/**
 * Buzz 1.0.5's Moderation screens (the relay-staff plugin), drawn from captures of 2026-11-23 on a relay
 * with its admin API on (BUZZ_ADMIN_HOST): Settings scrolled to Plugins and Moderation, Reports,
 * Communities with a community's Actions tab, and Staff. Every page says "Connected as operator" for the
 * owner. Review on Actions leads to a Confirm step (block/buzz-app src/bundled/relay-staff/DirectActions.tsx).
 * The community's address and the names are placeholders.
 */
const HOST = "buzz.yourteam.org";
const ADMIN = `admin.${HOST}`;
type Open = "Reports" | "Communities" | "Staff";

const item = (icon: string, label: string, open: string) => `<p class="mb-nav-i${label === open ? " on" : ""}">${icon}${label}</p>`;
/** Settings' column scrolled to its end: Plugins, then Moderation for relay staff. */
export const bottomNav = (open: string, moderation = true) => `<nav class="mb-nav-col md-nav">
  <p class="mb-nav-g">Plugins</p>
  ${item(ti("layout-grid"), "Manage plugins", open)}
  ${item(MK_BL, "Builderlab", open)}
  ${item(CLAUDE_MARK, "Claude", open)}
  ${item(ti("brand-github"), "GitHub", open)}
  ${item(ti("terminal-2"), "Terminal", open)}
  ${item(ti("chart-bar"), "Usage", open)}
  ${moderation ? `<p class="mb-nav-g">Moderation</p>
  ${item(ti("flag"), "Reports", open)}
  ${item(ti("message-circle"), "Feedback", open)}
  ${item(ti("world"), "Communities", open)}
  ${item(ti("shield"), "Staff", open)}` : ""}
</nav>`;
const nav = (open: Open) => bottomNav(open);

const head = (title: string, sub: string) => `<div class="md-head"><div><h5>${title}</h5><p class="mb-sub">${sub}</p></div><span class="mb-btn">Check again</span></div>
  <p class="md-ok">${ti("circle-check")}Connected as operator</p>`;

const reports = `<section class="mb-page md-page">${head("Reports", `Triage reports from every community on ${ADMIN}.`)}
  <p class="md-sel">All statuses${ti("chevron-down")}</p>
  <p class="md-empty">No reports found.</p>
</section>`;

const communities = `<section class="mb-page md-page">${head("Communities", `Browse and moderate every community on ${ADMIN}.`)}
  <p class="md-search">${ti("search")}Search by host (e.g. team.example.com)</p>
  <p class="md-comm hot">${HOST}<em>Connected</em></p>
</section>`;

const actions = `<section class="mb-page md-page tight">${head("Communities", `Browse and moderate every community on ${ADMIN}.`)}
  <p class="md-crumb">${ti("arrow-left")}<span>${HOST}</span></p>
  <p class="md-tabs"><span>Reports</span><span>Restrictions</span><span>Members</span><b>Actions</b></p>
  <p class="md-lab">Action</p>
  <p class="md-radio on"><i></i>Ban member</p>
  <p class="md-radio"><i></i>Time out member</p>
  <p class="md-radio"><i></i>Delete message</p>
  <p class="md-lab">Member</p>
  <p class="md-sel hot">Search by name, or paste an npub or hex key${ti("chevron-down")}</p>
  <p class="md-lab">Reason (optional)</p>
  <p class="md-in"></p>
  <p class="md-note">Sent verbatim to the affected user.</p>
  <span class="mb-btn md-go">Review</span>
</section>`;

const staff = `<section class="mb-page md-page">${head("Staff", `Add, change and remove operators and moderators on ${ADMIN}.`)}
  <div class="md-add"><small>Add staff</small><b>Public key</b><p><span class="md-key hot">npub or 64-hex public key</span><span class="ax-pick">moderator${ti("chevron-down")}</span><span class="mb-btn off">Add</span></p></div>
  <p class="md-note">Names come from profiles in ${HOST}.</p>
  <div class="md-row"><span class="md-av">M</span><span class="md-who"><b>Maya</b><small>npub…8k3a · you</small></span><em>owner (fallback)</em><b>operator</b><u>Remove</u></div>
</section>`;

/** How do you moderate?: reading reports, banning someone, and adding a moderator. */
export const moderationFlows: Flow[] = [
  {
    id: "reports",
    label: "Read reports",
    steps: [
      { k: "Open Reports", t: "In Buzz, open <b>Settings</b> and scroll to <b>Moderation</b> at the end. Choose <b>Reports</b>. The reports that members send from every community on your relay show here. <b>All statuses</b> filters them, and <b>Check again</b> checks your access again.", frame: settingsModal(nav("Reports"), reports) },
    ],
  },
  {
    id: "ban",
    label: "Ban someone",
    steps: [
      { k: "Open your community", t: "Under <b>Moderation</b>, choose <b>Communities</b>. Then choose your community.", frame: settingsModal(nav("Communities"), communities) },
      { k: "Ban, time out or delete", t: "Choose <b>Actions</b>. Pick <b>Ban member</b>, <b>Time out member</b> or <b>Delete message</b>, and find the person by name or paste their npub. If you write a reason, Buzz sends it to that person word for word. Choose <b>Review</b>, check what Buzz will do, then choose <b>Confirm</b>.", frame: settingsModal(nav("Communities"), actions) },
    ],
  },
  {
    id: "staff",
    label: "Add a moderator",
    steps: [
      { k: "Add them under Staff", t: "Under <b>Moderation</b>, choose <b>Staff</b>. Paste the person's npub, keep <b>moderator</b> and choose <b>Add</b>. The owner shows as the first operator. Only operators can add or remove staff.", frame: settingsModal(nav("Staff"), staff) },
    ],
  },
];

/** What if a key leaks?: banning a person's leaked key from Buzz's own screens. */
export const leakFlows: Flow[] = [
  {
    id: "leak",
    label: "Ban a leaked key",
    steps: [
      { k: "Open your community", t: "In Buzz, open <b>Settings</b> and scroll to <b>Moderation</b>. Choose <b>Communities</b>, then your community. Only the owner and staff see Moderation.", frame: settingsModal(nav("Communities"), communities) },
      { k: "Ban the old key", t: "Choose <b>Actions</b> and keep <b>Ban member</b>. Paste the leaked key's npub under <b>Member</b>. Choose <b>Review</b>, check what Buzz will do, then choose <b>Confirm</b>. The ban keeps that key out even with a live invite link, and it cancels every link the key made.", frame: settingsModal(nav("Communities"), actions) },
    ],
  },
];
