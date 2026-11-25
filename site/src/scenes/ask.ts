import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";
import { copyText } from "../lib/code";
import "../styles/ask.css";
import { swarm } from "./swarm";
import { BUZZ_ROBOT, TABLER } from "./tabler";

/**
 * Community: where to ask about self-hosting. The page's last section, in the menu as Community, and
 * linked from the hero. Readers join the buzz community that Block hosts and ask in its #self-hosting
 * channel, at the owner's request (docs/decisions.md, 2026-11-24). The invite is the one the owner gave.
 *
 * A Buzz window open on the channel, with the invite pinned to its corner, then three steps. The window
 * is drawn from Buzz 1.0.6 as it looked on 2026-11-24: the dock, then Activity, Solo, Starred, Team,
 * Forums and Direct messages. The messages are illustrative. The opening screen's flapping bees buzz
 * around it (scenes/swarm.ts). index.html holds a plain invite link for readers without JavaScript.
 */

const INVITE = "https://buzz.communities.buzz.xyz/invite/v2.EeLHaUAe23P7qK0NuWnsdfnH-6L0wJLDnnzpFzrG7rQ";
const CHANNEL = "self-hosting";
/** The footer's Report a problem link: the two move together. */
const ISSUES = "https://github.com/Beige-Coffee/buzz-selfhost/issues/new";

const EXTRA: Record<string, string> = {
  pencil: `<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>`,
  star: `<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"/>`,
  share: `<path d="M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.7 10.7l6.6 -3.4"/><path d="M8.7 13.3l6.6 3.4"/>`,
};
const ic = (n: string) => `<svg class="cm-i" viewBox="0 0 24 24" aria-hidden="true">${EXTRA[n] ?? TABLER[n]}</svg>`;
const ROBOT = `<svg class="cm-i" viewBox="0 0 24 24" aria-hidden="true">${BUZZ_ROBOT}</svg>`;
const ARROW = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Buzz's tile for the buzz community: the bee on chartreuse, as the invite page and the dock show it. */
const TILE = `<span class="cm-tile"><svg viewBox="0 0 466 309" aria-hidden="true"><use href="#bee"/></svg></span>`;

/** Ink and olive bees on the paper backdrop. */
const BEES = ["#231e1e", "#8d8d2c", "#231e1e", "#d7d72e", "#231e1e", "#8d8d2c"];

/* ── Buzz 1.0.6, open on the channel ── */

const msg = (av: string, name: string, time: string, body: string) =>
  `<div class="cw-msg"><img src="${av}" alt=""><div><div class="cw-meta"><b>${name}</b><time>${time}</time></div><div class="cw-bub">${body}</div></div></div>`;

const WINDOW = `
  <div class="cw" role="img" aria-label="A Buzz window open on the ${CHANNEL} channel in the buzz community, with a short conversation about pairing a phone. Illustrative.">
    <div class="cw-top"><span class="cw-lights"><i></i><i></i><i></i></span><span class="cw-nav">${ic("layout-sidebar")}${ic("arrow-left")}${ic("arrow-right")}</span><span class="cw-find">${ic("search")}Search<kbd>⌘K</kbd></span></div>
    <div class="cw-body">
      <div class="cw-dock"><span class="on">${ic("messages")}</span><span>${ic("alarm")}</span><span>${ROBOT}</span><span>${ic("bolt")}</span><span class="cw-comm">${TILE}</span><img class="cw-me" src="${leo}" alt=""></div>
      <aside class="cw-side">
        <div class="cw-row">${ic("bell")}Activity</div>
        <div class="cw-sub">Solo</div><div class="cw-row">${ic("pencil")}New chat</div>
        <div class="cw-row cw-gap">${ic("star")}Starred</div>
        <div class="cw-sub">Team</div><div class="cw-row on">${ic("hash")}${CHANNEL}</div>
        <div class="cw-sub">Forums</div>
        <div class="cw-sub">Direct messages</div>
      </aside>
      <section class="cw-main">
        <div class="cw-head"><span class="cw-stack"><img src="${maya}" alt=""><img src="${leo}" alt=""></span>${CHANNEL}</div>
        <div class="cw-msgs">
          ${msg(maya, "Maya", "10:02 AM", "Set up on a VPS with the skill. The check passed, but my phone won't pair.")}
          ${msg(leo, "Leo", "10:05 AM", "Is the pairing service running? Paste the FAIL line here.")}
          ${msg(maya, "Maya", "10:07 AM", "That was it. Paired now 🎉")}
        </div>
        <div class="cw-compose"><span>Message #${CHANNEL}</span><span class="cw-tools">${ic("at")}${ic("paperclip")}${ic("mood-smile")}${ic("microphone")}${ic("letter-case")}<i>${ic("arrow-up")}</i></span></div>
      </section>
    </div>
  </div>`;

/* ── the section ── */

const STEPS = [
  ["Open the invite", "Tick both boxes, then choose <b>Accept invite in Buzz</b>. No app yet? The page links the download."],
  [`Join #${CHANNEL}`, `In Buzz, open the buzz community and join <b>#${CHANNEL}</b>.`],
  ["Bring someone along", "Send the invite to anyone else running a relay. Anyone with the link can join."],
];

const SECTION = `
  <div class="cm">
    <div class="cm-stage">
      ${WINDOW}
      <div class="cm-join">
        <span class="cm-kicker">${TILE}buzz community · hosted by Block</span>
        <h3>Join <span>#${CHANNEL}</span></h3>
        <div class="cm-acts">
          <a class="cm-go" href="${INVITE}" target="_blank" rel="noopener">Open the invite${ARROW}</a>
          <button type="button" class="cm-btn" data-copy>${ic("copy")}<span>Copy invite</span></button>
          <button type="button" class="cm-btn" data-share>${ic("share")}<span>Share</span></button>
        </div>
      </div>
    </div>
    <ol class="cm-steps">${STEPS.map(([h, p], n) => `<li><i aria-hidden="true">${n + 1}</i><div><h3>${h}</h3><p>${p}</p></div></li>`).join("")}</ol>
    <div class="cm-fine">
      <p>Anyone can join, so leave out keys, passwords and server addresses. <b>Signed in to Builderlab?</b> Once you join a community Block hosts, Buzz backs up your key to Block without asking, unless you already chose "I will manage my own key". <a href="#operations" data-q-link="identity">About identities</a></p>
      <a class="cm-gh" href="${ISSUES}">${ic("brand-github")}Rather not join? Open an issue on GitHub</a>
    </div>
  </div>`;

function flash(btn: HTMLButtonElement, text: string): void {
  const label = btn.querySelector("span")!;
  const was = label.textContent;
  label.textContent = text;
  btn.classList.add("done");
  window.setTimeout(() => {
    label.textContent = was;
    btn.classList.remove("done");
  }, 1600);
}

export function mountAsk(host: HTMLElement): void {
  host.innerHTML = SECTION;
  swarm(host.querySelector<HTMLElement>(".cm-stage")!, BEES, ".cw, .cm-join");

  host.querySelector<HTMLButtonElement>("[data-copy]")!.addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    copyText(INVITE, () => flash(b, "Copied"));
  });
  host.querySelector<HTMLButtonElement>("[data-share]")!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const data = { title: `#${CHANNEL} on Buzz`, text: `Running Buzz on your own server? Ask in #${CHANNEL}.`, url: INVITE };
    if (!navigator.share) return copyText(INVITE, () => flash(b, "Link copied"));
    try {
      await navigator.share(data);
    } catch {
      /* closed without sharing */
    }
  });
}
