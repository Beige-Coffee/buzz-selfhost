/**
 * The section nav in the header. It appears once the headline scrolls away, marks the section
 * being read, and lands every in-page jump on the section's label, right under the header.
 */
const SECTIONS = ["how", "where", "guide", "operations", "practices"];
const HEADER = 56;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where a jump lands: the section's heading if it has one, else its top. */
function targetY(id: string): number | null {
  if (id === "top") return 0;
  const sec = document.getElementById(id);
  if (!sec || !sec.getClientRects().length) return null;
  // the guide has a heading per path; only the chosen one is showing
  const anchor = [...sec.querySelectorAll<HTMLElement>(".text h2")].find((h) => h.getClientRects().length) ?? sec;
  // layout position, not the painted one: sections that haven't faded in yet are still shifted down
  let y = 0;
  for (let el: HTMLElement | null = anchor; el; el = el.offsetParent as HTMLElement | null) y += el.offsetTop;
  return Math.max(0, y - HEADER - 28);
}

/** Scroll to a section's heading, as the nav does. */
export function jumpTo(id: string): void {
  const y = targetY(id);
  if (y === null) return;
  const from = scrollY;
  scrollTo({ top: y, behavior: reduced() ? "auto" : "smooth" });
  // if the smooth scroll never started (a background tab, a layout change mid-click), go straight there
  window.setTimeout(() => {
    const again = targetY(id);
    if (scrollY === from && again !== null && Math.abs(again - from) > 4) scrollTo({ top: again, behavior: "instant" });
  }, 700);
}

export function mountNav(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".hd-links a")];
  const sheetLinks = [...document.querySelectorAll<HTMLAnchorElement>(".hd-sheet a")];
  const thumb = document.querySelector<HTMLElement>(".hd-thumb")!;
  const menu = document.querySelector<HTMLButtonElement>(".hd-menu")!;
  const current = document.querySelector<HTMLElement>(".hd-current")!;
  const sheet = document.getElementById("hd-sheet")!;
  const headline = document.querySelector<HTMLElement>(".hero h1")!;
  let active = "";

  const moveThumb = () => {
    const a = links.find((l) => l.dataset.sec === active);
    if (!a || !a.offsetWidth) {
      thumb.style.opacity = "0";
      return;
    }
    thumb.style.opacity = "1";
    thumb.style.width = `${a.offsetWidth}px`;
    thumb.style.transform = `translateX(${a.offsetLeft}px)`;
    // glide only after the first placement, so it doesn't sweep in from the left edge
    requestAnimationFrame(() => thumb.classList.add("ready"));
  };

  const setActive = (id: string) => {
    if (id === active) return;
    active = id;
    for (const a of [...links, ...sheetLinks]) {
      const on = a.dataset.sec === id;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
    current.textContent = links.find((l) => l.dataset.sec === id)?.textContent ?? "";
    moveThumb();
  };

  const openSheet = (open: boolean) => {
    sheet.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
  };

  let ticking = false;
  const update = () => {
    ticking = false;
    const on = headline.getBoundingClientRect().bottom < HEADER;
    document.body.classList.toggle("nav-on", on);
    if (!on) openSheet(false);
    const line = innerHeight * 0.4;
    let id = SECTIONS[0];
    for (const s of SECTIONS) {
      const el = document.getElementById(s);
      if (el && el.getClientRects().length && el.getBoundingClientRect().top <= line) id = s;
    }
    setActive(id);
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => {
    thumb.classList.remove("ready");
    moveThumb();
    onScroll();
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".hd-menu")) {
      openSheet(sheet.hidden);
      return;
    }
    const a = t.closest<HTMLAnchorElement>('a[href^="#"]:not(.hl)');
    if (a) {
      const id = a.getAttribute("href")!.slice(1);
      if (id === "top" || SECTIONS.includes(id)) {
        const y = targetY(id);
        if (y !== null) {
          e.preventDefault();
          openSheet(false);
          scrollTo({ top: y, behavior: reduced() ? "auto" : "smooth" });
          return;
        }
      }
    }
    if (!sheet.hidden && !t.closest(".hd-sheet")) openSheet(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) {
      openSheet(false);
      menu.focus();
    }
  });

  update();
  // fonts change the links' widths once they load
  document.fonts?.ready.then(() => {
    thumb.classList.remove("ready");
    moveThumb();
    landOnHash();
  });
}

/** Opened from a shared link: land on its section or step, under the header. */
function landOnHash(): void {
  const h = location.hash;
  const to = h.match(/[#&]to=([\w-]+)/)?.[1] ?? h.slice(1);
  if (!to) return;
  let y: number | null = null;
  if (SECTIONS.includes(to)) y = targetY(to);
  else {
    const el = document.getElementById(to);
    if (el?.getClientRects().length) {
      let top = 0;
      for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
      y = Math.max(0, top - HEADER - 16);
    }
  }
  // instant: the page-wide smooth scrolling would turn a landing into a long glide
  if (y !== null) scrollTo({ top: y, behavior: "instant" });
}
