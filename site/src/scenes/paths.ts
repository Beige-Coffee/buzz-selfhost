import { getValues, onValues, setValues, trackHash, trackOf, type Path, type Track } from "../lib/values";
import { mountDecide } from "./decide";

const issue = (n: number) => `<a href="https://github.com/block/buzz/issues/${n}">#${n}</a>`;

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
  { k: "vps", kind: "Rent", name: "A VPS", line: "A Linux server by the month, running Buzz's compose bundle." },
  { k: "railway", kind: "One click", name: "Railway", line: "Block's template deploys the relay, Postgres, Redis and storage.", publicOnly: "Not on Railway" },
  { k: "own", kind: "Own", name: "Your hardware", line: "The same compose bundle on a machine you own: a home server, a mini PC, a spare desktop." },
  { k: "k8s", kind: "Cluster", name: "Kubernetes", line: "Block's Helm chart, on a cluster you already run." },
];

const PUBLIC = "publicly accessible, members only";

/** What each pick means, for every track: shown in its card, and the reach line under the switch. */
const FACTS: Record<Track, { reach: string; facts: [string, string][] }> = {
  vps: {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "On your server"],
      ["You maintain", "OS updates, Docker, backups"],
      ["Best for", "A team with someone at home in a terminal"],
    ],
  },
  "vps-private": {
    reach: "On: only devices on your network",
    facts: [
      ["Relay key", "On your server"],
      ["You maintain", "OS updates, Docker, backups, the network sign-in"],
      ["Best for", "A team that wants nothing facing the internet"],
    ],
  },
  railway: {
    reach: `Not on Railway: ${PUBLIC}`,
    facts: [
      ["Relay key", "Starts in Railway's variables; copy it out"],
      ["You maintain", "Backups and upgrades"],
      ["Best for", "A team with nobody to run a server"],
    ],
  },
  "own-public": {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "On your machine"],
      ["You maintain", "OS, backups, power, two ports on your router"],
      ["Best for", "The most control"],
    ],
  },
  "own-private": {
    reach: "On: only devices on your network",
    facts: [
      ["Relay key", "On your machine"],
      ["You maintain", "OS, backups and power; no router changes"],
      ["Best for", "The most control, with nothing facing the internet"],
    ],
  },
  practice: {
    reach: "Practice: only this laptop can reach it",
    facts: [
      ["Relay key", "On your laptop"],
      ["You maintain", "Nothing; delete it when you're done"],
      ["Best for", "Seeing how it works before you pick a server"],
    ],
  },
  k8s: {
    reach: `Off: ${PUBLIC}`,
    facts: [
      ["Relay key", "In a Kubernetes Secret"],
      ["You maintain", "The cluster, ingress, certificates, backups"],
      ["Best for", "Teams that already run Kubernetes"],
    ],
  },
  "k8s-private": {
    reach: "On: only devices on your network",
    facts: [
      ["Relay key", "In a Kubernetes Secret"],
      ["You maintain", "The cluster, backups, Tailscale's operator"],
      ["Best for", "Kubernetes teams that want nothing facing the internet"],
    ],
  },
};

const COMPARE: { label: string; cells: Record<Path, string> }[] = [
  { label: "Cost", cells: { vps: "$24 / mo, 4 GB (DigitalOcean)", railway: "$5 Hobby + $10 per GB of memory / mo", own: "Machine and power", k8s: "Your nodes, plus a load balancer when public" } },
  { label: "Reach", cells: { vps: "The internet, or a private network", railway: "The internet", own: "The internet, or a private network", k8s: "The internet, or a private network" } },
  { label: "Domain", cells: { vps: "Yours, or a free name from Tailscale", railway: "*.up.railway.app until you attach yours", own: "Yours, or a free name from Tailscale", k8s: "Yours at your ingress, or a free name from Tailscale" } },
  { label: "Phones", cells: { vps: `Pairing tested; no push notifications ${issue(5206)}`, railway: `No pairing yet ${issue(7721)}; no push notifications ${issue(5206)}`, own: "Same as a VPS", k8s: `Pairing untested; no push notifications ${issue(5206)}` } },
  { label: "Stack", cells: { vps: "Relay, Postgres 17, Redis, MinIO, Caddy", railway: "Relay, Postgres 18, Redis 8, Railway bucket; no volume for the relay", own: "Same as a VPS", k8s: "In the cluster (quickstart), or your managed Postgres, Redis and S3" } },
  { label: "Moving later", cells: { vps: "Restore a backup anywhere, same URL", railway: "A different stack: not a straight restore", own: "Restore a backup anywhere, same URL", k8s: "Dump Postgres and copy the bucket" } },
];

const LOCK = `<svg class="lock" viewBox="0 0 20 20" aria-hidden="true"><path class="shackle" d="M6.5 9V6.6a3.5 3.5 0 0 1 7 0V9" /><rect x="4" y="9" width="12" height="8.5" rx="2.4" /></svg>`;
const GLOBE = `<svg class="globe" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.1 2.9 4.4 2.9 7s-.9 4.9-2.9 7c-2-2.1-2.9-4.4-2.9-7S8 5.1 10 3z" /></svg>`;

/** What a private network is, behind the question mark on every card. Facts tested 2026-09-30; pricing checked 2026-10-01. */
const tip = (k: Path) => `<span class="pa-qw">
    <button type="button" class="pa-q" aria-label="What's a private network?" aria-expanded="false" aria-controls="pa-tip-${k}">?</button>
    <span class="pa-tip" id="pa-tip-${k}">
      <b>Private network</b>
      <span class="pa-tip-row"><i>What it is</i>A VPN for your team. The relay gets no public address, so only devices on the VPN can reach it. This guide uses Tailscale, free for up to 6 people.</span>
      <span class="pa-tip-row"><i>Why use it</i>Nothing is exposed to the internet: no open ports and no domain to buy.</span>
      <span class="pa-tip-row"><i>Tradeoff</i>Everyone runs the VPN on each device that uses Buzz, phones and agents included.</span>
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
    </div>
    <details class="pa-compare">
      <summary>Compare all four</summary>
      <div class="table-scroll"><table>
        <thead><tr><th></th>${OPTIONS.map((o) => `<th data-col="${o.k}">${o.name}</th>`).join("")}</tr></thead>
        <tbody>${COMPARE.map((r) => `<tr><th scope="row">${r.label}</th>${OPTIONS.map((o) => `<td data-col="${o.k}">${r.cells[o.k]}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="fine">Prices checked 2026-09-30. Issues are in block/buzz.</p>
    </details>`;

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
      card.querySelector<HTMLElement>("[data-dl]")!.innerHTML = f.facts.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join("");
      card.querySelector<HTMLElement>("[data-net-v]")!.textContent = f.reach;
      const sw = card.querySelector<HTMLButtonElement>(".pa-switch");
      if (!sw) return;
      const p = priv[k as Switchable] && !(on && t === "practice");
      card.classList.toggle("is-private", p);
      sw.setAttribute("aria-checked", String(p));
    });
    host.querySelectorAll<HTMLElement>("[data-col]").forEach((c) => c.classList.toggle("sel", c.dataset.col === v.path));
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
