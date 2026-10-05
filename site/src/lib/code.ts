/** Copy buttons for every <pre class="cmd">. Copies the rendered text, so filled-in values come along. */
export function enhanceCode(root: ParentNode = document): void {
  root.querySelectorAll<HTMLPreElement>("pre.cmd").forEach((pre) => {
    if (pre.parentElement?.classList.contains("cmd-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "cmd-wrap";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    if (pre.dataset.tracks) {
      wrap.dataset.tracks = pre.dataset.tracks;
      delete pre.dataset.tracks;
      wrap.hidden = pre.hidden;
      pre.hidden = false;
    }
    const btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy command");
    btn.addEventListener("click", () => {
      const text = (pre.textContent ?? "").trim();
      const done = () => {
        btn.textContent = "Copied";
        window.setTimeout(() => (btn.textContent = "Copy"), 1400);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
      } else fallback(text, done);
    });
    wrap.appendChild(btn);
  });
}

/** Copy text to the clipboard, calling done() on success. */
export function copyText(text: string, done: () => void): void {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
  else fallback(text, done);
}

function fallback(text: string, done: () => void): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    /* leave the button as is */
  }
  ta.remove();
}
