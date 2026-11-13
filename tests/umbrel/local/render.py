"""Renders every state of the setup page with mocked settings, Tailscale and checks, to catch errors
before a real run. A mocked test: nothing runs but the page's own code. Then the live page's checks card in
each state, and every connecting stage of the three options through the page's own checks, with the network
mocked."""
import html, importlib.machinery, importlib.util, itertools, json, os, re, tempfile, time
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../umbrel/setup-page/setup.py")
loader = importlib.machinery.SourceFileLoader("s", PAGE)
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("s", loader)); loader.exec_module(m)
CHECK = m.check
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"


def use(d):
    """The page's folders, all in d."""
    m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
    m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
    m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts-on", d + "/ts.json", d + "/ts.txt"
    m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
        d + "/cf-on", d + "/cf-state", d + "/cf-login.log", d + "/cf-setup.log", d + "/cf-reset")
    m.CLOUDFLARE_UPLOAD = d + "/cf-upload.pem"


# The live page's next steps, as a guide: its steps, their drawings in order with what each shows, and what the
# captions keep from the longer texts they replaced
GUIDE_STEPS = (("join", "Join your community", "First, as the owner", "Step 1 of 3"),
               ("invite", "Invite people", "With an invite link", "Step 2 of 3"),
               ("phone", "Pair your phone", "Optional", "Step 3 of 3 &middot; Optional"))
GUIDE_FRAMES = {"join": (("Open Join a community", '<p class="on">', "If Buzz opens on a <b>Join a community</b> page instead"),
                         ("Paste the address", "<h6>Community URL</h6>", "choose <b>Continue</b> twice")),
                "invite": (("Open Membership", 'dark hot">Invite members</span>', "the <b>Invite</b> tab in newer versions of Buzz"),
                           ("Send an invite link", "<b>Add or invite people</b>", "then send them the address")),
                "phone": (("Scan the code", "Copy pairing code", "choose <b>Add Community</b> in its community switcher"),
                          ("Check the code", 'dark hot">Codes match</span>', "choose <b>Use Face ID</b> or <b>Skip</b>"))}
GUIDE_LINK = ('<a class="g-out" href="https://self-host.buzz/" target="_blank" rel="noopener">')
OWN_KEY = ('Made your own key? <a href="https://self-host.buzz/" target="_blank" rel="noopener">The self-hosting guide</a> '
           "shows how to join with it.")
BUILDERLAB = '<details class="g-more"><summary>Signed in with Builderlab?</summary>'
NOTIFY_ON = "iPhones get notifications for direct messages and mentions. Android phones don't yet."
NOTIFY_OFF = "Phone notifications are off. You can turn them on in Settings."
# texts the guide dropped, or the old next steps had
GONE = ("Bought the domain recently?", "Opens Buzz on this computer", "Show me how", "Join as you set up Buzz",
        "Phone notifications are on for iPhone", "<h2>Add members</h2>")
# the app's own Cloudflare tunnel, from waiting for a sign-in to running, and its errors; signin+upload is
# a sign-in the owner uploaded, waiting for the tunnel to take it
CLOUDFLARE = ("", "signin", "signin+upload", "creating", "routing", "taken", "wrong-domain", "error", "running")
UPLOAD_FORM = 'action="cloudflare-upload"'
UPLOAD_OPEN = '<details class="alt" open><summary>Cloudflare saved a file named cert.pem instead?</summary>'
# Moderation as setup.json can hold it: never turned on (no key), on, and turned off again. A Tailscale option
# stores it off whatever is asked, so it has no "on".
MODERATION = (None, True, False)
TICKED, UNTICKED = 'name="moderation" value="on" checked>', 'name="moderation" value="on">'
POINTS = "A ban keeps one identity out of this community, and the agents that join through it."
MESSAGES = ("<b>Could not check access.</b>", "<b>Access is unavailable in this build or on this relay.</b>",
            "<b>Select a community on a relay where you have staff access.</b>")
OWNER_STAFF = "Staff added in Moderation stay staff after the change, whenever Moderation is on."
OWNER_REVIEW = "The new owner can review the staff in Buzz under Moderation, then Staff."
OWNER_LOSES = "You lose Moderation after the change, unless the new owner adds you as staff"
# Buzz's reason shows only as its button's tooltip, and its third message also comes from Cloudflare or a lost port
WHERE = "If it says Unavailable, point at its button to see the reason."
NOT_ONLY = "Cloudflare turning Buzz away, or a request that lost its port, shows this message as well."
OPERATORS_STAY = "Staff with the operator role can still rename public channels while it's off"
PRIVATE_LEAD = "<b>Private channels and direct messages are for the people in them.</b>"
ADDRESS_LINES = ('data-for="domain">Moderation stays on, at the new address.',
                 'data-for="funnel private">Moderation turns off: it needs your own domain.')
MODERATION_OPEN = '<details open><summary>Moderation<span class="val word">'


def section(page, start, end):
    return page[page.index(start):page.index(end, page.index(start))]


def check_guide(page, mode, domain, push):
    """The live page's guide: three steps in order, each with two drawings, a stepper and its own notes. Returns the
    number of steps and drawings checked."""
    guide = section(page, '<section class="next">', 'aria-live="polite"></p></div></section>')
    nav = section(guide, '<nav class="g-nav" aria-label="Next steps">', "</nav>")
    # the steps, in order, as links that work without scripts; none is current until the script picks one
    links = re.findall(r'<a class="g-step" href="#(\w+)">.*?<b>(.*?)</b><small>(.*?)</small>', nav)
    assert links == [(key, title, sub) for key, title, sub, _ in GUIDE_STEPS], links
    assert "aria-current" not in guide
    # Go further: the guide's homepage alone, in a new tab
    assert nav.count("self-host.buzz") == 1 and GUIDE_LINK in nav and ">Go further</p>" in nav
    assert "<b>The self-hosting guide</b><small>Roles, moderation, backups and agents</small>" in nav
    assert re.findall(r'href="https://self-host\.buzz[^"]*"', guide) == ['href="https://self-host.buzz/"'] * 2
    # each pane runs to its last </section>: Buzz's drawn screens have sections of their own
    parts = guide.split('<section class="g-pane" id="')[1:]
    panes = [(part[:part.index('"')], part[part.index('">') + 2:part.rindex("</section>")]) for part in parts]
    assert [key for key, _ in panes] == ["join", "invite", "phone"]
    checked = 0
    for (key, pane), (_, title, _, kicker) in zip(panes, GUIDE_STEPS):
        assert pane.startswith('<p class="eyebrow">' + kicker + "</p><h2>" + title + "</h2>"), key
        frames = pane.split('<div class="g-frame" ')[1:]
        assert len(frames) == 2, key
        for n, (frame, (name, drawn, kept)) in enumerate(zip(frames, GUIDE_FRAMES[key]), 1):
            assert '<span class="g-n" aria-hidden="true">0%d / 02</span>' % n in frame and '<span class="g-t">' + name + "</span>" in frame
            assert '<span class="vh">Part %d of 2: </span>' % n in frame
            assert drawn in frame and kept in frame, (key, n, drawn, kept)
            assert 'data-say="' + html.escape(title + ", part %d of 2: " % n + name) + '"' in frame
            # the stepper's buttons, with names, stopped only at the guide's ends
            assert 'data-go="-1" aria-label="Previous"' in frame and 'data-go="1" aria-label="Next"' in frame
            assert ('data-go="-1" aria-label="Previous" aria-disabled="true"' in frame) == (key == "join" and n == 1)
            assert ('data-go="1" aria-label="Next" aria-disabled="true"' in frame) == (key == "phone" and n == 2)
            checked += 1
        checked += 1
    join, invite, phone = (pane for _, pane in panes)
    # Join: the address to open or copy, kept in a data attribute, and the own-key line
    assert ('<a class="btn" href="buzz://connect?relay=wss%3A%2F%2F' + domain + '">Open in Buzz</a>') in join
    assert ('data-copy="https://' + domain + '" onclick="copyText(this, this.dataset.copy)">Copy the address</button>') in join
    assert OWN_KEY in join and join.count("self-host.buzz") == 1
    # Invite: who can connect, on the private network alone
    assert (m.private_members_note() in invite) == (mode == "private") and m.private_members_note() not in join + phone
    # Phone: the stores, Tailscale on the private network, Builderlab under the first drawing, notifications last
    assert m.APP_STORE in phone and m.GOOGLE_PLAY in phone
    assert ("The phone needs Tailscale too." in phone) == (mode == "private")
    first, second = phone.split('<div class="g-frame" ')[1:]
    assert BUILDERLAB in first and BUILDERLAB not in second and "<code>https://" + domain + "</code>" in first
    assert "Get Buzz on your phone" in first and "<b>or sign in with email</b>" in first and "<b>Enter a community link</b>" in first
    assert phone.endswith('<div class="g-foot"><p class="note">' + (NOTIFY_ON if push else NOTIFY_OFF) + "</p></div>")
    assert page.count(NOTIFY_ON if push else NOTIFY_OFF) == 1 and (NOTIFY_OFF if push else NOTIFY_ON) not in page
    assert not any(gone in page for gone in GONE), [gone for gone in GONE if gone in page]
    return checked



# The guide's look, from the stylesheet: about 1000px wide on a computer, stacked below 880px, 44px stepper buttons
style = m.STYLE + m.HOW_STYLE
assert "min(1000px, 100vw)" in section(style, ".next {", "}") and "@media (min-width: 880px) { .guide { grid-template-columns: 250px" in style
assert "width: 44px; height: 44px;" in section(style, ".g-btns button {", "}")

count = 0
for mode in ("domain", "funnel", "private"):
    for named in (True, False):
        for live in (True, False):
            states = ("",) if mode == "domain" else ("NeedsLogin", "NeedsMachineAuth", "Running", "")
            for state, push, cf, moderation in itertools.product(states, (True, False), CLOUDFLARE if mode == "domain" else ("",),
                                                                 MODERATION if mode == "domain" else (None, False)):
                use(tempfile.mkdtemp())
                domain = ("buzz.example.com" if mode == "domain" else "buzz.tail1234.ts.net") if named else ""
                if mode == "domain" and not named:
                    continue
                m.save(OWNER, m.owner_hex(OWNER), mode, domain, push, moderation)
                if cf:
                    open(m.CLOUDFLARE_STATE, "w").write(cf.split("+")[0] + "\n")
                    open(m.CLOUDFLARE_LOGIN, "w").write("https://dash.cloudflare.com/argotunnel?aud=&callback=x\n")
                    open(m.CLOUDFLARE_SETUP, "w").write("2026-10-28T00:00:00Z ERR Failed to add route: <reason>\n")
                    if cf.endswith("+upload"):
                        open(m.CLOUDFLARE_UPLOAD, "w").write("a sign-in the owner uploaded\n")
                json.dump({"BackendState": state, "AuthURL": "https://login.tailscale.com/a/x", "Self": {"DNSName": domain + ".", "ID": "n1"}}, open(m.TAILSCALE_STATUS, "w"))
                m.CACHE["key"] = None
                m.check = (lambda lv: (lambda setup, page_load=False: (lv, [m.item("relay", "ok", "x"), m.item("device", "wait", "y")])))(live)
                setup = m.load_setup()
                on = moderation is True and mode == "domain"
                assert m.moderation_on(setup) == on and ("BUZZ_ADMIN_HOST=buzz.example.com:8443" in m.read_text(m.RELAY_ENV)) == on
                forms = ({}, {"form": "owner", "owner": "bad"}, {"form": "address", "mode": "funnel"}, {"form": "moderation"})
                for values in forms + (({"form": "cert"},) if mode == "domain" else ()):
                    page = m.main_page(setup, "an error" if values else "", values)
                    assert "<main>" in page and "Traceback" not in page
                    assert ((NOTIFY_ON if push else NOTIFY_OFF) in page) == live
                    assert ('href="buzz://connect?relay=wss%3A%2F%2F' + domain + '"') in page or not (live and named)
                    # Live: the checks as a card, then the next steps as a guide. Connecting: the checks as a bar.
                    assert ('<div class="set-card ck-card' in page) == live and ('<ol class="bar"' in page) == (not live)
                    assert ('<section class="next">' in page) == live and page.count('<div class="checks" data-poll data-phase="') == 1
                    if live and named and not values:
                        count += check_guide(page, mode, domain, push)
                    # The upload, only while the tunnel waits for a sign-in and none was uploaded yet
                    if live or cf != "signin":
                        assert UPLOAD_FORM not in page, (mode, live, cf)
                    else:
                        assert UPLOAD_FORM in page and 'enctype="multipart/form-data"' in page and "My Profile, API Tokens" in page
                        assert "Sign in to Cloudflare</a>" in page
                        if values.get("form") == "cert":
                            box = page[page.index(UPLOAD_OPEN):]
                            assert box.index('role="alert">an error') < box.index("</details>"), "the error is inside the upload"
                        else:
                            assert UPLOAD_OPEN not in page
                    if not live and cf == "signin+upload":
                        assert "Signed in with your file" in page and "Sign in to Cloudflare</a>" not in page
                        assert "My Profile, API Tokens" in page
                    # Settings, Moderation: offered on the owner's own domain once live, and turned off from anywhere
                    row = section(page, "<summary>Moderation", "<summary>Address")
                    if mode != "domain":
                        assert "Own domain only" in row and "Buzz won't connect to it at a Tailscale address" in row
                        assert 'name="moderation"' not in row, (mode, moderation)
                    elif on:
                        assert TICKED in row and POINTS in row and m.STAFF_RETURN not in row
                        if live:
                            assert "Moderation doesn't show in Buzz?" in row and all(t in row for t in MESSAGES)
                            assert WHERE in row and NOT_ONLY in row
                            assert "Bans, timeouts and your staff list stay as they are." in row and OPERATORS_STAY in row
                        else:
                            assert "It starts working once your community is live." in row and MESSAGES[0] not in row
                    elif live:
                        assert UNTICKED in row and POINTS in row and "Moderation doesn't show in Buzz?" not in row
                        assert "Saving restarts Buzz for a few seconds." in row
                    else:
                        assert "You can turn it on here once your community is live." in row and 'name="moderation"' not in row
                    if mode == "domain":
                        assert (m.STAFF_RETURN in row) == (moderation is False and not on), (moderation, live)
                    # Staff with the operator role keep renaming public channels while it's off: said wherever the page
                    # says staff come back with it
                    assert m.OPERATOR_RENAME in m.STAFF_RETURN
                    assert ('<span class="val word">' + ("On" if on else "Off" if mode == "domain" else "Own domain only")
                            + "</span>") in row
                    if values.get("form") == "moderation":
                        assert page.count(MODERATION_OPEN) == 1 and 'role="alert">an error' in row, "the error is inside Moderation"
                    else:
                        assert MODERATION_OPEN not in page
                    # The owner form says staff stay whenever moderation has been on; the address form, what happens
                    # to moderation, only while it's on
                    owner_form = section(page, "<summary>Owner", "</form>")
                    assert (OWNER_STAFF in owner_form) == (moderation is not None), (mode, moderation)
                    assert (m.OPERATOR_RENAME in owner_form) == (moderation is not None), (mode, moderation)
                    # where Buzz can open moderation, the new owner reviews the staff; while it's on, the owner loses it
                    assert (OWNER_REVIEW in owner_form) == (moderation is not None and mode == "domain"), (mode, moderation)
                    assert (OWNER_LOSES in owner_form) == on, (mode, moderation)
                    address_form = section(page, 'action="address"', "</form>")
                    assert all((line in address_form) == on for line in ADDRESS_LINES), (mode, moderation)
                    # The safety tips, on the live page: how to ban on the owner's own domain, and who can read private
                    # messages while moderation is on
                    if live:
                        tips = section(page, "<summary>Keeping your community safe", "</details>")
                        assert (m.MODERATION_TIP in tips) == on
                        # and while it's on, the tip's lead promises no privacy from moderation
                        assert ("<b>" + m.MODERATED_PRIVATE_TIP + "</b>" in tips) == on and (PRIVATE_LEAD in tips) == (not on)
                        assert (m.BAN_TIP[True] in tips) == on and (m.BAN_TIP[False] in tips) == (mode == "domain" and not on)
                    else:
                        assert "Keeping your community safe" not in page
                    count += 1
for values in ({}, {"owner": "x", "mode": "private", "ack": "yes"}):
    assert "<main>" in m.setup_page("e", values); count += 1
assert "<main>" in m.login_page("e"); count += 1

# The status list's moderation row, in each state, and the hint for each kind of answer from moderation's address
use(tempfile.mkdtemp())
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; "
       "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
ANSWERS = {  # what https://<domain>:8443/ can answer, and the kind the page makes of it
    "ok": (404, {"content-security-policy": CSP}, b""),
    "cloudflare": (403, {"content-type": "text/plain; charset=UTF-8"}, b"error code: 1010"),
    "port": (200, {"content-type": "application/nostr+json"}, b'{"name":"x","supported_nips":[1,11]}'),
    "nothing": (None, {}, b"timed out"),
    "other": (530, {"content-type": "text/html"}, b"<html>error code: 1033</html>"),
}
for domain in ("buzz.example.com", "a&b.example.com"):
    for moderation in (None, True, False):
        m.save(OWNER, m.owner_hex(OWNER), "domain", "buzz.example.com", True, moderation)
        setup = m.load_setup()
        for advertised in ("", "https://" + domain + ":8443", "https://old.example.com:8443"):
            for kind in (None,) + tuple(ANSWERS):
                m.forget_admin()
                key = m.admin_key(domain)
                if kind:
                    got = m.admin_answer(*ANSWERS[kind])
                    assert got[0] == kind, (kind, got)
                    m.ADMIN.update(key=key, at=time.time(), value=got)
                row = m.admin_item(setup, domain, advertised, key)
                if not m.moderation_on(setup):
                    assert (row is None) == (advertised == "") and (row is None or row["text"] == "Turning off moderation")
                    continue
                if advertised != "https://" + domain + ":8443":
                    assert row["text"] == "Turning on moderation" and not row.get("due")
                    continue
                listed = m.status_html([row])
                assert "Traceback" not in listed and html.escape("https://" + domain + ":8443") in listed
                assert "a&b" not in listed, "the domain is escaped"
                if kind is None:
                    assert row.get("due") and row["state"] == "wait" and "Checking moderation" in row["text"]
                    assert m.phase_of(setup, True, [row]).endswith(":moderation") and m.phase_of(setup, False, [row]).endswith(":starting")
                else:
                    assert row["state"] == ("ok" if kind == "ok" else "bad") and not row.get("due")
                    assert bool(row["hint"]) == (kind != "ok") and m.phase_of(setup, True, [row]).endswith(":-")
                count += 1
assert m.admin_hint("other", 530).startswith("It answered with HTTP 530.") and m.admin_hint("other", None).startswith("Reload")

# The live page's checks, one card: all ok, a problem, a check still waiting, both, and the private network's check
OK3 = [m.item("relay", "ok", "Buzz is running on this Umbrel"),
       m.item("reach", "ok", "This Umbrel's Buzz answers at <code>https://buzz.example.com</code>"),
       m.item("pair", "ok", "Phones can pair")]
PROBLEM = m.item("admin", "bad", "Moderation isn't reachable at <code>https://buzz.example.com:8443</code>", m.admin_hint("cloudflare", 403))
WAITING = m.item("admin", "wait", "Turning on moderation", "Buzz restarts for a few seconds.")
NO_PAIRING = m.item("pair", "bad", "Phone pairing isn't reachable yet", "A hint for pairing.")
DEVICE = m.item("device", "wait", "Checking from this device...", "")
TOP = re.compile(r'<div class="ck-top (\w+)" data-key="(\w+)"><span class="icon"></span><span class="text">(.*?)</span>'
                 r'<span class="hint">(.*?)</span></div>')
ROW = re.compile(r'<li class="(\w+)"[^>]*><span class="icon"></span><span class="text">(.*?)</span><span class="hint">(.*?)</span></li>')


def assert_card(card, items, tops_want, summary_want, alert):
    tops = TOP.findall(card)
    assert [(state, key) for state, key, _, _ in tops] == tops_want, (tops, tops_want)
    # above the fold, each with its own text and full hint; in the fold, every check, the ones above with "See above."
    by = {e["key"]: e for e in items}
    assert all(text == by[key]["text"] and hint == by[key]["hint"] for _, key, text, hint in tops)
    assert ROW.findall(card) == [(e["state"], e["text"], e["hint"] if e["state"] == "ok" else "See above.") for e in items]
    assert re.search(r'<span class="ck-sum">(.*?)</span><span class="val word">(.*?)</span>', card).groups() == summary_want
    assert ("ck-alert" in card) == alert and card.count('<details class="ck-all">') == 1
    assert ('data-host="' in card) == ("device" in by) and (not tops or card.index("ck-top") < card.index('<details class="ck-all">'))


for items, tops_want, summary_want, alert in (
        (OK3, [], ("Everything works", "3 checks"), False),
        (OK3[:1], [], ("Everything works", "1 check"), False),
        (OK3 + [PROBLEM], [("bad", "admin")], ("Everything else works", "3 of 4 checks"), True),
        (OK3 + [WAITING], [("wait", "admin")], ("Everything else works", "3 of 4 checks"), False),
        (OK3[:2] + [WAITING, NO_PAIRING], [("bad", "pair"), ("wait", "admin")], ("Everything else works", "2 of 4 checks"), True),
        (OK3 + [DEVICE], [("wait", "device")], ("Everything else works", "3 of 4 checks"), False)):
    assert_card(m.check_card(items), items, tops_want, summary_want, alert)
    count += 1

# Every connecting stage of the three options, through the page's own checks: the bar's segments, which one is
# current, YOU where the owner can act, and each problem's hint under the bar. Then each option live, as a card.
DOMAIN, TS, PUBLIC = "buzz.example.com", "buzz.tail1234.ts.net", ["104.16.0.1"]
SERVE = {"funnel": "https://" + TS + " (Funnel on)\n|-- / proxy http://buzz-gateway:80\n",
         "private": "https://" + TS + " (tailnet only)\n|-- / proxy http://buzz-gateway:80\n"}
LABELS = {"domain": ["Set up on this Umbrel", "Sign in to Cloudflare", "Cloudflare publishes the name", "Phones can pair"],
          "funnel": ["Set up on this Umbrel", "Sign in to Tailscale", "Allow Funnel", "Tailscale publishes the address", "Phones can pair"],
          "private": ["Set up on this Umbrel", "Sign in to Tailscale", "Allow HTTPS"]}
SEGMENT = re.compile(r'<li class="(\w+)"( aria-current="step")?><span class="tr"></span><span class="lb">(.*?)</span>'
                     r'<span class="vh">: (.*?)</span></li>')


def stage(mode, cf=None, link=True, upload=False, backend=None, named=False, serve="", consent=False,
          relay=True, addresses=(), live=None, pair=False, other=False):
    """A fresh setup in one stage: the tunnel's or the Tailscale machine's files, and the relay and the public name
    as the page's checks see them. Returns the setup."""
    use(tempfile.mkdtemp())
    domain = DOMAIN if mode == "domain" else TS if named else ""
    m.save(OWNER, m.owner_hex(OWNER), mode, domain)
    if cf is not None:
        open(m.CLOUDFLARE_STATE, "w").write(cf + "\n")
        open(m.CLOUDFLARE_LOGIN, "w").write("https://dash.cloudflare.com/argotunnel?aud=&callback=x\n" if link else "Starting\n")
        if upload:
            open(m.CLOUDFLARE_UPLOAD, "w").write("a sign-in the owner uploaded\n")
    if backend is not None:
        json.dump({"BackendState": backend, "AuthURL": "https://login.tailscale.com/a/x",
                   "Self": {"DNSName": domain + "." if domain else "", "ID": "n1"}}, open(m.TAILSCALE_STATUS, "w"))
        open(m.TAILSCALE_SERVE, "w").write(SERVE.get(serve, ""))
        if consent:
            open(os.path.join(m.TAILSCALE_DIR, "tailscale-publish.log"), "w").write(
                "To enable, visit:\n\n https://login.tailscale.com/f/" + ("funnel" if mode == "funnel" else "serve") + "?node=n1\n")

    def request(host, port, path, tls=False, headers=None, timeout=6, addr=None):
        if host == m.RELAY_HOST:
            if not relay:
                return None, b"connection refused"
            return (200, b"ok") if path == "/_readiness" else (200, json.dumps({"self": "aa" * 32}).encode())
        if path == "/pair":
            return (101, b"") if pair else (None, b"connection refused")
        if live is None:
            return None, b"Name or service not known"
        if path == "/_liveness":
            return live
        return 200, json.dumps({"self": ("bb" if other else "aa") * 32}).encode()
    m.request, m.resolves, m.check = request, (lambda name: list(addresses)), CHECK
    m.CACHE["key"] = None
    return m.load_setup()


def rendered(setup):
    """The page, its checks as status.json sends them, and those checks themselves."""
    page = m.main_page(setup)
    live, items = m.check(setup)
    checks = m.checks_html(setup, live, items)
    # status.json's checks are the page's, with the same signature
    assert ('data-sig="' + m.checks_sig(checks) + '">' + checks + "</div>") in page
    return page, live, items, checks


PHASES = (
    ("domain", "starting Cloudflare's sign-in while Buzz starts", dict(cf="", relay=False), "work wait wait wait"),
    ("domain", "starting Cloudflare's sign-in", dict(cf=""), "done work wait wait"),
    ("domain", "the sign-in, its link not there yet", dict(cf="signin", link=False), "done work wait wait"),
    ("domain", "the sign-in link while Buzz starts", dict(cf="signin", relay=False), "work you wait wait"),
    ("domain", "the sign-in link", dict(cf="signin"), "done you wait wait"),
    ("domain", "signed in with the file Cloudflare saved", dict(cf="signin", upload=True), "done done work wait"),
    ("domain", "creating the tunnel", dict(cf="creating"), "done done work wait"),
    ("domain", "routing the name", dict(cf="routing"), "done done work wait"),
    ("domain", "the tunnel runs, the name not published", dict(cf="running"), "done done work wait"),
    ("domain", "published, nothing answers yet", dict(cf="running", addresses=PUBLIC, live=(None, b"timed out")), "done done work wait"),
    ("domain", "published, no connected tunnel", dict(cf="running", addresses=PUBLIC, live=(530, b"error code: 1033")), "done done bad wait"),
    ("domain", "published, the tunnel can't reach Buzz", dict(cf="running", addresses=PUBLIC, live=(502, b"")), "done done bad wait"),
    ("domain", "another relay answers there", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), other=True), "done done bad wait"),
    ("domain", "reachable, pairing not yet", dict(cf="running", addresses=PUBLIC, live=(200, b"ok")), "done done done work"),
    ("domain", "the name is taken", dict(cf="taken"), "done bad wait wait"),
    ("domain", "the wrong domain chosen", dict(cf="wrong-domain"), "done bad wait wait"),
    ("domain", "Cloudflare refused a step", dict(cf="error"), "done bad wait wait"),
    ("funnel", "starting Tailscale", dict(backend="NoState", relay=False), "work wait wait wait wait"),
    ("funnel", "Tailscale's sign-in link", dict(backend="NeedsLogin", relay=False), "work you wait wait wait"),
    ("funnel", "approving the machine", dict(backend="NeedsMachineAuth", relay=False), "work you wait wait wait"),
    ("funnel", "Funnel to allow while Buzz starts", dict(backend="Running", named=True, consent=True, relay=False), "work done you wait wait"),
    ("funnel", "Funnel to allow", dict(backend="Running", named=True, consent=True), "done done you wait wait"),
    ("funnel", "waiting for Tailscale to ask", dict(backend="Running", named=True), "done done work wait wait"),
    ("funnel", "Funnel on, the name not published", dict(backend="Running", named=True, serve="funnel"), "done done done work wait"),
    ("funnel", "Funnel on, nothing answers yet", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                      live=(None, b"timed out")), "done done done work wait"),
    ("funnel", "Funnel on, an error answers", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                   live=(502, b"")), "done done done bad wait"),
    ("funnel", "reachable, pairing not yet", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                  live=(200, b"ok")), "done done done done work"),
    ("private", "starting Tailscale", dict(backend="Starting", relay=False), "work wait wait"),
    ("private", "Tailscale's sign-in link", dict(backend="NeedsLogin", relay=False), "work you wait"),
    ("private", "approving the machine", dict(backend="NeedsMachineAuth", relay=False), "work you wait"),
    ("private", "HTTPS to allow while Buzz starts", dict(backend="Running", named=True, consent=True, relay=False), "work done you"),
    ("private", "HTTPS to allow", dict(backend="Running", named=True, consent=True), "done done you"),
    ("private", "getting the certificate", dict(backend="Running", named=True), "done done work"),
    ("private", "on the network while Buzz starts", dict(backend="Running", named=True, serve="private", relay=False), "work done done"),
)
for mode, what, files, want in PHASES:
    setup = stage(mode, **files)
    page, live, items, checks = rendered(setup)
    assert not live and "<h1>Connect " in page and '<section class="next">' not in page and '<div class="set-card ck-card' not in page, what
    segments = SEGMENT.findall(checks)
    states = [state for state, _, _, _ in segments]
    assert states == want.split(), (mode, what, states)
    assert checks.count('style="--n:' + str(len(states)) + '"') == 1
    labels = LABELS[mode][:]
    if files.get("backend") == "NeedsMachineAuth":
        labels[1] = "Approve buzz in Tailscale"
    assert [re.sub(r"<b[^>]*>!</b>|<em[^>]*>YOU</em>|<[^>]+>", "", label) for _, _, label, _ in segments] == labels, (mode, what)
    # one current step: the owner's turn if there is one, else the first one not done
    current = [i for i, (_, mark, _, _) in enumerate(segments) if mark]
    first = next(i for i, s in enumerate(states) if s != "done")
    assert current == [states.index("you") if "you" in states else first], (mode, what, current)
    for state, _, label, said in segments:
        assert ('<em aria-hidden="true">YOU</em>' in label) == (state == "you") and said.startswith(m.STAGE_WORDS[state] + ".")
        assert (m.ti("check") in label) == (state == "done") and ('<i aria-hidden="true"></i>' in label) == (state == "work")
    # every check's sentence is there for screen readers, every problem shows under the bar with its hint, and the
    # device check waits for the live page
    assert all(e["text"] in checks for e in items if e["key"] != "device") and 'data-host="' not in checks
    problems = [e for e in items if e["state"] == "bad"]
    assert TOP.findall(checks) == [("bad", e["key"], e["text"], e["hint"]) for e in problems], (mode, what)
    assert ("ck-alert" in checks) == bool(problems) and checks.count('<b aria-hidden="true">!</b>') == states.count("bad")
    count += 1

for mode, files, tops_want, summary_want in (
        ("domain", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), pair=True), [], ("Everything works", "3 checks")),
        ("funnel", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC, live=(200, b"ok"), pair=True), [],
         ("Everything works", "5 checks")),
        ("private", dict(backend="Running", named=True, serve="private"), [("wait", "device")], ("Everything else works", "3 of 4 checks"))):
    setup = stage(mode, **files)
    page, live, items, checks = rendered(setup)
    assert live and '<section class="next">' in page and '<ol class="bar"' not in page, mode
    assert_card(checks, items, tops_want, summary_want, False)
    assert ('data-host="' + TS + '"' in checks) == (mode == "private")
    count += 1
print("rendered", count, "page states without errors")
