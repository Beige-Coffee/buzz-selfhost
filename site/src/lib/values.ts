/**
 * The reader's choices and values. The path picked in section 3 decides which
 * guide the rest of the page shows; the values fill every command.
 * Nothing secret is entered here: keys are generated where the relay runs.
 */
export type Path = "vps" | "railway" | "own" | "k8s";
export type OwnMode = "public" | "practice";
/** Who can reach a server you run: anyone on the internet (members only), or only devices on a private network. */
export type Reach = "public" | "private";
/** A path, narrowed: a server is public or on a private network (Tailscale); own hardware can also be practice. */
export type Track = "vps" | "vps-private" | "railway" | "own-public" | "own-private" | "practice" | "k8s" | "k8s-private";
/** How the reader sets it up: an agent runs the skill, or they follow the steps by hand. */
export type Mode = "agent" | "steps";

export interface Values {
  path: Path;
  ownMode: OwnMode;
  reach: Reach;
  domain: string;
  npub: string;
  tag: string;
  mode: Mode;
}

/** The image every setup was last tested on (2026-10-01). Not every main commit gets an image. */
export const DEFAULT_TAG = "sha-d1b7da4";
const OLD_DEFAULT_TAGS = ["sha-53a1210", "sha-83aab8c"];
const KEY = "buzz-selfhost-values-v2";
const DEFAULTS: Values = { path: "vps", ownMode: "public", reach: "public", domain: "", npub: "", tag: "", mode: "agent" };
const PATHS: Path[] = ["vps", "railway", "own", "k8s"];

let state: Values = load();
const listeners = new Set<() => void>();

function load(): Values {
  let v: Values = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) v = { ...v, ...(JSON.parse(raw) as Partial<Values>) };
  } catch {
    /* storage unavailable */
  }
  // earlier versions saved their default tag even when nobody typed one; let the current default apply
  if (OLD_DEFAULT_TAGS.includes(v.tag)) v.tag = "";
  const m = location.hash.match(/path=(\w+)/);
  if (m && PATHS.includes(m[1] as Path)) v.path = m[1] as Path;
  if (!PATHS.includes(v.path)) v.path = "vps";
  const own = location.hash.match(/own=(public|practice)/);
  if (own) v.ownMode = own[1] as OwnMode;
  const reach = location.hash.match(/reach=(public|private)/);
  if (reach) v.reach = reach[1] as Reach;
  if (v.reach !== "private") v.reach = "public";
  if (v.mode !== "steps") v.mode = "agent";
  // a link to a step opens the step-by-step guide
  if (/[#&]to=step-/.test(location.hash)) v.mode = "steps";
  return v;
}

/** A shareable link to one step of one path's guide. */
export function stepHash(track: Track, stepId: string): string {
  return `#${trackHash(track)}&to=step-${stepId}`;
}

/** The hash fields that select a track. */
export function trackHash(track: Track): string {
  switch (track) {
    case "vps":
      return "path=vps&reach=public";
    case "vps-private":
      return "path=vps&reach=private";
    case "own-public":
      return "path=own&own=public&reach=public";
    case "own-private":
      return "path=own&own=public&reach=private";
    case "practice":
      return "path=own&own=practice";
    case "k8s":
      return "path=k8s&reach=public";
    case "k8s-private":
      return "path=k8s&reach=private";
    default:
      return `path=${track}`;
  }
}

/** Tracks that run the compose bundle on a machine you control. */
export const COMPOSE_TRACKS: Track[] = ["vps", "vps-private", "own-public", "own-private", "practice"];
export const isPrivate = (t: Track) => t === "vps-private" || t === "own-private" || t === "k8s-private";

export function getValues(): Values {
  return state;
}

export function trackOf(v: Values = state): Track {
  if (v.path === "own") return v.ownMode === "practice" ? "practice" : v.reach === "private" ? "own-private" : "own-public";
  if (v.path === "vps") return v.reach === "private" ? "vps-private" : "vps";
  if (v.path === "k8s") return v.reach === "private" ? "k8s-private" : "k8s";
  return v.path;
}

export function setValues(patch: Partial<Values>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  const t = trackOf();
  document.body.dataset.path = state.path;
  document.body.dataset.track = t;
  applyVisibility();
  listeners.forEach((f) => f());
}

export function onValues(f: () => void): void {
  listeners.add(f);
}

/** Elements with data-tracks="vps own-public …" show only on those tracks. */
export function applyVisibility(root: ParentNode = document): void {
  const t = trackOf();
  root.querySelectorAll<HTMLElement>("[data-tracks]").forEach((el) => {
    el.hidden = !el.dataset.tracks!.split(/\s+/).includes(t);
  });
}

/* ── npub (NIP-19 bech32) → 64-char hex ─────────────────────── */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

export function npubToHex(input: string): string | null {
  const s = input.trim().toLowerCase();
  const sep = s.lastIndexOf("1");
  if (sep < 1 || s.slice(0, sep) !== "npub") return null;
  const data: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v === -1) return null;
    data.push(v);
  }
  if (data.length < 7 || polymod([...hrpExpand("npub"), ...data]) !== 1) return null;
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const v of data.slice(0, -6)) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bytes.length !== 32) return null;
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── derived values used by every template ─────────────────── */
export function derived(v: Values = state): Record<string, string> {
  const t = trackOf(v);
  const practice = t === "practice";
  // Railway assigns a *.up.railway.app name unless you bring your own domain
  const fallback = isPrivate(t) ? "buzz.your-tailnet.ts.net" : t === "railway" ? "your-relay.up.railway.app" : "buzz.example.org";
  const domain = v.domain.trim().toLowerCase().replace(/^\w+:\/\//, "").replace(/\/.*$/, "") || fallback;
  const tag = v.tag.trim() || DEFAULT_TAG;
  const hex = npubToHex(v.npub);
  return {
    DOMAIN: domain,
    HOST: practice ? "127.0.0.1" : domain,
    RELAY_URL: practice ? "ws://127.0.0.1:3000" : `wss://${domain}`,
    HTTP_ORIGIN: practice ? "http://127.0.0.1:3000" : `https://${domain}`,
    OWNER_HEX: hex ?? "CHANGE_ME_OWNER_PUBKEY_HEX",
    OWNER_NPUB: v.npub.trim() || "<your npub>",
    TAG: tag,
    // sha-<7> tags name the main commit the image was built from; the bundle is checked out there
    COMMIT: /^sha-[0-9a-f]{7,40}$/.test(tag) ? tag.slice(4) : "main",
    IMAGE: `ghcr.io/block/buzz:${tag}`,
    // Caddy is only for public servers: practice has no TLS, and Tailscale serves the private ones
    RUN: practice || isPrivate(t) ? "./run.sh" : "BUZZ_COMPOSE_TLS=true ./run.sh",
    SKILL_URL: new URL("skills/self-host-buzz/SKILL.md", document.baseURI).href,
    SKILL_ARCHIVE: new URL("skills/self-host-buzz.tar.gz", document.baseURI).href,
  };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fill {{KEYS}}. html=true escapes the text and marks each value with <em>. */
export function fill(tpl: string, html = true): string {
  const d = derived();
  if (!html) return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => d[k] ?? `{{${k}}}`);
  return esc(tpl).replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in d ? `<em data-k="${k}">${esc(d[k])}</em>` : m));
}

/** Fill {{KEYS}} in trusted authored HTML; only the values are escaped. */
export function fillRich(tpl: string): string {
  const d = derived();
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in d ? `<span class="v" data-k="${k}">${esc(d[k])}</span>` : m));
}

/* ── static [data-tpl] elements ────────────────────────────── */
const cache = new WeakMap<HTMLElement, string>();

export function renderTemplates(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-tpl]").forEach((el) => {
    if (!cache.has(el)) cache.set(el, el.textContent ?? "");
    el.innerHTML = fill(cache.get(el)!);
  });
}

export function initValues(): void {
  setValues({});
  renderTemplates();
  onValues(() => renderTemplates());
}
