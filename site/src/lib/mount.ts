import { mountStory } from "../scenes/story";
import { mountPaths } from "../scenes/paths";
import { mountPanel } from "../scenes/panel";
import { mountSetup } from "../scenes/setup";
import { mountPractices } from "../scenes/practices";
import { mountMode } from "../scenes/mode";
import { mountAgent, mountAsks } from "../scenes/agent";
import { mountOps } from "../scenes/ops";
import { mountRelayKey } from "../scenes/relaykey";

const registry: Record<string, (el: HTMLElement) => void> = {
  story: mountStory,
  paths: mountPaths,
  panel: mountPanel,
  setup: mountSetup,
  practices: mountPractices,
  mode: mountMode,
  agent: mountAgent,
  asks: mountAsks,
  ops: mountOps,
  relaykey: mountRelayKey,
};

export function mountWidgets(): void {
  document.querySelectorAll<HTMLElement>("[data-widget]").forEach((el) => {
    const mount = registry[el.dataset.widget ?? ""];
    if (mount) mount(el);
  });
}

/** The slim header: reading progress. */
export function mountHeader(): void {
  const bar = document.querySelector<HTMLElement>(".hd-progress i");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    document.body.classList.toggle("scrolled", scrollY > 8);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/** Fade sections in as they arrive. */
export function mountReveal(): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = document.querySelectorAll<HTMLElement>(".reveal");
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -12% 0px" },
  );
  els.forEach((el) => io.observe(el));
  document.body.classList.add("reveal-on");
}
