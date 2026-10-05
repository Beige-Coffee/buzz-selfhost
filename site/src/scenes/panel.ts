import { DEFAULT_TAG, getValues, isPrivate, npubToHex, onValues, renderTemplates, setValues, applyVisibility, trackOf, type Track, type Values } from "../lib/values";

/** Your values: typed once, filled into every command below. */
export function mountPanel(host: HTMLElement): void {
  const v = getValues();
  host.classList.add("values");
  host.innerHTML = `
    <p class="vl-pick"><span>Running on</span><b data-picked></b><a href="#where">Change</a></p>
    <div class="vl-row">
      <label class="vl-field" data-tracks="vps vps-private own-public own-private railway k8s k8s-private">
        <span><b data-tracks="vps own-public railway k8s">Domain</b><b data-tracks="vps-private own-private k8s-private">Tailscale name</b></span>
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
    host.querySelector<HTMLInputElement>('input[name="domain"]')!.placeholder = isPrivate(t) ? "buzz.your-tailnet.ts.net" : "buzz.example.org";
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
