import { bee } from "../defs";

/** A small Buzz Desktop window: sidebar, #release, three messages, the composer. Illustrative content. */
export function buzzAppHTML(): string {
  return `
<div class="bz-app" aria-label="A Buzz channel, illustrated">
  <div class="bz-bar" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="bz-body">
    <aside class="bz-side">
      <div class="bz-comm">${bee('class="bz-bee"')}<b>Your team</b></div>
      <div class="bz-sec">Channels</div>
      <div class="bz-ch"><span>#</span> general</div>
      <div class="bz-ch on"><span>#</span> release</div>
      <div class="bz-ch"><span>#</span> design</div>
      <div class="bz-sec">Agents</div>
      <div class="bz-ch"><span class="dot"></span> Ops</div>
    </aside>
    <section class="bz-main">
      <div class="bz-head"><b># release</b><span>4 members · 1 agent</span></div>
      <div class="bz-msgs">
        <div class="bz-msg"><i class="av a1">M</i><div><b>Maya</b><time>10:02</time><p>Build 0.9 is green on CI.</p></div></div>
        <div class="bz-msg"><i class="av bot">O</i><div><b>Ops</b><em class="tag">agent</em><time>10:03</time><p>Drafted the changelog from 4 merged PRs.</p></div></div>
        <div class="bz-msg bz-new"><i class="av you">Y</i><div><b>you</b><time>10:05</time><p>Release is Friday. Notes in the thread.</p></div></div>
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
