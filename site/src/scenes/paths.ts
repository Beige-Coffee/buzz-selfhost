import { getValues, onValues, setValues, trackHash, trackOf, type Path, type Track } from "../lib/values";
import { mountDecide } from "./decide";

/** The paths that can run on a private network, tested end to end. */
type Switchable = "vps" | "own" | "k8s";
const SWITCHABLE: Path[] = ["vps", "own", "k8s"];

interface Option {
  k: Path;
  kind: string;
  name: string;
  line: string;
  /** why a private network isn't offered here, shown in place of the switch */
  publicOnly?: string;
}

const OPTIONS: Option[] = [
  { k: "vps", kind: "Rent", name: "A VPS", line: "A rented Linux server. Buzz runs on it with Docker Compose." },
  { k: "railway", kind: "Managed", name: "Railway", line: "A hosting platform. Block's template deploys Buzz and its database for you.", publicOnly: "Not on Railway" },
  { k: "own", kind: "Own", name: "Your hardware", line: "A Linux machine you own, like a mini PC. Same Docker Compose setup as a VPS." },
  { k: "k8s", kind: "Cluster", name: "Kubernetes", line: "For teams that already run a cluster. Installs with Block's Helm chart." },
];

const PUBLIC = "public URL, members only";

/** What each pick means, for every track: shown in its card, and the reach line under the switch. */
const FACTS: Record<Track, { reach: string; facts: [string, string][] }> = {
  vps: {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "On your server"],
      ["You maintain", "OS updates, Docker, backups"],
      ["Best for", "Most teams. Your data stays on a server you control"],
      ["Moving later", "Restore a backup on a new server, then point your domain at it. Same URL, same community"],
    ],
  },
  "vps-private": {
    reach: "On: only devices on your Tailscale network",
    facts: [
      ["Relay key", "On your server"],
      ["You maintain", "OS updates, Docker, backups, Tailscale"],
      ["Best for", "Teams with sensitive work that want nothing open to the internet"],
      ["Moving later", "Restore a backup on a new server, under the same Tailscale name"],
    ],
  },
  railway: {
    reach: `Not on Railway: ${PUBLIC}`,
    facts: [
      ["Relay key", "In Railway's variables; copy it somewhere safe"],
      ["You maintain", "Backups and upgrades. Git repos are lost on redeploy"],
      ["Best for", "Teams that want the least upkeep, and are fine with Railway holding their data"],
      ["Moving later", "Hard: a different setup, so no direct restore. Use your own domain from day one"],
    ],
  },
  "own-public": {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "On your machine"],
      ["You maintain", "OS updates, backups, power, port forwarding on your router"],
      ["Best for", "Teams that want full control, with data on hardware they own"],
      ["Moving later", "Restore a backup on a new server, then point your domain at it. Same URL, same community"],
    ],
  },
  "own-private": {
    reach: "On: only devices on your Tailscale network",
    facts: [
      ["Relay key", "On your machine"],
      ["You maintain", "OS updates, backups, power"],
      ["Best for", "Teams with the most sensitive data: their own hardware, nothing public"],
      ["Moving later", "Restore a backup on a new server, under the same Tailscale name"],
    ],
  },
  practice: {
    reach: "Local test: only this laptop can reach it",
    facts: [
      ["Relay key", "On your laptop"],
      ["You maintain", "Nothing. Delete it when you're done"],
      ["Best for", "Trying Buzz before you pick a server"],
      ["Moving later", "Nothing moves. A server means a new community"],
    ],
  },
  k8s: {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "In a Kubernetes Secret"],
      ["You maintain", "The cluster, ingress, TLS certificates, backups"],
      ["Best for", "Teams that already run Kubernetes"],
      ["Moving later", "Restore the skill's backup on the new cluster with your own tools"],
    ],
  },
  "k8s-private": {
    reach: "On: only devices on your Tailscale network",
    facts: [
      ["Relay key", "In a Kubernetes Secret"],
      ["You maintain", "The cluster, backups, the Tailscale operator"],
      ["Best for", "Teams that already run Kubernetes and want nothing public"],
      ["Moving later", "Restore the skill's backup on the new cluster with your own tools"],
    ],
  },
};

const LOCK = `<svg class="lock" viewBox="0 0 20 20" aria-hidden="true"><path class="shackle" d="M6.5 9V6.6a3.5 3.5 0 0 1 7 0V9" /><rect x="4" y="9" width="12" height="8.5" rx="2.4" /></svg>`;
const GLOBE = `<svg class="globe" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.1 2.9 4.4 2.9 7s-.9 4.9-2.9 7c-2-2.1-2.9-4.4-2.9-7S8 5.1 10 3z" /></svg>`;

/** What a private network is, behind the question mark on every card. Facts tested 2026-09-30; pricing checked 2026-10-01. */
const tip = (k: Path) => `<span class="pa-qw">
    <button type="button" class="pa-q" aria-label="What's a private network?" aria-expanded="false" aria-controls="pa-tip-${k}">?</button>
    <span class="pa-tip" id="pa-tip-${k}">
      <b>Private network</b>
      <span class="pa-tip-row"><i>What it is</i>A VPN for your team. The relay has no public address, so only devices on the VPN can reach it. This guide uses Tailscale, free for up to 6 users.</span>
      <span class="pa-tip-row"><i>Why use it</i>No open ports, and no domain to buy.</span>
      <span class="pa-tip-row"><i>Tradeoff</i>Every device that uses Buzz needs Tailscale, including phones and agents.</span>
    </span>
  </span>`;

/** What the relay key is, behind the icon beside "Relay key". BUZZ_RELAY_PRIVATE_KEY in Buzz's compose .env. */
const keyTip = (k: Path) => `<span class="pa-qw pa-qw-key">
    <button type="button" class="pa-q" aria-label="What's the relay key?" aria-expanded="false" aria-controls="pa-key-${k}">?</button>
    <span class="pa-tip" id="pa-key-${k}">
      <b>Relay key</b>
      <span class="pa-tip-row">The private key your relay signs its own events with, such as workflow messages and channel changes. Back it up and keep it secret: anyone with it can sign as your relay.</span>
      <button type="button" class="pa-tip-go" data-open="relay-key">What's a relay key? ↓</button>
    </span>
  </span>`;

const net = (o: Option) => `
  <div class="pa-net${o.publicOnly ? " is-fixed" : ""}"${o.publicOnly ? "" : ` data-net="${o.k}"`}>
    <span class="pa-net-i">${o.publicOnly ? GLOBE : LOCK}</span>
    <span class="pa-net-t"><span class="pa-net-k">Private network${tip(o.k)}</span><span class="pa-net-v" data-net-v></span></span>
    ${o.publicOnly ? "" : `<button type="button" class="pa-switch" role="switch" aria-checked="false" data-private="${o.k}" aria-label="Private network for ${o.name}"><i></i></button>`}
  </div>`;

export function mountPaths(host: HTMLElement): void {
  host.classList.add("paths");
  host.innerHTML = `
    <div class="dh"></div>
    <div class="pa-grid" role="group" aria-label="Where to run Buzz">
      ${OPTIONS.map(
        (o) => `<div class="pa-card" data-card="${o.k}">
          <button type="button" class="pa-pick" data-pick="${o.k}" aria-pressed="false">
            <span class="pa-kind">${o.kind}</span>
            <b>${o.name}</b>
            <span class="pa-line">${o.line}</span>
          </button>
          <dl class="pa-dl" data-dl></dl>
          ${net(o)}
        </div>`,
      ).join("")}
    </div>`;

  // Each card keeps its own switch, so a private VPS and a public machine can sit side by side.
  // The picked card's switch is the page's choice.
  const start = getValues().reach === "private";
  const priv: Record<Switchable, boolean> = { vps: start, own: start, k8s: start };

  /** The track a card shows: its own switch, unless it's the picked card in practice. */
  const cardTrack = (k: Path, t: Track): Track => {
    if (k === "own" && t === "practice") return "practice";
    if (k === "vps") return priv.vps ? "vps-private" : "vps";
    if (k === "own") return priv.own ? "own-private" : "own-public";
    if (k === "k8s") return priv.k8s ? "k8s-private" : "k8s";
    return k;
  };

  const sync = () => {
    const v = getValues();
    const t = trackOf();
    if (t !== "practice" && SWITCHABLE.includes(v.path)) priv[v.path as Switchable] = v.reach === "private";
    host.querySelectorAll<HTMLElement>(".pa-card").forEach((card) => {
      const k = card.dataset.card as Path;
      const on = v.path === k;
      card.classList.toggle("sel", on);
      card.querySelector(".pa-pick")!.setAttribute("aria-pressed", String(on));
      const f = FACTS[cardTrack(k, on ? t : "vps")];
      card.querySelector<HTMLElement>("[data-dl]")!.innerHTML = f.facts.map(([dt, dd]) => `<div><dt>${dt}${dt === "Relay key" ? keyTip(k) : ""}</dt><dd>${dd}</dd></div>`).join("");
      card.querySelector<HTMLElement>("[data-net-v]")!.textContent = f.reach;
      const sw = card.querySelector<HTMLButtonElement>(".pa-switch");
      if (!sw) return;
      const p = priv[k as Switchable] && !(on && t === "practice");
      card.classList.toggle("is-private", p);
      sw.setAttribute("aria-checked", String(p));
    });
  };

  const remember = () => {
    try {
      history.replaceState(null, "", `#${trackHash(trackOf())}`);
    } catch {
      /* ignore */
    }
  };

  const closeTips = (except?: Element) =>
    host.querySelectorAll(".pa-qw.open").forEach((w) => {
      if (w === except) return;
      w.classList.remove("open");
      w.querySelector(".pa-q")!.setAttribute("aria-expanded", "false");
    });

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // the question mark opens its note; a tap anywhere else closes it
    const q = t.closest<HTMLButtonElement>(".pa-q");
    if (q) {
      const w = q.closest(".pa-qw")!;
      closeTips(w);
      const open = w.classList.toggle("open");
      q.setAttribute("aria-expanded", String(open));
      return;
    }
    if (t.closest(".pa-tip")) return;
    closeTips();
    const row = t.closest<HTMLElement>(".pa-net[data-net]");
    if (row) {
      const k = row.dataset.net as Switchable;
      priv[k] = !priv[k];
      setValues({ path: k, ownMode: "public", reach: priv[k] ? "private" : "public" });
      remember();
      return;
    }
    const pick = t.closest<HTMLButtonElement>("[data-pick]");
    if (pick) {
      const k = pick.dataset.pick as Path;
      setValues(SWITCHABLE.includes(k) ? { path: k, ownMode: "public", reach: priv[k as Switchable] ? "private" : "public" } : { path: k });
      remember();
    }
  });
  document.addEventListener("click", (e) => {
    if (!host.contains(e.target as Node)) closeTips();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTips();
  });
  mountDecide(host.querySelector<HTMLElement>(".dh")!);
  sync();
  onValues(sync);
}
