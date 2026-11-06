import { NOT_COVERED, OWNER, QUESTIONS, SETUPS, dimmed, pick, type Answers, type Outcome, type QuestionId } from "../data/decide";
import { jumpTo } from "../lib/nav";
import { esc, setValues, trackHash, type Track } from "../lib/values";

/** Answers are kept per viewer, so the panel survives a reload. v2 held the three-question quiz's answers. */
const KEY = "buzz-selfhost-decide-v3";
const OLD_KEYS = ["buzz-selfhost-decide-v2"];

/** The saved answers, keeping only options that still exist. */
const load = (): Answers => {
  const a: Answers = {};
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown> | null;
    for (const q of QUESTIONS) {
      const v = raw?.[q.id];
      if (typeof v === "string" && q.options.some((o) => o.id === v)) a[q.id] = v;
    }
  } catch {
    /* storage unavailable or unreadable */
  }
  return a;
};
const save = (a: Answers) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
};

const ARROW = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const go = (track: Track, label: string) => `<button type="button" class="dr-go" data-go="${track}">${label}${ARROW}</button>`;

/** The result card: why it fits, what you need, what you give up and the cost, then the way in. */
function card(o: Outcome): string {
  if (o.kind === "owner")
    return `<div class="dr-card">
      <p class="dr-k">Recommended</p>
      <p class="dr-name">${OWNER.name}</p>
      <p class="dr-why">${OWNER.why}</p>
      <p class="dr-note">${OWNER.hosted}</p>
      <p class="dr-why">${OWNER.test}</p>
      ${go("practice", OWNER.go)}
    </div>`;
  const s = SETUPS[o.track];
  const closest = o.kind === "closest";
  return `<div class="dr-card">
      <p class="dr-k">${closest ? "Not covered here" : "Recommended"}</p>
      <p class="dr-name">${closest ? `Closest: ${s.name}` : s.name}</p>
      <p class="dr-why">${closest ? NOT_COVERED : s.why}</p>
      <dl class="dr-dl">
        <div><dt>You need</dt><dd>${s.need}</dd></div>
        <div><dt>You give up</dt><dd>${s.give}</dd></div>
        <div><dt>Cost a month</dt><dd>${s.cost}</dd></div>
      </dl>
      ${s.note && !closest ? `<p class="dr-note">${s.note}</p>` : ""}
      ${go(o.track, "Open this guide")}
    </div>`;
}

/** What a screen reader hears when the result changes; the card itself is there to read. */
const said = (o: Outcome | null): string => {
  if (!o) return "";
  if (o.kind === "owner") return `Recommended: ${OWNER.name}.`;
  const name = SETUPS[o.track].name;
  return o.kind === "closest" ? `Not covered here. Closest: ${name}.` : `Recommended: ${name}.`;
};

/**
 * Four questions on the left, the result on the right. Fits one screen.
 * Each question is a fieldset of native radios; a question an earlier answer decides is disabled and dimmed.
 */
export function mountDecide(host: HTMLElement): void {
  let answers = load();

  host.innerHTML = `
    <button type="button" class="dh-open"><i></i>Choose by requirements</button>
    <section class="dh-panel" hidden aria-label="Choose by requirements" tabindex="-1">
      <div class="dh-top">
        <p class="dh-title">Choose by requirements</p>
        <span class="dh-actions"><button type="button" class="dh-link" data-reset>Start over</button><button type="button" class="dh-link" data-close>Close</button></span>
      </div>
      <div class="dh-grid">
        <div class="dq">${QUESTIONS.map(
          (q, i) => `<fieldset class="dq-q" data-q="${q.id}" aria-describedby="dq-hint-${q.id}">
            <legend><span class="dq-text"><span class="dq-n">${i + 1}</span>${esc(q.text)}</span></legend>
            <div class="dq-opts">${q.options
              .map(
                (o) => `<label class="dq-opt"><input type="radio" name="dq-${q.id}" value="${o.id}" aria-describedby="dq-when-${q.id}-${o.id}"><span>${esc(o.label)}</span></label><span id="dq-when-${q.id}-${o.id}" hidden>${esc(o.when)}</span>`,
              )
              .join("")}</div>
            <p class="dq-hint" id="dq-hint-${q.id}"></p>
          </fieldset>`,
        ).join("")}</div>
        <div class="dr"></div>
      </div>
      <p class="dr-say" aria-live="polite"></p>
      <p class="dq-tip" aria-hidden="true" hidden></p>
    </section>`;

  const open = host.querySelector<HTMLButtonElement>(".dh-open")!;
  const panel = host.querySelector<HTMLElement>(".dh-panel")!;
  const out = host.querySelector<HTMLElement>(".dr")!;
  const say = host.querySelector<HTMLElement>(".dr-say")!;
  const tip = host.querySelector<HTMLElement>(".dq-tip")!;
  const inputOf = (opt: Element) => opt.querySelector<HTMLInputElement>("input")!;

  // "Pick this if", above the option under the pointer or keyboard focus, kept inside the panel.
  // Screen readers get the same text as each radio's description.
  const showTip = (opt: HTMLElement) => {
    const input = inputOf(opt);
    // a dimmed question's fieldset is disabled, which the input's own disabled property doesn't show
    if (input.matches(":disabled")) return;
    tip.textContent = document.getElementById(input.getAttribute("aria-describedby")!)?.textContent ?? "";
    tip.hidden = false;
    const pr = panel.getBoundingClientRect();
    const br = opt.getBoundingClientRect();
    const left = Math.max(12, Math.min(br.left - pr.left, pr.width - tip.offsetWidth - 12));
    tip.style.left = `${left}px`;
    tip.style.top = `${br.top - pr.top - 8}px`;
  };
  let tipTimer = 0;
  const hideTip = () => {
    window.clearTimeout(tipTimer);
    tip.hidden = true;
  };
  /** Over the note, or the gap between it and its option: it stays, so it can be read up close. */
  const overTip = (e: PointerEvent) => {
    const r = tip.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom + 10;
  };
  // phones have no hover: a tap shows the note for a few seconds, and another tap anywhere clears it
  let touch = false;
  panel.addEventListener("pointerdown", (e) => {
    touch = e.pointerType !== "mouse";
    if (touch && !(e.target as HTMLElement).closest(".dq-opt")) hideTip();
  });
  panel.addEventListener("pointerover", (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLElement>(".dq-opt");
    if (opt && e.pointerType === "mouse") showTip(opt);
  });
  panel.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || tip.hidden || (e.target as HTMLElement).closest(".dq-opt")) return;
    if (!overTip(e)) hideTip();
  });
  panel.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hideTip();
  });
  panel.addEventListener("keydown", (e) => {
    touch = false;
    if (e.key === "Escape") hideTip();
  });
  panel.addEventListener("focusin", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("input[type=radio]:focus-visible")) showTip(t.closest<HTMLElement>(".dq-opt")!);
  });
  panel.addEventListener("focusout", () => {
    if (!touch) hideTip();
  });

  const render = () => {
    const off = dimmed(answers);
    host.querySelectorAll<HTMLFieldSetElement>(".dq-q").forEach((fs) => {
      const q = QUESTIONS.find((x) => x.id === fs.dataset.q)!;
      const chosen = answers[q.id];
      const dim = off.includes(q.id);
      fs.disabled = dim;
      fs.classList.toggle("off", dim);
      fs.classList.toggle("done", !!chosen && !dim);
      fs.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = i.value === chosen));
      fs.querySelector<HTMLElement>(".dq-hint")!.innerHTML = q.options.find((o) => o.id === chosen)?.hint ?? q.hint;
    });

    const o = pick(answers);
    out.innerHTML = o ? card(o) : `<p class="dr-wait">Pick one option per row.</p>`;
    const line = said(o);
    if (say.textContent !== line) say.textContent = line;
  };

  host.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type !== "radio") return;
    const q = input.closest<HTMLElement>(".dq-q")!.dataset.q as QuestionId;
    answers[q] = input.value;
    save(answers);
    render();
  });

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".dh-open")) {
      open.hidden = true;
      panel.hidden = false;
      render();
      panel.focus();
      return;
    }
    if (t.closest("[data-close]")) {
      hideTip();
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
    const opt = t.closest<HTMLElement>(".dq-opt");
    if (opt && touch) {
      showTip(opt);
      window.clearTimeout(tipTimer);
      tipTimer = window.setTimeout(hideTip, 4000);
      return;
    }
    const to = t.closest<HTMLButtonElement>("[data-go]");
    if (to) {
      const track = to.dataset.go as Track;
      setValues(SETUPS[track].set);
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
