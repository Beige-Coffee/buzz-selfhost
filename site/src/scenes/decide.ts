import { QUESTIONS, RESULTS, pick, type Answers, type QuestionId } from "../data/decide";
import { jumpTo } from "../lib/nav";
import { esc, setValues, trackHash, type Track } from "../lib/values";

/** Answers are kept per viewer, so the panel survives a reload. */
const KEY = "buzz-selfhost-decide-v2";

const load = (): Answers => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Answers;
  } catch {
    return {};
  }
};
const save = (a: Answers) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
};

const ARROW = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Three questions on the left, the setup they pick on the right. Fits one screen. */
export function mountDecide(host: HTMLElement): void {
  let answers = load();

  host.innerHTML = `
    <button type="button" class="dh-open"><i></i>Choose by requirements</button>
    <section class="dh-panel" hidden aria-label="Choose by requirements">
      <div class="dh-top">
        <p class="dh-title">Choose by requirements</p>
        <span class="dh-actions"><button type="button" class="dh-link" data-reset>Start over</button><button type="button" class="dh-link" data-close>Close</button></span>
      </div>
      <div class="dh-grid">
        <ol class="dq">${QUESTIONS.map(
          (q, i) => `<li class="dq-q" data-q="${q.id}">
            <p class="dq-text"><span class="dq-n">${i + 1}</span>${esc(q.text)}</p>
            <div class="dq-opts" role="radiogroup" aria-label="${esc(q.text)}">${q.options
              .map((o) => `<button type="button" role="radio" aria-checked="false" data-opt="${o.id}" data-when="${esc(o.when)}">${esc(o.label)}</button>`)
              .join("")}</div>
            <p class="dq-hint"></p>
          </li>`,
        ).join("")}</ol>
        <div class="dr" aria-live="polite"></div>
      </div>
      <p class="dq-tip" role="tooltip" hidden></p>
    </section>`;

  const open = host.querySelector<HTMLButtonElement>(".dh-open")!;
  const panel = host.querySelector<HTMLElement>(".dh-panel")!;
  const out = host.querySelector<HTMLElement>(".dr")!;
  const tip = host.querySelector<HTMLElement>(".dq-tip")!;

  // "choose this if", above the option under the pointer or keyboard focus, kept inside the panel
  const showTip = (b: HTMLButtonElement) => {
    tip.textContent = b.dataset.when ?? "";
    tip.hidden = false;
    const pr = panel.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const left = Math.max(12, Math.min(br.left - pr.left, pr.width - tip.offsetWidth - 12));
    tip.style.left = `${left}px`;
    tip.style.top = `${br.top - pr.top - 8}px`;
  };
  let tipTimer = 0;
  const hideTip = () => {
    window.clearTimeout(tipTimer);
    tip.hidden = true;
  };
  // phones have no hover: a tap shows the note for a few seconds, and another tap anywhere clears it
  let touch = false;
  panel.addEventListener("pointerdown", (e) => {
    touch = e.pointerType !== "mouse";
    if (touch && !(e.target as HTMLElement).closest("[data-opt]")) hideTip();
  });
  const tapTip = (b: HTMLButtonElement) => {
    if (!touch) return;
    showTip(b);
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(hideTip, 4000);
  };
  panel.addEventListener("pointerover", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-opt]");
    if (b && e.pointerType === "mouse") showTip(b);
  });
  panel.addEventListener("pointerout", (e) => {
    if (e.pointerType === "mouse" && (e.target as HTMLElement).closest("[data-opt]")) hideTip();
  });
  panel.addEventListener("focusin", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-opt]");
    if (b?.matches(":focus-visible")) showTip(b);
  });
  panel.addEventListener("focusout", () => {
    if (!touch) hideTip();
  });

  const render = () => {
    const trial = answers.trial === "trial";
    host.querySelectorAll<HTMLElement>(".dq-q").forEach((el) => {
      const q = QUESTIONS.find((x) => x.id === el.dataset.q)!;
      const chosen = answers[q.id];
      el.classList.toggle("done", !!chosen);
      // a trial needs no server, so the server questions step back
      el.classList.toggle("off", trial && q.id !== "trial");
      el.querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.opt === chosen)));
      el.querySelector<HTMLElement>(".dq-hint")!.innerHTML = q.options.find((o) => o.id === chosen)?.hint ?? q.hint;
    });

    const p = pick(answers);
    if (!p) {
      out.innerHTML = `<p class="dr-wait">Pick one option per row.</p>`;
      return;
    }
    const r = RESULTS[p.track];
    out.innerHTML = `
      <div class="dr-card">
        <p class="dr-k">Recommended</p>
        <p class="dr-name">${esc(r.name)}</p>
        <p class="dr-why">${r.why}</p>
        <p class="dr-h">Tradeoffs</p>
        <ul class="dr-list">${r.trade.map((t) => `<li>${t}</li>`).join("")}</ul>
        ${p.note ? `<p class="dr-note">${p.note}</p>` : ""}
        <button type="button" class="dr-go" data-go="${p.track}">Open this guide${ARROW}</button>
      </div>`;
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".dh-open")) {
      open.hidden = true;
      panel.hidden = false;
      render();
      return;
    }
    if (t.closest("[data-close]")) {
      panel.hidden = true;
      open.hidden = false;
      open.focus();
      return;
    }
    if (t.closest("[data-reset]")) {
      answers = {};
      save(answers);
      render();
      return;
    }
    const b = t.closest<HTMLButtonElement>("[data-opt]");
    if (b) {
      const q = b.closest<HTMLElement>(".dq-q")!.dataset.q as QuestionId;
      if (answers[q] === b.dataset.opt) delete answers[q];
      else answers[q] = b.dataset.opt!;
      tapTip(b);
      // answering a server question means it's for real
      if (q !== "trial" && answers[q] && answers.trial === "trial") answers.trial = "real";
      save(answers);
      render();
      return;
    }
    const go = t.closest<HTMLButtonElement>("[data-go]");
    if (go) {
      const track = go.dataset.go as Track;
      setValues(RESULTS[track].set);
      try {
        history.replaceState(null, "", `#${trackHash(track)}`);
      } catch {
        /* ignore */
      }
      jumpTo("guide");
    }
  });
  render();
}
