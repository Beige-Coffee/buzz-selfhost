import { OPS } from "../data/steps";
import { enhanceCode } from "../lib/code";
import { fillRich, onValues, trackOf, type Track } from "../lib/values";

/** An operations card's step-by-step half: operations.md's tasks for this setup, as the skill writes them. */
export function mountOps(host: HTMLElement): void {
  const kinds = (host.dataset.ops ?? "").split(" ");
  let track: Track = trackOf();
  let items: { el: HTMLElement; html: string }[] = [];

  const fill = () => {
    items.forEach(({ el, html }) => (el.innerHTML = fillRich(html)));
    enhanceCode(host);
  };
  const render = () => {
    track = trackOf();
    const ops = OPS.filter((o) => kinds.includes(o.kind) && o.tracks.includes(track));
    host.innerHTML = ops.map((o) => `<details class="more"><summary>${o.title}</summary><div class="tl-md op-md"></div></details>`).join("");
    items = [...host.querySelectorAll<HTMLElement>(".op-md")].map((el, i) => ({ el, html: ops[i].html }));
    fill();
  };

  render();
  onValues(() => (trackOf() !== track ? render() : fill()));
}
