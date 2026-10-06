import { buzzAppHTML } from "./buzzapp";

/**
 * The opening story: one pinned drawing, short text steps scrolling past it.
 * Each step's data-state drives the drawing. Scroll is only observed, never hijacked.
 */
/**
 * The relay, drawn as a stack of its parts: one layer each, top to bottom. Isometric, in SVG units:
 * a layer's top face is a rhombus W wide and H tall at its centre line, T thick. Stacked tight it reads as
 * one machine; in step 04 the layers lift apart and say what they are.
 */
const LAYERS: { name: string; is: string; holds: string }[] = [
  { name: "relay", is: "Buzz server, in Rust", holds: "checks members, delivers" },
  { name: "Postgres", is: "database", holds: "messages, channels, members" },
  { name: "MinIO", is: "file storage (S3)", holds: "uploaded images and files" },
  { name: "git", is: "git repositories", holds: "code pushed to the relay" },
  { name: ".env", is: "settings file", holds: "relay key, passwords" },
  { name: "Redis", is: "in-memory cache", holds: "who's online, typing" },
];
const CX = 100;
const W = 86.6;
const H = 50;
const T = 11;
const layer = (i: number) => {
  const l = LAYERS[i];
  // the top layer carries the bee, laid flat on its face
  const mark = i === 0 ? `<use class="rs-mark" href="#bee" x="-25" y="-16.5" width="50" height="33" transform="matrix(0.866 0.5 -0.866 0.5 ${CX} 0)"/>` : "";
  const x = CX + W + 22;
  return `<g class="rs-l rs-l${i}" style="--yc:${131.5 + 14 * i}; --ye:${56 + 52 * i}">
    <polygon class="rs-side" points="${CX - W},0 ${CX},${H} ${CX + W},0 ${CX + W},${T} ${CX},${H + T} ${CX - W},${T}"/>
    <path class="rs-edge" d="M${CX} ${H}V${H + T}"/>
    <polygon class="rs-top" points="${CX},${-H} ${CX + W},0 ${CX},${H} ${CX - W},0"/>
    ${mark}
    <g class="rs-lbl"><path d="M${CX + W + 5} -4H${CX + W + 15}"/><text x="${x}" y="-4">${l.name}</text><text class="d" x="${x}" y="10">${l.is}</text><text class="d" x="${x}" y="23">${l.holds}</text></g>
  </g>`;
};
const YOURS = `<svg class="rs-svg" viewBox="0 0 290 380" aria-hidden="true">
  <g class="rs-floor" transform="translate(0 218)"><polygon points="${CX},-63 ${CX + 110},0 ${CX},63 ${CX - 110},0"/></g>
  ${[5, 4, 3, 2, 1, 0].map(layer).join("")}
</svg>`;

/**
 * Block's relay: a walled yard of identical stacks, each with Block's mark. Drawn around the yard floor's
 * centre at (150, 108) in a 300 x 210 box.
 */
const K = 0.38; // a stack in the yard, against yours at full size
const SX = 44.4; // one slot along an isometric axis, on screen
const SY = 25.65;
const A = 84.3; // the yard's half-size along each axis
const YW = 1.732 * A; // its half-width on screen
const WALL = 10;
const unitOf = (id: string, mark: boolean) => `<g id="${id}" stroke="#231e1e" stroke-opacity="0.34" stroke-width="2.1" stroke-linejoin="round">${[5, 4, 3, 2, 1, 0]
  .map(
    (i) => `<g transform="translate(0 ${131.5 + 14 * i})">
      <polygon fill="#e4e4dd" points="${CX - W},0 ${CX},${H} ${CX + W},0 ${CX + W},${T} ${CX},${H + T} ${CX - W},${T}"/>
      <path d="M${CX} ${H}V${H + T}"/>
      <polygon fill="#f3f3ef" points="${CX},${-H} ${CX + W},0 ${CX},${H} ${CX - W},0"/>
      ${i === 0 && mark ? `<g transform="matrix(0.866 0.5 -0.866 0.5 ${CX} 0)" color="#231e1e" stroke="none"><use href="#block-mark" x="-15" y="-15" width="30" height="30"/></g>` : ""}
    </g>`,
  )
  .join("")}</g>`;
const unit = unitOf("rs-unit", true) + unitOf("rs-unit-plain", false);
// back to front, so nearer stacks cover farther ones
const SLOTS: [number, number][] = [[-1, -1], [-1, 0], [0, -1], [-1, 1], [0, 0], [1, -1], [0, 1], [1, 0], [1, 1]];
const quad = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");
// a message lands on the middle stack: its top face, lit for a moment
const LIT = quad([[0, -32.9 - 19], [32.9, -32.9], [0, -32.9 + 19], [-32.9, -32.9]]);
const BLOCKS = `<svg class="rs-svg" viewBox="0 0 300 210" aria-hidden="true">
  <defs>${unit}</defs>
  <g transform="translate(150 108)">
    <g class="rs-yard">
      <polygon class="rs-y-slab" points="${quad([[-YW, 0], [0, A], [YW, 0], [YW, 8], [0, A + 8], [-YW, 8]])}"/>
      <polygon class="rs-y-floor" points="${quad([[-YW, 0], [0, -A], [YW, 0], [0, A]])}"/>
      <polygon class="rs-y-in" points="${quad([[-YW, 0], [0, -A], [0, -A - WALL], [-YW, -WALL]])}"/>
      <polygon class="rs-y-in" points="${quad([[0, -A], [YW, 0], [YW, -WALL], [0, -A - WALL]])}"/>
    </g>
    ${SLOTS.map(
      ([i, j]) =>
        // the middle stack comes first, where the one relay lands; the ring follows, nearest first
        `<g class="rs-slot${i === 0 && j === 0 ? " rs-mid" : ""}" style="--i:${i === 0 && j === 0 ? 0 : 1 + Math.abs(i) + Math.abs(j) + (i + j + 2) / 10}"><use href="#rs-unit" transform="translate(${(i - j) * SX} ${(i + j) * SY}) scale(${K}) translate(-100 -218)"/></g>${i === 0 && j === 0 ? `<polygon class="rs-lit" points="${LIT}"/>` : ""}`,
    ).join("")}
    <g class="rs-yard">
      <polygon class="rs-y-out" points="${quad([[-YW, 0], [0, A], [0, A - WALL], [-YW, -WALL]])}"/>
      <polygon class="rs-y-out" points="${quad([[0, A], [YW, 0], [YW, -WALL], [0, A - WALL]])}"/>
    </g>
  </g>
</svg>`;

const folder = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.6 1.6h5.8a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="currentColor"/></svg>`;

const tree = (root: string, rows: [string, string][]) => `
  <div class="tr-head"><span class="tr-dot"></span>${root}</div>
  <ul>${rows.map(([n, d], i) => `<li style="--i:${i}">${folder}<b>${n}</b><span>${d}</span></li>`).join("")}</ul>`;

const LINES: [string, string][] = [
  ["git clone https://github.com/block/buzz", ""],
  ["cd buzz/deploy/compose", ""],
  ["cp .env.example .env", ""],
  ["./run.sh start", ""],
];
const CHAR_MS = 10;
/* Each character is its own span with a reveal delay, so the final frame always shows the full line. */
const TERM = (() => {
  const escChar = (c: string) => (c === "<" ? "&lt;" : c === "&" ? "&amp;" : c);
  const chars = (segs: [string, string][]) => {
    let k = 0;
    return segs
      .map(([text, cls]) => [...text].map((c) => `<span class="ch${cls ? ` ${cls}` : ""}" style="--k:${k++}">${escChar(c)}</span>`).join(""))
      .join("");
  };
  let t = 100;
  const out = LINES.map(([cmd, comment]) => {
    const segs: [string, string][] = [["$", "p"], [" " + cmd, ""]];
    if (comment) segs.push([comment, "c"]);
    const n = 2 + cmd.length + comment.length;
    const line = `<span class="tl" style="--d:${t}ms">${chars(segs)}</span>`;
    t += n * CHAR_MS + 120;
    return line;
  });
  out.push(`<span class="tl" style="--d:${t}ms">${chars([["$", "p"], [" ", ""]])}<span class="cur"></span></span>`);
  return out.join("");
})();

export function mountStory(section: HTMLElement): void {
  const stage = section.querySelector<HTMLElement>(".story-stage")!;
  stage.innerHTML = `
    <div class="sg-frame">
      <div class="sg-inner">
        <div class="sg-app">${buzzAppHTML()}</div>
        <div class="sg-wire" aria-hidden="true"><span class="sg-packet"></span></div>
        <div class="sg-relay">
          <div class="rs-v rs-one">
            <div class="rs-art"><svg class="rs-svg" viewBox="0 70 200 200" aria-hidden="true"><use href="#rs-unit-plain"/></svg></div>
            <p class="rs-cap"><b>A relay</b><span>a community's server</span></p>
          </div>
          <div class="rs-v rs-block">
            <div class="rs-art">${BLOCKS}</div>
            <p class="rs-cap"><b>Block's relay</b><span>yourteam.communities.buzz.xyz</span></p>
          </div>
          <div class="rs-v rs-mine">
            <div class="rs-art">${YOURS}</div>
            <p class="rs-cap"><b>Your relay</b><span>buzz.yourteam.org</span></p>
          </div>
        </div>
        <div class="sg-tree sg-tree-repo">${tree("github.com/block/buzz", [
          ["desktop/", "Buzz Desktop, the app you saw"],
          ["mobile/", "the phone apps"],
          ["crates/", "the relay and its tools, in Rust"],
          ["deploy/", "what you run on a server"],
          ["docs/", "specs and guides"],
        ])}</div>
        <div class="sg-term">
          <div class="tm-bar"><i></i><i></i><i></i><span>your machine</span></div>
          <pre>${TERM}</pre>
        </div>
      </div>
    </div>`;

  const frame = stage.querySelector<HTMLElement>(".sg-frame")!;
  const inner = stage.querySelector<HTMLElement>(".sg-inner")!;
  const wire = stage.querySelector<HTMLElement>(".sg-wire")!;

  /* Scale a fixed-size drawing to the frame, like an SVG viewBox. Tall frames get the portrait layout. */
  const fit = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    const portrait = w / Math.max(1, h) < 1.3;
    inner.classList.toggle("portrait", portrait);
    const [dw, dh] = portrait ? [640, 700] : [1000, 580];
    inner.style.setProperty("--s", String(Math.min(w / dw, h / dh)));
  };
  new ResizeObserver(fit).observe(frame);
  fit();

  let current = "";
  let landed = 0;
  const apply = (state: string) => {
    if (state === current) return;
    const prev = current;
    current = state;
    stage.dataset.state = state;
    window.clearTimeout(landed);
    stage.classList.remove("ping");
    wire.classList.remove("go");
    if ((state === "hosted" || state === "self") && prev !== "inside") {
      // on the way to your relay, wait for it to slide in before the message goes
      const wait = state === "self" ? 550 : 200;
      wire.style.setProperty("--wait", `${wait}ms`);
      void wire.offsetWidth;
      wire.classList.add("go");
      // the message lands on top, then settles into storage
      landed = window.setTimeout(() => stage.classList.add("ping"), wait + 800);
    }
  };

  const steps = [...section.querySelectorAll<HTMLElement>(".story-step")];
  const narrow = window.matchMedia("(max-width: 899px)");

  // Wide screens: the picture stays pinned while the steps scroll past it.
  let io: IntersectionObserver | undefined;
  const watch = () => {
    io?.disconnect();
    io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          steps.forEach((s) => s.classList.toggle("on", s === e.target));
          apply((e.target as HTMLElement).dataset.state!);
        }),
      { rootMargin: "-45% 0px -54% 0px" },
    );
    steps.forEach((s) => io!.observe(s));
  };

  // Phones: a pinned picture leaves too little room for the text, so the story taps through instead.
  // The buttons sit right under the picture, where they stay put as the text below changes length.
  const nav = document.createElement("div");
  nav.className = "story-nav";
  nav.innerHTML = `<button type="button" class="sn-prev">Back</button>
    <span class="sn-dots">${steps.map((_, i) => `<button type="button" data-i="${i}" aria-label="Step ${i + 1}"></button>`).join("")}</span>
    <button type="button" class="sn-next">Next</button>`;
  section.insertBefore(nav, section.querySelector(".story-steps"));
  const prev = nav.querySelector<HTMLButtonElement>(".sn-prev")!;
  const next = nav.querySelector<HTMLButtonElement>(".sn-next")!;
  const dots = [...nav.querySelectorAll<HTMLButtonElement>(".sn-dots button")];
  let at = 0;
  const show = (i: number) => {
    at = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, j) => s.classList.toggle("on", j === at));
    dots.forEach((d, j) => d.setAttribute("aria-current", String(j === at)));
    prev.disabled = at === 0;
    next.textContent = at === steps.length - 1 ? "Where to run it" : "Next";
    apply(steps[at].dataset.state!);
  };
  nav.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b === prev) show(at - 1);
    else if (b === next) at === steps.length - 1 ? document.getElementById("where")?.scrollIntoView({ behavior: "smooth" }) : show(at + 1);
    else show(Number(b.dataset.i));
  });
  // a swipe across the picture turns the page
  let x0 = 0;
  let y0 = 0;
  stage.addEventListener("touchstart", (e) => ([x0, y0] = [e.touches[0].clientX, e.touches[0].clientY]), { passive: true });
  stage.addEventListener(
    "touchend",
    (e) => {
      if (!narrow.matches) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );

  const layout = () => {
    section.classList.toggle("stepper", narrow.matches);
    if (narrow.matches) {
      io?.disconnect();
      show(at);
    } else watch();
  };
  narrow.addEventListener("change", layout);
  steps[0].classList.add("on");
  apply(steps[0].dataset.state!);
  layout();
}
