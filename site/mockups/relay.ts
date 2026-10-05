/**
 * Four ways to draw the relay in the story's opening drawing, side by side.
 * A dev-only page: Vite serves it at /mockups/relay.html; the production build ignores it.
 */
import "@fontsource-variable/inter/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../src/styles/tokens.css";
import "../src/styles/main.css";
import "./relay.css";
import { SVG_DEFS, bee, blockMark } from "../src/defs";
import { buzzAppHTML } from "../src/scenes/buzzapp";

document.body.insertAdjacentHTML("afterbegin", SVG_DEFS);

type State = "hosted" | "self" | "inside";
const ID: Record<State, { name: string; addr: string }> = {
  hosted: { name: "Block's relay", addr: "yourteam.communities.buzz.xyz" },
  self: { name: "Your relay", addr: "buzz.yourteam.org" },
  inside: { name: "Your relay", addr: "buzz.yourteam.org" },
};

/** n: name, d: what it holds, s: the same in a word, k: core | keep (backed up) | "" */
const PARTS = [
  { n: "relay", d: "checks, delivers", s: "delivers", k: "core" },
  { n: "Postgres", d: "messages", s: "messages", k: "keep" },
  { n: "MinIO", d: "files", s: "files", k: "keep" },
  { n: "git", d: "repos", s: "repos", k: "keep" },
  { n: ".env", d: "keys", s: "keys", k: "keep" },
  { n: "Redis", d: "who's online", s: "presence", k: "" },
];

const MARKS = `${blockMark('class="m-block"')}${bee('class="m-bee"')}`;
const WHERE = (block: string, you: string) =>
  `<p class="mk-where"><span class="w-block">${block}</span><span class="w-you">${you}</span></p>`;
const LOCK = `<svg class="lk" viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 9V6.6a3.5 3.5 0 0 1 7 0V9" /><rect x="4" y="9" width="12" height="8.5" rx="2.4" /></svg>`;

/* ── A: the machine ─────────────────────────── */
const machine = () => `
  <div class="ap">
    <div class="ap-ghost up"><span></span></div>
    <div class="ap-unit">
      <div class="ap-top"><span class="ap-led"></span><span class="ap-lbl">relay</span><span class="ap-vents">${"<i></i>".repeat(9)}</span></div>
      <div class="ap-plate"><span class="mk-mark">${MARKS}</span><span class="ap-id"><b class="nm"></b><small class="ad"></small></span></div>
      <div class="ap-bays">${PARTS.map((p) => `<div class="ap-bay ${p.k}"><i></i><b>${p.n}</b><span>${p.d}</span></div>`).join("")}</div>
    </div>
    <div class="ap-ghost dn"><span></span></div>
    ${WHERE("In Block's data center", "On your server")}
  </div>`;

/* ── B: the hub ─────────────────────────────── */
const HUB = { x: 62, y: 170, r: 52 };
const COL = 150;
const PEER_Y = [116, 170, 224];
const PART_Y = [85, 119, 153, 187, 221, 255];
const spoke = (y: number) => `M${HUB.x + HUB.r} ${HUB.y} C ${HUB.x + HUB.r + 22} ${HUB.y}, ${COL - 22} ${y}, ${COL} ${y}`;
const PEERS = [
  { av: "a1", l: "M", n: "Maya", d: "desktop" },
  { av: "bot", l: "O", n: "Ops", d: "agent" },
  { av: "a3", l: "L", n: "Lee", d: "desktop" },
];
const hub = () => `
  <div class="hb">
    <svg class="hb-lines" viewBox="0 0 280 340" aria-hidden="true">
      <g class="hb-peerlines">${PEER_Y.map((y) => `<path d="${spoke(y)}" />`).join("")}</g>
      <g class="hb-partlines">${PART_Y.map((y) => `<path d="${spoke(y)}" />`).join("")}</g>
    </svg>
    <div class="hb-hub"><span class="hb-ring"></span><span class="mk-mark">${MARKS}</span></div>
    ${PEERS.map((p, i) => `<div class="hb-peer" style="top:${PEER_Y[i] - 20}px; --i:${i}"><i class="av ${p.av}">${p.l}</i><span><b>${p.n}</b><small>${p.d}</small></span><em aria-hidden="true"></em></div>`).join("")}
    ${PARTS.map((p, i) => `<div class="hb-part ${p.k}" style="top:${PART_Y[i] - 14}px; --i:${i}"><b>${p.n}</b><small>${p.s}</small></div>`).join("")}
    ${PEER_Y.map((y, i) => `<span class="hb-pkt" style="offset-path: path('${spoke(y)}'); --i:${i}"></span>`).join("")}
    <div class="hb-id"><b class="nm"></b><small class="ad"></small></div>
  </div>`;

/* ── C: the window ──────────────────────────── */
const SEED = [
  ["10:02", "EVENT", "Maya", "✓ sent to 4", ""],
  ["10:02", "REQ", "Lee", "#release", "q"],
  ["10:03", "EVENT", "Ops", "✓ sent to 4", ""],
  ["10:04", "AUTH", "npub1x7…", "✗ not a member", "no"],
];
const logLine = ([t, kind, who, out, cls]: string[], fresh = false) =>
  `<li class="${cls}${fresh ? " new" : ""}"><time>${t}</time><span>${kind}</span><b>${who}</b><em>${out}</em></li>`;
const window_ = () => `
  <div class="lg">
    <div class="lg-win">
      <div class="lg-bar"><span class="mk-mark">${MARKS}</span><span class="lg-id"><b class="nm"></b><small class="ad"></small></span><span class="lg-st"><i></i>live</span></div>
      <div class="lg-body">
        <ol class="lg-lines">${SEED.map((l) => logLine(l)).join("")}</ol>
        <ul class="lg-ps">${PARTS.map((p) => `<li class="${p.k}"><i></i><b>${p.n}</b><span>${p.d}</span>${p.k === "keep" ? "<em>backup</em>" : "<em class='no'></em>"}</li>`).join("")}</ul>
        <div class="lg-veil">${LOCK}<b>Only Block can see in</b><span>The logs, the data and the relay key stay on Block's servers.</span></div>
      </div>
    </div>
    ${WHERE("On Block's servers", "On your server")}
  </div>`;

/* ── D: the stack ───────────────────────────── */
const CX = 100;
const W = 86.6;
const H = 50;
const T = 11;
const plate = (i: number) => {
  const p = PARTS[i];
  const logo =
    i === 0
      ? `<g class="logo" transform="matrix(0.866 0.5 -0.866 0.5 ${CX} 0)"><use class="m-block" href="#block-mark" x="-15" y="-15" width="30" height="30" /><use class="m-bee" href="#bee" x="-25" y="-16.5" width="50" height="33" /></g>`
      : "";
  return `
    <g class="pl pl${i} ${p.k}" style="--yc:${131.5 + 14 * i}; --ye:${79.5 + 42 * i}; --n:${i}">
      <polygon class="side" points="${CX - W},0 ${CX},${H} ${CX + W},0 ${CX + W},${T} ${CX},${H + T} ${CX - W},${T}" />
      <path class="edge" d="M${CX} ${H} V ${H + T}" />
      <polygon class="top" points="${CX},${-H} ${CX + W},0 ${CX},${H} ${CX - W},0" />
      ${logo}
      <g class="lbl"><path d="M${CX + W + 5} 0 H ${CX + W + 17}" /><text x="${CX + W + 22}" y="-1">${p.n}</text><text class="d" x="${CX + W + 22}" y="12">${p.s}</text></g>
    </g>`;
};
const stack = () => `
  <div class="st">
    <svg class="st-svg" viewBox="0 0 290 380" aria-hidden="true">
      <g class="gr" transform="translate(0 218)"><polygon points="${CX},-63 ${CX + 110},0 ${CX},63 ${CX - 110},0" /></g>
      ${[5, 4, 3, 2, 1, 0].map(plate).join("")}
    </svg>
    <div class="st-cap">${WHERE("In Block's cloud", "On your server")}<b class="nm"></b><small class="ad"></small></div>
  </div>`;

const CONCEPTS = [
  {
    id: "a",
    name: "The machine",
    pitch: "The relay as hardware you could hold. Block's sits in a rack beside other communities; yours stands alone. Inside, the parts are drive bays, and the yellow lights are your backups.",
    html: machine,
  },
  {
    id: "b",
    name: "The hub",
    pitch: "Shows what a relay does: one message in, delivered to every member. Inside, the same hub fans out to the parts that make it work.",
    html: hub,
  },
  {
    id: "c",
    name: "The window",
    pitch: "Block's relay is a closed box you can't see into. Yours is a live window: every message checked and delivered, strangers turned away. Inside, the parts and what to back up.",
    html: window_,
  },
  {
    id: "d",
    name: "The stack",
    pitch: "One system built from layers. Inside, the layers lift apart and name themselves; the yellow ones are your backups.",
    html: stack,
  },
];

const list = document.querySelector<HTMLElement>(".mk-list")!;
list.innerHTML = CONCEPTS.map(
  (c, i) => `
  <section class="mk mk-${c.id}" data-state="hosted">
    <div class="mk-head">
      <span class="mk-letter">${String.fromCharCode(65 + i)}</span>
      <div><h2>${c.name}</h2><p class="mk-pitch">${c.pitch}</p></div>
    </div>
    <div class="mk-stage"><div class="sg-frame"><div class="sg-inner">
      <div class="sg-app">${buzzAppHTML()}</div>
      <div class="sg-wire" aria-hidden="true"><span class="sg-packet"></span></div>
      <div class="sg-relay">${c.html()}</div>
    </div></div></div>
  </section>`,
).join("");

/* scale each fixed-size drawing to its frame, as the story does */
document.querySelectorAll<HTMLElement>(".sg-frame").forEach((frame) => {
  const inner = frame.querySelector<HTMLElement>(".sg-inner")!;
  const fit = () => inner.style.setProperty("--s", String(Math.min(frame.clientWidth / 1000, frame.clientHeight / 580)));
  new ResizeObserver(fit).observe(frame);
  fit();
});

const frames = [...document.querySelectorAll<HTMLElement>(".mk")];
const setState = (s: State) => {
  frames.forEach((f) => {
    f.dataset.state = s;
    f.querySelectorAll(".nm").forEach((e) => (e.textContent = ID[s].name));
    f.querySelectorAll(".ad").forEach((e) => (e.textContent = ID[s].addr));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === s)));
};
document.querySelector(".mk-seg")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-set]");
  if (b) setState(b.dataset.set as State);
});
setState("hosted");

/* a message every few seconds: it travels the wire, then each relay reacts */
const WHO = ["you", "Maya", "Ops", "Lee"];
let sent = 0;
const appendLog = () => {
  const ol = document.querySelector<HTMLOListElement>(".mk-c .lg-lines")!;
  const k = sent++;
  const t = `10:${String(5 + (k % 50)).padStart(2, "0")}`;
  const line = k % 4 === 3 ? [t, "AUTH", "npub1q9…", "✗ not a member", "no"] : [t, "EVENT", WHO[k % 4], "✓ sent to 4", ""];
  ol.insertAdjacentHTML("beforeend", logLine(line, true));
  while (ol.children.length > 6) ol.firstElementChild!.remove();
};
const restart = (el: Element, cls: string) => {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};
const send = () => {
  frames.forEach((f) => restart(f.querySelector(".sg-wire")!, "go"));
  window.setTimeout(() => {
    frames.forEach((f) => restart(f, "ping"));
    appendLog();
  }, 1000);
};
let loop = 0;
const start = () => {
  window.clearInterval(loop);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) loop = window.setInterval(send, 4200);
};
document.querySelector(".mk-send")!.addEventListener("click", () => {
  send();
  start();
});
window.setTimeout(send, 600);
start();
