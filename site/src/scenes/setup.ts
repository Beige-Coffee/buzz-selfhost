import { FIXES, STEPS, type StepDef } from "../data/steps";
import { esc, fill, fillRich, getValues, setValues, onValues, renderTemplates, stepHash, trackOf, type Track } from "../lib/values";
import { linkButton } from "../lib/permalink";
import { enhanceCode } from "../lib/code";
import { joinMockHTML } from "./joinmock";

interface Slot {
  tpl: string;
  rich: boolean;
}

/**
 * The guide's steps as a timeline, numbered. Nothing on the page ticks (the owner's call, 2026-11-18).
 *
 * The steps fold as one, so nobody scrolls the whole list to get past it. While they are open, a
 * small "Collapse steps" pill floats at the foot of the screen and comes to rest after the last
 * step. Collapsed, one line where they were brings them back.
 */
const UP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>`;
const CHEV = `<svg class="st-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

/**
 * A step, lighter (the owner's pick of 2026-11-24): its commands stay in view, each under the sentence that
 * leads into it, and every paragraph moves behind Show details, in order. Commands nested in a list stay
 * with their list, in the details.
 *
 * A command's caption is the condition in front of it when there is one ("In `server` and `private`
 * modes, …", "If it lacks one or both, …"), so a command meant for other setups never shows without it
 * (the launch audit of 2026-11-24). Otherwise it's the sentence right before the command. Sentences that
 * start with "Check" close the command before, so they're never a caption. The first command gets a
 * caption only for a condition, since the step's summary already says what it does.
 */
const COND = /^(In|If|On|Only|For|When|Unless|Skip|Without)\b/;
function leadIn(text: string, first: boolean): string | undefined {
  const said = text.trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z`(])/).filter((t) => !/^Check\b/.test(t));
  const cond = [...said].reverse().find((t) => COND.test(t));
  const lead = cond ?? (first ? undefined : said[said.length - 1]);
  return lead && lead.replace(/[^a-z]/gi, "").length >= 12 ? lead : undefined;
}
function splitStep(html: string): { shown: string; details: string } {
  const box = document.createElement("template");
  box.innerHTML = html;
  const kids = [...box.content.childNodes].filter((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? "").trim()) as (Element | Text)[];
  const isCmd = (n: Node | undefined) => n instanceof Element && n.matches("pre.cmd");
  const shown: string[] = [];
  const details: string[] = [];
  kids.forEach((n, i) => {
    const html = n instanceof Element ? n.outerHTML : `<p>${esc(n.textContent ?? "")}</p>`;
    if (isCmd(n)) return void shown.push(html);
    details.push(html);
    if (isCmd(kids[i + 1])) {
      const lead = leadIn(n.textContent ?? "", !shown.length);
      if (lead) shown.push(`<p class="st-cap">${esc(lead)}</p>`);
    }
  });
  return { shown: shown.join(""), details: details.join("") };
}

/**
 * The check step's block has a line for each kind of setup, each named in a comment (SKILL.md section 3).
 * Only the line for the reader's setup shows (the launch audit of 2026-11-24).
 */
const CHECK_LINE: Record<Track, string> = {
  vps: "public server",
  "own-public": "public server",
  "vps-private": "private server",
  "own-private": "private server",
  practice: "local",
  k8s: "Kubernetes",
  "k8s-private": "Kubernetes",
};
function oneCheckLine(html: string, track: Track): string {
  return html.replace(/<pre class="cmd"[^>]*>([\s\S]*?)<\/pre>/, (block, code: string) => {
    const lines = code.split("\n").filter((l) => l.trim());
    const mine = lines.filter((l) => new RegExp(`#\\s*${CHECK_LINE[track]}\\b`).test(l));
    if (mine.length !== 1 || lines.length < 2) return block;
    return block.replace(code, mine[0].replace(/\s+#.*$/, ""));
  });
}

/**
 * Each card shows the skill's own step number (compose.md's 10, 2P; kubernetes.md's P3), so "step 12" in
 * the text points at card 12 (the launch audit of 2026-11-24). The skill's own sections show as S3 and S4,
 * and the runbook and the unnumbered extras show a dot.
 */
function stepLabel(id: string): string {
  const m = id.match(/^(?:compose|kubernetes)-(\d+P?|P\d+)$/);
  if (m) return m[1];
  const sk = id.match(/^skill-(\d+)$/);
  return sk ? `S${sk[1]}` : "·";
}

export function mountSetup(host: HTMLElement): void {
  const guide = document.getElementById("guide")!;
  let track: Track = trackOf();
  let bound: { el: HTMLElement; slot: Slot }[] = [];
  // the steps' commands live inside their HTML, so their copy buttons come back after each fill
  const refill = () => {
    bound.forEach(({ el, slot }) => (el.innerHTML = slot.rich ? fillRich(slot.tpl) : fill(slot.tpl)));
    enhanceCode(host);
  };

  function render(): void {
    track = trackOf();
    const slots: Slot[] = [];
    const slot = (tpl: string, rich: boolean) => {
      slots.push({ tpl, rich });
      return `data-slot="${slots.length - 1}"`;
    };
    const steps = STEPS.filter((s) => s.tracks.includes(track));

    const stepHTML = (s: StepDef): string => {
      const part = splitStep(s.id === "skill-3" ? oneCheckLine(s.html, track) : s.html);
      const n = stepLabel(s.id);
      return `<li class="tl-step" id="step-${s.id}">
        <span class="tl-n${n.length > 2 ? " wide" : ""}" aria-hidden="true"><span>${n}</span></span>
        <div class="tl-body">
          <h3>${s.title}${s.badge ? ` <span class="badge">${s.badge}</span>` : ""}${linkButton(stepHash(track, s.id), n === "·" ? `Copy a link to ${s.title}` : `Copy a link to step ${n}`)}</h3>
          <p class="st-sum">${s.summary}</p>
          ${part.shown ? `<div class="tl-md" ${slot(part.shown, true)}></div>` : ""}
          ${s.joinMock ? joinMockHTML() : ""}
          ${part.details ? `<details class="st-more"><summary>${CHEV}<span class="st-show">Show details</span><span class="st-hide">Hide details</span></summary><div class="tl-md st-rest" ${slot(part.details, true)}></div></details>` : ""}
        </div>
      </li>`;
    };
    const fixes = FIXES.filter((f) => f.tracks.includes(track));

    // The fold is a <details> so that a link to a step, or the browser's own find, opens it. Its
    // summary is never shown: the pill and the line are its controls. The pill comes first for the
    // keyboard and is drawn last, where it can stay at the foot of the screen.
    host.innerHTML = `
      <p class="setup-see tl-shown" hidden><button type="button" class="tl-show" aria-expanded="false" aria-controls="tl-steps">Show the ${steps.length} steps</button></p>
      <details class="tl-all" id="tl-steps" open>
        <summary>Steps</summary>
        <div class="tl-in">
          <p class="tl-foot"><button type="button" class="tl-fold" aria-expanded="true" aria-controls="tl-steps">${UP}Collapse steps</button></p>
          <ol class="tl st">${steps.map((s) => stepHTML(s)).join("")}</ol>
          <details class="tl-fail tl-fixes" id="fixes">
            <summary>If a step fails</summary>
            <dl>${fixes.map((f) => `<dt ${slot(f.symptom, true)}></dt><dd ${slot(f.fix, true)}></dd>`).join("")}</dl>
          </details>
        </div>
      </details>`;
    bound = [...host.querySelectorAll<HTMLElement>("[data-slot]")].map((el) => ({ el, slot: slots[Number(el.dataset.slot)] }));
    refill();
    renderTemplates(host);
    enhanceCode(host);
    all().addEventListener("toggle", folded);
    folded();
  }

  const all = () => host.querySelector<HTMLDetailsElement>(".tl-all")!;
  const line = () => host.querySelector<HTMLElement>(".tl-shown")!;
  // with the steps collapsed, the line stands in for them, and the box of values they are filled from
  // steps aside too (overhaul.css)
  const folded = () => {
    guide.dataset.steps = all().open ? "open" : "closed";
    line().hidden = all().open;
  };
  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".tl-fold")) {
      all().open = false;
      folded();
      // collapsed from deep in the list, the page would be left far below where the steps were: it
      // comes back to the line in the same moment, with what follows the setup in view
      scrollTo({ top: line().getBoundingClientRect().top + scrollY - 190, behavior: "instant" });
      line().querySelector<HTMLElement>(".tl-show")!.focus({ preventScroll: true });
      return;
    }
    if (t.closest(".tl-show")) {
      all().open = true;
      folded();
      host.querySelector<HTMLElement>(".tl-fold")!.focus({ preventScroll: true });
    }
  });

  const updateMode = () => {
    guide.dataset.mode = getValues().mode;
    guide.querySelectorAll<HTMLButtonElement>("[data-setup-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setupMode === getValues().mode)));
  };
  guide.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-setup-mode]");
    if (!button) return;
    setValues({ mode: button.dataset.setupMode === "steps" ? "steps" : "agent" });
    // asking for the steps again shows them, if they were collapsed
    if (button.dataset.setupMode === "steps") all().open = true;
    folded();
  });
  updateMode();
  onValues(updateMode);
  render();
  onValues(() => (trackOf() !== track ? render() : refill()));

  // the skill's links to its steps and fixes (build/skill.ts) open the folds they're in, then land there
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href="#fixes"], a[href="#commands"]');
    const to = a && document.getElementById(a.getAttribute("href")!.slice(1));
    if (!to) return;
    e.preventDefault();
    setValues({ mode: "steps" });
    all().open = true;
    folded();
    for (let d = to.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    scrollTo({ top: to.getBoundingClientRect().top + scrollY - 72, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}
