import { BEE } from "./bees";

/**
 * A few bees buzzing around a drawing, the way the opening screen's bees fly (scenes/bees.ts): each
 * hovers near a spot with a small jitter and now and then darts to a new one. They stay inside `stage`
 * and off everything `avoid` matches, so they never cover the drawing's text. They fly only while the
 * stage is on screen, and not at all for reduced motion.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Bee {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  jx: number;
  jy: number;
  jit: number;
  wait: number;
  dash: number;
  tilt: number;
  r: number;
}

/** Returns a call that measures again, for when what the bees must avoid moves. */
export function swarm(stage: HTMLElement, colors: string[], avoid: string): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const layer = document.createElement("div");
  layer.className = "cm-swarm";
  layer.setAttribute("aria-hidden", "true");
  stage.appendChild(layer);

  let W = 0;
  let H = 0;
  let zones: DOMRect[] = [];
  const measure = () => {
    const s = stage.getBoundingClientRect();
    W = s.width;
    H = s.height;
    zones = [...stage.querySelectorAll(avoid)].map((e) => {
      const r = e.getBoundingClientRect();
      return new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height);
    });
  };
  const clear = (x: number, y: number, pad: number) =>
    x > pad && x < W - pad && y > pad && y < H - pad &&
    !zones.some((z) => x > z.left - pad && x < z.right + pad && y > z.top - pad && y < z.bottom + pad);
  /** a clear spot near (x, y) if there is one, else anywhere clear */
  const pick = (b: Bee): [number, number] => {
    const pad = b.r + 4;
    for (let i = 0; i < 60; i++) {
      const near = i < 30;
      const x = near ? b.x + rand(-140, 140) : rand(0, W);
      const y = near ? b.y + rand(-90, 90) : rand(0, H);
      if (clear(x, y, pad)) return [x, y];
    }
    return [b.ax, b.ay];
  };

  measure();
  const narrow = W < 560;
  const bees: Bee[] = colors.slice(0, narrow ? Math.ceil(colors.length / 2) : colors.length).map((color) => {
    const el = document.createElement("span");
    el.className = "bee";
    const width = Math.round(rand(narrow ? 16 : 18, narrow ? 22 : 30));
    el.style.width = `${width}px`;
    el.style.color = color;
    el.style.setProperty("--flap", `${-rand(0, 0.28).toFixed(2)}s`);
    el.innerHTML = BEE;
    layer.appendChild(el);
    const b: Bee = { el, x: rand(0, W), y: rand(0, H), vx: 0, vy: 0, ax: 0, ay: 0, jx: 0, jy: 0, jit: 0, wait: rand(0.2, 1.5), dash: 0, tilt: rand(-16, 16), r: width / 2 };
    [b.ax, b.ay] = pick(b);
    [b.x, b.y] = [b.ax, b.ay];
    return b;
  });

  const step = (dt: number) => {
    for (const b of bees) {
      b.jit -= dt;
      if (b.jit <= 0) {
        b.jit = rand(0.05, 0.14);
        b.jx = rand(-3, 3);
        b.jy = rand(-3, 3);
      }
      b.wait -= dt;
      if (b.wait <= 0 || !clear(b.ax, b.ay, b.r + 4)) {
        [b.ax, b.ay] = pick(b);
        b.dash = rand(0.25, 0.45);
        b.wait = Math.random() < 0.3 ? rand(2, 3.4) : rand(0.4, 1.6);
      }
      b.dash -= dt;
      const k = b.dash > 0 ? 110 : 30;
      const c = 2 * Math.sqrt(k) * 0.55;
      b.vx += (k * (b.ax + b.jx - b.x) - c * b.vx) * dt;
      b.vy += (k * (b.ay + b.jy - b.y) - c * b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const lean = Math.max(-28, Math.min(28, b.vx * 0.06));
      b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${(b.tilt + lean).toFixed(1)}deg)`;
    }
  };

  let raf = 0;
  let last = 0;
  let seen = false;
  const frame = (now: number) => {
    step(Math.min(1 / 30, (now - last) / 1000 || 1 / 60));
    last = now;
    raf = seen ? requestAnimationFrame(frame) : 0;
  };
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    if (seen && !raf) {
      measure();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }).observe(stage);
  new ResizeObserver(measure).observe(stage);
  return measure;
}
