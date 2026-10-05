import { bee } from "../defs";

/**
 * "What's a relay key?": a dropdown under the path cards. Five steps, each a small drawing in How it works's
 * style that plays once when you arrive; steps only change when you ask. Drawn twice: wide (560 x 380) for a
 * roomy stage, tall (360 x 340) for a narrow one, so the type stays readable on a phone.
 * Facts, block/buzz main 2026-10-05:
 * - chat messages are signed events (kind 9); a bad signature is refused ("invalid: invalid schnorr signature")
 * - the relay signs with BUZZ_RELAY_PRIVATE_KEY: the NIP-43 member list (kind 13534), system notices
 *   (kind 40099), git repo state (kind 30618); NIP-11 publishes its public key as `self`
 * - no invite links here: self-hosted relays have no invite UI yet (block/buzz#6923), so the steps leave them out
 */

const KEY = `<svg class="rk-i-key" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2.5 2.5"/></svg>`;
const OK = `<svg class="rk-i-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
const NO = `<svg class="rk-i-no" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>`;
const WARN = `<svg class="rk-i-warn" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/></svg>`;

/** a bold word that explains itself on hover, focus or tap */
const term = (word: string, note: string) =>
  `<span class="rk-term"><button type="button" aria-expanded="false">${word}</button><span class="rk-note" role="tooltip">${note}</span></span>`;
const RELAY = term("relay", "The server a Buzz community runs on. It checks who's a member, stores each message and delivers it.");
const PRIV = term("private key", "A secret only its owner holds. It makes signatures; the matching public key lets anyone check them.");

const STEPS = [
  { k: "Nostr", t: `Buzz is built on <b>Nostr</b>, an open protocol: Notes and Other Stuff Transmitted by Relays. A ${RELAY} is the server your community runs on.` },
  { k: "Events", t: `Every message is an event: a small JSON object in one standard format, so any app can read it, on desktop or phone. Apps send events to the relay, and it delivers them to everyone in the channel.` },
  { k: "Signatures", t: `Each event is signed with its author's ${PRIV}, so anyone can check who sent it. The relay refuses events with an invalid signature, so nobody can post as someone else.` },
  { k: "The relay signs too", t: `Your relay has its own key, <code>BUZZ_RELAY_PRIVATE_KEY</code>. It signs the member list, notices like “Triage added by Maya”, and git updates after a push. Apps trust them because the signature matches your relay.` },
  { k: "Keep it safe", t: `Keep the relay key secret and backed up. If it's lost, your relay can't sign as itself anymore. If it's leaked, anyone with it can pretend to be your relay.` },
];

/** What the relay signs (step 4), each with a note that shows on hover, focus or tap. */
const SIGNED: [string, string][] = [
  ["Member list", "Who belongs to your community. The relay publishes it, and apps use it to show who's a member."],
  ["“Triage added by Maya”", "A notice in a channel, like someone joining or the topic changing. The relay posts these itself."],
  ["Git update after a push", "When someone pushes code to your relay, it records each branch's latest commit, so apps show the current code."],
];

/** plays once when its step is shown, after d seconds */
const A = (d: number, an = "pop", t?: number) => ` data-a style="--d:${d}s;--an:rk-${an}${t ? `;--t:${t}s` : ""}"`;
const at = (x: number, y: number, w?: number, h?: number) => `left:${x}px;top:${y}px${w ? `;width:${w}px` : ""}${h ? `;height:${h}px` : ""}`;
/** a dot that runs a path once */
const packet = (path: string, d: number, t = 0.6) => `<span class="rk-pk" style="offset-path: path('${path}'); --d:${d}s; --t:${t}s"></span>`;

/** The relay as How it works draws it: six isometric layers, the dark top one with the bee. Layer 4 is .env. */
const CX = 100;
const W = 86.6;
const H = 50;
const T = 11;
const TOP = `${CX},${-H} ${CX + W},0 ${CX},${H} ${CX - W},0`;
const SIDE = `${CX - W},0 ${CX},${H} ${CX + W},0 ${CX + W},${T} ${CX},${H + T} ${CX - W},${T}`;
function relay(o: { explode?: boolean; lift?: number; env?: number; lit?: number } = {}): string {
  const layers = [5, 4, 3, 2, 1, 0]
    .map((i) => {
      const y0 = 131.5 + 14 * i;
      const y1 = 56 + 52 * i;
      const move = o.lift !== undefined ? ` style="--y0:${y0}px;--y1:${y1}px;--d:${o.lift}s"` : "";
      const mark = i === 0 ? `<use class="rk-st-mark" href="#bee" x="-25" y="-16.5" width="50" height="33" transform="matrix(0.866 0.5 -0.866 0.5 ${CX} 0)"/>` : "";
      const lit = i === 0 && o.lit !== undefined ? `<polygon class="rk-st-lit" points="${TOP}" style="--d:${o.lit}s"/>` : "";
      const env = i === 4 && o.env !== undefined ? ` rk-st-env" style="--d:${o.env}s` : "";
      return `<g class="rk-st-l rk-st-l${i}${o.lift !== undefined ? " rk-st-lift" : ""}" transform="translate(0 ${o.explode ? y1 : y0})"${move}>
        <g class="rk-st-face${env}"><polygon class="rk-st-side" points="${SIDE}"/><path class="rk-st-edge" d="M${CX} ${H}V${H + T}"/><polygon class="rk-st-top" points="${TOP}"/></g>${lit}${mark}</g>`;
    })
    .join("");
  const floor = o.explode ? "" : `<polygon class="rk-st-floor" points="${CX},155 ${CX + 110},218 ${CX},281 ${CX - 110},218"/>`;
  const dim = o.env !== undefined ? ` rk-st-dim" style="--dd:${o.env}s` : "";
  return `<svg class="rk-st${dim}" viewBox="${o.explode ? "-12 0 224 384" : "-12 78 224 206"}" aria-hidden="true">${floor}${layers}</svg>`;
}

/** Where everything sits, in each drawing size. */
interface Box {
  x: number;
  y: number;
  w: number;
  h?: number;
}
interface Layout {
  w: number;
  h: number;
  name: number;
  exp: number;
  desk: Box;
  hub: Box;
  phone: Box;
  capY: number;
  hubCap: Box;
  /** what step 1 calls the relay, under it */
  hubSub: string;
  wy: number;
  card: Box;
  stamp: Box;
  note: Box;
  s4: { relay: Box; pill: Box; cap: Box; label: Box; from: [number, number]; cards: Box; ys: number[] };
  s5: { key: Box; label: number; lost: Box; leaked: Box };
}
const WIDE: Layout = {
  w: 560,
  h: 380,
  name: 20,
  exp: 62,
  desk: { x: 31, y: 144, w: 144, h: 104 },
  hub: { x: 210, y: 140, w: 140 },
  phone: { x: 385, y: 106, w: 104, h: 180 },
  capY: 296,
  hubCap: { x: 170, y: 296, w: 220 },
  hubSub: "your community's server",
  wy: 196,
  card: { x: 16, y: 22, w: 236 },
  stamp: { x: 238, y: 78, w: 34 },
  note: { x: 16, y: 122, w: 260 },
  s4: { relay: { x: 56, y: 6, w: 170 }, pill: { x: 214, y: 192, w: 0 }, cap: { x: 36, y: 306, w: 210 }, label: { x: 346, y: 72, w: 0 }, from: [324, 206], cards: { x: 346, y: 0, w: 206, h: 44 }, ys: [96, 156, 216] },
  s5: { key: { x: 252, y: 12, w: 56 }, label: 76, lost: { x: 20, y: 104, w: 254, h: 262 }, leaked: { x: 286, y: 104, w: 254, h: 262 } },
};
const TALL: Layout = {
  w: 360,
  h: 340,
  name: 10,
  exp: 48,
  desk: { x: 8, y: 144, w: 104, h: 76 },
  hub: { x: 128, y: 141, w: 104 },
  phone: { x: 248, y: 120, w: 72, h: 124 },
  capY: 258,
  hubCap: { x: 105, y: 258, w: 150 },
  hubSub: "your server",
  wy: 182,
  card: { x: 10, y: 14, w: 340 },
  stamp: { x: 312, y: 64, w: 30 },
  note: { x: 10, y: 112, w: 300 },
  s4: { relay: { x: 2, y: 6, w: 116 }, pill: { x: 98, y: 129, w: 0 }, cap: { x: 0, y: 240, w: 120 }, label: { x: 200, y: 36, w: 0 }, from: [192, 142], cards: { x: 200, y: 0, w: 154, h: 50 }, ys: [58, 120, 182] },
  s5: { key: { x: 160, y: 4, w: 40 }, label: 48, lost: { x: 8, y: 72, w: 168, h: 262 }, leaked: { x: 184, y: 72, w: 168, h: 262 } },
};

function frames(L: Layout): string[] {
  const { desk, hub, phone, wy } = L;
  // the stack's left and right edges: the layers span x 13.4 to 186.6 of the drawing's 224 (from -12)
  const hubL = hub.x + (25.4 / 224) * hub.w;
  const hubR = hub.x + (198.6 / 224) * hub.w;
  const midX = hub.x + 0.5 * hub.w;
  const wires = `<svg class="rk-wires" viewBox="0 0 ${L.w} ${L.h}"><path d="M${desk.x + desk.w} ${wy}H${hubL}"/><path d="M${hubR} ${wy}H${phone.x}"/></svg>`;
  const toRelay = `M${desk.x + desk.w} ${wy}H${midX - 14}`;
  const toJun = `M${midX + 14} ${wy}H${phone.x}`;

  const msg = (d?: number, cls = "rk-dmsg") =>
    d === undefined ? `<div class="${cls} ghost"><i></i><span></span></div>` : `<div class="${cls}"${A(d)}><i>M</i><span>Release is Friday</span></div>`;
  const deskHTML = (sent?: number) => `
    <div class="rk-desk" style="${at(desk.x, desk.y, desk.w, desk.h)}">
      <div class="rk-desk-bar"><i></i><i></i><i></i></div>
      <div class="rk-desk-body">
        <div class="rk-desk-side">${bee('class="rk-bee"')}<i></i><i class="on"></i><i></i></div>
        <div class="rk-desk-main"><p># release</p><div class="rk-msgs">${msg()}${sent === undefined ? "" : msg(sent)}</div><div class="rk-comp"></div></div>
      </div>
    </div>
    <div class="rk-cap" style="${at(desk.x - 10, L.capY, desk.w + 20)}"><b>Maya</b><span>Buzz Desktop</span></div>`;
  const phoneHTML = (got?: number) => `
    <div class="rk-phone" style="${at(phone.x, phone.y, phone.w, phone.h)}">
      <i class="rk-notch"></i><p># release</p>
      <div class="rk-msgs">${msg(undefined, "rk-pmsg")}${got === undefined ? "" : msg(got, "rk-pmsg")}</div><div class="rk-comp"></div>
    </div>
    <div class="rk-cap" style="${at(phone.x - 20, L.capY, phone.w + 40)}"><b>Leo</b><span>Buzz mobile</span></div>`;
  const hubHTML = (lit?: number) => `<div style="${at(hub.x, hub.y, hub.w)}">${relay({ lit })}</div>`;
  const hubCap = (b: string, s: string) => `<div class="rk-cap" style="${at(L.hubCap.x, L.hubCap.y, L.hubCap.w)}"><b>${b}</b><span>${s}</span></div>`;
  const card = (sig: boolean, d: number) => `
    <div class="rk-ev" style="${at(L.card.x, L.card.y, L.card.w)}"${A(d)}>
      <p class="rk-ev-h">the event</p>
      <p><span>"content"</span>: "Release is Friday"</p>
      <p><span>"pubkey"</span>: "a1f3…9c2e"</p>
      <p${sig ? ' class="sig"' : ""}><span>"sig"</span>: "3f9a…e81b"</p>
    </div>`;

  /* 1 · Nostr */
  const f1 = `
    <p class="rk-name" style="${at(0, L.name, L.w)}"${A(0.05, "fade")}>Nostr</p>
    <p class="rk-exp" style="${at(10, L.exp, L.w - 20)}"${A(0.25, "fade")}><b>N</b>otes and <b>O</b>ther <b>S</b>tuff <b>T</b>ransmitted by <b class="hot">Relays</b></p>
    <div class="rk-layer"${A(0.5, "rise", 0.7)}>${wires}${hubHTML()}${hubCap("relay", L.hubSub)}</div>
    <div class="rk-layer"${A(0.85, "fade", 0.5)}>${deskHTML()}${phoneHTML()}</div>`;

  /* 2 · Events: Maya sends, the relay delivers to Leo's phone */
  const f2 = `
    ${wires}${hubHTML(1.45)}${hubCap("Your relay", "buzz.yourteam.org")}
    ${deskHTML(0.1)}${phoneHTML(2.1)}
    ${card(false, 0.35)}
    ${packet(toRelay, 0.85)}${packet(toJun, 1.55)}`;

  /* 3 · Signatures: Maya's key signs it */
  const f3 = `
    ${wires}${hubHTML(1.75)}${hubCap("Your relay", "buzz.yourteam.org")}
    ${deskHTML(0)}${phoneHTML(2.4)}
    ${card(true, 0.1)}
    <span class="rk-key" style="${at(L.stamp.x, L.stamp.y, L.stamp.w, L.stamp.w)}"${A(0.55, "stamp", 0.6)}>${KEY}</span>
    <p class="rk-note-l" style="${at(L.note.x, L.note.y, L.note.w)}"${A(0.85, "fade")}>signed with Maya's private key</p>
    ${packet(toRelay, 1.15)}${packet(toJun, 1.85)}`;

  /* 4 · The relay signs too */
  const s4 = L.s4;
  const fan = s4.ys.map((y) => `M${s4.from[0]} ${s4.from[1]}C${s4.from[0] + 10} ${s4.from[1]} ${s4.cards.x - 10} ${y + (s4.cards.h ?? 44) / 2} ${s4.cards.x} ${y + (s4.cards.h ?? 44) / 2}`);
  const f4 = `
    <div style="${at(s4.relay.x, s4.relay.y, s4.relay.w)}"${A(0, "fade", 0.3)}>${relay({ explode: true, lift: 0.15, env: 0.95 })}</div>
    <div class="rk-pill" style="${at(s4.pill.x, s4.pill.y)}"${A(1.05, "left")}><span class="rk-key dark">${KEY}</span><span><b>.env</b><small>relay key</small></span></div>
    <div class="rk-cap" style="${at(s4.cap.x, s4.cap.y, s4.cap.w)}"${A(0.6, "fade")}><b>Your relay</b><span>its key lives in .env</span></div>
    <p class="rk-label" style="${at(s4.label.x, s4.label.y)}"${A(1.3, "fade")}>signed by your relay</p>
    <svg class="rk-wires" viewBox="0 0 ${L.w} ${L.h}"${A(1.3, "fade")}>${fan.map((d) => `<path class="hot" d="${d}"/>`).join("")}</svg>
    ${fan.map((d, i) => packet(d, 1.4 + 0.2 * i, 0.4)).join("")}
    ${SIGNED.map(
      ([t, note], i) =>
        `<div class="rk-signed" tabindex="0" style="${at(s4.cards.x, s4.ys[i], s4.cards.w, s4.cards.h)}"${A(1.75 + 0.2 * i, "right")}><span class="rk-key">${KEY}</span><b>${t}</b>${OK}<span class="rk-tip" role="tooltip">${note}</span></div>`,
    ).join("")}`;

  /* 5 · Keep it safe: what happens if it's lost, or leaked */
  const s5 = L.s5;
  const LOST = ["It has to start over with a new key", "Apps see a different relay key", "What it signed before no longer matches it: member lists, notices, git updates"];
  const LEAKED = ["Sign a member list", "Sign notices like “Mallory added by Maya”", "Sign git updates"];
  const f5 = `
    <span class="rk-key dark rk-vault" style="${at(s5.key.x, s5.key.y, s5.key.w, s5.key.w)}"${A(0.1, "stamp", 0.6)}>${KEY}</span>
    <p class="rk-vk" style="${at(0, s5.label, L.w)}"${A(0.4, "fade")}>your relay key</p>
    <div class="rk-if r" style="${at(s5.lost.x, s5.lost.y, s5.lost.w, s5.lost.h)}"${A(0.6, "rise")}>
      <span class="rk-badge r">${NO}If it's lost</span><p>Your relay can't sign as itself anymore:</p>
      <ul>${LOST.map((t, i) => `<li${A(0.85 + 0.12 * i, "left")}>${NO}${t}</li>`).join("")}</ul>
    </div>
    <div class="rk-if y" style="${at(s5.leaked.x, s5.leaked.y, s5.leaked.w, s5.leaked.h)}"${A(0.75, "rise")}>
      <span class="rk-badge y">${WARN}If it's leaked</span><p>Anyone with it can pretend to be your relay:</p>
      <ul>${LEAKED.map((t, i) => `<li${A(1.0 + 0.12 * i, "left")}>${KEY}${t}</li>`).join("")}</ul>
    </div>`;

  return [f1, f2, f3, f4, f5];
}

export function mountRelayKey(host: HTMLElement): void {
  host.innerHTML = `
    <details class="rk" id="relay-key">
      <summary><span class="rk-sum-i">${KEY}</span><span class="rk-sum-t">What's a relay key?</span><span class="rk-sum-s">And why it matters where it's stored</span></summary>
      <div class="rk-body">
        <div class="rk-stage"><div class="rk-inner"></div></div>
        <div class="rk-text" aria-live="polite">
          <p class="rk-n"></p>
          <h3 class="rk-h"></h3>
          <p class="rk-p"></p>
          <div class="rk-nav">
            <button type="button" class="rk-prev" aria-label="Previous step">←</button>
            <span class="rk-dots">${STEPS.map((s, i) => `<button type="button" data-i="${i}" aria-label="Step ${i + 1}: ${s.k}"></button>`).join("")}</span>
            <button type="button" class="rk-next" aria-label="Next step">→</button>
            <button type="button" class="rk-replay" aria-label="Play this step again">↻ Replay</button>
          </div>
        </div>
      </div>
    </details>`;

  const details = host.querySelector<HTMLDetailsElement>("details")!;
  const stage = host.querySelector<HTMLElement>(".rk-stage")!;
  const inner = host.querySelector<HTMLElement>(".rk-inner")!;
  let layout: Layout | null = null;
  let step = 0;

  // step 2 repeats: a message goes out every few seconds while you're looking at it
  const LOOP_STEP = 1;
  const LOOP_MS = 5000;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let loop = 0;
  let inView = false;
  new IntersectionObserver(([e]) => (inView = e.isIntersecting)).observe(stage);
  const replayFrame = () => {
    const f = inner.querySelectorAll<HTMLElement>(".rk-fr")[step];
    if (!f) return;
    f.classList.remove("on");
    void inner.offsetWidth;
    f.classList.add("on");
  };
  const arm = () => {
    window.clearInterval(loop);
    if (step !== LOOP_STEP || !details.open || still.matches) return;
    loop = window.setInterval(() => inView && replayFrame(), LOOP_MS);
  };

  const show = (i: number) => {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const fr = inner.querySelectorAll<HTMLElement>(".rk-fr");
    // re-adding .on restarts every animation in the step
    fr.forEach((f) => f.classList.remove("on"));
    void inner.offsetWidth;
    fr[step]?.classList.add("on");
    host.querySelector(".rk-n")!.innerHTML = `<span>0${step + 1}</span> / 0${STEPS.length}`;
    host.querySelector(".rk-h")!.textContent = STEPS[step].k;
    const p = host.querySelector<HTMLElement>(".rk-p")!;
    p.innerHTML = STEPS[step].t;
    p.classList.remove("in");
    void p.offsetWidth;
    p.classList.add("in");
    host.querySelectorAll<HTMLElement>(".rk-dots button").forEach((d, j) => d.setAttribute("aria-current", String(j === step)));
    host.querySelector<HTMLButtonElement>(".rk-prev")!.disabled = step === 0;
    host.querySelector<HTMLButtonElement>(".rk-next")!.disabled = step === STEPS.length - 1;
    arm();
  };

  // a narrow stage gets the tall drawings, so the words inside stay readable
  const fit = (width: number) => {
    const next = width < 460 ? TALL : WIDE;
    if (next !== layout) {
      layout = next;
      stage.classList.toggle("tall", next === TALL);
      stage.style.aspectRatio = `${next.w} / ${next.h}`;
      inner.style.width = `${next.w}px`;
      inner.style.height = `${next.h}px`;
      inner.innerHTML = frames(next)
        .map((f) => `<div class="rk-fr">${f}</div>`)
        .join("");
      if (details.open) show(step);
    }
    inner.style.setProperty("--s", String(width / next.w));
  };
  new ResizeObserver(([e]) => e.contentRect.width && fit(e.contentRect.width)).observe(stage);

  // opening plays the step you're on
  details.addEventListener("toggle", () => (details.open ? show(step) : window.clearInterval(loop)));

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>(".rk-signed");
    host.querySelectorAll(".rk-signed.open").forEach((c) => c !== card && c.classList.remove("open"));
    if (card) {
      card.classList.toggle("open");
      return;
    }
    const word = t.closest<HTMLElement>(".rk-term button");
    if (word) {
      const w = word.parentElement!;
      const open = !w.classList.contains("open");
      host.querySelectorAll(".rk-term.open").forEach((x) => x.classList.remove("open"));
      w.classList.toggle("open", open);
      word.setAttribute("aria-expanded", String(open));
      return;
    }
    if (t.closest(".rk-prev")) show(step - 1);
    else if (t.closest(".rk-next")) show(step + 1);
    else if (t.closest(".rk-replay")) show(step);
    else {
      const dot = t.closest<HTMLElement>(".rk-dots [data-i]");
      if (dot) show(Number(dot.dataset.i));
    }
  });

  // "What's a relay key?" from a card's note opens this and brings it into view
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest('[data-open="relay-key"]')) return;
    details.open = true;
    const y = details.getBoundingClientRect().top + scrollY - 90;
    scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}
