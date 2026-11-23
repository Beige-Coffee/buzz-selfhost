/**
 * Four ways to set an answer's recommendation apart from its details, on real answers.
 * A dev-only page: Vite serves it at /mockups/rec.html; the production build ignores it.
 * The real FAQ is mounted out of sight, each answer is opened there, and its HTML is regrouped
 * into title, recommendation and details for each variant.
 */
import "@fontsource-variable/inter/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "../src/styles/tokens.css";
import "../src/styles/main.css";
import "../src/styles/overhaul.css";
import "./rec.css";
import { SVG_DEFS } from "../src/defs";
import { initValues } from "../src/lib/values";
import { mountFaq } from "../src/scenes/faq";

document.body.insertAdjacentHTML("afterbegin", SVG_DEFS);
initValues();

// out of sight but laid out, so the click-throughs can measure themselves
const hidden = document.createElement("div");
hidden.setAttribute("aria-hidden", "true");
hidden.style.cssText = "position:absolute;left:-99999px;top:0;width:1100px;";
document.body.append(hidden);
mountFaq(hidden);

interface Parts {
  title: string;
  rec: string;
  rest: string;
}

/** One answer, opened in the hidden FAQ, split into its three parts. */
function parts(id: string): Parts {
  hidden.querySelector<HTMLButtonElement>(`#fq-tab-${id}`)!.click();
  const pane = hidden.querySelector<HTMLElement>("#fq-pane")!.cloneNode(true) as HTMLElement;
  const h = pane.querySelector(".fq-h")!;
  h.querySelector(".hl")?.remove();
  const rec = pane.querySelector(".fq-rec")!;
  const text = rec.querySelector("p")!.innerHTML;
  h.remove();
  rec.remove();
  return { title: h.textContent!.trim(), rec: text, rest: pane.innerHTML };
}

const CHEV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
const split = (label: string) => `<div class="mk-split"><span>${label}</span></div>`;

const VARIANTS: { key: string; name: string; pitch: string; draw: (p: Parts) => string }[] = [
  {
    key: "a",
    name: "The answer as a lead",
    pitch: "No box. The recommendation is the first, larger paragraph under the question, and a labeled rule marks where the details start.",
    draw: (p) => `<h3 class="fq-h">${p.title}</h3><p class="mka-lead">${p.rec}</p>${split("How to do it")}<div class="mk-rest">${p.rest}</div>`,
  },
  {
    key: "b",
    name: "A dark answer card",
    pitch: "The recommendation sits in the site's ink color with the chartreuse label, so it can't read as part of the light cards below it.",
    draw: (p) =>
      `<h3 class="fq-h">${p.title}</h3><div class="mkb-card"><b>Recommended</b><p>${p.rec}</p></div>${split("How to do it")}<div class="mk-rest">${p.rest}</div>`,
  },
  {
    key: "c",
    name: "Details on request",
    pitch: "Only the question and the recommendation show. The details open under a button, so the short answer stands alone until someone wants more.",
    draw: (p) =>
      `<h3 class="fq-h">${p.title}</h3><p class="mkc-lead">${p.rec}</p><button type="button" class="mkc-more" aria-expanded="false"><span>Show how</span>${CHEV}</button><div class="mk-rest mkc-rest" hidden>${p.rest}</div>`,
  },
  {
    key: "d",
    name: "A header band",
    pitch: "The question and its recommendation share a tinted band across the top of the answer. The details start on white below it.",
    draw: (p) =>
      `<div class="mkd-band"><h3 class="fq-h">${p.title}</h3><p class="mkd-rec"><b>Recommended</b>${p.rec}</p></div><div class="mk-rest">${p.rest}</div>`,
  },
];

const list = document.querySelector<HTMLElement>(".mk-list")!;
const draw = (id: string) => {
  const p = parts(id);
  list.innerHTML = VARIANTS.map(
    (v, i) => `<section class="mk-v">
      <div class="mk-head"><span class="mk-letter">${String.fromCharCode(65 + i)}</span><div><h2>${v.name}</h2><p class="mk-pitch">${v.pitch}</p></div></div>
      <div class="mk-frame mk-${v.key}"><div class="fq-pane">${v.draw(p)}</div></div>
    </section>`,
  ).join("");
};

document.querySelector(".mk-seg")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-mq]");
  if (!b) return;
  document.querySelectorAll(".mk-seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  draw(b.dataset.mq!);
});
list.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".mkc-more");
  if (!b) return;
  const open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open));
  b.querySelector("span")!.textContent = open ? "Hide" : "Show how";
  (b.nextElementSibling as HTMLElement).hidden = !open;
});
draw("add");
