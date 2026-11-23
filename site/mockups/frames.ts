/**
 * Every click-through frame on one page, at full size, to compare with screenshots of the real app.
 * A dev-only page: Vite serves it at /mockups/frames.html; the production build ignores it.
 */
import "@fontsource-variable/inter/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../src/styles/tokens.css";
import "../src/styles/main.css";
import "../src/styles/overhaul.css";
import { SVG_DEFS } from "../src/defs";
import { peopleFlows, type Flow } from "../src/scenes/members";
import { identityFlows, lostFlows, pairFlows } from "../src/scenes/identity";
import { agentFlows, harnessFlows, remoteFlows } from "../src/scenes/agentflow";
import { moderationFlows } from "../src/scenes/moderation";

document.body.insertAdjacentHTML("afterbegin", SVG_DEFS);
const sets: [string, Flow[]][] = [
  ["people", peopleFlows("1 day", "5")],
  ["identity", identityFlows],
  ["lost", lostFlows],
  ["pair", pairFlows],
  ["agents", agentFlows],
  ["harness", harnessFlows],
  ["moderate", moderationFlows],
  ["remote", remoteFlows],
];
document.querySelector(".fr-page")!.innerHTML = sets
  .flatMap(([set, flows]) =>
    flows.flatMap((f) =>
      f.steps.map(
        (s, i) => `<section class="fr" id="${set}-${f.id}-${i + 1}"><p class="fr-k">${set} · ${f.label} · ${i + 1}. ${s.k}</p><div class="mb"><div class="mb-stage" style="--s:1;width:560px"><div class="mb-canvas" style="left:0">${s.frame}</div></div></div></section>`,
      ),
    ),
  )
  .join("");
document.head.insertAdjacentHTML("beforeend", `<style>.fr-page{display:grid;gap:28px;padding:24px}.fr-k{margin:0 0 6px;font:500 13px var(--mono)}</style>`);
