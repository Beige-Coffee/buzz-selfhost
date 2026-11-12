import { FIXES, STEPS, type StepDef } from "../data/steps";
import { fill, fillRich, getValues, setValues, onValues, renderTemplates, stepHash, trackOf, type Track } from "../lib/values";
import { linkButton } from "../lib/permalink";
import { enhanceCode } from "../lib/code";
import { joinMockHTML } from "./joinmock";

const DONE_KEY = "buzz-selfhost-done-v1";

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveDone(s: Set<string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

interface Slot {
  tpl: string;
  rich: boolean;
}

/**
 * The guide's steps as a timeline. Click a step's number to mark it done.
 *
 * The steps fold as one, so nobody scrolls the whole list to get past it. While they are open, a
 * small "Collapse steps" pill floats at the foot of the screen and comes to rest after the last
 * step. Collapsed, one line where they were brings them back.
 */
const UP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>`;

export function mountSetup(host: HTMLElement): void {
  const done = loadDone();
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

    const stepHTML = (s: StepDef, n: number): string => {
      const isDone = done.has(`${track}:${s.id}`);
      return `<li class="tl-step${isDone ? " done" : ""}" id="step-${s.id}">
        <button type="button" class="tl-n" data-done="${s.id}" aria-pressed="${isDone}" aria-label="Mark step ${n} done"><span>${n}</span></button>
        <div class="tl-body">
          <h3>${s.title}${s.badge ? ` <span class="badge">${s.badge}</span>` : ""}${linkButton(stepHash(track, s.id), `Copy a link to step ${n}`)}</h3>
          <div class="tl-md" ${slot(s.html, true)}></div>
          ${s.joinMock ? joinMockHTML() : ""}
        </div>
      </li>`;
    };
    const fixes = FIXES.filter((f) => f.tracks.includes(track));

    // The fold is a <details> so that a link to a step, or the browser's own find, opens it. Its
    // summary is never shown: the pill and the line are its controls. The pill comes first for the
    // keyboard and is drawn last, where it can stay at the foot of the screen.
    host.innerHTML = `
      <p class="setup-see tl-shown" hidden><button type="button" class="tl-show" aria-expanded="false" aria-controls="tl-steps">Show the ${steps.length} steps</button><span class="tl-count"></span></p>
      <details class="tl-all" id="tl-steps" open>
        <summary>Steps</summary>
        <div class="tl-in">
          <p class="tl-foot"><button type="button" class="tl-fold" aria-expanded="true" aria-controls="tl-steps">${UP}Collapse steps</button></p>
          <p class="sr tl-live" aria-live="polite"></p>
          <ol class="tl">${steps.map((s, i) => stepHTML(s, i + 1)).join("")}</ol>
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
    progress();
    all().addEventListener("toggle", folded);
    folded();
  }

  /** How many steps are ticked: said aloud as it changes, and shown on the collapsed line once there is something to show. */
  function progress(): void {
    const total = host.querySelectorAll(".tl-all .tl-step").length;
    const n = host.querySelectorAll(".tl-all .tl-step.done").length;
    host.querySelector<HTMLElement>(".tl-live")!.textContent = `${n} of ${total} done`;
    host.querySelector<HTMLElement>(".tl-count")!.textContent = n ? `${n} of ${total} done` : "";
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
      return;
    }
    const b = t.closest<HTMLButtonElement>(".tl-n");
    if (!b) return;
    const key = `${track}:${b.dataset.done}`;
    const now = !done.has(key);
    if (now) done.add(key);
    else done.delete(key);
    b.setAttribute("aria-pressed", String(now));
    b.closest(".tl-step")!.classList.toggle("done", now);
    saveDone(done);
    progress();
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
