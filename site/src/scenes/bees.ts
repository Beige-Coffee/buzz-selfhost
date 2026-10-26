/**
 * Bees on the opening screen. Each one hovers near its spot with a buzzing jitter and darts off in short
 * bursts, the way bees fly. They never stop on the opening screen's text or the header: a spot that's
 * covered, or becomes covered as the page scrolls, sends the bee to a clear one. Scrolling toward the story sends them off one by one, up and out of view; by
 * the time the story's drawing fills the screen they're gone, and scrolling back up brings them home.
 * Bee shape and wing beat from Buzz Desktop's FlappingBee (block/buzz, Apache 2.0). Off for reduced motion.
 */

/** x and y as fractions of the viewport, size in px, colour index */
const HOMES: [number, number, number, number][] = [
  [0.06, 0.16, 22, 0], [0.19, 0.09, 17, 1], [0.35, 0.13, 15, 2], [0.53, 0.08, 20, 1],
  [0.71, 0.12, 24, 0], [0.87, 0.18, 18, 3], [0.95, 0.36, 22, 1], [0.8, 0.42, 16, 2],
  [0.91, 0.6, 26, 0], [0.77, 0.74, 18, 1], [0.93, 0.86, 20, 3], [0.6, 0.9, 16, 1],
  [0.4, 0.93, 22, 0], [0.22, 0.86, 18, 1], [0.07, 0.72, 24, 2], [0.04, 0.45, 18, 1],
];
const COLORS = ["#231e1e", "#d7d72e", "#8d8d2c", "#7093cc"];

const BEE = `<span class="bee-sprite">
  <span class="bee-wing-layer bee-wing-layer-left"><svg class="bee-wing bee-wing-left" viewBox="0 0 183.4 183.4"><circle cx="91.7" cy="91.7" r="91.7"/></svg></span>
  <span class="bee-wing-layer bee-wing-layer-right"><svg class="bee-wing bee-wing-right" viewBox="0 0 183.4 183.4"><circle cx="91.7" cy="91.7" r="91.7"/></svg></span>
  <svg class="bee-body" viewBox="0 0 466 309"><rect x="128" y="0" width="210" height="309" rx="34" mask="url(#bee-mask)"/></svg>
</span>`;

type Mode = "in" | "hover" | "out" | "away";

interface Bee {
  el: HTMLElement;
  fx: number;
  fy: number;
  /** home, then the spot it's buzzing around, then where it leaves to; all viewport px */
  hx: number;
  hy: number;
  ax: number;
  ay: number;
  ex: number;
  ey: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  jx: number;
  jy: number;
  mode: Mode;
  /** seconds until the next dart, the next jitter, and the end of a dart */
  wait: number;
  jit: number;
  dash: number;
  /** delay before flying in, s */
  delay: number;
  /** scroll progress, 0 to 1, at which it leaves */
  leaveAt: number;
  tilt: number;
  /** half its width, px: how far it has to stay from text */
  r: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function mountBees(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const story = document.querySelector<HTMLElement>("#how");
  if (!story) return;

  const layer = document.createElement("div");
  layer.className = "bees";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  const narrow = innerWidth < 640;
  // fewer on a phone: they share the screen with scrolling
  const homes = narrow ? HOMES.filter((_, i) => i % 3 === 0) : HOMES;
  let W = innerWidth;
  let H = innerHeight;
  let threshold = 1;
  /** the story's top edge, in page px: bees stay above it */
  let floorDoc = 0;
  /** home y: between the header and the floor at rest */
  const homeY = (fy: number) => 72 + fy * (Math.min(H, floorDoc) - 40 - 72);

  /** the text bees mustn't stop on: line and button boxes in page px, and the header in viewport px */
  const TEXT = ".hero h1, .hero .lede, .hero .hero-cta, .hero .why";
  let zones: DOMRect[] = [];
  let header: DOMRect | null = null;
  const readZones = () => {
    zones = [];
    for (const el of document.querySelectorAll(TEXT)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) if (r.width && r.height) zones.push(new DOMRect(r.left, r.top + scrollY, r.width, r.height));
    }
    header = document.querySelector(".hd")?.getBoundingClientRect() ?? null;
  };

  let pointer: { x: number; y: number } | null = null;
  addEventListener("pointermove", (e) => (pointer = e.pointerType === "mouse" ? { x: e.clientX, y: e.clientY } : null), { passive: true });
  document.addEventListener("pointerleave", () => (pointer = null));

  /** a spot a bee may stop at: on screen, above the story, clear of the text and away from the cursor */
  const clear = (x: number, y: number, pad: number) => {
    if (x < pad || x > W - pad || y > floorDoc - scrollY - 34) return false;
    if (header && y - pad < header.bottom) return false;
    for (const z of zones) {
      const top = z.top - scrollY;
      if (x > z.left - pad && x < z.right + pad && y > top - pad && y < top + z.height + pad) return false;
    }
    return !pointer || Math.hypot(x - pointer.x, y - pointer.y) > 120;
  };
  /** somewhere clear to buzz around: near home if there's room, then farther out; null if there's nowhere */
  const pick = (b: Bee): [number, number] | null => {
    const pad = b.r + 12;
    for (let i = 0; i < 48; i++) {
      const reach = i < 16 ? rand(24, 120) : i < 32 ? rand(120, 340) : rand(0, Math.max(W, H));
      const a = rand(0, Math.PI * 2);
      const x = b.hx + Math.cos(a) * reach;
      const y = b.hy + Math.sin(a) * reach * 0.7;
      if (clear(x, y, pad)) return [x, y];
    }
    return null;
  };

  const exitFor = (b: Bee) => {
    // up and away from the middle; the ones near an edge leave through it
    if (b.fx < 0.12) return [-60, b.hy - rand(40, 160)];
    if (b.fx > 0.88) return [W + 60, b.hy - rand(40, 160)];
    return [b.hx + (b.fx < 0.5 ? -1 : 1) * rand(60, 260), -70 - rand(0, 90)];
  };

  const bees: Bee[] = homes.map(([fx, fy, size, c], i) => {
    const el = document.createElement("span");
    el.className = "bee";
    const width = Math.round(size * (narrow ? 1.1 : 1.4));
    el.style.width = `${width}px`;
    el.style.color = COLORS[c];
    el.style.setProperty("--flap", `${-rand(0, 0.28).toFixed(2)}s`);
    el.innerHTML = BEE;
    layer.appendChild(el);
    const hx = fx * W;
    const hy = fy * H; // replaced by measure()
    const b: Bee = {
      el, fx, fy, hx, hy, ax: hx, ay: hy, ex: 0, ey: 0, x: hx, y: hy, vx: 0, vy: 0, jx: 0, jy: 0,
      mode: "in", wait: rand(0.3, 2), jit: 0, dash: 0, delay: rand(0, 1.1),
      // spread over the first two thirds of the way, so all are gone before the drawing is in full view
      leaveAt: 0.08 + (i / homes.length) * 0.6 + rand(-0.02, 0.02), tilt: rand(-14, 14), r: width / 2,
    };
    [b.ex, b.ey] = exitFor(b);
    // they start out of view and fly in
    b.x = b.ex;
    b.y = b.ey;
    el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) translate(-50%, -50%)`;
    return b;
  });

  const measure = () => {
    W = innerWidth;
    H = innerHeight;
    // fully in view: the story's drawing is pinned under the header
    const top = story.getBoundingClientRect().top + scrollY;
    threshold = Math.max(200, top - 76);
    floorDoc = top - 14;
    readZones();
    bees.forEach((b) => {
      b.hx = b.fx * W;
      b.hy = homeY(b.fy);
      [b.ax, b.ay] = clear(b.hx, b.hy, b.r + 12) ? [b.hx, b.hy] : (pick(b) ?? [b.hx, b.hy]);
      [b.ex, b.ey] = exitFor(b);
    });
  };
  measure();

  const step = (dt: number) => {
    let busy = false;
    const floor = floorDoc - scrollY;
    for (const b of bees) {
      if (b.mode === "away") continue;
      // the story's edge is rising toward it: leave
      if (b.mode !== "out" && b.y > floor - 44 && scrollY > 0) {
        b.mode = "out";
        b.delay = 0;
      }
      busy = true;
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      let tx: number;
      let ty: number;
      let k: number;
      if (b.mode === "out") {
        tx = b.ex;
        ty = b.ey;
        k = 70;
      } else {
        // buzz: a small jitter a few times a second, and now and then a dart to a new spot near home
        b.jit -= dt;
        if (b.jit <= 0) {
          b.jit = rand(0.05, 0.14);
          b.jx = rand(-3.5, 3.5);
          b.jy = rand(-3.5, 3.5);
        }
        b.wait -= dt;
        // a new spot when it's time to dart, or now if text or the cursor has come over this one
        if ((b.mode === "hover" && b.wait <= 0) || !clear(b.ax, b.ay, b.r + 12)) {
          const spot = pick(b);
          if (!spot) {
            // nowhere clear on this screen: fly off until there is
            b.mode = "out";
            continue;
          }
          [b.ax, b.ay] = spot;
          b.dash = rand(0.25, 0.45);
          b.wait = Math.random() < 0.25 ? rand(2.2, 3.6) : rand(0.35, 1.6);
        }
        b.dash -= dt;
        tx = b.ax + b.jx;
        ty = b.ay + b.jy;
        k = b.mode === "in" ? 34 : b.dash > 0 ? 110 : 30;
        ty = Math.min(ty, floor - 34);
      }
      // a lightly damped spring: quick starts, a little overshoot
      const c = 2 * Math.sqrt(k) * 0.55;
      b.vx += (k * (tx - b.x) - c * b.vx) * dt;
      b.vy += (k * (ty - b.y) - c * b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // never below the line: bounce off it
      if (b.y > floor - 24) {
        b.y = floor - 24;
        if (b.vy > 0) b.vy *= -0.3;
      }
      if (b.mode === "in" && Math.hypot(tx - b.x, ty - b.y) < 16) b.mode = "hover";
      if (b.mode === "out" && (b.y < -50 || b.x < -50 || b.x > W + 50)) {
        b.mode = "away";
        b.el.style.visibility = "hidden";
        continue;
      }
      const lean = Math.max(-28, Math.min(28, b.vx * 0.06));
      b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${(b.tilt + lean).toFixed(1)}deg)`;
    }
    return busy;
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    raf = step(dt) ? requestAnimationFrame(frame) : 0;
  };
  const run = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const onScroll = () => {
    const p = scrollY / threshold;
    for (const b of bees) {
      if (p > b.leaveAt && (b.mode === "in" || b.mode === "hover")) {
        b.mode = "out";
        b.delay = 0;
        // a startled jump before the flight out
        b.vy -= rand(120, 260);
      } else if (p <= b.leaveAt - 0.05 && b.hy < floorDoc - scrollY - 60 && (b.mode === "out" || b.mode === "away")) {
        const spot = pick(b);
        if (!spot) continue;
        if (b.mode === "away") {
          b.x = b.ex;
          b.y = b.ey;
          b.vx = 0;
          b.vy = 0;
        }
        b.mode = "in";
        [b.ax, b.ay] = spot;
        b.delay = rand(0, 0.5);
        b.el.style.visibility = "";
      }
    }
    run();
  };

  // opened partway down the page: start with the bees already gone
  const p0 = scrollY / threshold;
  bees.forEach((b) => {
    if (p0 > b.leaveAt) {
      b.mode = "away";
      b.el.style.visibility = "hidden";
    }
  });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => {
    measure();
    run();
  });
  // the line moves while fonts load and the page settles: measure again when it does
  const relayout = () => {
    measure();
    run();
  };
  document.fonts?.ready.then(relayout);
  addEventListener("load", relayout);
  new ResizeObserver(relayout).observe(document.querySelector(".hero") ?? document.body);
  run();

  if (import.meta.env.DEV) (window as unknown as { __bees: unknown }).__bees = { bees, step, onScroll, floor: () => floorDoc, zones: () => zones, clear };
}
