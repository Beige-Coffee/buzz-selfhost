import leo from "../assets/avatars/leo.svg";
import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import { BUZZ_ROBOT } from "./tabler";

/**
 * Security, after the setup: two practices for a community anyone can join, each with one still
 * drawing. Nothing here is operated.
 *
 * The first drawing sets your computer apart, then shows the community as a Buzz window and the
 * machine the agent runs on, tied to the agent's message. The second is two lists: what is fine to
 * share flows into the open community, and what to keep out is struck through and stops short.
 *
 * The detail is the skill's references/security.md, which agents read too. This section links to it
 * and to the answers in Running your relay instead of repeating either. Who can get in and who holds
 * the keys are not drawn here: their cautions live in those answers and in the reference.
 */

const REFERENCE = "https://github.com/Beige-Coffee/buzz-selfhost/blob/main/skills/self-host-buzz/references/security.md";

const ICON: Record<string, string> = {
  folder: `<path d="M4 7a2 2 0 0 1 2-2h3.6l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>`,
  key: `<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2.5 2.5"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  doc: `<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h4"/>`,
  branch: `<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 8v8M17 10c0 4-10 2-10 6"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>`,
  users: `<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>`,
  x: `<path d="M18 6 6 18M6 6l12 12"/>`,
  world: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
  horn: `<path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5"/><path d="M12 8l4.5-3.8a.9.9 0 0 1 1.5.7v12.2a.9.9 0 0 1-1.5.7L12 14H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>`,
  robot: BUZZ_ROBOT,
};
const ic = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ── a small isometric kit, in the proportions of the relay drawing in How it works ── */

type Pt = [number, number];
const R = (n: number) => n.toFixed(1);

function kit(ox: number, oy: number) {
  // ground x runs right and down, ground y runs left and down, z is up
  const p = (x: number, y: number, z = 0): Pt => [ox + (x - y) * 0.866, oy + (x + y) * 0.5 - z];
  const poly = (pts: Pt[], attrs: string) => `<polygon points="${pts.map(([a, b]) => `${R(a)},${R(b)}`).join(" ")}" ${attrs}/>`;
  const box = (x: number, y: number, z: number, w: number, d: number, h: number, front = "#efefe9") =>
    `<g class="sq-b">${poly([p(x, y + d, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x, y + d, z)], `fill="${front}"`)}${poly([p(x + w, y, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x + w, y, z)], `fill="#e2e2db"`)}${poly([p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)], `fill="#fff"`)}</g>`;
  /** A square of ground: the dashed grey one is yours, the yellow one is the agent's. */
  const floor = (s: number, open = false) => poly([p(0, 0), p(s, 0), p(s, s), p(0, s)], `class="sq-floor${open ? " open" : ""}"`);
  /** An icon standing on the floor. */
  const badge = (x: number, y: number, icon: string, pub = false) => {
    const [cx, cy] = p(x, y);
    return `<g class="sq-badge${pub ? " pub" : ""}"><ellipse class="sq-shadow" cx="${R(cx)}" cy="${R(cy)}" rx="12" ry="5"/><rect x="${R(cx - 13)}" y="${R(cy - 29)}" width="26" height="26" rx="8"/><g transform="translate(${R(cx - 8.5)} ${R(cy - 24.5)}) scale(0.71)">${ICON[icon]}</g></g>`;
  };
  const agent = (x: number, y: number, z: number, size: number) => {
    const [cx, cy] = p(x, y, z);
    return `<ellipse class="sq-shadow" cx="${R(cx)}" cy="${R(cy)}" rx="${R(size * 0.3)}" ry="${R(size * 0.12)}"/><image href="${ops}" x="${R(cx - size / 2)}" y="${R(cy - size * 0.93)}" width="${size}" height="${size}"/>`;
  };
  /** A laptop: a flat base, and a screen standing along its back edge. */
  const laptop = (x: number, y: number) => {
    const w = 58, d = 40, t = 4, h = 38;
    const face: Pt[] = [p(x + 5, y + 4, t + h - 4), p(x + w - 5, y + 4, t + h - 4), p(x + w - 5, y + 4, t + 5), p(x + 5, y + 4, t + 5)];
    const keys: Pt[] = [p(x + 7, y + 13, t), p(x + w - 7, y + 13, t), p(x + w - 7, y + 30, t), p(x + 7, y + 30, t)];
    return box(x, y, 0, w, d, t) + poly(keys, `fill="#ecece6" stroke="none"`) + box(x, y, t, w, 4, h, "#fff") + poly(face, `fill="#eeeee8" stroke="none"`);
  };
  /** A small machine: two slabs, like the relay's layers, with a light on the front. */
  const machine = (x: number, y: number) => {
    const s = 46, t = 12, g = 4;
    const front = (z: number) => {
      const led = p(x + 7, y + s, z), a = p(x + 16, y + s, z), b = p(x + 34, y + s, z);
      return `<circle class="sq-led" cx="${R(led[0])}" cy="${R(led[1])}" r="2.2"/><path class="sq-slot" d="M${R(a[0])} ${R(a[1])}L${R(b[0])} ${R(b[1])}"/>`;
    };
    return box(x, y, 0, s, s, t) + box(x, y, t + g, s, s, t) + front(t + g + t / 2) + front(t / 2);
  };
  return { floor, badge, agent, laptop, machine };
}

/** The line nothing crosses: dotted, struck out at `yc`. */
const apart = (x: number, y1: number, y2: number, yc: number) =>
  `<path class="sq-bar" d="M${x} ${y1}V${y2}"/><g class="sq-no"><circle cx="${x}" cy="${yc}" r="10"/><path d="M${R(x - 3.6)} ${R(yc - 3.6)}l7.2 7.2M${R(x + 3.6)} ${R(yc - 3.6)}l-7.2 7.2"/></g>`;

/* ── a Buzz window facing the reader, in SVG so it scales with the drawing ── */

type Row = { av?: string; who: string; time: string; chip?: string; text: string; bw: number };
const ROW = 44; // a message row's height
/** The middle of row i's bubble, for a line that starts at that message. */
const rowY = (y: number, i: number) => y + 59 + i * ROW + 25;

/**
 * The window as Buzz 1.0 draws a channel: the title bar, the channel's members and name, then each
 * message as a grey bubble under its author. People get round pictures, the agent a square one and
 * the robot mark. `bw` is each bubble's width until `fit` measures its words.
 */
function win(x: number, y: number, w: number, h: number, rows: Row[]): string {
  const face = (src: string, cx: number, cy: number, r: number) => `<image href="${src}" x="${R(cx - r)}" y="${R(cy - r)}" width="${2 * r}" height="${2 * r}" style="clip-path: circle(50%)"/>`;
  const icon = (n: string, ix: number, iy: number, k: number, dim = false) => `<g class="sq-wi${dim ? " dim" : ""}" transform="translate(${R(ix)} ${R(iy)}) scale(${k})">${ICON[n]}</g>`;
  const pw = 92, px = w - 13 - pw;
  const body = rows
    .map((r, i) => {
      const ry = 59 + i * ROW;
      const who = r.av
        ? face(r.av, 22, ry + 25, 10) + `<text class="sq-wt nm" x="41" y="${ry + 9}">${r.who}<tspan class="tm" dx="5">${r.time}</tspan></text>`
        : `<rect class="sq-w-tile" x="12" y="${ry + 15}" width="20" height="20" rx="6"/><image href="${ops}" x="14" y="${ry + 17}" width="16" height="16"/>${icon("robot", 41, ry + 0.6, 0.4)}<text class="sq-wt nm" x="53" y="${ry + 9}">${r.who}<tspan class="tm" dx="5">${r.time}</tspan></text>`;
      const chip = r.chip ? `<rect class="sq-w-chip" x="44" y="${ry + 17.5}" width="38" height="15" rx="4.5"/>${icon("robot", 47, ry + 20.3, 0.4)}<text class="sq-wt ch" x="59" y="${ry + 29}">${r.chip}</text>` : "";
      return `${who}<g class="sq-bub"><rect class="sq-w-bub" x="38" y="${ry + 14}" width="${r.bw}" height="22" rx="11"/>${chip}<text class="sq-wt" x="${r.chip ? 86 : 47}" y="${ry + 29}">${r.text}</text></g>`;
    })
    .join("");
  return `<g class="sq-win" transform="translate(${x} ${y})">
    <rect class="sq-w-body" width="${w}" height="${h}" rx="13"/>
    ${[14, 24, 34].map((d) => `<circle class="sq-w-light" cx="${d}" cy="11" r="3.2"/>`).join("")}
    <rect class="sq-w-panel" x="5" y="21" width="${w - 10}" height="${h - 26}" rx="10"/>
    <circle class="sq-w-ring" cx="20" cy="37" r="8"/>${face(maya, 20, 37, 7)}<circle class="sq-w-ring" cx="30" cy="37" r="8"/>${face(leo, 30, 37, 7)}
    <text class="sq-wt hd" x="44" y="41">release</text>
    <rect class="sq-w-pill" x="${px}" y="28.5" width="${pw}" height="17" rx="8.5"/>${icon("world", px + 6.5, 32, 0.42, true)}<text class="sq-wt pl" x="${px + 20}" y="40.4">Open community</text>
    <path class="sq-w-rule" d="M5.5 53H${w - 5.5}"/>
    ${body}
  </g>`;
}

/* ── 1 · what the agent can touch ───────────────────────────── */

const SAY_AGENT =
  "Your computer, with your files, keys and logins, set apart by a dotted line that nothing crosses. Beside it, a Buzz window: Maya asks the agent Ops to draft the notes, and Ops answers. A line runs from the agent's message to a small machine on a yellow floor, where the agent runs with one project.";

/** On a wide screen, left to right: your computer, the line nothing crosses, the community, the agent's machine. */
function agentWide(): string {
  const W = 560, H = 204, sa = 88, sc = 80;
  const A = kit(80, 46), C = kit(483, 50);
  const wx = 186, wy = 12, ww = 206, wh = 156;
  const oy = rowY(wy, 1), cy = 50 + sc / 2, cx = 483 - sc * 0.866 - 2, ex = wx + ww + 11;
  return `<svg class="sq-iso sq-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="${SAY_AGENT}">
    ${A.floor(sa)}${A.laptop(13, 6)}
    ${A.badge(10, 70, "folder")}${A.badge(42, 76, "key")}${A.badge(74, 70, "lock")}
    ${apart(170, 10, H - 34, 90)}<text class="sq-note" x="170" y="${H - 14}">no way across</text>
    ${win(wx, wy, ww, wh, [
      { av: maya, who: "Maya", time: "10:02 AM", chip: "Ops", text: "draft the notes?", bw: 140 },
      { who: "Ops", time: "10:03 AM", text: "On it.", bw: 46 },
    ])}
    <path class="sq-wire" d="M${wx + ww} ${oy}H${ex - 5}Q${ex} ${oy} ${ex} ${oy - 5}V${cy + 5}Q${ex} ${cy} ${ex + 5} ${cy}H${R(cx)}"/>
    <circle class="sq-dot" cx="${wx + ww}" cy="${oy}" r="3"/><circle class="sq-dot" cx="${R(cx)}" cy="${cy}" r="3"/>
    ${C.floor(sc, true)}${C.machine(17, 17)}${C.agent(40, 40, 28, 54)}
    ${C.badge(72, 10, "folder", true)}
  </svg>`;
}

/**
 * On a phone the window gets the full width, so its words stay readable. The agent's machine sits
 * under the agent's message, and your computer is set apart beside it. Its labels are drawn in.
 */
function agentTall(): string {
  const W = 340, H = 348, sa = 88, sc = 80;
  const C = kit(84, 222), A = kit(254, 216);
  const wx = 8, wy = 6, ww = 324, wh = 156;
  const ax = wx + 22, by = wy + wh, ty = by + 12, head = 222 + sc / 2 - 28 - 47;
  return `<svg class="sq-iso sq-tall" viewBox="0 0 ${W} ${H}" role="img" aria-label="${SAY_AGENT}">
    ${win(wx, wy, ww, wh, [
      { av: maya, who: "Maya", time: "10:02 AM", chip: "Ops", text: "can you draft the notes?", bw: 180 },
      { who: "Ops", time: "10:03 AM", text: "On it. Working from the app repo.", bw: 192 },
    ])}
    <path class="sq-wire" d="M${ax} ${by}V${ty - 6}Q${ax} ${ty} ${ax + 6} ${ty}H78Q84 ${ty} 84 ${ty + 6}V${head}"/>
    <circle class="sq-dot" cx="${ax}" cy="${by}" r="3"/><circle class="sq-dot" cx="84" cy="${head}" r="3"/>
    ${C.floor(sc, true)}${C.machine(17, 17)}${C.agent(40, 40, 28, 54)}
    ${C.badge(72, 10, "folder", true)}
    ${apart(170, 186, 310, 262)}
    ${A.floor(sa)}${A.laptop(13, 6)}
    ${A.badge(10, 70, "folder")}${A.badge(42, 76, "key")}${A.badge(74, 70, "lock")}
    <text class="sq-cap" x="84" y="326">The agent's machine</text><text class="sq-sub" x="84" y="341">one project only</text>
    <text class="sq-cap" x="254" y="326">Your computer</text><text class="sq-sub" x="254" y="341">your files, keys, logins</text>
  </svg>`;
}

const AGENT_FIG = `
  <figure class="sq-fig">
    <p class="sq-k"><i></i>What the agent can touch</p><span class="sq-rec">Recommended</span>
    <div class="sq-stage">
      ${agentWide()}${agentTall()}
      <div class="sq-caps" aria-hidden="true">
        <p><b>Your computer</b><span>your files, keys, logins</span></p>
        <p><b>Your community</b><span>the agent sees what is posted</span></p>
        <p><b>The agent's machine</b><span>one project only</span></p>
      </div>
    </div>
  </figure>`;

/* ── 2 · what anyone who joins can read ─────────────────────── */

const SHARE: [icon: string, text: string][] = [["doc", "Public docs"], ["branch", "Open-source code"], ["horn", "Announcements"]];
const KEEP: [icon: string, text: string][] = [["users", "Customer data"], ["branch", "Private repositories"], ["key", "Keys and logins"]];
const items = (list: [string, string][], pub: boolean) => list.map(([i, t]) => `<li><span class="sq-b2${pub ? " pub" : ""}" aria-hidden="true">${ic(i)}</span>${t}</li>`).join("");
const NEWCOMER = `<span class="sq-new">${ic("user")}</span>`;

/** Two lists over one community: what is fine to share flows in, what to keep out is struck through and stops short. */
const OPEN_FIG = `
  <figure class="sq-fig">
    <p class="sq-k"><i></i>What anyone who joins can read</p>
    <div class="sq-lists">
      <div class="sq-tray"><p class="sq-h" id="sq-share">Fine to share</p><ul aria-labelledby="sq-share">${items(SHARE, true)}</ul></div>
      <div class="sq-tray sq-out"><p class="sq-h" id="sq-keep">Keep out</p><ul aria-labelledby="sq-keep">${items(KEEP, false)}</ul></div>
      <span class="sq-flow" aria-hidden="true"></span>
      <span class="sq-flow sq-stop" aria-hidden="true"><i class="sq-x">${ic("x")}</i></span>
      <p class="sq-room"><span class="sq-faces" aria-hidden="true"><img src="${maya}" alt=""><img src="${leo}" alt="">${NEWCOMER}${NEWCOMER}${NEWCOMER}</span><span class="sq-name"><b>Open community</b><i>anyone can join</i></span></p>
    </div>
  </figure>`;

/* ── the section ────────────────────────────────────────────── */

const faq = (id: string, text: string) => `<a href="#operations" data-q-link="${id}">${text}</a>`;

/** The answers in Running your relay that carry the rest: moderation, keys, and what to do when something goes wrong. */
const MORE: [id: string, text: string][] = [
  ["moderate", "Moderation"],
  ["identity", "Keys"],
  ["lost", "A lost device"],
  ["leak", "A leaked key"],
  ["leave", "Someone leaves"],
  ["server", "Server access"],
];

export function mountSecurity(host: HTMLElement): void {
  host.innerHTML = `
  <div class="sq">
    <div class="sq-grid">
      <article class="sq-rule">
        ${AGENT_FIG}
        <div class="sq-text">
          <h3><i aria-hidden="true">01</i>Give your agent its own machine</h3>
          <p>Your agent works for you, but it reads what others post. Today Buzz starts a local agent without a sandbox or approval prompts, so it can reach whatever is on its computer. A spare computer or a virtual machine with one project on it keeps that reach small.</p>
          <p class="sq-links">${faq("agents", "How should we run agents?")}</p>
        </div>
      </article>
      <article class="sq-rule">
        ${OPEN_FIG}
        <div class="sq-text">
          <h3><i aria-hidden="true">02</i>Keep private context out of open communities</h3>
          <p>An open community works like a public room. Anyone who joins can read every channel that is not private. Share there what you would be comfortable publishing, and give an agent that works there only the context it needs.</p>
          <p class="sq-links">${faq("read", "Who can read our messages?")}</p>
        </div>
      </article>
    </div>
    <p class="sq-also">Running a private community? The same two practices apply, with less urgency.</p>
    <div class="sq-more">
      <p class="sq-k" id="sq-more">More on security</p>
      <ul aria-labelledby="sq-more">${MORE.map(([id, text]) => `<li>${faq(id, text)}</li>`).join("")}</ul>
      <a class="sq-ref" href="${REFERENCE}">Full reference</a>
    </div>
  </div>`;

  // each drawn chat bubble is as wide as its words: measured once the fonts are in, and again when the
  // screen crosses over to the other drawing, since a hidden one can't be measured
  const fit = () =>
    host.querySelectorAll<SVGGElement>(".sq-bub").forEach((g) => {
      const bubble = g.querySelector<SVGRectElement>(".sq-w-bub")!;
      const words = [...g.querySelectorAll<SVGTextElement>("text")].pop()!.getBBox();
      if (words.width) bubble.setAttribute("width", R(words.x + words.width + 10 - bubble.x.baseVal.value));
    });
  fit();
  document.fonts?.ready.then(fit);
  matchMedia("(max-width: 520px)").addEventListener("change", fit);
}
