"""Previews the setup page with mocked states: no relay, no Tailscale, nothing real behind it.

  python3 preview.py <port> <scenario>    then open http://127.0.0.1:<port>

Scenarios: login, setup, domain-dns (the Cloudflare sign-in), domain-530 (the tunnel set up, not connected), funnel-login, funnel-consent, private-live, domain-live.
Everything except "login" skips the sign-in. Mocked: relay and public checks, Tailscale status files.
"""
import http.server, importlib.machinery, importlib.util, json, os, sys, tempfile

PKG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../umbrel/buzz/setup.py.template")
loader = importlib.machinery.SourceFileLoader("setup_page", PKG)
spec = importlib.util.spec_from_loader("setup_page", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)

port, scenario = int(sys.argv[1]), sys.argv[2]
d = tempfile.mkdtemp(prefix="buzz-preview-")
m.SETTINGS_DIR = d
m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/tailscale-enabled", d + "/tailscale-status.json", d + "/tailscale-serve.txt"
m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
    d + "/" + n for n in ("cloudflare-enabled", "cloudflare-state", "cloudflare-login.log", "cloudflare-setup.log", "cloudflare-reset"))
m.PASSWORD = "preview-only-password"
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"


def setup(mode, domain):
    m.save(OWNER, m.owner_hex(OWNER), mode, domain)


def tailscale(state, name="", auth="", serve=""):
    json.dump({"BackendState": state, "AuthURL": auth, "Self": {"DNSName": name + "." if name else "", "ID": "nPREVIEWCNTRL"}},
              open(m.TAILSCALE_STATUS, "w"))
    open(m.TAILSCALE_SERVE, "w").write(serve)


def fake_request(public):
    def request(host, port_, path, tls=False, headers=None, timeout=6):
        if host == m.RELAY_HOST:
            if port_ == 8080:
                return 200, b"ok"
            return 200, json.dumps({"self": "aa" * 32}).encode()
        return public(path, headers or {})
    return request


if scenario != "login":
    m.Handler.signed_in = lambda self: True
if scenario == "domain-dns":
    setup("domain", "buzz.yourteam.com")
    open(m.CLOUDFLARE_STATE, "w").write("signin\n")
    open(m.CLOUDFLARE_LOGIN, "w").write("Please open the following URL and log in with your Cloudflare account:\n\n"
                                        "https://dash.cloudflare.com/argotunnel?aud=&callback=https%3A%2F%2Flogin.cloudflareaccess.org%2Fpreview\n")
    m.resolves = lambda name: []
    m.request = fake_request(lambda path, h: (None, b"Name or service not known"))
elif scenario == "domain-530":
    setup("domain", "buzz.yourteam.com")
    open(m.CLOUDFLARE_STATE, "w").write("running\n")
    m.resolves = lambda name: ["104.21.32.1"]
    m.request = fake_request(lambda path, h: (530, b"error code: 1033"))
elif scenario in ("funnel-login", "funnel-consent"):
    setup("funnel", "")
    m.tailscale_watcher = lambda: None
    if scenario == "funnel-login":
        tailscale("NeedsLogin", auth="https://login.tailscale.com/a/preview")
    else:
        tailscale("Running", name="buzz.tail1234.ts.net")
        m.save(OWNER, m.owner_hex(OWNER), "funnel", "buzz.tail1234.ts.net")
        open(d + "/tailscale-publish.log", "w").write("Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n https://login.tailscale.com/f/funnel?node=nPREVIEWCNTRL\n")
        m.resolves = lambda name: []
        m.request = fake_request(lambda path, h: (None, b"connection refused"))
elif scenario == "private-live":
    setup("private", "buzz.tail1234.ts.net")
    tailscale("Running", name="buzz.tail1234.ts.net", serve="https://buzz.tail1234.ts.net (tailnet only)\n|-- / proxy http://buzz-gateway:80\n")
    m.request = fake_request(lambda path, h: (None, b"unreachable"))
elif scenario == "domain-live":
    setup("domain", "buzz.yourteam.com")
    m.resolves = lambda name: ["104.21.32.1"]

    def public(path, h):
        if path == "/_liveness":
            return 200, b"ok"
        if path == "/pair":
            return 101, b""
        return 200, json.dumps({"self": "aa" * 32}).encode()
    m.request = fake_request(public)

print("preview", scenario, "on", port, "settings in", d, flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), m.Handler).serve_forever()
