import { FIXES, STEPS, type StepDef } from "../data/steps";
import { fill, fillRich, onValues, renderTemplates, stepHash, trackOf, type Track } from "../lib/values";
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

/** The guide's steps as a timeline. Click a step's number to mark it done. */
export function mountSetup(host: HTMLElement): void {
  const done = loadDone();
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

    host.innerHTML = `
      <div class="tl-progress" aria-live="polite"><i><b></b></i><span></span></div>
      <ol class="tl">${steps.map((s, i) => stepHTML(s, i + 1)).join("")}</ol>
      <details class="tl-fail tl-fixes">
        <summary>If a step fails</summary>
        <dl>${fixes.map((f) => `<dt ${slot(f.symptom, true)}></dt><dd ${slot(f.fix, true)}></dd>`).join("")}</dl>
      </details>`;
    bound = [...host.querySelectorAll<HTMLElement>("[data-slot]")].map((el) => ({ el, slot: slots[Number(el.dataset.slot)] }));
    refill();
    renderTemplates(host);
    enhanceCode(host);
    progress();
  }

  function progress(): void {
    const all = host.querySelectorAll(".tl-step").length;
    const n = host.querySelectorAll(".tl-step.done").length;
    host.querySelector<HTMLElement>(".tl-progress b")!.style.width = `${(100 * n) / Math.max(1, all)}%`;
    host.querySelector<HTMLElement>(".tl-progress span")!.textContent = `${n} of ${all} done`;
  }

  host.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".tl-n");
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

  render();
  onValues(() => (trackOf() !== track ? render() : refill()));
}
