import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";

/**
 * Adding people, as a click-through of Buzz 1.0's own screens, in light mode. Wording from
 * block/buzz-app at 68ebbfe: Settings (src/app/settings-sections.ts), Membership and its
 * "Add or invite people" dialog (src/bundled/moderation/CommunityAdmin.tsx), and the first-run
 * Join a community screen (src/features/communities/CommunityLanding.tsx). Names are illustrative.
 */

const STEPS = [
  {
    k: "Open Membership",
    t: "In Buzz, open <b>Settings</b> from your picture at the top right, or press ⌘, (Ctrl+, on Windows and Linux). Under <b>Community admin</b>, choose <b>Membership</b>. Only the owner and admins see it.",
  },
  {
    k: "Add someone directly",
    t: "Choose <b>Invite members</b>. Paste their npub, which they copy from Buzz's <b>Settings</b>, <b>Identity</b>, pick <b>Member</b> or <b>Admin</b>, and choose <b>Add member</b>.",
  },
  {
    k: "Or send an invite link",
    t: "The same window makes a link anyone can join with until it expires. Copy it and send it. You choose how long it lasts and how many people can use it.",
  },
  {
    k: "They join",
    t: "They paste the link into <b>Join a community</b> on Buzz's first screen. Or they open the link and choose <b>Accept invite in Buzz</b>.",
  },
  {
    k: "Change or remove someone",
    t: "In the member list, the <b>…</b> menu on a row makes someone an admin, or a member again, or removes them.",
  },
];

const HOST = "buzz.yourteam.org";
const i = (d: string) => `<svg class="b1-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const CROWN = i(`<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.29L21.18 5.5a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.97.73H5.82a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.66a1 1 0 0 0 1.52-.29z"/><path d="M5 21h14"/>`);
const SHIELD = i(`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`);
const SEARCH = i(`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`);
const MORE = i(`<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`);
const DOWN = i(`<path d="m6 9 6 6 6-6"/>`);

/** Settings' sidebar, with a community selected (settings-sections.ts), Membership open. */
const SIDE = `<aside class="mb-side">
  <p class="mb-host"><span>Y</span>${HOST}</p>
  <p class="mb-g">Community</p><p>Profile</p><p>Local settings</p><p>Custom emoji</p><p>Pair mobile</p><p>Leave or remove</p>
  <p class="mb-g">Community admin</p><p class="on">Membership</p>
  <p class="mb-g">Buzz</p><p>Identity</p><p>Appearance</p>
</aside>`;

type Hot = "invite" | "menu" | "";
const row = (img: string, name: string, role: string, badge = "", menu = false) =>
  `<div class="mb-row"><span class="mb-av">${img}</span><b>${name}</b>${badge}<em>${role}</em><span class="mb-dots${menu ? " hot" : ""}">${MORE}</span></div>`;
const pic = (src: string) => `<img src="${src}" alt="">`;

/** The Membership page: its buttons, the count and search, and the member list. */
const membership = (hot: Hot) => `<section class="mb-page">
  <h5>Membership</h5>
  <p class="mb-sub">Manage members and access to ${HOST}.</p>
  <div class="mb-btns"><span class="mb-btn">Refresh</span><span class="mb-btn primary${hot === "invite" ? " hot" : ""}">Invite members</span></div>
  <div class="mb-count"><b>Members</b><em>3</em><span class="mb-search">${SEARCH}Search members</span></div>
  ${row(pic(maya), "Maya", "Owner · You", CROWN)}
  ${row(pic(leo), "Leo", "Member", "", hot === "menu")}
  ${row(`<i>S</i>`, "Sam", "Admin", SHIELD)}
  ${hot === "menu" ? `<div class="mb-menu"><p>Make admin</p><p>Make member</p><p class="no">Remove</p></div>` : ""}
</section>`;

const win = (inner: string) => `<div class="mb-win"><div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div><div class="mb-body">${SIDE}${inner}</div></div>`;

/** "Add or invite people", over the dimmed Membership page: one of its two sections in focus. */
const dialog = (focus: "direct" | "link") => `<div class="mb-dim"></div>
<div class="mb-dlg">
  <h5>Add or invite people</h5>
  <p class="mb-sub">Add someone by their exact identity, or share a link they can use to join.</p>
  <div class="mb-sec${focus === "direct" ? " on" : ""}">
    <b>Add directly</b>
    <p>Paste the person's npub or 64-character public key.</p>
    <div class="mb-line"><span class="mb-in mono">npub1qk3f…7x2a</span><span class="mb-sel">Member${DOWN}</span><span class="mb-btn primary${focus === "direct" ? " hot" : ""}">Add member</span></div>
  </div>
  <div class="mb-sec${focus === "link" ? " on" : ""}">
    <b>Invite with a link</b>
    <p>Anyone with this link can use it to join until it expires.</p>
    <div class="mb-line"><span class="mb-in mono">https://${HOST}/invite/v2.Jx7oZ…</span><span class="mb-btn${focus === "link" ? " primary hot" : ""}">Copy link</span></div>
    <div class="mb-line mb-opts"><span>Expires after</span><span class="mb-sel">3 days${DOWN}</span><span>Limit number of uses</span><span class="mb-sel">No limit${DOWN}</span></div>
  </div>
</div>`;

/** The new member's first screen, with the invite link pasted. */
const join = `<div class="mb-join j1-win">
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <h4>Join a community</h4>
  <p class="j1-lab">Invite link or community URL</p>
  <div class="j1-input">https://${HOST}/invite/v2.Jx7oZ…</div>
  <div class="j1-join hot">Join</div>
</div>`;

const FRAMES = [win(membership("invite")), win(membership("") + dialog("direct")), win(membership("") + dialog("link")), join, win(membership("menu"))];

/** The click-through: the drawing, then the step's words and its controls. `step` is the one shown. */
export function membersHTML(step: number): string {
  const n = Math.max(0, Math.min(STEPS.length - 1, step));
  return `<div class="mb" data-step="${n}">
    <div class="mb-stage"><div class="mb-canvas">${FRAMES[n]}</div></div>
    <div class="mb-text">
      <p class="mb-n"><span>0${n + 1}</span> / 0${STEPS.length}</p>
      <h4 class="mb-h">${STEPS[n].k}</h4>
      <p class="mb-p">${STEPS[n].t}</p>
      <div class="mb-nav">
        <button type="button" class="mb-go" data-mb="${n - 1}" aria-label="Previous step"${n === 0 ? " disabled" : ""}>←</button>
        <span class="mb-dots-nav">${STEPS.map((s, j) => `<button type="button" data-mb="${j}" aria-label="Step ${j + 1}: ${s.k}" aria-current="${j === n}"></button>`).join("")}</span>
        <button type="button" class="mb-go next" data-mb="${n + 1}" aria-label="Next step"${n === STEPS.length - 1 ? " disabled" : ""}>→</button>
      </div>
    </div>
  </div>`;
}

export const MEMBER_STEPS = STEPS.length;

/** The canvas is drawn at 560 x 330 and scaled to the stage, like an SVG viewBox. */
export function fitMembers(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".mb-stage").forEach((stage) => {
    const fit = () => stage.style.setProperty("--s", String(Math.min(1, stage.clientWidth / 560)));
    fit();
    new ResizeObserver(fit).observe(stage);
  });
}
