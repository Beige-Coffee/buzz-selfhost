"""The setup page's scripts in headless Chrome, on the page's previews (preview.py), with nothing real behind them:
the guide's stepper across its four steps and at its ends, a step opened by the address, the step drawn before the
script runs, a step's link moving focus to it, the safety step's drawings and notes on each option, the 5-second
refresh keeping an open list open and focus where it was and saying what changed, the private network's device check
against answers held back and let through in a chosen order, a new phase keeping the reader's step, and the page
without scripts, where every drawing fits from a computer's width to a phone's.

Chrome runs over a pipe, with no port, and every name but 127.0.0.1 fails to resolve, so nothing leaves this machine.
The page's 5-second refresh and the device check's 6-second limit are held, and fired by the test, and the device
check's requests are held by Chrome until the test answers them: nothing depends on how long anything takes. The
previews use ports 8771 to 8774, or the four from BROWSER_PORT. Without Chrome it says so and exits 0.

  python3 tests/umbrel/local/browser.py
"""
import base64, fcntl, json, os, select, shutil, signal, socket, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PORT = int(os.environ.get("BROWSER_PORT", "8771"))
PREVIEWS = {"domain-live": PORT, "private-live": PORT + 1, "domain-dns": PORT + 2, "domain-moderation": PORT + 3}
LIVE, PRIVATE, CONNECTING, MODERATED = ("http://127.0.0.1:%d/" % PREVIEWS[name] for name in PREVIEWS)
DEVICE = "buzz.tail1234.ts.net"  # the private-live preview's address
PASSED = FAILED = 0


def ok(condition, text, detail=None):
    global PASSED, FAILED
    print(("PASS  " if condition else "FAIL  ") + text
          + ("" if condition or detail is None else "  :: " + json.dumps(detail, default=str)[:700]), flush=True)
    PASSED, FAILED = PASSED + bool(condition), FAILED + (not condition)


class Chrome:
    """Headless Chrome over --remote-debugging-pipe: commands go to its fd 3, answers and events come from its fd 4,
    each one JSON message ending in a NUL byte."""

    def __init__(self):
        self.profile = tempfile.mkdtemp(prefix="buzz-browser-")
        to_chrome, self.writer = os.pipe()
        self.reader, from_chrome = os.pipe()
        # Chrome's two ends go to 3 and 4 from numbers above both, so placing one can't overwrite the other
        ends = [fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 10) for fd in (to_chrome, from_chrome)]
        null = os.open(os.devnull, os.O_RDWR)
        os.close(to_chrome)
        os.close(from_chrome)
        args = [CHROME, "--headless=new", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check",
                "--disable-gpu", "--disable-extensions", "--disable-background-networking", "--disable-component-update",
                "--disable-sync", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
                "--user-data-dir=" + self.profile, "about:blank"]
        self.pid = os.posix_spawn(CHROME, args, os.environ, file_actions=[
            (os.POSIX_SPAWN_DUP2, null, 0), (os.POSIX_SPAWN_DUP2, null, 1), (os.POSIX_SPAWN_DUP2, null, 2),
            (os.POSIX_SPAWN_DUP2, ends[0], 3), (os.POSIX_SPAWN_DUP2, ends[1], 4)])
        for fd in ends + [null]:
            os.close(fd)
        self.buffer, self.last, self.answers, self.events = b"", 0, {}, []

    def pump(self, timeout):
        ready, _, _ = select.select([self.reader], [], [], timeout)
        if ready:
            chunk = os.read(self.reader, 1 << 20)
            if not chunk:
                raise RuntimeError("Chrome closed its pipe")
            self.buffer += chunk
        while b"\0" in self.buffer:
            raw, self.buffer = self.buffer.split(b"\0", 1)
            message = json.loads(raw)
            if "id" in message:
                self.answers[message["id"]] = message
            else:
                self.events.append(message)

    def call(self, method, params=None, session=None, timeout=20):
        self.last += 1
        n, message = self.last, {"id": self.last, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        data = json.dumps(message).encode() + b"\0"
        while data:
            data = data[os.write(self.writer, data):]
        end = time.time() + timeout
        while n not in self.answers:
            if time.time() > end:
                raise TimeoutError(method)
            self.pump(0.05)
        answer = self.answers.pop(n)
        if "error" in answer:
            raise RuntimeError(method + ": " + answer["error"].get("message", ""))
        return answer.get("result", {})

    def close(self):
        try:
            self.call("Browser.close", timeout=5)
        except Exception:
            pass
        for _ in range(50):
            if os.waitpid(self.pid, os.WNOHANG)[0]:
                break
            time.sleep(0.1)
        else:
            os.kill(self.pid, signal.SIGKILL)
            os.waitpid(self.pid, 0)
        for fd in (self.reader, self.writer):
            os.close(fd)
        shutil.rmtree(self.profile, ignore_errors=True)


# Run in every page before its own script: the page's 5-second refresh and the device check's 6-second limit are held
# until the test fires them, each look the device check starts is counted, and what the page shows when its document
# is parsed, before its script's DOMContentLoaded handler draws the guide, is kept
HELD = """(() => {
  const realSet = window.setTimeout, realClear = window.clearTimeout, realFetch = window.fetch, held = new Map();
  let next = 0;
  window.setTimeout = function (fn, ms, ...rest) {
    if (ms !== 5000 && ms !== 6000) { return realSet.call(window, fn, ms, ...rest); }
    next += 1;
    held.set("held-" + next, { fn: fn, ms: ms, rest: rest });
    return "held-" + next;
  };
  window.clearTimeout = function (id) { if (!held.delete(id)) { realClear.call(window, id); } };
  window.__held = (ms) => [...held.values()].filter((t) => t.ms === ms).length;
  window.__fire = (ms) => {
    const due = [...held.entries()].filter(([, t]) => t.ms === ms);
    due.forEach(([id]) => held.delete(id));
    due.forEach(([, t]) => t.fn(...t.rest));
    return due.length;
  };
  window.__looks = 0;
  window.fetch = function (url, options) {
    if (String(url).endsWith("/_liveness")) { window.__looks += 1; }
    return realFetch.call(window, url, options);
  };
  document.addEventListener("DOMContentLoaded", () => {
    const shown = (el) => getComputedStyle(el).display !== "none";
    window.__firstPaint = {
      ready: Boolean(document.querySelector(".guide.ready")),
      step: document.documentElement.getAttribute("data-step"),
      shown: [...document.querySelectorAll(".g-pane")].filter(shown).map((pane) => pane.id + ":"
        + [...pane.querySelectorAll(".g-frame")].map((frame, i) => shown(frame) ? i + 1 : 0).filter(Boolean).join(",")),
    };
  }, true);
})();"""

# The guide as the reader sees it, and where focus is
GUIDE = """(() => {
  const guide = document.querySelector(".guide"), shown = (el) => !el.hidden && getComputedStyle(el).display !== "none";
  const panes = [...guide.querySelectorAll(".g-pane")].filter(shown), pane = panes[0];
  const frames = pane ? [...pane.querySelectorAll(".g-frame")] : [];
  const el = document.activeElement, frame = el && el.closest(".g-frame");
  let kept = null;
  try { kept = sessionStorage.getItem("buzz-guide"); } catch (e) { kept = "unreadable"; }
  return {
    ready: guide.classList.contains("ready"), at: pane ? pane.id + ":" + (frames.findIndex(shown) + 1) : "",
    panes: panes.length, frames: frames.filter(shown).length, hash: location.hash, kept: kept,
    current: [...guide.querySelectorAll(".g-step[aria-current]")].map((a) => a.getAttribute("href")),
    focus: !el || el === document.body ? "body" : frame ? "go" + el.getAttribute("data-go") + "@"
      + frame.closest(".g-pane").id + ":" + ([...frame.parentNode.children].indexOf(frame) + 1)
      : el.tagName.toLowerCase() + (el.closest(".g-pane") ? "@" + el.closest(".g-pane").id : ""),
    disabled: el && el.getAttribute ? el.getAttribute("aria-disabled") : null,
    say: guide.querySelector(".g-say").textContent, pwned: window.__pwned || null, images: document.images.length,
  };
})()"""

# The live card, and the private network's row in its list as the document has it now
CARD = """(() => {
  const card = document.querySelector("[data-poll] .ck-card"), row = card.querySelector("[data-host]");
  return {
    row: row.className + "|" + row.querySelector(".text").textContent + "|" + row.querySelector(".hint").textContent,
    tops: [...card.querySelectorAll(".ck-top")].map((t) => t.className.replace("ck-top ", "") + ":" + t.getAttribute("data-key")),
    summary: card.querySelector(".ck-sum").textContent + ", " + card.querySelector(".ck-all .val").textContent,
    alert: card.classList.contains("ck-alert"), looks: window.__looks, looking: Boolean((window.looking || {})["%s"]),
    said: (document.querySelector("[data-said]") || {}).textContent,
  };
})()""" % DEVICE


class Page:
    """One tab, with the timers held unless scripts are off."""

    def __init__(self, chrome, width=1440, height=900, scripts=True, intercept=None, media=None):
        self.chrome = chrome
        self.target = chrome.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.session = chrome.call("Target.attachToTarget", {"targetId": self.target, "flatten": True})["sessionId"]
        self.call("Page.enable")
        self.call("Runtime.enable")
        self.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1,
                                                         "mobile": width < 600})
        if scripts:
            self.call("Page.addScriptToEvaluateOnNewDocument", {"source": HELD})
        else:
            self.call("Emulation.setScriptExecutionDisabled", {"value": True})
        if media:
            self.call("Emulation.setEmulatedMedia", {"features": media})
        if intercept:
            self.call("Fetch.enable", {"patterns": [{"urlPattern": intercept, "requestStage": "Request"}]})

    def call(self, method, params=None, timeout=20):
        return self.chrome.call(method, params, self.session, timeout)

    def events(self, method):
        return [e for e in self.chrome.events if e.get("sessionId") == self.session and e.get("method") == method]

    def until(self, test, timeout=15):
        end = time.time() + timeout
        while time.time() < end:
            if test():
                return True
            self.chrome.pump(0.05)
        return test()

    def goto(self, url):
        loads = len(self.events("Page.loadEventFired"))
        self.call("Page.navigate", {"url": url})
        if not self.until(lambda: len(self.events("Page.loadEventFired")) > loads):
            raise TimeoutError("loading " + url)

    def eval(self, expression):
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in result:
            raise RuntimeError(json.dumps(result["exceptionDetails"])[:400])
        return result["result"].get("value")

    def wait(self, expression, timeout=15):
        """The expression's value once it's true, or its last value. A page between documents can't answer yet."""
        end, value = time.time() + timeout, None
        while time.time() < end:
            try:
                value = self.eval(expression)
                if value:
                    return value
            except RuntimeError:
                pass
            self.chrome.pump(0.05)
        return value

    def refresh(self):
        """Fires the page's 5-second refresh and waits for it to finish: it then holds the next one."""
        fired = self.eval("window.__fire(5000)")
        return fired == 1 and bool(self.wait("window.__held(5000) === 1"))

    def key(self, key, shift=False):
        codes = {"Enter": (13, "\r"), "Tab": (9, "")}
        code, text = codes[key]
        down = {"type": "keyDown" if text else "rawKeyDown", "key": key, "code": key, "windowsVirtualKeyCode": code,
                "modifiers": 8 if shift else 0}
        if text:
            down.update(text=text, unmodifiedText=text)
        self.call("Input.dispatchKeyEvent", down)
        self.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": key, "windowsVirtualKeyCode": code,
                                             "modifiers": 8 if shift else 0})

    def click(self, selector):
        x, y = self.eval("(() => { const el = document.querySelector(%s); el.scrollIntoView({ block: 'center' }); "
                         "const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()"
                         % json.dumps(selector))
        for kind in ("mousePressed", "mouseReleased"):
            self.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1})

    def held(self, count, timeout=15):
        """The device check's requests Chrome holds, in the order the page made them, once there are this many."""
        self.until(lambda: len(self.events("Fetch.requestPaused")) >= count, timeout)
        return [e["params"]["requestId"] for e in self.events("Fetch.requestPaused")]

    def answer(self, request, reached):
        if reached:
            self.call("Fetch.fulfillRequest", {"requestId": request, "responseCode": 200, "body": base64.b64encode(b"ok").decode(),
                                               "responseHeaders": [{"name": "Content-Type", "value": "text/plain"}]})
        else:
            self.call("Fetch.failRequest", {"requestId": request, "errorReason": "NameNotResolved"})

    def close(self):
        self.chrome.call("Target.closeTarget", {"targetId": self.target})


def first_paint_and_hash(chrome):
    """The step the address names, or the one kept across a new phase, drawn from the start, and the script showing the
    same: a hash that isn't a step, a hostile one included, opens the first."""
    page = Page(chrome)
    hostile = '"><img src=x onerror="window.__pwned=1">'
    cases = (("", None, "join:1"), ("#join", None, "join:1"), ("#invite", None, "invite:1"), ("#safe", None, "safe:1"),
             ("#phone", None, "phone:1"), ("#nope", None, "join:1"), ("#Invite", None, "join:1"), ("#" + hostile, None, "join:1"),
             ("", "phone:2", "phone:2"), ("", "invite:1", "invite:1"), ("", "safe:2", "safe:2"), ("#invite", "phone:2", "invite:1"),
             ("#safe", "invite:2", "safe:1"), ("", "nope:2", "join:1"), ("", hostile, "join:1"))
    wrong = []
    for hash_, kept, want in cases:
        if kept is not None:
            page.goto(LIVE)
            page.eval("sessionStorage.setItem('buzz-guide', %s)" % json.dumps(kept))
        page.goto("about:blank")
        page.goto(LIVE + hash_)
        first, now = page.eval("window.__firstPaint"), page.eval(GUIDE)
        step, frame = want.split(":")
        good = (first == {"ready": False, "step": step, "shown": [step + ":" + frame]} and now["ready"] and now["at"] == want
                and now["panes"] == now["frames"] == 1 and now["current"] == ["#" + step] and now["kept"] is None
                and now["pwned"] is None and now["images"] == 0)
        if not good:
            wrong.append((hash_[:20], kept, want, first, now))
    ok(not wrong, "before the script draws the guide, the page shows the one step the address names, or the one kept "
       "across a new phase (a hash still wins), at its drawing, and the script keeps it: %d addresses, a hostile hash "
       "and unknown ones open the first step" % len(cases), wrong)
    page.close()


def stepper(chrome):
    """Next and Previous with the keyboard, across steps and stopping at the guide's ends, focus moving along."""
    page = Page(chrome)
    page.goto(LIVE)
    page.eval("document.querySelector('#join .g-frame [data-go=\"1\"]').focus()")
    walk = []
    for _ in range(9):
        page.key("Enter")
        now = page.eval(GUIDE)
        walk.append((now["at"], now["hash"], now["focus"], now["disabled"]))
    forward = [("join:2", "", "go1@join:2", None), ("invite:1", "#invite", "go1@invite:1", None),
               ("invite:2", "#invite", "go1@invite:2", None), ("safe:1", "#safe", "go1@safe:1", None),
               ("safe:2", "#safe", "go1@safe:2", None), ("phone:1", "#phone", "go1@phone:1", None),
               ("phone:2", "#phone", "go1@phone:2", "true"), ("phone:2", "#phone", "go1@phone:2", "true"),
               ("phone:2", "#phone", "go1@phone:2", "true")]
    ok(walk == forward, "Next walks every drawing and crosses into the next step, moving the address to it and focus "
       "to the new drawing's Next; at the guide's last drawing it's aria-disabled and does nothing", walk)
    page.key("Tab", shift=True)
    back = []
    for _ in range(9):
        page.key("Enter")
        now = page.eval(GUIDE)
        back.append((now["at"], now["hash"], now["focus"], now["disabled"]))
    backward = [("phone:1", "#phone", "go-1@phone:1", None), ("safe:2", "#safe", "go-1@safe:2", None),
                ("safe:1", "#safe", "go-1@safe:1", None), ("invite:2", "#invite", "go-1@invite:2", None),
                ("invite:1", "#invite", "go-1@invite:1", None), ("join:2", "#join", "go-1@join:2", None),
                ("join:1", "#join", "go-1@join:1", "true"), ("join:1", "#join", "go-1@join:1", "true"),
                ("join:1", "#join", "go-1@join:1", "true")]
    ok(back == backward, "Previous crosses back into the previous step's last drawing, and stops at the first", back)
    page.eval("document.querySelector('#join .g-frame [data-go=\"1\"]').focus()")
    page.key("Enter")
    page.key("Enter")
    said = [page.eval(GUIDE)["say"]]
    page.key("Enter")
    page.key("Enter")
    said.append(page.eval(GUIDE)["say"])
    page.key("Enter")
    said.append(page.eval(GUIDE)["say"])
    ok(said == ["Invite people, part 1 of 2: Open Membership", "Keep your community safe, part 1 of 2: Give each agent its own "
                "machine", "Keep your community safe, part 2 of 2: Treat an open community as public"],
       "crossing into a step says where the reader is, the safety step by its heading", said)
    page.close()


def step_links(chrome):
    """A step's link, clicked or with Enter, opens it and moves focus to its heading, as the link's jump does without
    scripts; in forced colors, the current link keeps a border."""
    page = Page(chrome, media=[{"name": "forced-colors", "value": "active"}])
    page.goto(LIVE)
    page.click('.g-step[href="#phone"]')
    clicked = page.eval(GUIDE)
    page.click('.g-step[href="#safe"]')
    safe = page.eval(GUIDE)
    page.eval("document.querySelector('.g-step[href=\"#invite\"]').focus()")
    page.key("Enter")
    entered = page.eval(GUIDE)
    ok(clicked["at"] == "phone:1" and clicked["hash"] == "#phone" and clicked["focus"] == "h2@phone"
       and safe["at"] == "safe:1" and safe["hash"] == "#safe" and safe["focus"] == "h2@safe" and safe["current"] == ["#safe"]
       and entered["at"] == "invite:1" and entered["focus"] == "h2@invite" and entered["current"] == ["#invite"],
       "a step's link opens the step at its first drawing and moves focus to the step's heading, clicked or with Enter",
       (clicked, safe, entered))
    borders = page.eval("[...document.querySelectorAll('.g-step')].map((a) => getComputedStyle(a).borderTopStyle + ' ' "
                        "+ getComputedStyle(a).borderTopWidth)")
    kept = page.eval("[...document.querySelectorAll('#safe .sq-fig')].map((f) => getComputedStyle(f).forcedColorAdjust)")
    ok(page.eval("matchMedia('(forced-colors: active)').matches") and borders == ["none 0px", "solid 2px", "none 0px", "none 0px"]
       and kept == ["none", "none"], "in forced colors, the current step's link has a border, the others none, and the "
       "safety step's drawings keep their own colors", (borders, kept))
    page.close()


def refresh_swap(chrome):
    """The 5-second refresh on a live page: the same checks change nothing; changed ones are drawn again with the list
    still open, focus still on the card's summary, the page where it was, and one sentence for screen readers."""
    page = Page(chrome)
    page.goto(LIVE)
    page.eval("(() => { const s = document.querySelector('.ck-all > summary'); s.scrollIntoView({ block: 'center' }); "
              "s.focus(); })()")
    page.key("Enter")
    page.eval("""(() => { window.__said = 0; window.__card = document.querySelector('.ck-card');
      const said = document.querySelector('[data-said]');
      if (said) { new MutationObserver((list) => { window.__said += list.length; })
        .observe(said, { childList: true, characterData: true, subtree: true }); } })()""")
    state = ("(() => ({ same: document.querySelector('.ck-card') === window.__card, open: document.querySelector('.ck-all').open, "
             "focus: document.activeElement.matches('.ck-all > summary') && document.activeElement.isConnected, "
             "said: (document.querySelector('[data-said]') || {}).textContent, writes: window.__said, y: Math.round(scrollY), "
             "sig: document.querySelector('[data-poll]').getAttribute('data-sig') }))()")
    before = page.eval(state)
    unchanged = page.refresh() and page.eval(state)
    ok(before["open"] and before["focus"] and unchanged == before, "a refresh with the same checks changes nothing: the same "
       "card, the list open, focus on its summary, and nothing said", (before, unchanged))
    page.eval("document.querySelector('[data-poll]').setAttribute('data-sig', 'stale')")
    swapped = page.refresh() and page.eval(state)
    ok(swapped and not swapped["same"] and swapped["sig"] != "stale" and swapped["open"] and swapped["focus"]
       and swapped["y"] == before["y"] and swapped["said"] == "Everything works, 3 checks." and swapped["writes"] == 1,
       "when the checks change, the card is drawn again with its list open and focus on its summary, the page doesn't "
       "move, and a screen reader hears the card's summary once", (before, swapped))
    again = page.refresh() and page.eval(state)
    ok(again and again["writes"] == 1, "the next refresh, with nothing new, says nothing", again)
    page.close()
    # While connecting, the sentence is the current stage
    page = Page(chrome)
    page.goto(CONNECTING)
    page.eval("document.querySelector('[data-poll]').setAttribute('data-sig', 'stale')")
    said = page.refresh() and page.eval("(document.querySelector('[data-said]') || {}).textContent")
    ok(said == "Sign in to Cloudflare: your turn.", "while connecting, a change says the current stage", said)
    page.close()


def device_check(chrome):
    """The private network's device check, its answers held back and let through in a chosen order: the reviewers'
    race, where the first look is slow and a refresh comes before it answers."""
    page = Page(chrome, intercept="https://%s/*" % DEVICE)
    page.goto(PRIVATE)
    first = page.held(1)
    start = page.eval(CARD)
    ok(len(first) == 1 and start["row"].startswith("wait|Checking from this device") and start["looking"],
       "the page looks once from this device as it opens, and shows that it's checking", start)
    refreshed = page.refresh()
    during = page.eval(CARD)
    ok(refreshed and during["looks"] == 1, "a refresh during that look starts no other: one look at a time", during)
    # The old race: a second look, if the page started one, answers at once that the device reaches Buzz; then the
    # first look runs out of time. Only the newest look's answer may show.
    second = page.held(2, timeout=1)[1:]
    if second:
        page.answer(second[0], True)
        page.wait("document.querySelector('[data-poll] [data-host]').className === 'ok'")
    page.eval("window.__fire(6000)")
    settled = page.wait("(() => { const c = %s; return !c.looking && !c.row.startsWith('wait') && c; })()" % CARD)
    newest = "ok" if second else "bad"
    ok(settled and settled["row"].startswith(newest + "|"), "a late answer from an older look never replaces a newer "
       "one: the row shows the newest look's answer, here the first look running out of time", settled)
    # The next look reaches Buzz: the problem goes, and the card says everything works
    page.refresh()
    request = page.held(len(first) + len(second) + 1)[-1]
    page.answer(request, True)
    reached = page.wait("(() => { const c = %s; return !c.looking && c.row.startsWith('ok') && c; })()" % CARD)
    ok(reached and reached["tops"] == [] and reached["summary"] == "Everything works, 4 checks" and not reached["alert"],
       "the next look reaches Buzz: the problem goes from above the card, which says Everything works, 4 checks", reached)
    # The same answer again, twice: the row and the card aren't touched
    page.eval("""(() => { window.__writes = 0; new MutationObserver((list) => { window.__writes += list.length; })
      .observe(document.querySelector('[data-poll]'), { subtree: true, childList: true, characterData: true, attributes: true }); })()""")
    for _ in range(2):
        looks = page.eval("window.__looks")
        page.refresh()
        page.answer(page.held(looks + 1)[-1], True)
        page.wait("!(window.looking || {})['%s'] && window.__looks === %d" % (DEVICE, looks + 1))
    ok(page.eval("window.__writes") == 0, "two more looks with the same answer leave the row and the card as they are: no "
       "writes at all", page.eval("window.__writes"))
    # A look still out when the checks are drawn again answers into the row the page has then
    looks = page.eval("window.__looks")
    page.refresh()
    pending = page.held(looks + 1)[-1]
    page.eval("document.querySelector('[data-poll]').setAttribute('data-sig', 'stale')")
    page.refresh()
    redrawn = page.eval(CARD)
    ok(redrawn["looks"] == looks + 1 and redrawn["row"].startswith("ok|") and redrawn["said"] == "Everything works, 4 checks.",
       "drawn again while a look is out: the last answer shows in the new row at once, no second look starts, and a "
       "screen reader hears the card's summary", redrawn)
    page.answer(pending, False)
    lost = page.wait("(() => { const c = %s; return !c.looking && c.row.startsWith('bad') && c; })()" % CARD)
    ok(lost and lost["tops"] == ["bad:device"] and lost["row"].endswith("|See above.") and lost["alert"]
       and lost["summary"] == "Everything else works, 3 of 4 checks",
       "that look's answer, that this device can't reach Buzz, goes to the row the page has now, and above the card", lost)
    page.close()


def new_phase(chrome):
    """A new phase opens the page again, at the reader's step and drawing."""
    page = Page(chrome)
    page.goto(LIVE)
    page.click('.g-step[href="#safe"]')
    page.eval("document.querySelector('#safe .g-frame [data-go=\"1\"]').click()")
    before = page.eval(GUIDE)
    page.eval("window.__old = true; document.querySelector('[data-poll]').setAttribute('data-phase', 'other')")
    page.eval("window.__fire(5000)")
    page.wait("!window.__old && document.readyState === 'complete' && document.querySelector('.guide.ready') !== null")
    after, first = page.eval(GUIDE), page.eval("window.__firstPaint")
    ok(before["at"] == "safe:2" and after["at"] == "safe:2" and after["hash"] == "" and after["kept"] is None
       and first["shown"] == ["safe:2"], "a new phase opens the page again at the reader's step and drawing, drawn "
       "from the start, and keeps nothing after", (before, after, first))
    page.close()


# The safety step's drawings as the reader sees them: which drawing of the agent shows and its labels, the scale each is
# drawn at (the guide allows itself 0.8 before it changes to the tall one), anything outside its drawing or wider than
# its box, whether every person and the agent is drawn, and each drawing's height
SAFE = """(() => {
  const shown = (el) => getComputedStyle(el).display !== "none" && !el.closest("[hidden]");
  const pane = document.getElementById("safe"), figs = [...pane.querySelectorAll(".sq-fig")].filter(shown);
  const inside = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5; };
  const svgs = [...pane.querySelectorAll(".sq-iso")].filter(shown);
  return {
    figs: figs.length, agent: svgs.map((s) => s.classList.contains("sq-wide") ? "wide" : "tall").join(),
    caps: [...pane.querySelectorAll(".sq-caps")].filter(shown).length,
    scale: Math.min(...svgs.map((s) => Math.round(s.getBoundingClientRect().width / s.viewBox.baseVal.width * 100) / 100)),
    cropped: figs.filter((f) => [...f.querySelectorAll(".sq-k, .sq-rec, .sq-iso, .sq-caps, .sq-tray, .sq-room")].filter(shown)
      .some((el) => !inside(el, f))).length + [...pane.querySelectorAll(".sq-tray, .sq-tray li, .sq-room, .g-notes p")]
      .filter(shown).filter((el) => el.scrollWidth > el.clientWidth + 0.5).length,
    drawn: [...pane.querySelectorAll("use")].filter((u) => shown(u.closest("svg"))).map((u) => u.getBBox().width > 0)
      .reduce((all, one) => all && one, true),
    heights: figs.map((f) => Math.round(f.getBoundingClientRect().height)),
    width: figs.length ? Math.round(figs[0].getBoundingClientRect().width) : 0,
    // each chat bubble in the drawing that shows: where its words end, and where its padding starts
    bubbles: [...pane.querySelectorAll(".sq-bub")].filter((g) => shown(g.closest("svg"))).map((g) => {
      const words = [...g.querySelectorAll("text")].pop().getBBox(), bubble = g.querySelector(".sq-w-bub");
      return Math.round((bubble.x.baseVal.value + bubble.width.baseVal.value - 10 - words.x - words.width) * 10) / 10;
    }),
    notes: [...pane.querySelectorAll(".g-notes li")].filter(shown).map((li) => li.textContent.slice(0, 40)),
    intro: pane.querySelector("h2 + .muted").textContent.split(". ")[0],
  };
})()"""


def safety_step(chrome):
    """The safety step with scripts: its drawings as tall as Buzz's screens on a computer, so the stepper stays put, each
    chat bubble as wide as its words, the people and the agent drawn, the tall drawing once the window is a phone's,
    and the notes on each option."""
    page = Page(chrome)
    page.goto(LIVE + "#safe")
    agent = page.eval(SAFE)
    page.eval("document.querySelector('#safe .g-frame [data-go=\"1\"]').click()")
    public = page.eval(SAFE)
    # Buzz's screens are 340 pixels tall at 560 wide or more, and scale down with the width
    screen = round(340 * min(1, agent["width"] / 560))
    ok(agent["agent"] == "wide" and agent["caps"] == 1 and agent["heights"] == [screen] and public["heights"] == [screen]
       and agent["drawn"] and public["drawn"] and agent["cropped"] == public["cropped"] == 0,
       "on a computer, each drawing is as tall as Buzz's screens in the other steps (%d pixels), with the people and the "
       "agent drawn and nothing outside it" % screen, (agent, public))
    ok(len(agent["bubbles"]) == 2 and all(abs(gap) < 0.6 for gap in agent["bubbles"]),
       "each chat bubble is as wide as its words in this browser's font", agent["bubbles"])
    # the window narrows to a phone's: the tall drawing, measured as it shows
    page.call("Emulation.setDeviceMetricsOverride", {"width": 375, "height": 812, "deviceScaleFactor": 1, "mobile": True})
    page.eval("document.querySelector('#safe .g-frame [data-go=\"-1\"]').click()")
    narrow = page.wait("(() => { const s = %s; return s.agent === 'tall' && s; })()" % SAFE)
    ok(narrow and narrow["caps"] == 0 and narrow["scale"] >= 0.8 and narrow["cropped"] == 0 and narrow["drawn"]
       and len(narrow["bubbles"]) == 2 and all(abs(gap) < 0.6 for gap in narrow["bubbles"]),
       "at a phone's width the tall drawing shows, at %s of its size, with its bubbles fitted to their words" % (narrow or {}).get("scale"),
       narrow)
    page.close()
    # The notes on each option: bans only on the owner's own domain, moderation's reading leading while it's on, and no
    # first sentence about the internet on the private network
    seen = {}
    for name, url in (("domain", LIVE), ("moderation", MODERATED), ("private", PRIVATE)):
        page = Page(chrome)
        page.goto(url + "#safe")
        found = page.eval(SAFE)
        seen[name] = (found["intro"], [note.split(".")[0] + ": " + note.split(". ", 1)[1][:16] for note in found["notes"]])
        page.close()
    ok(seen == {"domain": ("Opening your community to the internet exposes you to risk",
                           ["Private channels: Anyone in a priv", "Invite links: A new link works", "Bans: To keep an ident"]),
                "moderation": ("Opening your community to the internet exposes you to risk",
                               ["Private channels: While Moderation", "Invite links: A new link works", "Bans: To keep an ident"]),
                "private": ("Adding agents with access to personal data exposes you to risk",
                            ["Private channels: Anyone in a priv", "Invite links: A new link works"])},
       "the notes on each option: bans on the owner's own domain alone, who can read private messages first while "
       "moderation is on, and on the private network an intro without the internet", seen)


def settings_link(chrome):
    """Moderation's link to the safety step, in Settings: it opens the step in view and moves focus to its heading."""
    page = Page(chrome)
    page.goto(LIVE)
    page.eval("[...document.querySelectorAll('.set-card details')].find((d) => d.querySelector('summary').textContent"
              ".startsWith('Moderation')).open = true")
    page.click('.set-card a[href="#safe"]')
    now = page.wait("(() => { const g = %s; return g.at === 'safe:1' && g; })()" % GUIDE)
    seen = page.eval("(() => { const r = document.getElementById('safe').getBoundingClientRect(); "
                     "return r.top > -1 && r.top < innerHeight; })()")
    ok(now and now["hash"] == "#safe" and now["focus"] == "h2@safe" and now["current"] == ["#safe"] and seen,
       "Moderation's link to the safety step opens it in view and moves focus to its heading", (now, seen))
    page.close()


def without_scripts(chrome):
    """Without scripts: every step and drawing, no stepper, no copy buttons, and from a computer's width to a phone's the
    drawings fit, the safety step's legible and whole."""
    for width in (1440, 375):
        page = Page(chrome, width=width, height=900, scripts=False)
        page.goto(LIVE)
        seen = page.eval("""(() => {
          const shown = (el) => getComputedStyle(el).display !== "none";
          return { js: document.documentElement.className, copies: [...document.querySelectorAll("[data-copy]")].length,
            copiesShown: [...document.querySelectorAll("[data-copy]")].filter(shown).length,
            panes: [...document.querySelectorAll(".g-pane")].filter(shown).map((p) => p.id).join(),
            frames: [...document.querySelectorAll(".g-frame")].filter(shown).length,
            steppers: [...document.querySelectorAll(".g-btns")].filter(shown).length,
            cropped: [...document.querySelectorAll(".g-frame .mb-stage")].filter((s) =>
              s.querySelector(".mb-canvas").getBoundingClientRect().width > s.clientWidth + 0.5).length,
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
        })()""")
        ok(seen == {"js": "", "copies": 2, "copiesShown": 0, "panes": "join,invite,safe,phone", "frames": 8, "steppers": 0,
                    "cropped": 0, "sideways": False},
           "without scripts at %d pixels: every step and drawing, no stepper and no copy buttons, nothing cropped or "
           "wider than the page" % width, seen)
        safe = page.eval(SAFE)
        drawing = "wide" if width > 600 else "tall"
        ok(safe["figs"] == 2 and safe["agent"] == drawing and safe["caps"] == (drawing == "wide") and safe["scale"] >= 0.8
           and safe["cropped"] == 0 and safe["drawn"],
           "and the safety step's two drawings: the %s one of the agent at %s of its size, the people and the agent drawn, "
           "nothing outside its drawing or wider than its box" % (drawing, safe["scale"]), safe)
        page.close()


def main():
    if not os.access(CHROME, os.X_OK):
        print("skipped: no Chrome at " + CHROME + " (set CHROME to another)")
        return 0
    busy = [port for port in PREVIEWS.values() if socket.socket().connect_ex(("127.0.0.1", port)) == 0]
    if busy:
        print("FAIL  ports in use: %s" % busy)
        return 1
    servers = [subprocess.Popen([sys.executable, os.path.join(HERE, "preview.py"), str(port), name],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for name, port in PREVIEWS.items()]
    chrome = None
    try:
        for port in PREVIEWS.values():
            for _ in range(100):
                if socket.socket().connect_ex(("127.0.0.1", port)) == 0:
                    break
                time.sleep(0.1)
        chrome = Chrome()
        print(chrome.call("Browser.getVersion")["product"])
        for test in (first_paint_and_hash, stepper, step_links, safety_step, settings_link, refresh_swap, device_check,
                     new_phase, without_scripts):
            print("== " + test.__doc__.split(":")[0].split(",")[0].strip().rstrip("."))
            try:
                test(chrome)
            except Exception as error:  # one test's failure, reported, and the next one runs
                ok(False, test.__name__ + " stopped: " + repr(error)[:300])
    finally:
        if chrome:
            chrome.close()
        for server in servers:
            server.terminate()
            server.wait()
    print("\npassed: %d  failed: %d" % (PASSED, FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
