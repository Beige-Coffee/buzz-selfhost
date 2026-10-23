const i = (d: string) => `<svg class="b1-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
/** lucide icons, as Buzz 1.0 uses them */
const IC = {
  side: i(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>`),
  plus: i(`<path d="M5 12h14"/><path d="M12 5v14"/>`),
  msgs: i(`<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>`),
  alarm: i(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>`),
  bot: i(`<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>`),
  zap: i(`<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`),
  search: i(`<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`),
  bell: i(`<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`),
  users: i(`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`),
  more: i(`<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`),
  at: i(`<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>`),
  clip: i(`<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`),
  smile: i(`<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>`),
  up: i(`<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>`),
};

/**
 * A small Buzz 1.0 window in light mode, the way block/buzz-app draws it (68ebbfe, 2026-10-23): the top bar's
 * page tabs (AppShell.tsx), All, Solo and Team over Channels (PrimarySidebar.tsx), the open channel in Citrus,
 * a date line, and each message as a gray bubble under its author. People get round avatars, agents square ones.
 * Illustrative content.
 */
export function buzzAppHTML(): string {
  const msg = (av: string, cls: string, name: string, time: string, body: string) =>
    `<div class="b1-msg"><i class="b1-av ${cls}">${av}</i><div class="b1-col"><div class="b1-meta"><b>${name}</b><time>${time}</time></div><div class="b1-bub">${body}</div></div></div>`;
  return `
<div class="b1-app" aria-label="A Buzz channel, illustrated">
  <div class="b1-top">
    <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
    <span class="b1-nav">${IC.side}</span>
    <div class="b1-tabs">
      <span class="b1-tab">${IC.plus}</span>
      <span class="b1-tab on">${IC.msgs}Messages</span>
      <span class="b1-tab">${IC.alarm}Reminders</span>
      <span class="b1-tab">${IC.bot}Agents</span>
      <span class="b1-tab">${IC.zap}Workflows</span>
      <span class="b1-tab">${IC.search}</span>
    </div>
    <div class="b1-me"><span class="b1-comm">Y</span><span class="b1-me-av">L<i></i></span></div>
  </div>
  <div class="b1-body">
    <aside class="b1-side">
      <div class="b1-seg"><b>All</b><b>Solo</b><b class="on">Team</b></div>
      <div class="b1-row">${IC.bell}Inbox</div>
      <div class="b1-sub">Channels</div>
      <div class="b1-row"><em>#</em>general</div>
      <div class="b1-row on"><em>#</em>release</div>
      <div class="b1-row"><em>#</em>design</div>
      <div class="b1-sub">Direct messages</div>
    </aside>
    <section class="b1-main">
      <div class="b1-head"><b><em>#</em>release</b><span>${IC.users}${IC.more}</span></div>
      <div class="b1-msgs">
        <div class="b1-day"><span><i class="b1-cal">23</i>Today</span></div>
        ${msg("M", "p1", "Maya", "10:02 AM", `<span class="b1-chip">${IC.bot}Ops</span> can you fix the 5-minute login timeout?`)}
        ${msg("O", "sq", "Ops", "10:04 AM", `Pushed fix/login to app.<pre>- const SESSION_TTL = 5 * 60;
+ const SESSION_TTL = 24 * 60 * 60;</pre>`)}
        ${msg("R", "sq ci", "Reviewer", "10:06 AM", "Tests passed on fix/login.")}
      </div>
      <div class="b1-compose"><span class="b1-ph">Message #release</span><span class="b1-tools">${IC.at}${IC.clip}${IC.smile}<b class="b1-send">${IC.up}</b></span></div>
    </section>
  </div>
</div>`;
}
