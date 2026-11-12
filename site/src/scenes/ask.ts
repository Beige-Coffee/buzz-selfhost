import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";
import { copyText } from "../lib/code";
import { TABLER } from "./tabler";

/**
 * A place to ask, the page's last section: how to join Block's feedback community for Buzz, and
 * where self-hosting questions go. Three steps, each under a still drawing of the screen it happens
 * on: Block's invite page, Buzz's community list, and the channel. Nothing in a drawing is operated.
 *
 * The heading, the invite link and the copy button are in index.html, so the link works without
 * JavaScript. This scene draws the steps under them and makes the button copy that link.
 *
 * Sources. The invite page is drawn from the page itself, seen on 2026-11-12: both of its boxes
 * (18 or older, and the terms) must be ticked before its button works. The community list is drawn
 * from block/buzz-app v1.0.0 (CommunityPicker.tsx: each community, then Join a community), not from
 * a screenshot. The channel and its messages are illustrative. The note about keys is the skill's
 * own caution, from references/security.md ("Two kinds of keys"), said where it applies.
 */

/** The channel self-hosting questions go in. A placeholder: it does not exist yet (docs/decisions.md, Launch decisions). */
const CHANNEL = "self-hosting";
/** The footer's Report a problem link: the two move together. */
const ISSUES = "https://github.com/Beige-Coffee/buzz-selfhost/issues/new";

const USERS_PLUS = `<path d="M5 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4c.96 0 1.84 .34 2.53 .9"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M16 19h6M19 16v6"/>`;
const ic = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${n === "users-plus" ? USERS_PLUS : TABLER[n]}</svg>`;

/* ── 1 · Block's invite page: the community, the two boxes, the button ── */

const INVITE_PAGE = `
  <div class="aq-ip" role="img" aria-label="Block's invite page. You're invited: the community named feedback, two ticked boxes (18 or older, and the terms), and a button, Accept invite in Buzz.">
    <div class="aq-ip-card">
      <span class="aq-ip-h">You're invited</span>
      <span class="aq-ip-s">Join your community on Buzz.</span>
      <span class="aq-ip-c"><span class="aq-tile b">f</span>feedback</span>
      <span class="aq-ip-chk"><span><i>${ic("check")}</i>I am 18 years of age or older.</span><span><i>${ic("check")}</i>I agree to the Buzz Terms of Service and Privacy Policy.</span></span>
      <span class="aq-ip-go">Accept invite in Buzz</span>
    </div>
  </div>`;

/* ── 2 · Buzz's community button, at the foot of the dock, with its list open ── */

const communityList = (host: string) => `
  <div class="aq-pkw" role="img" aria-label="Buzz's community button, at the foot of the dock, with its list open: your own community, feedback, and Join a community.">
    <div class="aq-dock"><span class="aq-cb">f</span><img src="${maya}" alt=""></div>
    <div class="aq-pk">
      <div class="aq-pk-row"><span class="aq-tile">Y</span><span><b>Your community</b><small>buzz.yourteam.org</small></span></div>
      <div class="aq-pk-row on"><span class="aq-tile b">f</span><span><b>feedback</b><small>${host}</small></span></div>
      <div class="aq-pk-add"><span>${ic("users-plus")}</span>Join a community</div>
    </div>
  </div>`;

/* ── 3 · the channel, in the guide's own drawing of Buzz (scenes/buzzapp.ts) ── */

const msg = (av: string, name: string, time: string, body: string) =>
  `<div class="b1-msg"><img class="b1-av" src="${av}" alt=""><div class="b1-col"><div class="b1-meta"><b>${name}</b><time>${time}</time></div><div class="b1-bub">${body}</div></div></div>`;
const CHANNEL_VIEW = `
  <div class="aq-ch" role="img" aria-label="The ${CHANNEL} channel in the feedback community: someone says which setup they picked and which check failed, and gets an answer.">
    <div class="b1-head"><b><span class="b1-stack"><img src="${maya}" alt=""><img src="${leo}" alt=""></span>${CHANNEL}</b></div>
    <div class="b1-msgs">
      ${msg(maya, "Maya", "10:02 AM", "VPS, public. The check fails on phone pairing.")}
      ${msg(leo, "Leo", "10:09 AM", "Paste the FAIL line and we can look.")}
    </div>
    <div class="b1-compose"><span class="b1-ph">Message #${CHANNEL}</span></div>
  </div>`;

/* ── the section ── */

const step = (n: number, drawing: string, title: string, text: string) => `
  <li>
    <div class="aq-shot">${drawing}</div>
    <div class="aq-text"><h3><i aria-hidden="true">${n}</i>${title}</h3><p>${text}</p></div>
  </li>`;

export function mountAsk(host: HTMLElement): void {
  // index.html holds the invite, Block's public one: its link is the one thing copied and its host the one shown
  const invite = document.querySelector<HTMLAnchorElement>("#aq-invite")!;
  const community = new URL(invite.href).host;

  host.innerHTML = `
  <div class="aq">
    <ol class="aq-steps">
      ${step(1, INVITE_PAGE, "Open the invite", "Confirm you are 18 or older and agree to Buzz's terms. Then choose <strong>Accept invite in Buzz</strong>.")}
      ${step(2, communityList(community), "Find it beside your community", "The community button now lists both. Your own community stays as it was.")}
      ${step(3, CHANNEL_VIEW, `Ask in #${CHANNEL}`, "Say which setup you picked and what the check printed. Anyone can join, so leave out keys and passwords.")}
    </ol>
    <p class="aq-also"><b>Signed in to Builderlab?</b> Once you join a community Block hosts, Buzz backs up your key to Block without asking. If you answered "I will manage my own key" before, that still stands. <a href="#operations" data-q-link="identity">Set up an identity</a></p>
    <p class="aq-more"><span>Buzz did not open? Copy the invite, then paste it into <b>Join a community</b>.</span><a class="aq-gh" href="${ISSUES}">Rather not join? Open an issue on GitHub</a></p>
  </div>`;

  const copy = document.querySelector<HTMLButtonElement>(".aq-copy");
  if (!copy) return;
  copy.innerHTML = `${ic("copy")}<span>Copy invite</span>`;
  copy.hidden = false;
  copy.addEventListener("click", () =>
    copyText(invite.href, () => {
      const label = copy.querySelector("span")!;
      label.textContent = "Copied";
      window.setTimeout(() => (label.textContent = "Copy invite"), 1600);
    }),
  );
}
