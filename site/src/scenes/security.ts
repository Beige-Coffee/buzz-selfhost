import skill from "virtual:skill-steps";
import { esc } from "../lib/values";

/** Security advice is rendered from the same reference that installed agents read. */
export function mountSecurity(host: HTMLElement): void {
  const boundary = `<figure class="sec-boundary"><figcaption>Recommended environment for an agent reading public content</figcaption>
    <div class="sec-flow"><div><small>Input</small><b>Messages, files and links</b><span>Treat them as untrusted</span></div><i aria-hidden="true">→</i>
    <div class="sec-isolated"><small>Separate environment</small><b>Your public-community agent</b><span>Only intended files, tools and scoped accounts</span></div></div>
    <p>Keep personal vaults, private repositories and production credentials outside this environment. A selected Workspace folder does not create this boundary.</p></figure>`;
  host.innerHTML = `<div class="sec-grid">${skill.security.map((s, i) => `<article class="sec-card sec-card-${i}"><span class="sec-number" aria-hidden="true">0${i + 1}</span><h3>${esc(s.title)}</h3>${i === 1 ? boundary : ""}<div class="sec-copy">${s.html}</div></article>`).join("")}</div>
    <p class="sec-evidence"><b>Reviewed 11 November 2026.</b> Desktop app v1.0.0 · Relay <code>${esc(skill.pin.tag)}</code> · Helm chart 0.1.10.<br>Source and browser checks are complete. Current relay deployment, recovery and real-device checks remain open; a newer relay release awaits validation. <a href="https://github.com/Beige-Coffee/buzz-selfhost/blob/main/docs/research.md">Source review</a> · <a href="https://github.com/Beige-Coffee/buzz-selfhost/blob/main/tests/README.md">Coverage and results</a>.</p>`;
  host.querySelectorAll("table").forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "sec-table"; wrap.tabIndex = 0;
    wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "Key backup comparison");
    table.replaceWith(wrap); wrap.appendChild(table);
  });
}
