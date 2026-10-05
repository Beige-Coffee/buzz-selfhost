import { DEFAULT_TAG, getValues, isPrivate, npubToHex, onValues, renderTemplates, setValues, applyVisibility, trackOf, type Track, type Values } from "../lib/values";

/** Your values: typed once, filled into every command below. */
export function mountPanel(host: HTMLElement): void {
  const v = getValues();
  host.classList.add("values");
  host.innerHTML = `
    <p class="vl-pick"><span>Running on</span><b data-picked></b><a href="#where">Change</a></p>
    <div class="vl-row">
      <label class="vl-field" data-tracks="vps vps-private own-public own-private railway k8s k8s-private">
        <span><b data-tracks="vps own-public k8s">Domain</b><b data-tracks="railway">Your domain, optional</b><b data-tracks="vps-private own-private k8s-private">Tailscale name</b></span>
        <input name="domain" placeholder="buzz.example.org" autocomplete="off" spellcheck="false" value="${attr(v.domain)}">
      </label>
      <label class="vl-field">
        <span>Your npub <i data-npub-state></i></span>
        <input name="npub" placeholder="npub1…" autocomplete="off" spellcheck="false" value="${attr(v.npub)}">
      </label>
      <label class="vl-field narrow mode-steps" title="Tested with ${DEFAULT_TAG}. Not every commit on main has an image.">
        <span>Image tag</span>
        <input name="tag" placeholder="${DEFAULT_TAG}" autocomplete="off" spellcheck="false" value="${attr(v.tag)}">
      </label>
    </div>
    <p class="vl-out"><span>Community URL</span><code data-tpl>{{RELAY_URL}}</code></p>`;

  host.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "domain" || t.name === "npub" || t.name === "tag") setValues({ [t.name]: t.value } as Partial<Values>);
  });

  const sync = () => {
    const cur = getValues();
    const t = trackOf();
    host.querySelector<HTMLElement>("[data-picked]")!.innerHTML = PICK[t];
    host.querySelector<HTMLInputElement>('input[name="domain"]')!.placeholder = isPrivate(t) ? "buzz.your-tailnet.ts.net" : t === "railway" ? "Railway names it for you" : "buzz.example.org";
    const state = host.querySelector<HTMLElement>("[data-npub-state]")!;
    const input = host.querySelector<HTMLInputElement>('input[name="npub"]')!;
    const ok = npubToHex(cur.npub);
    state.textContent = !cur.npub.trim() ? "from Buzz Desktop" : ok ? "✓ valid" : "not a valid npub";
    state.className = !cur.npub.trim() ? "" : ok ? "ok" : "bad";
    if (cur.npub.trim() && !ok) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  };
  sync();
  applyVisibility(host);
  renderTemplates(host);
  onValues(sync);
  linkValues(host);
}

/** Which field each filled-in value comes from. A local test's addresses are fixed, not typed. */
const FROM: Record<string, string> = {
  DOMAIN: "domain",
  HOST: "domain",
  RELAY_URL: "domain",
  HTTP_ORIGIN: "domain",
  OWNER_NPUB: "npub",
  OWNER_HEX: "npub",
  TAG: "tag",
  IMAGE: "tag",
  COMMIT: "tag",
};
const fieldFor = (k: string) => (trackOf() === "practice" && FROM[k] === "domain" ? null : (FROM[k] ?? null));

/**
 * Every value filled in from this box, anywhere on the page, points back to it: hovering one lights up
 * its field (and the community URL, for the domain), and clicking one in the text jumps to the field.
 * Commands are left alone on click, so their text can still be selected.
 */
function linkValues(panel: HTMLElement): void {
  const label = (f: string) => panel.querySelector<HTMLInputElement>(`input[name="${f}"]`)?.closest<HTMLElement>(".vl-field") ?? null;
  const NAME: Record<string, string> = { domain: "Domain", npub: "Your npub", tag: "Image tag" };
  let lit: HTMLElement[] = [];
  const clear = () => {
    lit.forEach((el) => el.classList.remove("linked"));
    lit = [];
  };
  // values in running text jump to their field; values in commands stay selectable
  const clickable = (v: HTMLElement) => v.tagName === "SPAN" && !v.closest("pre, code, a, button");
  const valueAt = (t: EventTarget | null) => {
    const v = (t as HTMLElement | null)?.closest?.<HTMLElement>("[data-k]");
    return v && !panel.contains(v) ? v : null;
  };

  document.addEventListener("mouseover", (e) => {
    const v = valueAt(e.target);
    clear();
    const f = v && fieldFor(v.dataset.k!);
    const field = f ? label(f) : null;
    if (!v || !f || !field || !field.offsetParent) return;
    lit = [v, field];
    if (f === "domain") lit.push(...panel.querySelectorAll<HTMLElement>(".vl-out"));
    lit.forEach((el) => el.classList.add("linked"));
    if (!v.title) v.title = `From ${NAME[f]}, in the Running on box${clickable(v) ? ". Click to change it." : "."}`;
  });

  document.addEventListener("click", (e) => {
    const v = valueAt(e.target);
    if (!v || !clickable(v)) return;
    const f = fieldFor(v.dataset.k!);
    const input = f ? panel.querySelector<HTMLInputElement>(`input[name="${f}"]`) : null;
    if (!input || !input.offsetParent) return;
    const r = input.getBoundingClientRect();
    if (r.top < 80 || r.bottom > innerHeight) scrollTo({ top: r.top + scrollY - 140, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    input.focus({ preventScroll: true });
    input.select();
  });
}

const PICK: Record<Track, string> = {
  vps: "A VPS, on the internet",
  "vps-private": "A VPS, on a private network",
  railway: "Railway",
  "own-public": "Your hardware, on the internet",
  "own-private": "Your hardware, on a private network",
  practice: "Your laptop, to practice",
  k8s: "Kubernetes, on the internet",
  "k8s-private": "Kubernetes, on a private network",
};

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
