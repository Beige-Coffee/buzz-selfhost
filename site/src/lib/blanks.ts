/**
 * Blanks: what a prompt needs that only the reader knows, like the server's address. Each <name>
 * in a prompt becomes a field to type into. Blanks with the same name share what's typed, on
 * every prompt, and this browser remembers it. A blank left empty is copied as <name>, so the
 * agent still sees what's missing.
 */
import { esc, npubToHex } from "./values";

const KEY = "buzz-selfhost-blanks-v1";
let typed: Record<string, string> = load();

function load(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(typed));
  } catch {
    /* ignore */
  }
}

/** Blanks that can be wrong in a way the page can tell. */
const VALID: Record<string, (v: string) => boolean> = { "their npub": (v) => npubToHex(v) !== null };
const bad = (name: string, v: string) => Boolean(v.trim()) && VALID[name]?.(v) === false;

const attr = (s: string) => esc(s).replace(/"/g, "&quot;");

/** One blank. It grows with what's typed: its wrapper sizes itself to data-v. */
function blank(name: string): string {
  const v = typed[name] ?? "";
  const wrong = bad(name, v);
  return `<span class="blank${v.trim() ? " filled" : ""}${wrong ? " bad" : ""}" data-v="${attr(v || name)}"><input data-blank="${attr(name)}" value="${attr(v)}" placeholder="${attr(name)}" aria-label="${attr(name)}"${wrong ? ' aria-invalid="true"' : ""} size="1" spellcheck="false" autocomplete="off" autocapitalize="off"></span>`;
}

/** Each &lt;name&gt; in escaped text becomes a blank; a user@host pair stays on one line. */
export function blanksHTML(escaped: string): string {
  return escaped.replace(
    /&lt;([^&]+?)&gt;(?:@&lt;([^&]+?)&gt;)?/g,
    (_, a: string, b?: string) => `<span class="blank-run">${blank(a)}${b ? `@${blank(b)}` : ""}</span>`,
  );
}

/** Each <name> in plain text gets what was typed into that blank, or stays as it is. */
export function fillBlanks(text: string): string {
  return text.replace(/<([^<>]+)>/g, (m, n: string) => typed[n]?.trim() || m);
}

/** Typing in a blank fills every blank with that name on the page. Nothing re-renders, so focus stays. */
export function initBlanks(): void {
  document.addEventListener("input", (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.dataset.blank === undefined) return;
    const name = inp.dataset.blank;
    typed[name] = inp.value;
    save();
    document.querySelectorAll<HTMLInputElement>("input[data-blank]").forEach((o) => {
      if (o.dataset.blank !== name) return;
      if (o !== inp) o.value = inp.value;
      const wrap = o.parentElement!;
      wrap.dataset.v = inp.value || name;
      wrap.classList.toggle("filled", Boolean(inp.value.trim()));
      const wrong = bad(name, inp.value);
      wrap.classList.toggle("bad", wrong);
      if (wrong) o.setAttribute("aria-invalid", "true");
      else o.removeAttribute("aria-invalid");
    });
  });
}
