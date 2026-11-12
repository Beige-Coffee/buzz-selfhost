import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";
import { joinCard } from "./joinmock";
import { BUZZ_ROBOT, TABLER } from "./tabler";

/**
 * Managing people, as click-throughs of Buzz 1.0's own screens, in light mode: four flows, each
 * starting from the profile menu. Drawn from block/buzz-app as released in v1.0.0: the
 * window with its dock (#2626: src/app/shell/AppShell.tsx, presentation.ts, ProfileButton.tsx and its
 * .module.css, src/features/communities/CommunityPicker.tsx, src/shared/styles/globals.css), Settings
 * (src/app/settings-sections.ts), Membership, its row menu, the confirmations and "Add or invite people"
 * (src/bundled/moderation/CommunityAdmin.tsx, api.ts allowedActions), and first run's Join a community
 * (joinmock.ts). Icons are Buzz's own: Tabler's outline set, and its robot for agents. Names are
 * illustrative.
 */

const HOST = "buzz.yourteam.org";
const LINK = `https://${HOST}/invite/v2.nOvr6DwA6uV77rW3`;
export const ti = (name: string) => `<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true">${name === "robot" ? BUZZ_ROBOT : TABLER[name]}</svg>`;
const ring = (on: boolean) => (on ? " hot" : "");

/* ── the app: a header with Search, the dock down the left, one white panel ── */
export const CURSOR = `<svg class="mb-cursor" viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1v15l4.2-3.9 2.7 6.2 2.6-1.1-2.7-6.1H14z"/></svg>`;
type Page = "messages" | "agents";
/** The dock on a new install, in Buzz's order: Messages and Agents (Bestie, Reminders and Workflows start off). */
const DOCK: [string, string][] = [["messages", "messages"], ["agents", "robot"]];
/** Messages' sidebar, sketched: Activity, the scope tabs and New, then the channels. */
const SIDE = `<div class="mb-side">
  <p class="mb-srow">${ti("bell")}Activity</p>
  <p class="mb-seg"><i><b>All</b><b>Solo</b><b class="on">Team</b></i><span>${ti("plus")}</span></p>
  <p class="mb-side-g">Channels</p>
  <p class="mb-srow">${ti("hash")}general</p>
  <p class="mb-srow on">${ti("hash")}release</p>
  <p class="mb-srow">${ti("hash")}design</p>
</div>`;
/** An open channel, sketched: its members and name, as one button (ChannelHeaderIdentity.tsx), then messages. */
const CHANNEL = `<p class="mb-chan"><span class="mb-stack"><img src="${maya}" alt=""><img src="${leo}" alt=""></span>release</p><span></span><span></span><span class="short"></span>`;
/**
 * Buzz's window: back and forward and Search across the top; Messages and Agents down the
 * dock, with the community button and your profile picture at its foot; one white panel for the page.
 */
export const app = (page: Page, main: string, over = "") => `<div class="mb-app">
  <div class="mb-hd">
    <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
    <span class="mb-hd-nav">${page === "messages" ? ti("layout-sidebar") : ""}${ti("arrow-left")}<i>${ti("arrow-right")}</i></span>
    <span class="mb-find">${ti("search")}Search<kbd>⌘K</kbd></span>
  </div>
  <div class="mb-dock">
    ${DOCK.map(([p, icon]) => `<span class="mb-dk${p === page ? " on" : ""}">${ti(icon)}</span>`).join("")}
    <span class="mb-comm">B</span>
    <span class="mb-me"><img src="${maya}" alt=""><i></i></span>
  </div>
  <div class="mb-panel">${page === "messages" ? SIDE : ""}<div class="mb-main">${main}</div></div>
  ${over}
</div>`;

/* ── the profile menu: it opens beside your profile picture ── */
const MENU = `<div class="mb-pmenu">
  <div class="mb-pm-head"><span class="mb-pm-av"><img src="${maya}" alt=""><i></i></span><span><b>Maya</b><em>Online</em></span></div>
  <p class="mb-pm-status">${ti("mood-smile")}Set a status</p>
  <hr>
  <p>${ti("device-desktop")}Appearance<span class="mb-pm-more">${ti("chevron-right")}</span></p>
  <p>${ti("layout-grid")}Plugins</p>
  <p class="mb-pm-set">${ti("settings")}Settings</p>
  <hr>
  <p>${ti("message-circle")}Send feedback</p>
</div>`;
const open = app("messages", CHANNEL, MENU + CURSOR);

/* ── Settings, over the app ── */
const COMMUNITY: [string, string][] = [["user", "Profile"], ["settings", "Local settings"], ["mood-smile", "Custom emoji"], ["device-mobile", "Mobile app"], ["logout", "Leave or remove"]];
const ADMIN: [string, string][] = [["users", "Membership"]];
const BUZZ: [string, string][] = [["shield", "Identity"], ["lock", "Security"], ["palette", "Appearance"], ["bell", "Notifications"], ["keyboard", "Shortcuts"], ["robot", "Agent setup"]];
/** Settings' left column: groups of icon and label, with one item open; a community's Settings start with its address. */
export const settingsNav = (groups: [string, [string, string][]][], open: string, host = "") => `<nav class="mb-nav-col">
  ${host ? `<p class="mb-nav-host"><span>${host[0].toUpperCase()}</span>${host}</p>` : ""}
  ${groups.map(([group, items]) => `<p class="mb-nav-g">${group}</p>${items.map(([icon, label]) => `<p class="mb-nav-i${label === open ? " on" : ""}">${ti(icon)}${label}</p>`).join("")}`).join("")}
</nav>`;
/** A community's Settings column, opened at one item. Community admin shows for the owner and admins only. */
export const communityNav = (open: string, admin = true) =>
  settingsNav([["Community", COMMUNITY], ...(admin ? ([["Community admin", ADMIN]] as [string, [string, string][]][]) : []), ["Buzz", BUZZ]], open, HOST);
const nav = communityNav("Membership");

type Spot = "invite" | "dots" | "make-admin" | "remove" | "";
const pic = (src: string) => `<img src="${src}" alt="">`;
const row = (av: string, name: string, npub: string, role: string, badge: string, dots: boolean, spot: Spot) =>
  `<div class="mb-row"><span class="mb-av">${av}</span><span class="mb-who"><b>${name} · <em>${npub}</em>${badge}</b><small>${role}</small></span>${
    dots ? `<span class="mb-dots${spot === "dots" ? " hot" : spot === "make-admin" || spot === "remove" ? " open" : ""}">${ti("dots")}</span>` : ""
  }</div>`;
const membership = (spot: Spot) => `<section class="mb-page">
  <h5>Membership</h5>
  <p class="mb-sub">Manage members and access to ${HOST}.</p>
  <div class="mb-btns"><span class="mb-btn">Refresh</span><span class="mb-btn dark${ring(spot === "invite")}">Invite members</span></div>
  <h6>Members <em>3</em></h6>
  <div class="mb-box">
    <p class="mb-search">${ti("search")}Search members</p>
    ${row(pic(maya), "Maya", "npub1…7x2a", "Owner · You", ti("crown"), false, spot)}
    ${row("<i>S</i>", "Sam", "npub1…hgjq", "Admin", ti("shield"), true, spot)}
    ${row(pic(leo), "Leo", "npub1…9vlx", "Member", "", true, spot)}
    ${spot === "make-admin" || spot === "remove" ? `<div class="mb-rmenu"><p class="${ring(spot === "make-admin")}">${ti("shield")}Make admin</p><p class="${ring(spot === "remove")}">${ti("minus")}Remove</p></div>` : ""}
  </div>
</section>`;
/** Settings, a modal over the app: its column, a page, and anything open over it. */
export const settingsModal = (navHTML: string, page: string, over = "") => `<div class="mb-shade"></div>
<div class="mb-modal">
  <div class="mb-modal-h"><b>Settings</b><span class="mb-x">${ti("x")}</span></div>
  <div class="mb-modal-b">${navHTML}${page}</div>
  ${over}
</div>`;
export const settings = (spot: Spot, over = "") => settingsModal(nav, membership(spot), over);

/* ── dialogs over Settings ── */
/** The use limit as the menu words it: No limit, or 1 use, 5 uses and so on. */
const usesLabel = (uses: string) => (/^\d+$/.test(uses) ? `${uses} ${uses === "1" ? "use" : "uses"}` : uses);
export const invite = (spot: "add" | "copy", expiry = "3 days", uses = "No limit") => `<div class="mb-shade on-modal"></div>
<div class="mb-dlg">
  <div class="mb-dlg-h"><b>Add or invite people</b><span class="mb-x">${ti("x")}</span></div>
  <p class="mb-sub">Share a link someone can use to join, or add them by their exact identity.</p>
  <h6>Invite with a link</h6>
  <p class="mb-sub">Anyone with this link can use it to join until it expires.</p>
  <div class="mb-line"><span class="mb-in"><span class="mono">${LINK}</span><span class="mb-copy${ring(spot === "copy")}">Copy link</span></span></div>
  <p class="mb-opt">Expires after<span class="mb-choice${expiry === "3 days" ? "" : " set"}">${expiry}${ti("chevron-down")}</span></p>
  <p class="mb-opt">Max uses<span class="mb-choice${uses === "No limit" ? "" : " set"}">${usesLabel(uses)}${ti("chevron-down")}</span></p>
  <h6>Add directly</h6>
  <p class="mb-sub">Paste the person's npub or 64-character public key.</p>
  <div class="mb-line"><span class="mb-in">${spot === "add" ? `<span class="typed">npub1qk3f8w…7x2a</span>` : `<span class="ph">npub1… or public key</span>`}<span class="mb-choice">Member${ti("chevron-down")}</span></span><span class="mb-btn${spot === "add" ? " dark hot" : " off"}">Add member</span></div>
</div>`;
/** The confirmation, as CommunityAdmin.tsx words it. */
export const confirm = (what: "admin" | "remove") => `<div class="mb-shade on-modal"></div>
<div class="mb-dlg small">
  <b class="mb-alert-t">${what === "admin" ? "Make admin: Leo?" : "Remove: Leo?"}</b>
  <p class="mb-sub">${what === "admin" ? "Admins can invite people and remove members." : "They lose access to this community until they are invited again."}</p>
  <div class="mb-alert-b"><span class="mb-btn">Cancel</span><span class="mb-btn hot ${what === "admin" ? "dark" : "red"}">${what === "admin" ? "Make admin" : "Remove"}</span></div>
</div>`;

/** A new member's first run, after Other options, with the invite link pasted. */
const join = joinCard(`<span class="mono">${LINK}</span>`, true);

export interface Step {
  k: string;
  t: string;
  frame: string;
  loop?: boolean;
}
export interface Flow {
  id: string;
  label: string;
  steps: Step[];
}
const OPEN: Step = {
  k: "Open Settings",
  t: "Press ⌘, (Ctrl+, on Windows and Linux). Or choose your profile picture, then <b>Settings</b>.",
  frame: open,
  loop: true,
};
const MEMBERS = (spot: Spot, t: string): Step => ({ k: "Open Membership", t, frame: settings(spot) });

/**
 * Managing people, in four flows: add by npub, an invite link, a role, removing someone. The FAQ
 * shows the invite link first, set the way it recommends (a short expiry and a use limit). The
 * screens are Buzz 1.0.0's: preview builds after it replace the dialog with Members and Invite tabs
 * and hide Add directly.
 */
export const peopleFlows = (expiry = "3 days", uses = "No limit"): Flow[] => [
  {
    id: "add",
    label: "Add someone",
    steps: [
      OPEN,
      MEMBERS("invite", "Under <b>Community admin</b>, choose <b>Membership</b>, then <b>Invite members</b>. Only the owner and admins see Membership."),
      {
        k: "Add them by their npub",
        t: "Paste the npub they send you. As the owner you can pick <b>Member</b> or <b>Admin</b>. Then choose <b>Add member</b>. They're added to each channel with <b>Starter channel for new members</b> on; add them to any other they need.",
        frame: settings("", invite("add")),
      },
    ],
  },
  {
    id: "link",
    label: "Invite with a link",
    steps: [
      OPEN,
      MEMBERS("invite", "Under <b>Community admin</b>, choose <b>Membership</b>, then <b>Invite members</b>."),
      {
        k: expiry === "3 days" ? "Copy the link" : "Set it, then copy it",
        t:
          expiry === "3 days"
            ? "Copy it and send it. Anyone with it can join until it expires: after 3 days unless you pick 1, 7 or 30, and as many times as you allow: no limit, or 1, 5, 10 or 25 uses. A link can't be taken back, so for one person pick 1 use."
            : `Set <b>Expires after</b> to <b>${expiry}</b> and the use limit to the number of people you expect, then <b>Copy link</b> and send it. Links can't be taken back, and opening this dialog already made one valid for 3 days, so don't open it on a shared screen.`,
        frame: settings("", invite("copy", expiry, uses)),
      },
      {
        k: "They join",
        t: "On Buzz's first screen they choose <b>Other options</b>, paste the link and choose <b>Continue</b>, then <b>Use an existing key</b> or <b>Sign in with Builderlab</b>. Already in Buzz? They open the link and choose <b>Accept invite in Buzz</b>.",
        frame: join,
      },
    ],
  },
  {
    id: "role",
    label: "Change a role",
    steps: [
      OPEN,
      MEMBERS("dots", "Under <b>Community admin</b>, choose <b>Membership</b>, then the <b>…</b> on their row. The owner's own row has none."),
      {
        k: "Pick the new role",
        t: "<b>Make admin</b> for a member, or <b>Make member</b> for an admin. Only the owner can change roles.",
        frame: settings("make-admin"),
      },
      { k: "Confirm", t: "Admins can invite people and remove members. Making them a member again takes that away.", frame: settings("", confirm("admin")) },
    ],
  },
  {
    id: "remove",
    label: "Remove someone",
    steps: [
      OPEN,
      MEMBERS("dots", "Under <b>Community admin</b>, choose <b>Membership</b>, then the <b>…</b> on their row."),
      { k: "Choose Remove", t: "The owner can remove anyone but themselves. Admins can remove members.", frame: settings("remove") },
      { k: "Confirm", t: "It disconnects them and their agents. An invite link that hasn't expired still lets them back in.", frame: settings("", confirm("remove")) },
    ],
  },
];

/** A click-through: its flows when there's more than one, the drawing, then the step's words and its controls. */
export function clickThroughHTML(flows: Flow[], flow: number, step: number): string {
  const f = flows[Math.max(0, Math.min(flows.length - 1, flow))];
  const n = Math.max(0, Math.min(f.steps.length - 1, step));
  const s = f.steps[n];
  return `<div class="mb">
    ${flows.length > 1 ? `<div class="mb-flows" role="tablist" aria-label="What to do">${flows.map((x, i) => `<button type="button" role="tab" data-mb-flow="${i}" aria-selected="${x === f}">${x.label}</button>`).join("")}</div>` : ""}
    <div class="mb-stage"><div class="mb-canvas${s.loop ? " loop" : ""}">${s.frame}</div></div>
    <div class="mb-text">
      <p class="mb-n"><span>0${n + 1}</span> / 0${f.steps.length}</p>
      <h4 class="mb-h">${s.k}</h4>
      <p class="mb-p">${s.t}</p>
      <div class="mb-nav">
        <button type="button" class="mb-go" data-mb="${n - 1}" aria-label="Previous step"${n === 0 ? " disabled" : ""}>←</button>
        <span class="mb-dots-nav">${f.steps.map((x, j) => `<button type="button" data-mb="${j}" aria-label="Step ${j + 1}: ${x.k}" aria-current="${j === n}"></button>`).join("")}</span>
        <button type="button" class="mb-go next" data-mb="${n + 1}" aria-label="Next step"${n === f.steps.length - 1 ? " disabled" : ""}>→</button>
      </div>
    </div>
  </div>`;
}

/** The canvas is drawn at 560 x 340 and scaled to the stage, like an SVG viewBox. */
export function fitMembers(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".mb-stage").forEach((stage) => {
    const fit = () => stage.style.setProperty("--s", String(Math.min(1, stage.clientWidth / 560)));
    fit();
    new ResizeObserver(fit).observe(stage);
  });
}
