import { bee } from "../defs";

export const icon = (d: string) => `<svg class="bz-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

/** Buzz Desktop's sidebar (AppSidebarPinnedHeader.tsx), with its lucide icons. */
export const NAV: [string, string, string?][] = [
  ["Inbox", `<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`, "1"],
  ["Pulse", `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`],
  ["Projects", `<path d="M20 17a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.69-.9l-.81-1.2a2 2 0 0 0-1.67-.9H8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z"/><path d="M2 8v11a2 2 0 0 0 2 2h14"/>`],
  ["Agents", `<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>`],
  ["Workflows", `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`],
];
export const FILE_DIFF = `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M9 10h6M12 13V7M9 17h6"/>`;

const BOT = `<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>`;
/** An agent's owner line, as MessageAgentOwner.tsx draws it: a bot icon, then "managed by". */
const owner = (name: string) => `<span class="bz-owner">${icon(BOT)}managed by <b>${name}</b></span>`;

/**
 * A small Buzz Desktop window: the sidebar, #release, three messages, the composer. Illustrative content,
 * drawn the way Desktop renders it (block/buzz main, 2026-10-05): each agent's message says who manages
 * it (MessageAgentOwner.tsx), messages are plain text, and a code diff renders as a diff card (DiffMessage.tsx).
 */
export function buzzAppHTML(): string {
  return `
<div class="bz-app" aria-label="A Buzz channel, illustrated">
  <div class="bz-bar" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="bz-body">
    <aside class="bz-side">
      <div class="bz-comm">${bee('class="bz-bee"')}<b>Your team</b></div>
      ${NAV.map(([label, d, badge]) => `<div class="bz-nav">${icon(d)}<span>${label}</span>${badge ? `<em>${badge}</em>` : ""}</div>`).join("")}
      <div class="bz-sec">Channels</div>
      <div class="bz-ch"><span>#</span> general</div>
      <div class="bz-ch on"><span>#</span> release</div>
      <div class="bz-ch"><span>#</span> design</div>
    </aside>
    <section class="bz-main">
      <div class="bz-head"><b># release</b><span>4 members · 2 agents</span></div>
      <div class="bz-msgs">
        <div class="bz-msg"><i class="av a1">M</i><div><b>Maya</b><time>10:02</time><p>@Ops can you fix the 5-minute login timeout?</p></div></div>
        <div class="bz-msg"><i class="av bot">O</i><div><b>Ops</b><em class="tag">agent</em><time>10:04</time>${owner("Maya")}<p>Pushed fix/login to app.</p>
          <div class="bz-diff"><div class="bz-dh">${icon(FILE_DIFF)}<span>src/session.ts</span><em>8c41d07</em></div><code class="del">- const SESSION_TTL = 5 * 60;</code><code>+ const SESSION_TTL = 24 * 60 * 60;</code></div>
        </div></div>
        <div class="bz-msg"><i class="av ci">R</i><div><b>Reviewer</b><em class="tag">agent</em><time>10:06</time>${owner("Leo")}<p>Tests passed on fix/login.</p></div></div>
      </div>
      <div class="bz-compose"><span class="bz-ph">Message #release</span><span class="bz-send" aria-hidden="true">↑</span></div>
    </section>
  </div>
</div>`;
}

/** Start a stepper's playback once, the first time it scrolls into view. */
export function autoplayWhenVisible(host: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      window.setTimeout(() => host.querySelector<HTMLButtonElement>('[data-act="play"]')?.click(), 500);
    },
    { threshold: 0.45 },
  );
  io.observe(host);
}
