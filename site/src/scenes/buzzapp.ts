import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import reviewer from "../assets/avatars/reviewer.webp";
import { BUZZ_ROBOT, TABLER } from "./tabler";

/** A Tabler outline icon, the set Buzz 1.0 draws its interface with. `cls` sets its size or stroke. */
const i = (name: string, cls = "") => `<svg class="b1-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true">${TABLER[name]}</svg>`;
/** Buzz 1.0's own agent mark, drawn for Buzz rather than taken from Tabler. */
const robot = (cls = "") => `<svg class="b1-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true">${BUZZ_ROBOT}</svg>`;
/** The icon each spot uses in block/buzz-app. Sizes follow the app's: dk and lg for its 20px icons, md for 18px, the rest 16px. */
const IC = {
  side: i("layout-sidebar"),
  back: i("arrow-left"),
  forward: i("arrow-right", "off"),
  search: i("search"),
  // the dock's page icons are drawn at stroke 2.5
  activity: i("bell", "dk"),
  msgs: i("messages", "dk"),
  agents: robot("dk"),
  plus: i("plus"),
  drafts: i("send", "pg"),
  hash: i("hash"),
  huddle: i("headphones"),
  terminal: i("terminal-2"),
  more: i("dots"),
  at: i("at", "lg"),
  clip: i("paperclip"),
  smile: i("mood-smile", "lg"),
  mic: i("microphone"),
  format: i("letter-case"),
  send: i("arrow-up", "off"),
  react: i("mood-plus", "md"),
  agent: robot("em"),
};

/*
 * Avatars: Maya and Leo are Notionists by Zoish (CC0 1.0), made with DiceBear (seeds Maya2 and Sam). The
 * agents are Fuzzies 12 and 13 from Buzz 1.0's agent avatar packs (block/buzz-app,
 * src/features/agents/avatar-packs, Apache 2.0), resized.
 */
const AV = { maya, leo, ops, reviewer };

/** Reactions sit inside the bubble, under the text, with the add-reaction button last. */
const reactions = (list: [string, number][]) =>
  `<div class="b1-reacts">${list.map(([e, n]) => `<span class="b1-react">${e}<b>${n}</b></span>`).join("")}<span class="b1-react add">${IC.react}</span></div>`;

/** A change as GitHub shows it: line numbers, the removed line in red and the added one in green, darker where they differ. */
const DIFF = `<div class="b1-diff" aria-label="A code change">
  <div class="b1-diff-h">src/session.ts</div>
  <div class="b1-dl del"><i>12</i><i></i><b>-</b><code><span class="k">const</span> <span class="c">SESSION_TTL</span> = <mark><span class="n">5</span> * <span class="n">60</span></mark>;</code></div>
  <div class="b1-dl add"><i></i><i>12</i><b>+</b><code><span class="k">const</span> <span class="c">SESSION_TTL</span> = <mark><span class="n">24</span> * <span class="n">60</span> * <span class="n">60</span></mark>;</code></div>
</div>`;

/**
 * A small Buzz 1.0 window in light mode, the way block/buzz-app draws it as released in
 * v1.0.0: across the top, the sidebar toggle, back and forward, and Search
 * (AppShell.tsx, PageSearch.tsx); down the dock, Messages and Agents, with the community button
 * and the profile picture at its foot (presentation.ts, CommunityPicker.tsx, ProfileButton.tsx); then one
 * white panel, the sidebar joined to the open channel: Activity, All, Solo and Team with New, and the
 * channels (PrimarySidebar.tsx); the channel's members and name, then its huddle, terminal and menu
 * (ChannelHeaderIdentity.tsx); each message as a gray bubble under its author, agents marked with the
 * robot; and the composer's tools under its text. People get round avatars, agents square ones.
 * Illustrative content.
 */
export function buzzAppHTML(): string {
  const msg = (av: string, agent: boolean, name: string, time: string, body: string) =>
    `<div class="b1-msg"><img class="b1-av${agent ? " sq" : ""}" src="${av}" alt=""><div class="b1-col"><div class="b1-meta"><b>${agent ? IC.agent : ""}${name}</b><time>${time}</time></div><div class="b1-bub">${body}</div></div></div>`;
  return `
<div class="b1-app" aria-label="A Buzz channel, illustrated">
  <div class="b1-top">
    <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
    <span class="b1-nav">${IC.side}${IC.back}${IC.forward}</span>
    <span class="b1-find">${IC.search}Search<kbd>⌘K</kbd></span>
  </div>
  <div class="b1-body">
    <div class="b1-dock">
      <span class="b1-dk on">${IC.msgs}</span>
      <span class="b1-dk">${IC.agents}</span>
      <span class="b1-comm">B</span>
      <span class="b1-me-av"><img src="${AV.leo}" alt=""><i></i></span>
    </div>
    <div class="b1-panel">
      <aside class="b1-side">
        <div class="b1-row">${IC.activity}Activity</div>
        <div class="b1-side-top"><div class="b1-seg"><b>All</b><b>Solo</b><b class="on">Team</b></div><span class="b1-new">${IC.plus}</span></div>
        <div class="b1-sub">Channels</div>
        <div class="b1-row">${IC.hash}general</div>
        <div class="b1-row on">${IC.hash}release</div>
        <div class="b1-row">${IC.hash}design</div>
        <div class="b1-sub">Direct messages</div>
      </aside>
      <section class="b1-main">
        <div class="b1-head"><b><span class="b1-stack"><img src="${AV.maya}" alt=""><img src="${AV.leo}" alt=""></span>release</b><span>${IC.huddle}${IC.terminal}${IC.more}</span></div>
        <div class="b1-msgs">
          ${msg(AV.maya, false, "Maya", "10:02 AM", `<span class="b1-chip">${IC.agent}Ops</span> can you fix the 5-minute login timeout?`)}
          ${msg(AV.ops, true, "Ops", "10:04 AM", `Pushed fix/login to app.${DIFF}${reactions([["🚀", 2], ["🙌", 1]])}`)}
          ${msg(AV.reviewer, true, "Reviewer", "10:06 AM", `Tests passed on fix/login. ✅${reactions([["🎉", 3], ["🐝", 2]])}`)}
        </div>
        <div class="b1-compose"><span class="b1-ph">Message #release</span><div class="b1-acts"><span class="b1-tools">${IC.at}${IC.clip}${IC.smile}${IC.mic}${IC.format}</span>${IC.send}</div></div>
      </section>
    </div>
  </div>
</div>`;
}
