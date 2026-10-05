import { copyText } from "./code";
import { trackHash, trackOf } from "./values";

const ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M7.1 4.7l1-1a2.75 2.75 0 0 1 3.9 3.9l-1 1M8.9 11.3l-1 1a2.75 2.75 0 0 1-3.9-3.9l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** Sections whose content depends on the chosen path carry it in their links. */
const PATHED = ["guide", "operations"];

export const linkButton = (href: string, label: string, sec = "") =>
  `<a class="hl" href="${href}"${sec ? ` data-sec-link="${sec}"` : ""} aria-label="${label}">${ICON}</a>`;

function tip(anchor: HTMLElement, text: string): void {
  const t = document.createElement("span");
  t.className = "hl-tip";
  t.textContent = text;
  const r = anchor.getBoundingClientRect();
  t.style.left = `${r.left + r.width / 2 + scrollX}px`;
  t.style.top = `${r.top + scrollY}px`;
  document.body.appendChild(t);
  window.setTimeout(() => t.classList.add("out"), 1100);
  window.setTimeout(() => t.remove(), 1500);
}

/** A link button beside each section heading and step title. Clicking one copies the link. */
export function mountPermalinks(): void {
  document.querySelectorAll<HTMLElement>("section.block[id] > .text h2").forEach((h) => {
    const id = h.closest("section")!.id;
    if (!h.querySelector(".hl")) h.insertAdjacentHTML("beforeend", linkButton(`#${id}`, "Copy a link to this section", id));
  });

  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.hl");
    if (!a) return;
    e.preventDefault();
    const sec = a.dataset.secLink;
    const hash = sec && PATHED.includes(sec) ? `#${trackHash(trackOf())}&to=${sec}` : a.getAttribute("href")!;
    copyText(location.origin + location.pathname + hash, () => tip(a, "Link copied"));
    try {
      history.replaceState(null, "", hash);
    } catch {
      /* ignore */
    }
  });
}
