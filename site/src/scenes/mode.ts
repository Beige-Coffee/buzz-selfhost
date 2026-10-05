import { getValues, onValues, setValues, type Mode } from "../lib/values";

const NOTES: Record<Mode, string> = {
  agent: "Your agent runs the tested steps and checks, and stops to ask you before anything that costs money or can't be undone.",
  steps: "Every command, with the output to expect and what to do when it differs.",
};

const read = (key: string): Mode | null => {
  try {
    const m = localStorage.getItem(key);
    return m === "agent" || m === "steps" ? m : null;
  } catch {
    return null;
  }
};
const write = (key: string, m: Mode) => {
  try {
    localStorage.setItem(key, m);
  } catch {
    /* ignore */
  }
};

/**
 * The agent / step-by-step switch, for its own section only: switching one section leaves the
 * others alone, so the page above doesn't change length under the reader. The guide keeps its mode
 * in the page's values, which its "How" links and step links set; any other section keeps its own.
 * `data-note` adds the line under it.
 */
export function mountMode(host: HTMLElement): void {
  const section = host.closest<HTMLElement>("section")!;
  const own = section.id !== "guide" ? `buzz-selfhost-mode-${section.id}` : null;
  const get = (): Mode => (own ? (read(own) ?? "agent") : getValues().mode);

  host.classList.add("mode");
  host.innerHTML = `
    <div class="mode-switch" role="group" aria-label="How to do it">
      <button type="button" data-set="agent">With an agent</button>
      <button type="button" data-set="steps">Step by step</button>
    </div>
    ${host.hasAttribute("data-note") ? `<p class="mode-note" aria-live="polite"></p>` : ""}`;

  const apply = () => {
    const m = get();
    section.dataset.mode = m;
    host.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.set === m)));
    const note = host.querySelector<HTMLElement>(".mode-note");
    if (note) note.textContent = NOTES[m];
  };

  host.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-set]");
    if (!b || b.dataset.set === get()) return;
    const m = b.dataset.set as Mode;
    if (own) {
      write(own, m);
      apply();
    } else setValues({ mode: m });
  });
  apply();
  if (!own) onValues(apply);
}
