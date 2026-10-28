"""Renders every state of the setup page with mocked settings, Tailscale and checks, to catch errors
before a real run. A mocked test: nothing runs but the page's own code."""
import importlib.machinery, importlib.util, itertools, json, os, tempfile
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../umbrel/buzz/setup.py.template")
loader = importlib.machinery.SourceFileLoader("s", PAGE)
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("s", loader)); loader.exec_module(m)
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"
# the app's own Cloudflare tunnel, from waiting for a sign-in to running, and its errors
CLOUDFLARE = ("", "signin", "creating", "routing", "taken", "wrong-domain", "error", "running")
count = 0
for mode in ("domain", "funnel", "private"):
    for named in (True, False):
        for live in (True, False):
            states = ("",) if mode == "domain" else ("NeedsLogin", "NeedsMachineAuth", "Running", "")
            for state, push, cf in itertools.product(states, (True, False), CLOUDFLARE if mode == "domain" else ("",)):
                d = tempfile.mkdtemp()
                m.SETTINGS_DIR, m.RELAY_ENV, m.SETUP_JSON = d, d + "/relay.env", d + "/setup.json"
                m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts-on", d + "/ts.json", d + "/ts.txt"
                m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
                    d + "/cf-on", d + "/cf-state", d + "/cf-login.log", d + "/cf-setup.log", d + "/cf-reset")
                domain = ("buzz.example.com" if mode == "domain" else "buzz.tail1234.ts.net") if named else ""
                if mode == "domain" and not named:
                    continue
                m.save(OWNER, m.owner_hex(OWNER), mode, domain, push)
                if cf:
                    open(m.CLOUDFLARE_STATE, "w").write(cf + "\n")
                    open(m.CLOUDFLARE_LOGIN, "w").write("https://dash.cloudflare.com/argotunnel?aud=&callback=x\n")
                    open(m.CLOUDFLARE_SETUP, "w").write("2026-10-28T00:00:00Z ERR Failed to add route: <reason>\n")
                json.dump({"BackendState": state, "AuthURL": "https://login.tailscale.com/a/x", "Self": {"DNSName": domain + ".", "ID": "n1"}}, open(m.TAILSCALE_STATUS, "w"))
                m.CACHE["key"] = None
                m.check = (lambda lv: (lambda setup: (lv, [m.item("relay", "ok", "x"), m.item("device", "wait", "y")])))(live)
                for values in ({}, {"form": "owner", "owner": "bad"}, {"form": "address", "mode": "funnel"}):
                    page = m.main_page(m.load_setup(), "an error" if values else "", values)
                    assert "<main>" in page and "Traceback" not in page
                    assert ("Phone notifications are " + ("on" if push else "off")) in page or not live
                    count += 1
for values in ({}, {"owner": "x", "mode": "private", "ack": "yes"}):
    assert "<main>" in m.setup_page("e", values); count += 1
assert "<main>" in m.login_page("e"); count += 1
print("rendered", count, "page states without errors")
