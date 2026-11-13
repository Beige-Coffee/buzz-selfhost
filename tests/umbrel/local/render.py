"""Renders every state of the setup page with mocked settings, Tailscale and checks, to catch errors
before a real run. A mocked test: nothing runs but the page's own code."""
import html, importlib.machinery, importlib.util, itertools, json, os, tempfile, time
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../umbrel/setup-page/setup.py")
loader = importlib.machinery.SourceFileLoader("s", PAGE)
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("s", loader)); loader.exec_module(m)
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"
# the app's own Cloudflare tunnel, from waiting for a sign-in to running, and its errors; signin+upload is
# a sign-in the owner uploaded, waiting for the tunnel to take it
CLOUDFLARE = ("", "signin", "signin+upload", "creating", "routing", "taken", "wrong-domain", "error", "running")
UPLOAD_FORM = 'action="cloudflare-upload"'
UPLOAD_OPEN = '<details class="alt" open><summary>Cloudflare saved a file named cert.pem instead?</summary>'
# Moderation as setup.json can hold it: never turned on (no key), on, and turned off again. A Tailscale option
# stores it off whatever is asked, so it has no "on".
MODERATION = (None, True, False)
TICKED, UNTICKED = 'name="moderation" value="on" checked>', 'name="moderation" value="on">'
POINTS = "A ban keeps that identity out of this community, and the agents that join through it."
MESSAGES = ("<b>Could not check access.</b>", "<b>Access is unavailable in this build or on this relay.</b>",
            "<b>Select a community on a relay where you have staff access.</b>")
OWNER_STAFF = "Staff added in Moderation stay staff after the change, whenever Moderation is on."
ADDRESS_LINES = ('data-for="domain">Moderation stays on, at the new address.',
                 'data-for="funnel private">Moderation turns off: it needs your own domain.')
MODERATION_OPEN = '<details open><summary>Moderation<span class="val word">'


def section(page, start, end):
    return page[page.index(start):page.index(end, page.index(start))]


count = 0
for mode in ("domain", "funnel", "private"):
    for named in (True, False):
        for live in (True, False):
            states = ("",) if mode == "domain" else ("NeedsLogin", "NeedsMachineAuth", "Running", "")
            for state, push, cf, moderation in itertools.product(states, (True, False), CLOUDFLARE if mode == "domain" else ("",),
                                                                 MODERATION if mode == "domain" else (None, False)):
                d = tempfile.mkdtemp()
                m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
                m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
                m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts-on", d + "/ts.json", d + "/ts.txt"
                m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
                    d + "/cf-on", d + "/cf-state", d + "/cf-login.log", d + "/cf-setup.log", d + "/cf-reset")
                m.CLOUDFLARE_UPLOAD = d + "/cf-upload.pem"
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
                    assert ("Phone notifications are " + ("on" if push else "off")) in page or not live
                    assert ('href="buzz://connect?relay=wss%3A%2F%2F' + domain + '"') in page or not (live and named)
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
                            assert "Bans, timeouts and your staff list stay as they are." in row
                        else:
                            assert "It starts working once your community is live." in row and MESSAGES[0] not in row
                    elif live:
                        assert UNTICKED in row and POINTS in row and "Moderation doesn't show in Buzz?" not in row
                        assert "Saving restarts Buzz for a few seconds." in row
                    else:
                        assert "You can turn it on here once your community is live." in row and 'name="moderation"' not in row
                    if mode == "domain":
                        assert (m.STAFF_RETURN in row) == (moderation is False and not on), (moderation, live)
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
                    address_form = section(page, 'action="address"', "</form>")
                    assert all((line in address_form) == on for line in ADDRESS_LINES), (mode, moderation)
                    # The safety tips, on the live page: how to ban on the owner's own domain, and who can read private
                    # messages while moderation is on
                    if live:
                        tips = section(page, "<summary>Keeping your community safe", "</details>")
                        assert (m.MODERATION_TIP in tips) == on
                        assert (m.BAN_TIP[True] in tips) == on and (m.BAN_TIP[False] in tips) == (mode == "domain" and not on)
                    else:
                        assert "Keeping your community safe" not in page
                    count += 1
for values in ({}, {"owner": "x", "mode": "private", "ack": "yes"}):
    assert "<main>" in m.setup_page("e", values); count += 1
assert "<main>" in m.login_page("e"); count += 1

# The status list's moderation row, in each state, and the hint for each kind of answer from moderation's address
d = tempfile.mkdtemp()
m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts-on", d + "/ts.json", d + "/ts.txt"
m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
    d + "/cf-on", d + "/cf-state", d + "/cf-login.log", d + "/cf-setup.log", d + "/cf-reset")
m.CLOUDFLARE_UPLOAD = d + "/cf-upload.pem"
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
print("rendered", count, "page states without errors")
